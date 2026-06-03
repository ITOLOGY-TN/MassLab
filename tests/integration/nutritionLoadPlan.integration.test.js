import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T027 — US2 load-plan against the live API:
//  - empty day load fills the five meal slots from the seeded template items (D-6/FR-010);
//  - a non-empty day with NO mode → 409 LOAD_PLAN_CONFLICT (never silent overwrite, FR-011);
//  - mode=replace clears the day then re-inserts the template;
//  - mode=append adds the template on top of existing entries;
//  - loaded entries are editable (PATCH) and deletable (DELETE) like any logged entry;
//  - an RLS probe: the publishable-key client cannot read nutrition_template_meal_items.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the
// nutrition_template_meal_items migration is not applied. The "fills the slots"
// assertions additionally skip when the template has no seeded items for the test
// athlete. Cleanup is scoped to the test athlete + the sentinel day.
let app;
let config;
let supabase;
let live = false;

const SENTINEL_DATE = '2000-01-05';

let testAthleteId = null;
let templateItems = [];

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionLoadPlan.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('nutrition_template_meal_items').select('id').limit(1);
  if (probe.error) {
    console.warn(
      '[nutritionLoadPlan.integration] skipped — nutrition_template_meal_items migration not applied',
    );
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
  // Clean any leftovers from a prior interrupted run.
  await supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
});

afterAll(async () => {
  if (!live) return;
  let del = supabase.from('nutrition_logs').delete().eq('logged_on', SENTINEL_DATE);
  if (testAthleteId) del = del.eq('athlete_id', testAthleteId);
  await del;
});

// Learn the test athlete id (load-plan uses req.athleteId, never a caller-supplied
// tenant). We log one entry, capture the id, then delete it so the day starts empty.
async function discoverAthlete() {
  const foods = await request(app).get('/api/v1/foods');
  const food = foods.body.data[0];
  const logged = await request(app).post('/api/v1/nutrition/log').send({
    logged_on: SENTINEL_DATE,
    slot: 'breakfast',
    quantity_g: 100,
    food_id: food.id,
  });
  expect(logged.status).toBe(201);
  testAthleteId = logged.body.data.athlete_id;
  await request(app).delete(`/api/v1/nutrition/log/${logged.body.data.id}`);
  const items = await supabase
    .from('nutrition_template_meal_items')
    .select('id, slot')
    .eq('athlete_id', testAthleteId);
  templateItems = items.data ?? [];
}

describe('nutrition load-plan lifecycle (Phase 7 US2)', () => {
  it('fills the day from seeded template items on an empty day (D-6/FR-010)', async () => {
    if (!live) return;
    await discoverAthlete();
    if (templateItems.length === 0) {
      console.warn('[nutritionLoadPlan.integration] no template items seeded — skipping fill');
      return;
    }

    // Empty day → loads regardless of mode (mode omitted).
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE });
    expect(res.status).toBe(200);
    const dv = res.body.data;
    expect(dv.date).toBe(SENTINEL_DATE);

    // Every seeded slot now has at least one entry.
    const seededSlots = new Set(templateItems.map((i) => i.slot));
    const loadedEntries = dv.slots.flatMap((s) => s.entries);
    expect(loadedEntries.length).toBe(templateItems.length);
    for (const slot of seededSlots) {
      const slotView = dv.slots.find((s) => s.slot === slot);
      expect(slotView.entries.length).toBeGreaterThan(0);
    }
    // Day totals reflect the loaded entries (non-zero).
    expect(dv.totals.kcal).toBeGreaterThan(0);
  });

  it('returns 409 LOAD_PLAN_CONFLICT on a non-empty day with no mode (FR-011)', async () => {
    if (!live) return;
    if (templateItems.length === 0) return;

    // The day is non-empty from the previous test.
    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOAD_PLAN_CONFLICT');
  });

  it('mode=replace clears the day then re-inserts the template', async () => {
    if (!live) return;
    if (templateItems.length === 0) return;

    // Add an extra entry so the day has more than the template's worth.
    const foods = await request(app).get('/api/v1/foods');
    const extra = await request(app).post('/api/v1/nutrition/log').send({
      logged_on: SENTINEL_DATE,
      slot: 'dinner',
      quantity_g: 100,
      food_id: foods.body.data[0].id,
    });
    expect(extra.status).toBe(201);

    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE, mode: 'replace' });
    expect(res.status).toBe(200);
    const loaded = res.body.data.slots.flatMap((s) => s.entries);
    // The extra entry is gone; only the template's items remain.
    expect(loaded.length).toBe(templateItems.length);
    expect(loaded.some((e) => e.id === extra.body.data.id)).toBe(false);
  });

  it('mode=append adds the template on top of existing entries', async () => {
    if (!live) return;
    if (templateItems.length === 0) return;

    const before = await request(app)
      .get('/api/v1/nutrition/day')
      .query({ date: SENTINEL_DATE });
    const beforeCount = before.body.data.slots.flatMap((s) => s.entries).length;

    const res = await request(app)
      .post('/api/v1/nutrition/load-plan')
      .send({ date: SENTINEL_DATE, mode: 'append' });
    expect(res.status).toBe(200);
    const afterCount = res.body.data.slots.flatMap((s) => s.entries).length;
    expect(afterCount).toBe(beforeCount + templateItems.length);
  });

  it('loaded entries are editable and deletable like any logged entry', async () => {
    if (!live) return;
    if (templateItems.length === 0) return;

    const day = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    const entry = day.body.data.slots.flatMap((s) => s.entries)[0];
    expect(entry).toBeTruthy();

    // Edit: double the quantity → the snapshot rescales proportionally.
    const newQty = Number(entry.quantity_g) * 2;
    const edit = await request(app)
      .patch(`/api/v1/nutrition/log/${entry.id}`)
      .send({ quantity_g: newQty });
    expect(edit.status).toBe(200);
    expect(edit.body.data.quantity_g).toBe(newQty);
    expect(edit.body.data.kcal).toBeCloseTo(Number(entry.kcal) * 2, 2);

    // Delete: the entry disappears from the day view.
    const del = await request(app).delete(`/api/v1/nutrition/log/${entry.id}`);
    expect(del.status).toBe(204);
    const after = await request(app).get('/api/v1/nutrition/day').query({ date: SENTINEL_DATE });
    expect(after.body.data.slots.flatMap((s) => s.entries).some((e) => e.id === entry.id)).toBe(
      false,
    );
  });

  it('RLS — the publishable-key client cannot read nutrition_template_meal_items', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('nutrition_template_meal_items').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
