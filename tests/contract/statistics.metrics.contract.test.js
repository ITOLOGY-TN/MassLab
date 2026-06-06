import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 11 (014-phase11-statistics) T011 — contract for GET /statistics, driven against
// specs/014-phase11-statistics/contracts/openapi.yaml via Supertest. Asserts the { data }
// envelope, the top-level Statistics keys, and the `metrics` slice shape (Metrics schema).
// Phase 11 is PURELY READ-ONLY and adds NO schema, so this suite performs no seeding/
// mutation and needs NO migration probe. Live-gated: skips when .env is missing or
// Supabase is unreachable.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[statistics.metrics.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[statistics.metrics.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /statistics — envelope + metrics slice', () => {
  it('returns the { data } envelope with all tab keys and the documented metrics shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/statistics');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();
    expect(typeof data).toBe('object');

    // --- top-level Statistics keys ---
    expect(data).toHaveProperty('metrics');
    expect(data).toHaveProperty('body');
    expect(data).toHaveProperty('strength');
    expect(data).toHaveProperty('attendance');
    expect(data).toHaveProperty('nutrition');
    expect(data).toHaveProperty('recovery');

    // --- metrics (Metrics schema) ---
    const { metrics } = data;
    expect(metrics).toBeTruthy();
    expect(typeof metrics).toBe('object');

    // total_weight_gained_kg: number-or-null.
    if (metrics.total_weight_gained_kg !== null) {
      expect(typeof metrics.total_weight_gained_kg).toBe('number');
    }

    // total_volume_kg: a number (0 cold-start).
    expect(typeof metrics.total_volume_kg).toBe('number');

    // session_completion_rate: integer completed/scheduled + number-or-null pct.
    const rate = metrics.session_completion_rate;
    expect(rate).toBeTruthy();
    expect(Number.isInteger(rate.completed)).toBe(true);
    expect(rate.completed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rate.scheduled)).toBe(true);
    expect(rate.scheduled).toBeGreaterThanOrEqual(0);
    if (rate.pct !== null) {
      expect(typeof rate.pct).toBe('number');
    }

    // avg_weekly_calories: number-or-null.
    if (metrics.avg_weekly_calories !== null) {
      expect(typeof metrics.avg_weekly_calories).toBe('number');
    }
  });
});
