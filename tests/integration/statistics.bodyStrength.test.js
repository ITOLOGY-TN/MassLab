import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T023 — integration for the `body` + `strength`
// slices of GET /api/v1/statistics, driven against the live API via Supertest. The
// endpoint is PURELY READ-ONLY. This suite asserts:
//   1. Both slices are present and well-formed for the seeded athlete (tolerant of a
//      sparse athlete per the contract's nullability).
//   2. If the athlete has weight data, body.weight.has_data is true and points is
//      non-empty.
//   3. muscle_radar.values aligns 1:1 with muscle_radar.axes.
//   4. READ-ONLY (SC-011): a GET leaves row counts unchanged + writes no
//      calculation_results.
//
// Live-gated: skips when .env is absent or Supabase is unreachable. No schema → no probe.
let app;
let supabase;
let seededAthleteId = null;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.bodyStrength] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.bodyStrength] skipped — Supabase unreachable');
    return;
  }
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  seededAthleteId = athlete?.id;
  if (!seededAthleteId) {
    console.warn('[statistics.bodyStrength] skipped — no seeded athlete');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: statistics body + strength slices (Phase 11)', () => {
  it('body + strength are present and well-formed for the seeded athlete', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);
    const data = res.body.data;

    // ---- body (BodyTab) -------------------------------------------------------------
    const body = data.body;
    expect(body).toBeTruthy();
    expect(body.weight).toBeTruthy();
    expect(Array.isArray(body.weight.points)).toBe(true);
    expect(typeof body.weight.has_data).toBe('boolean');
    expect(body.weight.goal_kg === null || typeof body.weight.goal_kg === 'number').toBe(true);
    for (const pt of body.weight.points) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.weight_kg).toBe('number');
    }
    // If the athlete has weight data, has_data is true and points is non-empty (and vice
    // versa — the two are consistent).
    expect(body.weight.has_data).toBe(body.weight.points.length > 0);

    // measurements: one series per measurement that has data; each well-formed.
    expect(Array.isArray(body.measurements)).toBe(true);
    for (const series of body.measurements) {
      expect(typeof series.key).toBe('string');
      expect(typeof series.label).toBe('string');
      expect(typeof series.unit).toBe('string');
      expect(Array.isArray(series.points)).toBe(true);
      for (const pt of series.points) {
        expect(typeof pt.date).toBe('string');
        expect(typeof pt.value).toBe('number');
      }
    }

    // ---- strength (StrengthTab) -----------------------------------------------------
    const strength = data.strength;
    expect(strength).toBeTruthy();
    expect(Array.isArray(strength.top_progressions)).toBe(true);
    for (const tp of strength.top_progressions) {
      expect(Number.isInteger(tp.exercise_id)).toBe(true);
      expect(typeof tp.name).toBe('string');
      expect(typeof tp.gain_kg).toBe('number');
      expect(Array.isArray(tp.series)).toBe(true);
      for (const s of tp.series) {
        expect(typeof s.date).toBe('string');
        expect(typeof s.working_weight_kg).toBe('number');
      }
    }

    expect(Array.isArray(strength.weekly_volume)).toBe(true);
    for (const w of strength.weekly_volume) {
      expect(typeof w.week_start).toBe('string');
      expect(typeof w.volume_kg).toBe('number');
    }

    // muscle_radar: values aligns 1:1 with axes.
    const radar = strength.muscle_radar;
    expect(radar).toBeTruthy();
    expect(Array.isArray(radar.axes)).toBe(true);
    expect(Array.isArray(radar.values)).toBe(true);
    expect(radar.values.length).toBe(radar.axes.length);
    for (const axis of radar.axes) {
      expect(typeof axis.muscle_group).toBe('string');
      expect(axis.color === null || typeof axis.color === 'string').toBe(true);
    }
    for (const v of radar.values) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('read-only: a GET leaves row counts unchanged and writes no calculation_results (SC-011)', async () => {
    if (!live) return;

    const countOwn = (table) =>
      supabase
        .from(table)
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', seededAthleteId);

    const TABLES = [
      'body_measurements',
      'one_rep_max_records',
      'session_journal_entries',
      'nutrition_logs',
      'recovery_log',
      'calculation_results',
    ];

    const before = await Promise.all(TABLES.map(countOwn));
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);
    const after = await Promise.all(TABLES.map(countOwn));

    for (let i = 0; i < TABLES.length; i += 1) {
      expect(after[i].count ?? 0).toBe(before[i].count ?? 0);
    }
  });
});
