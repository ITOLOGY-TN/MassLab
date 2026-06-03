// Phase 9 (T040) — RLS isolation for the recovery_log write table (incl. the new
// Phase 9 columns sleep_quality / mood / sore_zones). The application's secret-key
// client bypasses RLS by design (auth middleware is the primary tenant guard); these
// tests exercise the *_own policies as defense-in-depth (Constitution I) by driving
// the publishable-key client directly — it must see zero rows and be denied any
// cross-athlete write. LIVE-GATED like the sibling RLS suites: probe-and-skip when
// .env is missing, Supabase is unreachable, or the Phase 9 migration is unapplied.
//
// Mirrors the Phase 8 supplement RLS block in tests/integration/rls.policies.test.js.
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
      console.warn('[rls:recovery] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  serverClient = getSupabase(config);
  const probe = await serverClient.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[rls:recovery] skipped — Supabase unreachable');
    return;
  }
  // Phase 9 probes the extended recovery_log (the new sleep_quality column) — skip
  // cleanly if the column-add migration is not applied (Phase 7/8 probe-and-skip).
  const migProbe = await serverClient.from('recovery_log').select('sleep_quality').limit(1);
  if (migProbe.error) {
    console.warn('[rls:recovery] skipped — Phase 9 recovery_log migration not applied');
    return;
  }
  live = true;
});

describe('Phase 9 — recovery_log RLS enforces per-athlete isolation', () => {
  it('publishable-key client sees zero rows in recovery_log', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('recovery_log').select('*');
    // Either RLS returns an empty array (no policy match) or a 401-style error.
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });

  it('publishable-key client cannot read another athlete’s recovery_log columns', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    // Explicitly select the new Phase 9 columns — the *_own select policy must hide
    // every row regardless of which columns are projected (FR-002).
    const { data, error } = await anon
      .from('recovery_log')
      .select('id, athlete_id, logged_on, sleep_quality, mood, sore_zones');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });

  // The recovery write table must reject a cross-athlete INSERT from the
  // publishable-key client (the *_own with-check policy; Constitution I).
  it('publishable-key client cannot INSERT a recovery_log row for another athlete', async () => {
    if (!live) return;
    const { data: athlete } = await serverClient.from('athletes').select('id').limit(1).single();
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon
      .from('recovery_log')
      .insert({
        athlete_id: athlete.id,
        logged_on: '2026-01-01',
        sleep_quality: 5,
        mood: 'great',
        sore_zones: ['legs'],
      })
      .select('id');
    // RLS denies the write: either an explicit error or zero affected rows.
    if (error) {
      expect(error.message).toMatch(/permission|policy|jwt|denied|violat/i);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });
});
