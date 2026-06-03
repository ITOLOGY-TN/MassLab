import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T017 — nutrition logging against the
// live API:
//  - log a catalogue food + a custom food → GET /nutrition/day totals = sum (FR-001/FR-006);
//  - edit quantity → recompute, delete → recompute (FR-005);
//  - quantity_g <= 0 and > 5000 → 400, future logged_on → 400 (FR-004/FR-024);
//  - a custom food persists into the catalogue and is found by GET /foods?q= (FR-002a/FR-002);
//  - a duplicate custom name reconciles to the same row (no duplicate, FR-002a);
//  - SC-008 STABILITY: re-pricing the referenced catalogue food's reference macros
//    leaves a prior entry's stored snapshot AND the day total UNCHANGED (D-4);
//  - an RLS probe: the publishable-key client cannot read nutrition_logs.
// Live-gated: skips when .env missing, Supabase unreachable, or the nutrition_logs
// migration is not yet applied. Cleanup is scoped to the test athlete + the
// sentinel ids/foods created here.
let app;
let config;
let supabase;
let live = false;

const SENTINEL_DATE = '2000-01-04';
const FUTURE_DATE = '2999-12-31';
const CUSTOM_NAME = 'ZZTest Custom Food 010';
const CUSTOM_SLUG = 'zztest-custom-food-010';

let testAthleteId = null;
const createdLogIds = [];
const createdFoodIds = [];

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionLog.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('nutrition_logs').select('id').limit(1);
  if (probe.error) {
    console.warn('[nutritionLog.integration] skipped — nutrition_logs migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
  // Clean any leftovers from a prior interrupted run.
  await supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
});

afterAll(async () => {
  if (!live) return;
  // Remove the log rows first (FK ON DELETE RESTRICT → foods can't go before logs).
  let delLogs = supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
  if (testAthleteId) delLogs = delLogs.eq('athlete_id', testAthleteId);
  await delLogs;
  // Then the custom food(s) created by this test, scoped to the test athlete + slug.
  if (testAthleteId) {
    await supabase
      .from('foods')
      .delete()
      .eq('athlete_id', testAthleteId)
      .eq('slug', CUSTOM_SLUG);
  }
});

