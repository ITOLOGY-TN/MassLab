import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Validates GET /api/v1/program/week against the Phase 3 WeekView contract.
// Skips automatically when .env is missing or Supabase is unreachable
// (single-user mode resolves the seeded athlete on the server).
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.week.contract] skipped — .env not configured:', err.message);
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.week.contract] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('contract — GET /api/v1/program/week', () => {
  it('returns a WeekView envelope with seven ordered days', async () => {
    if (!live) {
      console.warn('[program.week.contract] skipping live assertions');
      return;
    }
    const res = await request(app).get('/api/v1/program/week');
    expect(res.status).toBe(200);
    const week = res.body.data;
    expect(week).toBeTruthy();
    expect(Array.isArray(week.days)).toBe(true);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(typeof week.training_day_count).toBe('number');
    expect(typeof week.empty).toBe('boolean');

    for (const day of week.days) {
      expect(['training', 'rest']).toContain(day.kind);
      if (day.kind === 'training') {
        expect(day.muscle_group).toMatchObject({ name: expect.any(String) });
        expect(day.exercise_count).toBeGreaterThanOrEqual(0);
      } else {
        expect(day.muscle_group).toBeNull();
      }
    }
  });
});
