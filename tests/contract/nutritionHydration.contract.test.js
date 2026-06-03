import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T037 — contract for the hydration surface:
// POST /nutrition/hydration, driven against
// specs/010-phase7-nutrition-calories/contracts/openapi.yaml via Supertest.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 7
// hydration_log migration is not applied. Mutates a far-past sentinel day and
// cleans up the row it creates.
let app;
let supabase;
let live = false;

// A sentinel past date unlikely to collide with real data (never in the future).
const SENTINEL_DATE = '2000-01-04';

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionHydration.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[nutritionHydration.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('hydration_log').select('athlete_id').limit(1);
  if (mig.error) {
    console.warn('[nutritionHydration.contract] skipped — Phase 7 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
  // Clear any sentinel row left by a previously interrupted run so the
  // accumulation assertions (total_ml) start from a known-zero baseline.
  await supabase.from('hydration_log').delete().eq('logged_on', SENTINEL_DATE);
});

afterAll(async () => {
  if (!live) return;
  await supabase.from('hydration_log').delete().eq('logged_on', SENTINEL_DATE);
});

describe('contract: nutrition hydration surface', () => {
  it('POST /nutrition/hydration adds water → 200 { total_ml, goal_ml }', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 500 });
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data).toHaveProperty('total_ml');
    expect(data).toHaveProperty('goal_ml');
    expect(data.total_ml).toBe(500);
    expect(typeof data.goal_ml).toBe('number');
  });

  it('POST /nutrition/hydration accumulates across calls', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 250 });
    expect(res.status).toBe(200);
    expect(res.body.data.total_ml).toBe(750);
  });

  it('POST /nutrition/hydration clamps the running total at 0 on undo (FR-015)', async () => {
    if (!live) return;
    // Running total is 750 ml from the prior cases; a single in-range undo larger
    // than the current total must clamp to 0 rather than go negative.
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: -5000 });
    expect(res.status).toBe(200);
    expect(res.body.data.total_ml).toBe(0);
  });

  it('POST /nutrition/hydration with an out-of-range delta is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 100000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/hydration with a future date is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: '2999-12-31', delta_ml: 250 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/hydration with a malformed date is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: 'not-a-date', delta_ml: 250 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/hydration with a non-integer delta is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 12.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/hydration with a missing delta is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});
