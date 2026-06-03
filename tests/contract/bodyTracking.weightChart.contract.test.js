import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 6 (009-body-weight-measurements) T020 [US2] — contract for
// GET /api/v1/body-tracking/weight-chart, against
// specs/009-body-weight-measurements/contracts/openapi.yaml. Read-only, so the
// shape holds even with no logged entries (empty/low-data state). Live-gated:
// skips when .env missing or Supabase unreachable.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[bodyTracking.weightChart.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('body_measurements').select('id').limit(1);
  if (probe.error) {
    console.warn('[bodyTracking.weightChart.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /api/v1/body-tracking/weight-chart', () => {
  it('returns the WeightChart view shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/body-tracking/weight-chart');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data.points)).toBe(true);
    expect(Array.isArray(data.phaseMarkers)).toBe(true);
    expect(typeof data.hasTrend).toBe('boolean');
    // goalKg / zone are nullable (FR-017/FR-018).
    expect(['number', 'object']).toContain(typeof data.goalKg); // number or null(object)
    if (data.points.length) {
      const p = data.points[0];
      expect(p).toHaveProperty('date');
      expect(p).toHaveProperty('kg');
    }
    if (data.zone) {
      expect(Array.isArray(data.zone.lower)).toBe(true);
      expect(Array.isArray(data.zone.upper)).toBe(true);
    }
  });
});
