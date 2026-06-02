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
  // Phase 4 (T055) probes the session tables too — skip cleanly if unmigrated.
  const sessionProbe = await serverClient
    .from('session_journal_entries')
    .select('day_of_week')
    .limit(1);
  if (sessionProbe.error) {
    console.warn('[rls] skipped — Phase 4 session migration not applied');
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
    // Phase 4 (T055) — the session write tables must be isolated too (FR-027).
    'session_journal_entries',
    'session_sets',
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

  // Phase 4 (T055) — an anonymous publishable-key client cannot WRITE a session
  // row for any athlete (cross-athlete write denial; Constitution I, FR-027).
  it('publishable-key client cannot INSERT a session_journal_entry', async () => {
    if (!live) return;
    const { data: athlete } = await serverClient.from('athletes').select('id').limit(1).single();
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon
      .from('session_journal_entries')
      .insert({ athlete_id: athlete.id, started_at: new Date().toISOString() })
      .select('id');
    // RLS denies the write: either an explicit error or zero affected rows.
    if (error) {
      expect(error.message).toMatch(/permission|policy|jwt|denied|violat/i);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });
});
