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
    // Phase 6 (T042) — body data must be athlete-isolated too (SC-009).
    'body_measurements',
    'athlete_photos',
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

  // Phase 6 (T042) — the body-data write tables must reject a cross-athlete
  // INSERT from the publishable-key client (SC-009; `*_own` with-check policies).
  it('publishable-key client cannot INSERT a body_measurement for another athlete', async () => {
    if (!live) return;
    const { data: athlete } = await serverClient.from('athletes').select('id').limit(1).single();
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon
      .from('body_measurements')
      .insert({ athlete_id: athlete.id, measured_on: '2026-01-01', weight_kg: 70 })
      .select('id');
    if (error) {
      expect(error.message).toMatch(/permission|policy|jwt|denied|violat/i);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });

  it('publishable-key client cannot INSERT an athlete_photo for another athlete', async () => {
    if (!live) return;
    // athlete_photos ships in Phase 0 (research D-2); skip cleanly if absent.
    const photoProbe = await serverClient.from('athlete_photos').select('id').limit(1);
    if (photoProbe.error) {
      console.warn('[rls] skipped athlete_photos — table not present');
      return;
    }
    const { data: athlete } = await serverClient.from('athletes').select('id').limit(1).single();
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon
      .from('athlete_photos')
      .insert({ athlete_id: athlete.id, taken_on: '2026-01-01', storage_key: 'rogue/key.jpg' })
      .select('id');
    if (error) {
      expect(error.message).toMatch(/permission|policy|jwt|denied|violat/i);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });

  // Phase 8 (T040) — the supplement adherence tables must be athlete-isolated too.
  // Probe each first and skip cleanly if the Phase 8 migration is not applied.
  it.each(['supplement_intake_log', 'supplement_weekly_assessment'])(
    'publishable-key client sees zero rows in %s (Phase 8)',
    async (table) => {
      if (!live) return;
      const mig = await serverClient.from(table).select('*').limit(1);
      if (mig.error) {
        console.warn(`[rls] skipped ${table} — Phase 8 migration not applied`);
        return;
      }
      const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false },
      });
      const { data, error } = await anon.from(table).select('*');
      if (!error) {
        expect(data).toEqual([]);
      } else {
        expect(error.message).toMatch(/permission|policy|jwt|denied/i);
      }
    },
  );
});
