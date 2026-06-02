import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// GET /api/v1/program/exercises/:id against the ExerciseView contract.
// Skips when .env is missing, Supabase is unreachable, OR the Phase 3
// exercise_alternatives migration has not been applied yet (T005).
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.exercise.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.exercise.contract] skipped — Supabase unreachable');
    return;
  }
  const { error: tblErr } = await supabase.from('exercise_alternatives').select('id').limit(1);
  if (tblErr) {
    console.warn(
      '[program.exercise.contract] skipped — exercise_alternatives migration not applied',
    );
    return;
  }
  app = buildApp({ config });
  live = true;
});

const STATES = ['ready_to_increase', 'stable', 'regressing'];

describe('contract — GET /api/v1/program/exercises/:id', () => {
  it('returns an ExerciseView with static content + nullable history', async () => {
    if (!live) {
      console.warn('[program.exercise.contract] skipping live assertions');
      return;
    }
    const exercises = (await request(app).get('/api/v1/exercises')).body.data;
    expect(exercises.length).toBeGreaterThan(0);
    const id = exercises[0].id;

    const res = await request(app).get(`/api/v1/program/exercises/${id}`);
    expect(res.status).toBe(200);
    const ex = res.body.data;

    expect(ex).toMatchObject({ exercise_id: id, name: expect.any(String) });
    expect(Array.isArray(ex.targeted_muscles)).toBe(true);
    expect(typeof ex.instructions).toBe('string');
    expect(ex.media).toHaveProperty('image_url');
    expect(ex.media.video).toHaveProperty('kind');
    expect(Array.isArray(ex.alternatives)).toBe(true);
    expect(ex.history).toHaveProperty('has_history');
    expect(Array.isArray(ex.history.recent_sessions)).toBe(true);
    if (!ex.history.has_history) {
      expect(ex.history.estimated_1rm_kg).toBeNull();
      expect(ex.history.recommended_load_kg).toBeNull();
    }
    void STATES;
  });

  it('returns 404 for an unknown exercise', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/program/exercises/99999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
