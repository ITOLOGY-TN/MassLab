import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { runSeed } from '../../seed/runSeed.js';

// Excludes `athletes` because parallel tests (e.g. tenant.scoping) may add rows.
const TABLES = [
  'exercises',
  'foods',
  'supplements',
  'training_phases',
  'quotes',
  'weekly_plan_slots',
  'weekly_plan_exercises',
  'nutrition_template_meals',
];

let supabase;
let config;
let live = false;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[seed.idempotent] skipped — .env not configured:', err.message);
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  // Probe whether the local stack is reachable.
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[seed.idempotent] skipped — Supabase unreachable:', error.message);
    return;
  }
  live = true;
});

async function counts() {
  const out = {};
  for (const t of TABLES) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) throw error;
    out[t] = count;
  }
  return out;
}

describe('seed idempotency (FR-011 / SC-005)', () => {
  it('preserves row counts across two seed runs', async () => {
    if (!live) {
      console.warn('[seed.idempotent] skipping live assertions');
      return;
    }
    await runSeed({ config });
    const before = await counts();
    await runSeed({ config });
    const after = await counts();
    expect(after).toEqual(before);
    expect(after.exercises).toBeGreaterThanOrEqual(18);
    expect(after.foods).toBeGreaterThanOrEqual(50);
    expect(after.quotes).toBeGreaterThanOrEqual(30);
    expect(after.supplements).toBeGreaterThanOrEqual(5);
    expect(after.training_phases).toBeGreaterThanOrEqual(3);
    expect(after.weekly_plan_slots).toBeGreaterThanOrEqual(5);
    expect(after.nutrition_template_meals).toBeGreaterThanOrEqual(5);
  }, 60000);
});
