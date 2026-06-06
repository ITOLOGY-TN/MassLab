import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T022 — contract for GET /statistics, asserting the
// `body` (BodyTab) and `strength` (StrengthTab) slices against
// specs/014-phase11-statistics/contracts/openapi.yaml. Phase 11 is PURELY READ-ONLY and
// adds NO schema — no seeding/mutation, no migration probe. Live-gated: skips when .env is
// missing or Supabase is unreachable.
let app;
let live = false;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.bodyStrength.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.bodyStrength.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /statistics — body + strength slices', () => {
  it('conforms to the BodyTab and StrengthTab schemas', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();

    // --- body (BodyTab) ---
    const { body } = data;
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');

    const { weight } = body;
    expect(weight).toBeTruthy();
    expect(Array.isArray(weight.points)).toBe(true);
    for (const p of weight.points) {
      expect(typeof p.date).toBe('string');
      expect(p.date).toMatch(ISO_DATE);
      expect(typeof p.weight_kg).toBe('number');
    }
    if (weight.goal_kg !== null) {
      expect(typeof weight.goal_kg).toBe('number');
    }
    expect(typeof weight.has_data).toBe('boolean');

    expect(Array.isArray(body.measurements)).toBe(true);
    for (const series of body.measurements) {
      expect(typeof series.key).toBe('string');
      expect(typeof series.label).toBe('string');
      expect(typeof series.unit).toBe('string');
      expect(Array.isArray(series.points)).toBe(true);
      for (const p of series.points) {
        expect(typeof p.date).toBe('string');
        expect(p.date).toMatch(ISO_DATE);
        expect(typeof p.value).toBe('number');
      }
    }

    // --- strength (StrengthTab) ---
    const { strength } = data;
    expect(strength).toBeTruthy();
    expect(typeof strength).toBe('object');

    expect(Array.isArray(strength.top_progressions)).toBe(true);
    for (const prog of strength.top_progressions) {
      expect(Number.isInteger(prog.exercise_id)).toBe(true);
      expect(typeof prog.name).toBe('string');
      expect(typeof prog.gain_kg).toBe('number');
      expect(Array.isArray(prog.series)).toBe(true);
      for (const p of prog.series) {
        expect(typeof p.date).toBe('string');
        expect(p.date).toMatch(ISO_DATE);
        expect(typeof p.working_weight_kg).toBe('number');
      }
    }

    expect(Array.isArray(strength.weekly_volume)).toBe(true);
    for (const w of strength.weekly_volume) {
      expect(typeof w.week_start).toBe('string');
      expect(w.week_start).toMatch(ISO_DATE);
      expect(typeof w.volume_kg).toBe('number');
    }

    const { muscle_radar: radar } = strength;
    expect(radar).toBeTruthy();
    expect(Array.isArray(radar.axes)).toBe(true);
    expect(Array.isArray(radar.values)).toBe(true);
    for (const axis of radar.axes) {
      expect(typeof axis.muscle_group).toBe('string');
    }
    for (const v of radar.values) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // values aligned to axes.
    expect(radar.values.length).toBe(radar.axes.length);
  });
});
