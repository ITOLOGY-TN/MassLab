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
  // The app's SINGLE_USER auth resolves the OLDEST (seeded) athlete, so match it.
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
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

      const countAudit = async () =>
        (
          await supabase
            .from('calculation_results')
            .select('id', { head: true, count: 'exact' })
            .eq('athlete_id', athleteId)
            .eq('reason', 'session_finish')
        ).count ?? 0;
      const count1rm = async () =>
        (
          await supabase
            .from('one_rep_max_records')
            .select('id', { head: true, count: 'exact' })
            .eq('athlete_id', athleteId)
            .eq('exercise_id', exId)
        ).count ?? 0;
      const auditBefore = await countAudit();
      const ormBefore = await count1rm();

      const fin = await request(app)
        .post(`/api/v1/sessions/${sid}/finish`)
        .send({ note: 'finish test', energy_rating: 5 });
      expect(fin.status).toBe(200);
      // Volume from completed only: 80*5 = 400 (the 85×3 incomplete is excluded).
      expect(fin.body.data.total_volume_kg).toBe(400);
      // Exactly one exercise performed → exactly one 1RM record.
      expect(fin.body.data.engine.one_rep_max_records_created).toBe(1);
      expect(typeof fin.body.data.engine.progression_flags_updated).toBe('number');

      // Incomplete set was discarded — only the completed set remains.
      const { data: remainingSets } = await supabase
        .from('session_sets')
        .select('completed')
        .eq('session_id', sid);
      expect(remainingSets).toHaveLength(1);
      expect(remainingSets.every((s) => s.completed === true)).toBe(true);

      // The session is ended.
      const { data: row } = await supabase
        .from('session_journal_entries')
        .select('ended_at')
        .eq('id', sid)
        .single();
      expect(row.ended_at).not.toBeNull();

      // Exact engine fan-out: 1 new one_rep_max_records row for this exercise…
      expect(await count1rm()).toBe(ormBefore + 1);
      // …and the audit fan-out is exactly (records + 1 progression_eval) = 2.
      const records = fin.body.data.engine.one_rep_max_records_created;
      expect(await countAudit()).toBe(auditBefore + records + 1);

      // Phase 3 now reflects the logged session (last weight present).
      const detail = await request(app).get(`/api/v1/program/exercises/${exId}`);
      if (detail.status === 200) {
        expect(detail.body.data.history.has_history).toBe(true);
      }

      // Finish-once guard.
      const again = await request(app).post(`/api/v1/sessions/${sid}/finish`).send({});
      expect(again.status).toBe(409);
    } finally {
      // Finished sessions are immutable; clean up at the DB level.
      await supabase.from('session_journal_entries').delete().eq('id', sid);
    }
  });
});
