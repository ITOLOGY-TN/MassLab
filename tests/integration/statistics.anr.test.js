import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T038 — integration for the `attendance` + `nutrition`
// + `recovery` slices of GET /api/v1/statistics, driven against the live API via
// Supertest. The endpoint is PURELY READ-ONLY. This suite asserts:
//   1. attendance.days covers EVERY day in [from,to] inclusive (one cell per calendar
//      day) and every level is an integer in 0..attendance.levels.
//   2. nutrition.weekly is an array (per-ISO-week kcal totals).
//   3. recovery.stress_weight.sufficient is a boolean and points only contains entries
//      with BOTH a stress value and a weight_kg.
//   4. READ-ONLY (SC-011): a GET leaves row counts unchanged + writes no
//      calculation_results.
//
// Live-gated: skips when .env is absent or Supabase is unreachable. No schema → no probe.
let app;
let supabase;
let seededAthleteId = null;
let live = false;

// Inclusive count of calendar days between two YYYY-MM-DD strings (UTC).
function inclusiveDayCount(from, to) {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.anr] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.anr] skipped — Supabase unreachable');
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
    console.warn('[statistics.anr] skipped — no seeded athlete');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: statistics attendance + nutrition + recovery slices (Phase 11)', () => {
  it('attendance/nutrition/recovery are well-formed for the seeded athlete', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);
    const data = res.body.data;

    // ---- attendance (AttendanceTab) -------------------------------------------------
    const att = data.attendance;
    expect(att).toBeTruthy();
    expect(typeof att.from).toBe('string');
    expect(typeof att.to).toBe('string');
    expect(Number.isInteger(att.levels)).toBe(true);
    expect(att.levels).toBeGreaterThan(0);
    expect(Array.isArray(att.days)).toBe(true);

    // The heatmap covers EVERY day in [from,to] inclusive — exactly one cell per day.
    const expectedDays = inclusiveDayCount(att.from, att.to);
    expect(att.days.length).toBe(expectedDays);

    // The days are the contiguous calendar run from `from` to `to`, in order.
    expect(att.days[0].date).toBe(att.from);
    expect(att.days[att.days.length - 1].date).toBe(att.to);

    for (const day of att.days) {
      expect(typeof day.date).toBe('string');
      expect(typeof day.volume_kg).toBe('number');
      // level is an integer in 0..levels (0 = no completed session; 1..levels graded).
      expect(Number.isInteger(day.level)).toBe(true);
      expect(day.level).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeLessThanOrEqual(att.levels);
    }

    // ---- nutrition (NutritionTab) ---------------------------------------------------
    const nut = data.nutrition;
    expect(nut).toBeTruthy();
    expect(Array.isArray(nut.weekly)).toBe(true);
    for (const w of nut.weekly) {
      expect(typeof w.week_start).toBe('string');
      expect(typeof w.kcal).toBe('number');
    }
    expect(
      nut.weekly_target_kcal === null || typeof nut.weekly_target_kcal === 'number',
    ).toBe(true);

    // ---- recovery (RecoveryTab) -----------------------------------------------------
    const rec = data.recovery;
    expect(rec).toBeTruthy();
    expect(rec.sleep).toBeTruthy();
    expect(Array.isArray(rec.sleep.points)).toBe(true);
    for (const pt of rec.sleep.points) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.hours).toBe('number');
    }
    expect(
      rec.sleep.average_hours === null || typeof rec.sleep.average_hours === 'number',
    ).toBe(true);

    const sw = rec.stress_weight;
    expect(sw).toBeTruthy();
    expect(typeof sw.sufficient).toBe('boolean');
    expect(Array.isArray(sw.points)).toBe(true);
    // Each paired point carries BOTH a stress reading and a weight_kg.
    for (const pt of sw.points) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.stress).toBe('number');
      expect(typeof pt.weight_kg).toBe('number');
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
