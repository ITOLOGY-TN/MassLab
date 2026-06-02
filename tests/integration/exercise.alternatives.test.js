import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// T040 — alternative links lifecycle via the live API: add, list, self-link and
// duplicate rejection, remove. Cleans up in a finally block.
// Skips when .env missing, Supabase unreachable, or the migration is unapplied.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[exercise.alternatives] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[exercise.alternatives] skipped — Supabase unreachable');
    return;
  }
  const { error: tblErr } = await supabase.from('exercise_alternatives').select('id').limit(1);
  if (tblErr) {
    console.warn('[exercise.alternatives] skipped — exercise_alternatives migration not applied');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('exercise alternatives — CRUD + guards (FR-022, FR-023)', () => {
  it('adds, lists, rejects self/duplicate, and removes a link', async () => {
    if (!live) {
      console.warn('[exercise.alternatives] skipping live assertions');
      return;
    }
    const exercises = (await request(app).get('/api/v1/exercises')).body.data;
    expect(exercises.length).toBeGreaterThan(1);
    const a = exercises[0].id;
    const b = exercises[1].id;

    try {
      const add = await request(app)
        .post(`/api/v1/exercises/${a}/alternatives`)
        .send({ alternative_exercise_id: b });
      expect(add.status).toBe(201);
      expect(add.body.data.exercise_id).toBe(b);

      const list = await request(app).get(`/api/v1/exercises/${a}/alternatives`);
      expect(list.status).toBe(200);
      expect(list.body.data.map((x) => x.exercise_id)).toContain(b);

      const dup = await request(app)
        .post(`/api/v1/exercises/${a}/alternatives`)
        .send({ alternative_exercise_id: b });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');

      const self = await request(app)
        .post(`/api/v1/exercises/${a}/alternatives`)
        .send({ alternative_exercise_id: a });
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe('SELF_LINK_FORBIDDEN');

      const del = await request(app).delete(`/api/v1/exercises/${a}/alternatives/${b}`);
      expect(del.status).toBe(204);

      const after = await request(app).get(`/api/v1/exercises/${a}/alternatives`);
      expect(after.body.data.map((x) => x.exercise_id)).not.toContain(b);
    } finally {
      // belt-and-suspenders cleanup
      await supabase
        .from('exercise_alternatives')
        .delete()
        .eq('exercise_id', a)
        .eq('alternative_exercise_id', b);
    }
  });
});
