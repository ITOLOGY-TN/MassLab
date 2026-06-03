import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 6 (009-body-weight-measurements) T029 [US3] — contract for
// GET /api/v1/body-tracking/measurements-table, against
// specs/009-body-weight-measurements/contracts/openapi.yaml. Read-only, so the
// shape holds even with no logged entries. Live-gated: skips when .env missing
// or Supabase unreachable.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[bodyTracking.measurementsTable.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('body_measurements').select('id').limit(1);
  if (probe.error) {
    console.warn('[bodyTracking.measurementsTable.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /api/v1/body-tracking/measurements-table', () => {
  it('returns the MeasurementsTable view shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/body-tracking/measurements-table');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data.months)).toBe(true);
    if (data.months.length) {
      const m = data.months[0];
      expect(m).toHaveProperty('month');
      expect(typeof m.fields).toBe('object');
      const cell = Object.values(m.fields)[0];
      if (cell) {
        expect(cell).toHaveProperty('value');
        expect(cell).toHaveProperty('delta');
        expect(['up', 'down', 'flat']).toContain(cell.direction);
      }
    }
  });
});
