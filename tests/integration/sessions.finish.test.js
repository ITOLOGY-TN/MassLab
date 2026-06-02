import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 4 (T042) — finish discards incomplete sets (D-7), finalizes the session,
// and triggers the Phase 1 engine exactly once (progression + 1RM + audit, D-6),
// so Phase 3 reflects the new history (FR-026). Skips offline / unmigrated.
let app;
let supabase;
let athleteId;
let exId;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[sessions.finish] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('session_journal_entries').select('day_of_week').limit(1);
  if (probe.error) {
    console.warn('[sessions.finish] skipped — Supabase unreachable or migration unapplied');
    return;
  }
  const { data: athlete } = await supabase.from('athletes').select('id').limit(1).single();
  athleteId = athlete?.id;
  const { data: exs } = await supabase
    .from('exercises')
    .select('id')
    .eq('athlete_id', athleteId)
    .limit(1);
  exId = exs?.[0]?.id;
  if (!athleteId || !exId) {
    console.warn('[sessions.finish] skipped — insufficient seed data');
    return;
  }
  app = buildApp({ config });
  live = true;
});

async function discardActive() {
  const res = await request(app).get('/api/v1/sessions/active');
  const id = res.body?.data?.session_id;
  if (id) await request(app).delete(`/api/v1/sessions/${id}`);
}

describe('integration: session finish + engine', () => {
  it('discards incomplete sets, finalizes, and runs the engine once', async () => {
    if (!live) {
      console.warn('[sessions.finish] skipping live assertions');
      return;
    }
    await discardActive();
    const start = await request(app).post('/api/v1/sessions').send({});
    const sid = start.body.data.session_id;

    try {
      await request(app)
        .put(`/api/v1/sessions/${sid}/sets`)
        .send({
          sets: [
            { exercise_id: exId, set_number: 1, weight_kg: 80, reps: 5, completed: true },
            { exercise_id: exId, set_number: 2, weight_kg: 85, reps: 3, completed: false }, // incomplete
          ],
        });

      const before = await supabase
        .from('calculation_results')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId)
        .eq('reason', 'session_finish');

      const fin = await request(app)
        .post(`/api/v1/sessions/${sid}/finish`)
        .send({ note: 'finish test', energy_rating: 5 });
      expect(fin.status).toBe(200);
      // Volume from completed only: 80*5 = 400 (the 85×3 incomplete is excluded).
      expect(fin.body.data.total_volume_kg).toBe(400);
      expect(fin.body.data.engine.one_rep_max_records_created).toBeGreaterThanOrEqual(1);

      // Incomplete set was discarded — only the completed set remains.
      const { data: remainingSets } = await supabase
        .from('session_sets')
        .select('completed')
        .eq('session_id', sid);
      expect(remainingSets.every((s) => s.completed === true)).toBe(true);

      // The session is ended.
      const { data: row } = await supabase
        .from('session_journal_entries')
        .select('ended_at')
        .eq('id', sid)
        .single();
      expect(row.ended_at).not.toBeNull();

      // A session_finish audit row was appended.
      const after = await supabase
        .from('calculation_results')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId)
        .eq('reason', 'session_finish');
      expect(after.count ?? 0).toBeGreaterThan(before.count ?? 0);

      // Phase 3 now reflects the logged session (last weight present).
      const detail = await request(app).get(`/api/v1/program/exercises/${exId}`);
      if (detail.status === 200) {
        expect(detail.body.data.history.has_history).toBe(true);
      }

      // Finish-once guard.
      const again = await request(app).post(`/api/v1/sessions/${sid}/finish`).send({});
      expect(again.status).toBe(409);
    } finally {
      await request(app).delete(`/api/v1/sessions/${sid}`);
    }
  });
});
