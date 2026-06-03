import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T026 — US2 contract for the template-plan
// loader: POST /nutrition/load-plan, driven against
// specs/010-phase7-nutrition-calories/contracts/openapi.yaml via Supertest.
// Empty day loads regardless of mode (200); a non-empty day requires an explicit
// mode, else 409 LOAD_PLAN_CONFLICT (never a silent overwrite); 'replace'/'append'
// both return 200; bad mode/date return 400.
// Live-gated: skips when .env is missing, Supabase is unreachable, the Phase 7
// nutrition_logs migration is not applied, or the nutrition_template_meal_items
// table is absent. Mutates a far-past sentinel day and cleans up its rows.
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
      console.warn('[nutritionLoadPlan.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[nutritionLoadPlan.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('nutrition_logs').select('id').limit(1);
  if (mig.error) {
    console.warn('[nutritionLoadPlan.contract] skipped — Phase 7 nutrition_logs migration not applied');
    return;
  }
  const tmpl = await supabase.from('nutrition_template_meal_items').select('id').limit(1);
  if (tmpl.error) {
    console.warn(
      '[nutritionLoadPlan.contract] skipped — nutrition_template_meal_items migration not applied',
    );
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

afterAll(async () => {
  if (!live) return;
  await supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
});

// Reset the sentinel day to empty before each shared-state assertion so the suite
// is order-independent against whatever rows a prior run/test left behind.
async function clearDay() {
  await supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
}

// Seed one log entry so the day is non-empty (drives the 409 / mode paths).
async function seedEntry() {
  const res = await request(app)
    .post('/api/v1/nutrition/log')
    .send({
      logged_on: SENTINEL_DATE,
      slot: 'breakfast',
      quantity_g: 100,
      custom_food: {
        name: 'Contract LoadPlan Seed Phase7',
        kcal_per_100g: 100,
        protein_per_100g: 10,
        carbs_per_100g: 20,
        fat_per_100g: 2,
      },
    });
  expect(res.status).toBe(201);
}

describe('contract: nutrition load-plan surface', () => {
  it('POST /nutrition/load-plan on an empty day → 200 DayView (no mode required)', async () => {
    if (!live) return;
    await clearDay();
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE });
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.date).toBe(SENTINEL_DATE);
    expect(Array.isArray(data.slots)).toBe(true);
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) {
      expect(data.totals).toHaveProperty(k);
    }
  });

  it('POST /nutrition/load-plan on a non-empty day with mode=replace → 200 DayView', async () => {
    if (!live) return;
    await clearDay();
    await seedEntry();
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE, mode: 'replace' });
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe(SENTINEL_DATE);
    expect(Array.isArray(res.body.data.slots)).toBe(true);
  });

  it('POST /nutrition/load-plan on a non-empty day with mode=append → 200 DayView', async () => {
    if (!live) return;
    await clearDay();
    await seedEntry();
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE, mode: 'append' });
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe(SENTINEL_DATE);
    expect(Array.isArray(res.body.data.slots)).toBe(true);
  });

  it('POST /nutrition/load-plan on a non-empty day with no mode → 409 LOAD_PLAN_CONFLICT', async () => {
    if (!live) return;
    await clearDay();
    await seedEntry();
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOAD_PLAN_CONFLICT');
  });

  it('POST /nutrition/load-plan with an invalid mode is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE, mode: 'merge' });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/load-plan with a malformed date is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: '01-04-2000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/load-plan with a future date is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: '2999-12-31' });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});
