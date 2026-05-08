// Phase 2 US2 (T029): RLS check for muscle_groups — anonymous publishable-key
// client cannot SELECT or INSERT. Mirrors the Phase 0 rls.policies pattern.
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';

let config;
let live = false;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[muscleGroups.rls] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const probe = await getSupabase(config).from('muscle_groups').select('id').limit(1);
  if (probe.error) {
    console.warn('[muscleGroups.rls] skipped — Supabase unreachable');
    return;
  }
  live = true;
});

describe('US2 — RLS isolates muscle_groups per athlete', () => {
  it('anonymous publishable-key client returns zero rows', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('muscle_groups').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });

  it('anonymous publishable-key client cannot INSERT', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anon
      .from('muscle_groups')
      .insert({ athlete_id: '00000000-0000-0000-0000-000000000001', slug: 'rogue', name: 'Rogue' });
    expect(error).not.toBeNull();
  });
});
