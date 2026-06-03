import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 6 (009-body-weight-measurements) T009 [US1] — contract for
// POST /api/v1/body-measurements (201 envelope) + GET (date-descending history),
// against specs/009-body-weight-measurements/contracts/openapi.yaml.
// Live-gated: skips when .env missing or Supabase unreachable. Mutates the
// shared athlete's weigh-in for a far-past sentinel date, then leaves it (the
// row is harmless and idempotent on re-run via the one-per-day upsert).
let app;
let supabase;
let live = false;

// A sentinel past date unlikely to collide with real data.
const SENTINEL_DATE = '2000-01-02';

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[bodyMeasurements.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('body_measurements').select('id').limit(1);
  if (probe.error) {
    console.warn('[bodyMeasurements.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

afterAll(async () => {
  if (!live) return;
  await supabase.from('body_measurements').delete().eq('measured_on', SENTINEL_DATE);
});

describe('contract: /api/v1/body-measurements', () => {
  it('POST returns the 201 envelope { measurement, body_composition, program_id }', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: SENTINEL_DATE, weight_kg: 60, arm_cm: 38 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('measurement');
    expect(res.body.data).toHaveProperty('body_composition');
    expect(res.body.data).toHaveProperty('program_id');
    expect(res.body.data.measurement.measured_on).toBe(SENTINEL_DATE);
  });

  it('POST with neither weight nor a circumference is rejected (FR-003)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: SENTINEL_DATE, note: 'no numbers' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('POST with a future date is rejected with 400 VALIDATION_FAILED (FR-005)', async () => {
    if (!live) return;
    const future = '2999-12-31';
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: future, weight_kg: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET returns date-descending history', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/body-measurements?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const dates = res.body.data.map((m) => m.measured_on);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(sorted);
  });
});
