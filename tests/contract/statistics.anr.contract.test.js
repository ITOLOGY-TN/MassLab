import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T037 — contract for GET /statistics, asserting the
// `attendance` (AttendanceTab), `nutrition` (NutritionTab), and `recovery` (RecoveryTab)
// slices against specs/014-phase11-statistics/contracts/openapi.yaml. Phase 11 is PURELY
// READ-ONLY and adds NO schema — no seeding/mutation, no migration probe. Live-gated:
// skips when .env is missing or Supabase is unreachable.
let app;
let live = false;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.anr.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.anr.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /statistics — attendance + nutrition + recovery slices', () => {
  it('conforms to the AttendanceTab, NutritionTab, and RecoveryTab schemas', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();

    // --- attendance (AttendanceTab) ---
    const { attendance } = data;
    expect(attendance).toBeTruthy();
    expect(typeof attendance).toBe('object');
    expect(typeof attendance.from).toBe('string');
    expect(attendance.from).toMatch(ISO_DATE);
    expect(typeof attendance.to).toBe('string');
    expect(attendance.to).toMatch(ISO_DATE);
    expect(Number.isInteger(attendance.levels)).toBe(true);
    expect(Array.isArray(attendance.days)).toBe(true);
    for (const day of attendance.days) {
      expect(typeof day.date).toBe('string');
      expect(day.date).toMatch(ISO_DATE);
      expect(typeof day.volume_kg).toBe('number');
      expect(Number.isInteger(day.level)).toBe(true);
      expect(day.level).toBeGreaterThanOrEqual(0);
    }

    // --- nutrition (NutritionTab) ---
    const { nutrition } = data;
    expect(nutrition).toBeTruthy();
    expect(typeof nutrition).toBe('object');
    expect(Array.isArray(nutrition.weekly)).toBe(true);
    for (const w of nutrition.weekly) {
      expect(typeof w.week_start).toBe('string');
      expect(w.week_start).toMatch(ISO_DATE);
      expect(typeof w.kcal).toBe('number');
    }
    if (nutrition.weekly_target_kcal !== null) {
      expect(typeof nutrition.weekly_target_kcal).toBe('number');
    }

    // --- recovery (RecoveryTab) ---
    const { recovery } = data;
    expect(recovery).toBeTruthy();
    expect(typeof recovery).toBe('object');

    const { sleep } = recovery;
    expect(sleep).toBeTruthy();
    expect(Array.isArray(sleep.points)).toBe(true);
    for (const p of sleep.points) {
      expect(typeof p.date).toBe('string');
      expect(p.date).toMatch(ISO_DATE);
      expect(typeof p.hours).toBe('number');
    }
    if (sleep.average_hours !== null) {
      expect(typeof sleep.average_hours).toBe('number');
    }

    const { stress_weight: stressWeight } = recovery;
    expect(stressWeight).toBeTruthy();
    expect(Array.isArray(stressWeight.points)).toBe(true);
    for (const p of stressWeight.points) {
      expect(typeof p.date).toBe('string');
      expect(p.date).toMatch(ISO_DATE);
      expect(typeof p.stress).toBe('number');
      expect(typeof p.weight_kg).toBe('number');
    }
    expect(typeof stressWeight.sufficient).toBe('boolean');
  });
});
