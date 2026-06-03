import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T038 — US3 hydration against the live API:
//  - POST +250 then +500 → running total = 750 (FR-013 upsert-increment);
//  - undo -1000 → clamps to 0, never negative (FR-015);
//  - a different day's counter is independent;
//  - goal_ml reflects engine_overrides.hydration.goal_ml when set, else the
//    config HYDRATION_GOAL_ML default (D-9);
//  - an RLS probe: the publishable-key client cannot read hydration_log.
// Live-gated: skips when .env missing, Supabase unreachable, or the hydration_log
// migration is not yet applied. Cleanup is scoped to the test athlete + the
// sentinel dates, and restores the athlete's prior engine_overrides.
let app;
let config;
let supabase;
let live = false;

const SENTINEL_DATE = '2000-01-05';
const OTHER_DATE = '2000-01-06';

let testAthleteId = null;
let priorOverrides = null;
let overridesTouched = false;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionHydration.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('hydration_log').select('athlete_id').limit(1);
  if (probe.error) {
    console.warn('[nutritionHydration.integration] skipped — hydration_log migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
  // Clean any leftovers from a prior interrupted run.
  await supabase.from('hydration_log').delete().in('logged_on', [SENTINEL_DATE, OTHER_DATE]);
});

afterAll(async () => {
  if (!live) return;
  let del = supabase.from('hydration_log').delete().in('logged_on', [SENTINEL_DATE, OTHER_DATE]);
  if (testAthleteId) del = del.eq('athlete_id', testAthleteId);
  await del;
  // Restore the athlete's engine_overrides exactly as they were before the test.
  if (overridesTouched && testAthleteId) {
    await supabase
      .from('app_config')
      .update({ engine_overrides: priorOverrides ?? {} })
      .eq('athlete_id', testAthleteId);
  }
});

describe('hydration tracking lifecycle (Phase 7 US3)', () => {
  it('adds +250 then +500 → running total = 750 (FR-013)', async () => {
    if (!live) return;

    const first = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 250 });
    expect(first.status).toBe(200);
    expect(first.body.data.total_ml).toBe(250);

    const second = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 500 });
    expect(second.status).toBe(200);
    expect(second.body.data.total_ml).toBe(750);

    // Capture the test athlete from the persisted row (the hydration response
    // omits athlete_id; the auth middleware resolved it server-side).
    const { data, error } = await supabase
      .from('hydration_log')
      .select('athlete_id, total_ml')
      .eq('logged_on', SENTINEL_DATE);
    expect(error).toBeFalsy();
    expect(data.length).toBe(1);
    expect(data[0].total_ml).toBe(750);
    testAthleteId = data[0].athlete_id;
  });

  it('undoes -1000 → clamps to 0, never negative (FR-015)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: -1000 });
    expect(res.status).toBe(200);
    expect(res.body.data.total_ml).toBe(0);

    const { data } = await supabase
      .from('hydration_log')
      .select('total_ml')
      .eq('athlete_id', testAthleteId)
      .eq('logged_on', SENTINEL_DATE)
      .single();
    expect(data.total_ml).toBe(0);
  });

  it("a different day's counter is independent", async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: OTHER_DATE, delta_ml: 300 });
    expect(res.status).toBe(200);
    expect(res.body.data.total_ml).toBe(300);

    // The sentinel day is still 0 — the two days do not share a counter.
    const { data } = await supabase
      .from('hydration_log')
      .select('logged_on, total_ml')
      .eq('athlete_id', testAthleteId)
      .in('logged_on', [SENTINEL_DATE, OTHER_DATE]);
    const byDay = Object.fromEntries(data.map((r) => [r.logged_on, r.total_ml]));
    expect(byDay[SENTINEL_DATE]).toBe(0);
    expect(byDay[OTHER_DATE]).toBe(300);
  });

  it('goal_ml falls back to the config default when no override is set (D-9)', async () => {
    if (!live) return;
    // Ensure no hydration override is present for this athlete.
    priorOverrides = await supabase
      .from('app_config')
      .select('engine_overrides')
      .eq('athlete_id', testAthleteId)
      .maybeSingle()
      .then((r) => r.data?.engine_overrides ?? {});
    overridesTouched = true;
    const withoutHydration = { ...priorOverrides };
    delete withoutHydration.hydration;
    await supabase
      .from('app_config')
      .upsert(
        { athlete_id: testAthleteId, engine_overrides: withoutHydration },
        { onConflict: 'athlete_id' },
      );

    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.goal_ml).toBe(config.HYDRATION_GOAL_ML);
  });

  it('goal_ml reflects engine_overrides.hydration.goal_ml when set (D-9)', async () => {
    if (!live) return;
    const overrideGoal = config.HYDRATION_GOAL_ML + 500;
    const base = await supabase
      .from('app_config')
      .select('engine_overrides')
      .eq('athlete_id', testAthleteId)
      .maybeSingle()
      .then((r) => r.data?.engine_overrides ?? {});
    overridesTouched = true;
    await supabase.from('app_config').upsert(
      {
        athlete_id: testAthleteId,
        engine_overrides: { ...base, hydration: { ...(base.hydration ?? {}), goal_ml: overrideGoal } },
      },
      { onConflict: 'athlete_id' },
    );

    const res = await request(app)
      .post('/api/v1/nutrition/hydration')
      .send({ date: SENTINEL_DATE, delta_ml: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.goal_ml).toBe(overrideGoal);
  });

  it('RLS — the publishable-key client cannot read hydration_log', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('hydration_log').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
