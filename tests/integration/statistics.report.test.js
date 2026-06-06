import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T052 — integration for GET /api/v1/statistics/report,
// driven against the live API via Supertest. The endpoint is PURELY READ-ONLY. This
// suite asserts:
//   1. A recent explicit ?month=YYYY-MM AND the default (no month) both return valid
//      Report payloads.
//   2. The default period.month equals the most-recently-COMPLETED calendar month
//      relative to the server UTC day (the month before the current UTC month; January
//      rolls to previous-year December) — computed the same way the controller does.
//   3. A far-future month still returns a VALID payload with zeroed/empty
//      summary / topProgressions / weightSeries — an empty month is a valid state, not
//      an error.
//   4. READ-ONLY (SC-011): the GETs leave row counts unchanged + write no
//      calculation_results.
//
// Live-gated: skips when .env is absent or Supabase is unreachable. No schema → no probe.
let app;
let supabase;
let seededAthleteId = null;
let live = false;

// The most-recently-completed calendar month relative to the server UTC day — computed
// EXACTLY as the controller does (month before the current UTC month; Jan → prev-year Dec).
function previousUtcMonth() {
  const asOf = new Date().toISOString().slice(0, 10);
  const [y, m] = asOf.split('-');
  let year = Number(y);
  let monthIndex = Number(m) - 1 - 1; // 0..11, previous month
  if (monthIndex < 0) {
    monthIndex = 11;
    year -= 1;
  }
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
}

// Assert a payload is a structurally-valid Report (tolerant of nullability per contract).
function assertValidReport(report) {
  expect(report).toBeTruthy();

  // period
  const p = report.period;
  expect(p).toBeTruthy();
  expect(p.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(typeof p.label).toBe('string');
  // from is the first of the month; to is on/after from.
  expect(p.from).toBe(`${p.month}-01`);
  expect(p.to >= p.from).toBe(true);

  // summary
  const s = report.summary;
  expect(s).toBeTruthy();
  expect(typeof s.volume_kg).toBe('number');
  expect(Number.isInteger(s.sessions_completed)).toBe(true);
  expect(s.sessions_completed).toBeGreaterThanOrEqual(0);
  expect(s.weight_change_kg === null || typeof s.weight_change_kg === 'number').toBe(true);
  expect(s.avg_daily_calories === null || typeof s.avg_daily_calories === 'number').toBe(true);
  expect(s.avg_sleep_hours === null || typeof s.avg_sleep_hours === 'number').toBe(true);

  // lifetime
  const lt = report.lifetime;
  expect(lt).toBeTruthy();
  expect(lt.total_weight_gained_kg === null || typeof lt.total_weight_gained_kg === 'number').toBe(
    true,
  );
  expect(typeof lt.total_volume_kg).toBe('number');
  expect(lt.session_completion_pct === null || typeof lt.session_completion_pct === 'number').toBe(
    true,
  );
  expect(lt.avg_weekly_calories === null || typeof lt.avg_weekly_calories === 'number').toBe(true);

  // topProgressions (≤ 3)
  expect(Array.isArray(report.topProgressions)).toBe(true);
  expect(report.topProgressions.length).toBeLessThanOrEqual(3);
  for (const tp of report.topProgressions) {
    expect(Number.isInteger(tp.exercise_id)).toBe(true);
    expect(typeof tp.name).toBe('string');
    expect(typeof tp.gain_kg).toBe('number');
  }

  // weightSeries
  expect(Array.isArray(report.weightSeries)).toBe(true);
  for (const w of report.weightSeries) {
    expect(typeof w.date).toBe('string');
    expect(typeof w.weight_kg).toBe('number');
  }

  // recommendations
  expect(Array.isArray(report.recommendations)).toBe(true);
  for (const r of report.recommendations) {
    expect(typeof r.key).toBe('string');
    expect(typeof r.message).toBe('string');
  }
}

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.report] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.report] skipped — Supabase unreachable');
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
    console.warn('[statistics.report] skipped — no seeded athlete');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: statistics report (Phase 11)', () => {
  it('returns a valid Report for an explicit recent ?month and resolves the default month', async () => {
    if (!live) return;

    const expectedDefaultMonth = previousUtcMonth();

    // Explicit recent month (the most-recently-completed one).
    const explicitRes = await request(app).get(
      `/api/v1/statistics/report?month=${expectedDefaultMonth}`,
    );
    expect(explicitRes.status).toBe(200);
    const explicit = explicitRes.body.data;
    assertValidReport(explicit);
    expect(explicit.period.month).toBe(expectedDefaultMonth);

    // Default (no month) → the most-recently-completed calendar month.
    const defaultRes = await request(app).get('/api/v1/statistics/report');
    expect(defaultRes.status).toBe(200);
    const dflt = defaultRes.body.data;
    assertValidReport(dflt);
    expect(dflt.period.month).toBe(expectedDefaultMonth);
  });

  it('returns a valid, empty-state Report for a far-future month (empty is valid, not an error)', async () => {
    if (!live) return;

    const FUTURE_MONTH = '2099-12';
    const res = await request(app).get(`/api/v1/statistics/report?month=${FUTURE_MONTH}`);
    expect(res.status).toBe(200);
    const report = res.body.data;
    assertValidReport(report);
    expect(report.period.month).toBe(FUTURE_MONTH);

    // Empty month: zeroed/empty month-scoped figures (lifetime header may still carry
    // since-start data, but the month summary + month series are empty).
    expect(report.summary.volume_kg).toBe(0);
    expect(report.summary.sessions_completed).toBe(0);
    expect(report.weightSeries).toEqual([]);
  });

  it('read-only: the GETs leave row counts unchanged and write no calculation_results (SC-011)', async () => {
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

    // Exercise multiple report GETs (default + explicit + empty) across the read window.
    expect((await request(app).get('/api/v1/statistics/report')).status).toBe(200);
    expect(
      (await request(app).get(`/api/v1/statistics/report?month=${previousUtcMonth()}`)).status,
    ).toBe(200);
    expect((await request(app).get('/api/v1/statistics/report?month=2099-12')).status).toBe(200);

    const after = await Promise.all(TABLES.map(countOwn));

    for (let i = 0; i < TABLES.length; i += 1) {
      expect(after[i].count ?? 0).toBe(before[i].count ?? 0);
    }
  });
});
