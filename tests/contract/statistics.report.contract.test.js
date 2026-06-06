import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T051 — contract for GET /statistics/report, driven
// against specs/014-phase11-statistics/contracts/openapi.yaml via Supertest. Covers the
// month-scoped payload, the default (most-recently-completed-month) behaviour, and the
// malformed-month 400. Phase 11 is PURELY READ-ONLY and adds NO schema — no seeding/
// mutation, no migration probe. Live-gated: skips when .env is missing or Supabase is
// unreachable.
let app;
let live = false;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.report.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.report.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /statistics/report', () => {
  it('returns the documented Report shape for ?month=2026-05', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics/report?month=2026-05');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();
    expect(typeof data).toBe('object');

    // --- period ---
    const { period } = data;
    expect(period).toBeTruthy();
    expect(period.month).toBe('2026-05');
    expect(typeof period.from).toBe('string');
    expect(period.from).toMatch(ISO_DATE);
    expect(typeof period.to).toBe('string');
    expect(period.to).toMatch(ISO_DATE);
    expect(typeof period.label).toBe('string');

    // --- summary ---
    const { summary } = data;
    expect(summary).toBeTruthy();
    expect(typeof summary.volume_kg).toBe('number');
    expect(Number.isInteger(summary.sessions_completed)).toBe(true);
    expect(summary.sessions_completed).toBeGreaterThanOrEqual(0);
    if (summary.weight_change_kg !== null) {
      expect(typeof summary.weight_change_kg).toBe('number');
    }
    if (summary.avg_daily_calories !== null) {
      expect(typeof summary.avg_daily_calories).toBe('number');
    }
    if (summary.avg_sleep_hours !== null) {
      expect(typeof summary.avg_sleep_hours).toBe('number');
    }

    // --- lifetime ---
    const { lifetime } = data;
    expect(lifetime).toBeTruthy();
    if (lifetime.total_weight_gained_kg !== null) {
      expect(typeof lifetime.total_weight_gained_kg).toBe('number');
    }
    expect(typeof lifetime.total_volume_kg).toBe('number');
    if (lifetime.session_completion_pct !== null) {
      expect(typeof lifetime.session_completion_pct).toBe('number');
    }
    if (lifetime.avg_weekly_calories !== null) {
      expect(typeof lifetime.avg_weekly_calories).toBe('number');
    }

    // --- topProgressions (<= 3) ---
    expect(Array.isArray(data.topProgressions)).toBe(true);
    expect(data.topProgressions.length).toBeLessThanOrEqual(3);
    for (const p of data.topProgressions) {
      expect(Number.isInteger(p.exercise_id)).toBe(true);
      expect(typeof p.name).toBe('string');
      expect(typeof p.gain_kg).toBe('number');
    }

    // --- weightSeries ---
    expect(Array.isArray(data.weightSeries)).toBe(true);
    for (const p of data.weightSeries) {
      expect(typeof p.date).toBe('string');
      expect(p.date).toMatch(ISO_DATE);
      expect(typeof p.weight_kg).toBe('number');
    }

    // --- recommendations ---
    expect(Array.isArray(data.recommendations)).toBe(true);
    for (const r of data.recommendations) {
      expect(typeof r.key).toBe('string');
      expect(typeof r.message).toBe('string');
    }
  });

  it('defaults to the most recently completed month when no month param is given', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics/report');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();
    expect(data.period).toBeTruthy();
    expect(data.period.month).toMatch(MONTH_RE);
  });

  it('returns 400 VALIDATION_ERROR for a malformed month param', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics/report?month=2026-13');
    expect(res.status).toBe(400);

    const { error } = res.body;
    expect(error).toBeTruthy();
    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