describe('nutrition logging lifecycle (Phase 7)', () => {
  it('logs a catalogue food + a custom food → day totals equal the sum (FR-001/FR-006)', async () => {
    if (!live) return;

    // A catalogue food to log against (seeded; non-custom).
    const foods = await request(app).get('/api/v1/foods');
    expect(foods.status).toBe(200);
    expect(Array.isArray(foods.body.data)).toBe(true);
    expect(foods.body.data.length).toBeGreaterThan(0);
    const catalogueFood = foods.body.data[0];

    // 1) catalogue food at 80 g.
    const catRes = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'breakfast',
        quantity_g: 80,
        food_id: catalogueFood.id,
      });
    expect(catRes.status).toBe(201);
    testAthleteId = catRes.body.data.athlete_id;
    createdLogIds.push(catRes.body.data.id);
    const catEntry = catRes.body.data;
    // snapshot = per-100g × 0.8.
    expect(catEntry.kcal).toBeCloseTo(Number(catalogueFood.kcal_per_100g) * 0.8, 2);

    // 2) a custom food at 150 g (created/reconciled inline).
    const customRes = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'lunch',
        quantity_g: 150,
        custom_food: {
          name: CUSTOM_NAME,
          kcal_per_100g: 200,
          protein_per_100g: 25,
          carbs_per_100g: 10,
          fat_per_100g: 5,
        },
      });
    expect(customRes.status).toBe(201);
    createdLogIds.push(customRes.body.data.id);
    if (customRes.body.data.food_id) createdFoodIds.push(customRes.body.data.food_id);
    const customEntry = customRes.body.data;
    expect(customEntry.food_name).toBe(CUSTOM_NAME);
    expect(customEntry.kcal).toBeCloseTo(200 * 1.5, 2); // 300
    expect(customEntry.protein_g).toBeCloseTo(25 * 1.5, 2); // 37.5

    // GET /nutrition/day → totals == sum of the two snapshots.
    const day = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    expect(day.status).toBe(200);
    const dv = day.body.data;
    expect(dv.date).toBe(SENTINEL_DATE);
    expect(dv.totals.kcal).toBeCloseTo(catEntry.kcal + customEntry.kcal, 2);
    expect(dv.totals.protein_g).toBeCloseTo(catEntry.protein_g + customEntry.protein_g, 2);
    expect(dv.totals.carbs_g).toBeCloseTo(catEntry.carbs_g + customEntry.carbs_g, 2);
    expect(dv.totals.fat_g).toBeCloseTo(catEntry.fat_g + customEntry.fat_g, 2);

    // Per-slot subtotals match each entry.
    const breakfast = dv.slots.find((s) => s.slot === 'breakfast');
    const lunch = dv.slots.find((s) => s.slot === 'lunch');
    expect(breakfast.subtotal.kcal).toBeCloseTo(catEntry.kcal, 2);
    expect(lunch.subtotal.kcal).toBeCloseTo(customEntry.kcal, 2);
  });

  it('edits a quantity → recomputes the snapshot and the day total (FR-005)', async () => {
    if (!live) return;
    const id = createdLogIds[1]; // the custom-food entry at 150 g
    const before = await request(app)
      .get('/api/v1/nutrition/day')
      .query({ date: SENTINEL_DATE });
    const beforeTotal = before.body.data.totals.kcal;

    const editRes = await request(app)
      .patch(`/api/v1/nutrition/log/${id}`)
      .send({ quantity_g: 300 }); // double → kcal 600
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.quantity_g).toBe(300);
    expect(editRes.body.data.kcal).toBeCloseTo(200 * 3, 2); // 600

    const after = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    // +300 kcal vs the prior 150 g entry (which contributed 300 kcal).
    expect(after.body.data.totals.kcal).toBeCloseTo(beforeTotal + 300, 2);
  });

  it('deletes an entry → recomputes the day total (FR-005)', async () => {
    if (!live) return;
    const id = createdLogIds[1];
    const before = await request(app)
      .get('/api/v1/nutrition/day')
      .query({ date: SENTINEL_DATE });
    const removed = before.body.data.slots
      .flatMap((s) => s.entries)
      .find((e) => e.id === id);
    expect(removed).toBeTruthy();

    const delRes = await request(app).delete(`/api/v1/nutrition/log/${id}`);
    expect(delRes.status).toBe(204);
    createdLogIds.splice(1, 1);

    const after = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    expect(after.body.data.totals.kcal).toBeCloseTo(
      before.body.data.totals.kcal - removed.kcal,
      2,
    );
    expect(after.body.data.slots.flatMap((s) => s.entries).some((e) => e.id === id)).toBe(false);
  });

  it('rejects quantity_g <= 0 with 400 (FR-004)', async () => {
    if (!live) return;
    const foods = await request(app).get('/api/v1/foods');
    const res = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: SENTINEL_DATE,
      slot: 'dinner',
      quantity_g: 0,
      food_id: foods.body.data[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects quantity_g > 5000 with 400 (FR-004)', async () => {
    if (!live) return;
    const foods = await request(app).get('/api/v1/foods');
    const res = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: SENTINEL_DATE,
      slot: 'dinner',
      quantity_g: 5001,
      food_id: foods.body.data[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a future logged_on with 400 VALIDATION_FAILED (FR-024)', async () => {
    if (!live) return;
    const foods = await request(app).get('/api/v1/foods');
    const res = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: FUTURE_DATE,
      slot: 'dinner',
      quantity_g: 100,
      food_id: foods.body.data[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('persists the custom food into the catalogue, found by GET /foods?q= (FR-002a/FR-002)', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/foods').query({ q: 'ZZTest Custom Food' });
    expect(res.status).toBe(200);
    const match = res.body.data.find((f) => f.name === CUSTOM_NAME);
    expect(match).toBeTruthy();
    expect(match.slug).toBe(CUSTOM_SLUG);
    expect(match.category).toBe('custom');
  });

  it('reconciles a duplicate custom name to the same row — no duplicate (FR-002a)', async () => {
    if (!live) return;
    // POST /foods with the same name (different macros) must upsert on the slug.
    const post = await request(app).post('/api/v1/foods').send({
      name: CUSTOM_NAME,
      kcal_per_100g: 222,
      protein_per_100g: 22,
      carbs_per_100g: 22,
      fat_per_100g: 2,
    });
    expect(post.status).toBe(201);
    expect(post.body.data.slug).toBe(CUSTOM_SLUG);
    if (post.body.data.id) createdFoodIds.push(post.body.data.id);

    // Exactly one row for this athlete + slug exists.
    const { data, error } = await supabase
      .from('foods')
      .select('id')
      .eq('athlete_id', testAthleteId)
      .eq('slug', CUSTOM_SLUG);
    expect(error).toBeFalsy();
    expect(data.length).toBe(1);
  });

  it('SC-008 — re-pricing a catalogue food leaves prior entries + the day total UNCHANGED', async () => {
    if (!live) return;
    // The surviving entry is the catalogue-food breakfast log (createdLogIds[0]).
    const entryId = createdLogIds[0];

    const before = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    const entryBefore = before.body.data.slots
      .flatMap((s) => s.entries)
      .find((e) => e.id === entryId);
    expect(entryBefore).toBeTruthy();
    const dayTotalBefore = before.body.data.totals.kcal;

    // Read the referenced food, then re-price its reference macros via the upsert
    // write path (createForAthlete reconciles on (athlete_id, slug, locale)).
    const { data: food } = await supabase
      .from('foods')
      .select('*')
      .eq('athlete_id', testAthleteId)
      .eq('id', entryBefore.food_id)
      .single();
    const newKcal = Number(food.kcal_per_100g) + 500;
    const up = await supabase
      .from('foods')
      .update({
        kcal_per_100g: newKcal,
        protein_per_100g: Number(food.protein_per_100g) + 50,
        carbs_per_100g: Number(food.carbs_per_100g) + 50,
        fat_per_100g: Number(food.fat_per_100g) + 50,
      })
      .eq('athlete_id', testAthleteId)
      .eq('id', food.id)
      .select('*')
      .single();
    expect(up.error).toBeFalsy();
    expect(Number(up.data.kcal_per_100g)).toBeCloseTo(newKcal, 2);

    // The stored snapshot on the prior entry is unchanged.
    const after = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    const entryAfter = after.body.data.slots
      .flatMap((s) => s.entries)
      .find((e) => e.id === entryId);
    expect(entryAfter.kcal).toBeCloseTo(entryBefore.kcal, 2);
    expect(entryAfter.protein_g).toBeCloseTo(entryBefore.protein_g, 2);
    expect(entryAfter.carbs_g).toBeCloseTo(entryBefore.carbs_g, 2);
    expect(entryAfter.fat_g).toBeCloseTo(entryBefore.fat_g, 2);
    // And the day total is unchanged.
    expect(after.body.data.totals.kcal).toBeCloseTo(dayTotalBefore, 2);

    // Restore the catalogue food's macros so re-running the suite is idempotent.
    await supabase
      .from('foods')
      .update({
        kcal_per_100g: food.kcal_per_100g,
        protein_per_100g: food.protein_per_100g,
        carbs_per_100g: food.carbs_per_100g,
        fat_per_100g: food.fat_per_100g,
      })
      .eq('athlete_id', testAthleteId)
      .eq('id', food.id);
  });

  it('RLS — the publishable-key client cannot read nutrition_logs', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('nutrition_logs').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
