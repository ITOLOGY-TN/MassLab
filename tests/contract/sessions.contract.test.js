import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 4 (T013/T032/T041) — contract for /api/v1/sessions. Drives the write
// lifecycle + conflict codes against contracts/openapi.yaml. Skips when .env is
// missing, Supabase is unreachable, or the Phase 4 migration is not applied.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[sessions.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[sessions.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('session_journal_entries').select('day_of_week').limit(1);
  if (mig.error) {
    console.warn('[sessions.contract] skipped — Phase 4 migration not applied');
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

async function anyExerciseId(athleteId) {
  const { data } = await supabase
    .from('exercises')
    .select('id')
    .eq('athlete_id', athleteId)
    .limit(1);
  return data?.[0]?.id ?? null;
}
// Finished sessions are immutable (discard is rejected), so clean up at the DB
// level (cascade deletes sets).
async function purge(sid) {
  await supabase.from('session_journal_entries').delete().eq('id', sid);
}

describe('contract: /api/v1/sessions', () => {
  it('start → active → get → set CRUD → upsert → finish, with conflict + validation codes', async () => {
    if (!live) {
      console.warn('[sessions.contract] skipping live assertions');
      return;
    }
    await discardActive();
    const { data: athlete } = await supabase.from('athletes').select('id').limit(1).single();

    const start = await request(app).post('/api/v1/sessions').send({});
    expect(start.status).toBe(201);
    expect(start.body.data).toHaveProperty('session_id');
    expect(start.body.data).toHaveProperty('started_at');
    expect(Array.isArray(start.body.data.exercises)).toBe(true);
    const sid = start.body.data.session_id;

    try {
      // Only one in-progress session at a time.
      const dup = await request(app).post('/api/v1/sessions').send({});
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('ACTIVE_SESSION_EXISTS');

      // GET /sessions/active resolves to this session.
      const active = await request(app).get('/api/v1/sessions/active');
      expect(active.status).toBe(200);
      expect(active.body.data.session_id).toBe(sid);

      const got = await request(app).get(`/api/v1/sessions/${sid}`);
      expect(got.status).toBe(200);
      expect(got.body.data.session_id).toBe(sid);

      const exId = start.body.data.exercises[0]?.exercise_id ?? (await anyExerciseId(athlete.id));
      expect(exId).toBeTruthy();

      // Per-set CRUD: create → edit → delete.
      const created = await request(app)
        .post(`/api/v1/sessions/${sid}/sets`)
        .send({ exercise_id: exId, set_number: 9, weight_kg: 50, reps: 10, completed: false });
      expect(created.status).toBe(201);
      const setId = created.body.data.set_id;
      const patched = await request(app)
        .patch(`/api/v1/sessions/${sid}/sets/${setId}`)
        .send({ exercise_id: exId, set_number: 9, weight_kg: 55, reps: 8, completed: true });
      expect(patched.status).toBe(200);
      expect(patched.body.data.weight_kg).toBe(55);
      const removed = await request(app).delete(`/api/v1/sessions/${sid}/sets/${setId}`);
      expect(removed.status).toBe(204);

      // Bulk auto-save (unconditional now that exId is guaranteed).
      const put = await request(app)
        .put(`/api/v1/sessions/${sid}/sets`)
        .send({
          sets: [{ exercise_id: exId, set_number: 1, weight_kg: 60, reps: 8, completed: true }],
        });
      expect(put.status).toBe(200);
      expect(put.body.data.total_volume_kg).toBe(480);

      // A completed set with zero weight/reps is rejected.
      const bad = await request(app)
        .put(`/api/v1/sessions/${sid}/sets`)
        .send({
          sets: [{ exercise_id: exId, set_number: 1, weight_kg: 0, reps: 0, completed: true }],
        });
      expect(bad.status).toBe(422);

      const fin = await request(app)
        .post(`/api/v1/sessions/${sid}/finish`)
        .send({ note: 'contract', energy_rating: 4 });
      expect(fin.status).toBe(200);
      expect(fin.body.data).toHaveProperty('duration_seconds');
      expect(fin.body.data).toHaveProperty('total_volume_kg');
      expect(fin.body.data.engine).toBeDefined();

      const again = await request(app).post(`/api/v1/sessions/${sid}/finish`).send({});
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('SESSION_ALREADY_FINISHED');
    } finally {
      await purge(sid);
    }
  });

  it('discards an in-progress session and clears the active slot', async () => {
    if (!live) return;
    await discardActive();
    const start = await request(app).post('/api/v1/sessions').send({});
    const sid = start.body.data.session_id;

    const del = await request(app).delete(`/api/v1/sessions/${sid}`);
    expect(del.status).toBe(204);
    const active = await request(app).get('/api/v1/sessions/active');
    expect(active.body.data).toBeNull();
  });
});
