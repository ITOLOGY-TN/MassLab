import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// GET /api/v1/program/day/:dayOfWeek against the DayView contract.
// Skips when .env is missing or Supabase is unreachable.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.day.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.day.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

const STATES = ['ready_to_increase', 'stable', 'regressing'];

describe('contract — GET /api/v1/program/day/:dayOfWeek', () => {
  it('returns a DayView for a configured training day', async () => {
    if (!live) {
      console.warn('[program.day.contract] skipping live assertions');
      return;
    }
    const week = (await request(app).get('/api/v1/program/week')).body.data;
    const training = week.days.find((d) => d.kind === 'training');
    if (!training) {
      console.warn('[program.day.contract] no training day configured — skipping');
      return;
    }

    const res = await request(app).get(`/api/v1/program/day/${training.day_of_week}`);
    expect(res.status).toBe(200);
    const day = res.body.data;
    expect(day.day_of_week).toBe(training.day_of_week);
    expect(day.muscle_group).toMatchObject({ name: expect.any(String) });
    expect(typeof day.empty_exercises).toBe('boolean');
    expect(Array.isArray(day.exercises)).toBe(true);

    // Ordered by position; valid shape + indicator + nullable last weight.
    const positions = day.exercises.map((e) => e.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const ex of day.exercises) {
      expect(typeof ex.exercise_id).toBe('number');
      expect(STATES).toContain(ex.progression);
      expect(ex.last_weight_kg === null || typeof ex.last_weight_kg === 'number').toBe(true);
    }
  });

  it('returns 404 for an out-of-range day', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/program/day/99');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a rest day', async () => {
    if (!live) return;
    const week = (await request(app).get('/api/v1/program/week')).body.data;
    const rest = week.days.find((d) => d.kind === 'rest');
    if (!rest) return;
    const res = await request(app).get(`/api/v1/program/day/${rest.day_of_week}`);
    expect(res.status).toBe(404);
  });
});
