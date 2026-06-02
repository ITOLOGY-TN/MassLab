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

describe('contract: /api/v1/sessions', () => {
  it('start → get → upsert → finish, with conflict + validation codes', async () => {
    if (!live) {
      console.warn('[sessions.contract] skipping live assertions');
      return;
    }
    await discardActive();

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

      const got = await request(app).get(`/api/v1/sessions/${sid}`);
      expect(got.status).toBe(200);
      expect(got.body.data.session_id).toBe(sid);

      const exId = start.body.data.exercises[0]?.exercise_id;
      if (exId) {
        const put = await request(app)
          .put(`/api/v1/sessions/${sid}/sets`)
          .send({
            sets: [{ exercise_id: exId, set_number: 1, weight_kg: 60, reps: 8, completed: true }],
          });
        expect(put.status).toBe(200);
        expect(put.body.data.total_volume_kg).toBe(480);

        const bad = await request(app)
          .put(`/api/v1/sessions/${sid}/sets`)
          .send({
            sets: [{ exercise_id: exId, set_number: 1, weight_kg: 0, reps: 0, completed: true }],
          });
        expect(bad.status).toBe(422);
      }

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
      await request(app).delete(`/api/v1/sessions/${sid}`);
    }
  });
});
