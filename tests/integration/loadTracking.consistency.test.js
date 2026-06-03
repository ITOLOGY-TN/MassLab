import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 5 (T032) — load-tracking reflects the logged history AND is read-only:
// a finished session shows up in the overview, and a GET /load-tracking/* writes
// no engine rows (FR-022). Skips offline / when the Phase 4 migration is absent.
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
      console.warn('[loadTracking.consistency] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('session_journal_entries').select('day_of_week').limit(1);
  if (probe.error) {
    console.warn(
      '[loadTracking.consistency] skipped — Supabase unreachable or migration unapplied',
    );
    return;
  }
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  athleteId = athlete?.id;
  const { data: ex } = await supabase
    .from('exercises')
    .select('id')
    .eq('athlete_id', athleteId)
    .limit(1);
  exId = ex?.[0]?.id;
  if (!athleteId || !exId) {
    console.warn('[loadTracking.consistency] skipped — insufficient seed data');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

async function discardActive() {
  const res = await request(app).get('/api/v1/sessions/active');
  const id = res.body?.data?.session_id;
  if (id) await request(app).delete(`/api/v1/sessions/${id}`);
}

describe('integration: load-tracking consistency + read-only', () => {
  it('reflects a finished session in the overview and never writes on a GET', async () => {
    if (!live) {
      console.warn('[loadTracking.consistency] skipping live assertions');
      return;
    }
    await discardActive();
    const start = await request(app).post('/api/v1/sessions').send({});
    const sid = start.body.data.session_id;
    try {
      await request(app)
        .put(`/api/v1/sessions/${sid}/sets`)
        .send({
          sets: [{ exercise_id: exId, set_number: 1, weight_kg: 82.5, reps: 5, completed: true }],
        });
      await request(app).post(`/api/v1/sessions/${sid}/finish`).send({});

      // Overview reflects the logged working load for that exercise.
      const ov = await request(app).get('/api/v1/load-tracking/overview');
      expect(ov.status).toBe(200);
      const row = ov.body.data.exercises.find((e) => e.exercise_id === exId);
      expect(row).toBeTruthy();
      expect(row.current_load_kg).toBe(82.5);
      expect(['ready_to_increase', 'maintain', 'stagnation', 'regressing']).toContain(row.status);

      // Detail's current 1RM equals the latest persisted record (FR-023).
      const { data: latestRec } = await supabase
        .from('one_rep_max_records')
        .select('primary_estimate_kg')
        .eq('athlete_id', athleteId)
        .eq('exercise_id', exId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const detail = await request(app).get(`/api/v1/load-tracking/exercises/${exId}`);
      expect(detail.body.data.current_estimate_1rm_kg).toBe(Number(latestRec.primary_estimate_kg));

      // READ-ONLY (FR-022): a GET appends no audit rows.
      const auditCount = async () =>
        (
          await supabase
            .from('calculation_results')
            .select('id', { head: true, count: 'exact' })
            .eq('athlete_id', athleteId)
        ).count ?? 0;
      const before = await auditCount();
      await request(app).get('/api/v1/load-tracking/overview');
      await request(app).get('/api/v1/load-tracking/phase-comparison');
      expect(await auditCount()).toBe(before);
    } finally {
      // Finished session is immutable; clean up at the DB level (cascade deletes sets).
      await supabase.from('session_journal_entries').delete().eq('id', sid);
    }
  });
});
