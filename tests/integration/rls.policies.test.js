import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';

let config;
let serverClient;
let live = false;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[rls] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  serverClient = getSupabase(config);
  const probe = await serverClient.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[rls] skipped — Supabase unreachable');
    return;
  }
  live = true;
});

describe('US2 — RLS policies enforce per-athlete isolation', () => {
  it('an anonymous publishable-key client cannot SELECT any athlete', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('athletes').select('*');
    // Either RLS returns an empty array (no policy match) or a 401-style error.
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });

  it.each([
    'exercises',
    'weekly_plan_slots',
    'training_phases',
    'supplements',
    'foods',
    'quotes',
    'nutrition_template_meals',
  ])('publishable-key client sees zero rows in %s', async (table) => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from(table).select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
