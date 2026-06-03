import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T016 — contract for the day-log surface:
// GET /nutrition/day, POST/PATCH/DELETE /nutrition/log, and GET/POST /foods, driven
// against specs/010-phase7-nutrition-calories/contracts/openapi.yaml via Supertest.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 7
// nutrition_logs migration is not applied. Mutates a far-past sentinel day and
// cleans up the rows it creates.
let app;
let supabase;
let live = false;
const created = []; // log-entry ids created by this suite

// A sentinel past date unlikely to collide with real data (never in the future).
const SENTINEL_DATE = '2000-01-03';

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionDay.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[nutritionDay.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('nutrition_logs').select('id').limit(1);
  if (mig.error) {
    console.warn('[nutritionDay.contract] skipped — Phase 7 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

afterAll(async () => {
  if (!live) return;
  if (created.length) {
    await supabase.from('nutrition_logs').delete().in('id', created);
  } else {
    await supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
  }
});

const SLOTS = ['breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack'];

describe('contract: nutrition day-log surface', () => {
  it('GET /nutrition/day returns the DayView envelope (empty state holds)', async () => {
    if (!live) return;
    const res = await request(app).get(`/api/v1/nutrition/day?date=${SENTINEL_DATE}`);
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.date).toBe(SENTINEL_DATE);
    expect(Array.isArray(data.slots)).toBe(true);
    for (const s of data.slots) {
      expect(SLOTS).toContain(s.slot);
      expect(Array.isArray(s.entries)).toBe(true);
      for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) {
        expect(s.subtotal).toHaveProperty(k);
      }
    }
    for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) {
      expect(data.totals).toHaveProperty(k);
      const bar = data.bars[k];
      expect(bar).toHaveProperty('value');
      expect(bar).toHaveProperty('target');
      expect(bar).toHaveProperty('pct');
      expect(['under', 'at', 'over']).toContain(bar.state);
    }
    expect(data.hydration).toHaveProperty('total_ml');
    expect(data.hydration).toHaveProperty('goal_ml');
  });

  it('GET /foods returns the Food list envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/foods');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length) {
      for (const k of ['id', 'name', 'kcal_per_100g', 'protein_per_100g']) {
        expect(res.body.data[0]).toHaveProperty(k);
      }
    }
  });

  it('POST /foods creates (or reconciles) a custom food → 201 Food envelope', async () => {
    if (!live) return;
    const res = await request(app).post('/api/v1/foods').send({
      name: 'Contract Test Food Phase7',
      kcal_per_100g: 250,
      protein_per_100g: 20,
      carbs_per_100g: 30,
      fat_per_100g: 5,
    });
    expect(res.status).toBe(201);
    const food = res.body.data;
    expect(food).toHaveProperty('id');
    expect(food).toHaveProperty('slug');
    expect(food.kcal_per_100g).toBe(250);
  });

  it('POST /foods with missing name is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app).post('/api/v1/foods').send({
      kcal_per_100g: 250,
      protein_per_100g: 20,
      carbs_per_100g: 30,
      fat_per_100g: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/log logs a custom food → 201 LogEntry with macro snapshot', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'breakfast',
        quantity_g: 200,
        custom_food: {
          name: 'Contract Log Food Phase7',
          kcal_per_100g: 100,
          protein_per_100g: 10,
          carbs_per_100g: 20,
          fat_per_100g: 2,
        },
      });
    expect(res.status).toBe(201);
    const entry = res.body.data;
    expect(entry).toHaveProperty('id');
    expect(entry.slot).toBe('breakfast');
    expect(entry.logged_on).toBe(SENTINEL_DATE);
    expect(entry.quantity_g).toBe(200);
    // 200 g of a 100 kcal/100 g food → 200 kcal snapshot.
    expect(entry.kcal).toBe(200);
    expect(entry.protein_g).toBe(20);
    for (const k of ['food_id', 'food_name', 'carbs_g', 'fat_g']) {
      expect(entry).toHaveProperty(k);
    }
    created.push(entry.id);
  });

  it('POST /nutrition/log with quantity_g <= 0 is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: SENTINEL_DATE,
      slot: 'lunch',
      quantity_g: 0,
      custom_food: {
        name: 'Contract Bad Qty Phase7',
        kcal_per_100g: 100,
        protein_per_100g: 10,
        carbs_per_100g: 20,
        fat_per_100g: 2,
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/log with a future date is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: '2999-12-31',
      slot: 'lunch',
      quantity_g: 100,
      custom_food: {
        name: 'Contract Future Phase7',
        kcal_per_100g: 100,
        protein_per_100g: 10,
        carbs_per_100g: 20,
        fat_per_100g: 2,
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /nutrition/log with neither food_id nor custom_food is rejected with 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/log')
      .send({ logged_on: SENTINEL_DATE, slot: 'lunch', quantity_g: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PATCH /nutrition/log/:id recomputes the macro snapshot → 200', async () => {
    if (!live) return;
    const post = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'dinner',
        quantity_g: 100,
        custom_food: {
          name: 'Contract Patch Food Phase7',
          kcal_per_100g: 100,
          protein_per_100g: 10,
          carbs_per_100g: 20,
          fat_per_100g: 2,
        },
      });
    expect(post.status).toBe(201);
    const id = post.body.data.id;
    created.push(id);

    const res = await request(app)
      .patch(`/api/v1/nutrition/log/${id}`)
      .send({ quantity_g: 300 });
    expect(res.status).toBe(200);
    expect(res.body.data.quantity_g).toBe(300);
    // Snapshot rescaled: 300 g of 100 kcal/100 g → 300 kcal.
    expect(res.body.data.kcal).toBe(300);
  });

  it('PATCH /nutrition/log/:id with an invalid quantity is rejected with 400', async () => {
    if (!live) return;
    const post = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'dinner',
        quantity_g: 100,
        custom_food: {
          name: 'Contract Patch Bad Phase7',
          kcal_per_100g: 100,
          protein_per_100g: 10,
          carbs_per_100g: 20,
          fat_per_100g: 2,
        },
      });
    expect(post.status).toBe(201);
    const id = post.body.data.id;
    created.push(id);

    const res = await request(app).patch(`/api/v1/nutrition/log/${id}`).send({ quantity_g: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PATCH /nutrition/log/:id for a non-owned/missing id returns 404', async () => {
    if (!live) return;
    const res = await request(app)
      .patch('/api/v1/nutrition/log/999999999')
      .send({ quantity_g: 100 });
    expect(res.status).toBe(404);
  });

  it('DELETE /nutrition/log/:id removes the entry → 204', async () => {
    if (!live) return;
    const post = await request(app)
      .post('/api/v1/nutrition/log')
      .send({
        logged_on: SENTINEL_DATE,
        slot: 'evening_snack',
        quantity_g: 100,
        custom_food: {
          name: 'Contract Delete Food Phase7',
          kcal_per_100g: 100,
          protein_per_100g: 10,
          carbs_per_100g: 20,
          fat_per_100g: 2,
        },
      });
    expect(post.status).toBe(201);
    const id = post.body.data.id;

    const res = await request(app).delete(`/api/v1/nutrition/log/${id}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /nutrition/log/:id for a non-owned/missing id returns 404', async () => {
    if (!live) return;
    const res = await request(app).delete('/api/v1/nutrition/log/999999999');
    expect(res.status).toBe(404);
  });
});
