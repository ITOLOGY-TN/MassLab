import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T012 — integration for the `metrics` slice of
// GET /api/v1/statistics, driven against the live API via Supertest. The statistics
// endpoint is PURELY READ-ONLY: it composes data the athlete already owns and never
// writes / re-runs the engine. This suite asserts:
//   1. The metrics slice is internally consistent for the seeded athlete (finite
//      numbers, completion bounds, pct null iff scheduled === 0).
//   2. READ-ONLY (SC-011): a GET leaves row counts unchanged across every read source
//      (body_measurements, one_rep_max_records, session_journal_entries, nutrition_logs,
//      recovery_log) AND writes NO calculation_results — the read-only guarantee.
//
// Live-gated: skips when .env is absent or Supabase is unreachable. Phase 11 adds no
// schema, so there is no migration probe.
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
      console.warn('[statistics.metrics] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  // Connectivity probe (Phase 11 adds no schema — probe an existing table).
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.metrics] skipped — Supabase unreachable');
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
    console.warn('[statistics.metrics] skipped — no seeded athlete');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: statistics metrics slice (Phase 11)', () => {
  it('metrics is internally consistent for the seeded athlete', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);

    const m = res.body.data.metrics;
    expect(m).toBeTruthy();

    // total_weight_gained_kg: nullable (no weight logged) else a finite number.
    expect(m.total_weight_gained_kg === null || Number.isFinite(m.total_weight_gained_kg)).toBe(
      true,
    );

    // total_volume_kg: a finite number, never negative (Σ finished-session volume; 0 cold).
    expect(Number.isFinite(m.total_volume_kg)).toBe(true);
    expect(m.total_volume_kg).toBeGreaterThanOrEqual(0);

    // session_completion_rate: completed/scheduled are non-negative integers; completed
    // never exceeds the sane bound of scheduled-to-date; pct is null iff scheduled === 0.
    const rate = m.session_completion_rate;
    expect(Number.isInteger(rate.completed)).toBe(true);
    expect(Number.isInteger(rate.scheduled)).toBe(true);
    expect(rate.completed).toBeGreaterThanOrEqual(0);
    expect(rate.scheduled).toBeGreaterThanOrEqual(0);
    expect(rate.completed).toBeLessThanOrEqual(rate.scheduled);
    if (rate.scheduled === 0) {
      expect(rate.pct).toBeNull();
    } else {
      expect(rate.pct === null || Number.isFinite(rate.pct)).toBe(true);
      if (rate.pct !== null) {
        expect(rate.pct).toBeGreaterThanOrEqual(0);
        expect(rate.pct).toBeLessThanOrEqual(100);
      }
    }

    // avg_weekly_calories: nullable (none logged) else a finite, non-negative number.
    expect(m.avg_weekly_calories === null || Number.isFinite(m.avg_weekly_calories)).toBe(true);
    if (m.avg_weekly_calories !== null) {
      expect(m.avg_weekly_calories).toBeGreaterThanOrEqual(0);
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

    // No read source gained or lost a row across the GET — the read-only guarantee.
    for (let i = 0; i < TABLES.length; i += 1) {
      expect(after[i].count ?? 0).toBe(before[i].count ?? 0);
    }
  });
});
