import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T020 — smart recovery alerts against the live
// API. Seeds the recent check-in window so each rule fires (and a healthy/thin window so
// nothing fires), then asserts the kinds GET /recovery/alerts returns:
//   - high_stress   — stress >= RECOVERY_STRESS_HIGH for RECOVERY_STRESS_HIGH_DAYS
//                     consecutive days;
//   - reduce_volume — avg sleep <= RECOVERY_SLEEP_LOW_HOURS AND avg energy <=
//                     RECOVERY_ENERGY_LOW over the window;
//   - full_rest     — >= RECOVERY_SORE_ZONES_REST sore zones on the most recent day;
//   - all-clear     — a healthy window fires nothing;
//   - silent        — a thin window (one day) suppresses the multi-day rules.
// The alert look-back spans the widest rule window (the last few days ending today).
// This suite seeds those exact days directly via the DAO (alerts read any range — the
// current-ISO-week edit guard only governs the PUT path), and SNAPSHOTS-AND-RESTORES
// every seeded day in afterAll so it never destroys real recovery data.
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let today = null;
let windowDays = []; // the exact days this suite writes (oldest → newest), incl. today
let snapshots = new Map(); // logged_on → original row (or null when absent)

function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Replace the window with the given per-day rows, leaving every other day untouched.
async function seedWindow(rowsByDay) {
  // Clear any seeded day first so a sparse seed (e.g. the thin window) is honored.
  await supabase
    .from('recovery_log')
    .delete()
    .eq('athlete_id', athleteId)
    .in('logged_on', windowDays);
  const payload = Object.entries(rowsByDay).map(([logged_on, fields]) => ({
    athlete_id: athleteId,
    logged_on,
    ...fields,
  }));
  if (payload.length) {
    const { error } = await supabase.from('recovery_log').insert(payload);
    if (error) throw new Error(`seed failed: ${error.message}`);
  }
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.alerts.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.alerts.integration] skipped — Phase 9 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[recovery.alerts.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;

  // The controller's look-back spans max(stressHighDays, lowWindowDays) days ending
  // today; full_rest reads the most recent day. Seed exactly that span (oldest first).
  const lookBack = Math.max(
    config.RECOVERY_STRESS_HIGH_DAYS,
    config.RECOVERY_LOW_WINDOW_DAYS,
  );
  today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
  windowDays = [];
  for (let i = lookBack - 1; i >= 0; i -= 1) windowDays.push(shiftIso(today, -i));

  // Snapshot every day we will write, so afterAll can restore exact prior state.
  const { data: existing } = await supabase
    .from('recovery_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('logged_on', windowDays);
  for (const day of windowDays) snapshots.set(day, null);
  for (const row of existing ?? []) snapshots.set(row.logged_on, row);

  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Wipe our seeded days, then restore any rows that pre-existed verbatim.
  await supabase
    .from('recovery_log')
    .delete()
    .eq('athlete_id', athleteId)
    .in('logged_on', windowDays);
  const restore = [];
  for (const row of snapshots.values()) {
    if (!row) continue;
    const { id, created_at, ...rest } = row; // let the DB re-assign identity/defaults
    void id;
    void created_at;
    restore.push(rest);
  }
  if (restore.length) {
    await supabase.from('recovery_log').insert(restore);
  }
});

function alertKinds(body) {
  return (body.data.alerts ?? []).map((a) => a.kind).sort();
}

describe('recovery smart alerts (Phase 9)', () => {
  beforeEach(async () => {
    if (!live) return;
  });

  it('fires high_stress when stress stays elevated across the window', async () => {
    if (!live) return;
    const high = config.RECOVERY_STRESS_HIGH;
    const rows = {};
    for (const day of windowDays) {
      // High stress every day, but healthy sleep/energy so only high_stress qualifies.
      rows[day] = { stress: high, sleep_hours: 8, energy: 8, sore_zones: [] };
    }
    await seedWindow(rows);
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    expect(res.body.data.all_clear).toBe(false);
    expect(alertKinds(res.body)).toContain('high_stress');
  });

  it('fires reduce_volume when sleep and energy are both low across the window', async () => {
    if (!live) return;
    const lowSleep = config.RECOVERY_SLEEP_LOW_HOURS;
    const lowEnergy = config.RECOVERY_ENERGY_LOW;
    const rows = {};
    for (const day of windowDays) {
      // Low sleep + low energy, but calm stress so high_stress does not also fire.
      rows[day] = { sleep_hours: lowSleep, energy: lowEnergy, stress: 1, sore_zones: [] };
    }
    await seedWindow(rows);
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    expect(alertKinds(res.body)).toContain('reduce_volume');
  });

  it('fires full_rest when the most recent day reports enough sore zones', async () => {
    if (!live) return;
    const zones = config.RECOVERY_SORE_ZONES.slice(0, config.RECOVERY_SORE_ZONES_REST);
    expect(zones.length).toBe(config.RECOVERY_SORE_ZONES_REST);
    const rows = {};
    for (const day of windowDays) {
      rows[day] = { sleep_hours: 8, energy: 8, stress: 1, sore_zones: [] };
    }
    // Many sore zones only on the most recent day → full_rest, no multi-day rule.
    rows[windowDays[windowDays.length - 1]] = {
      sleep_hours: 8,
      energy: 8,
      stress: 1,
      sore_zones: zones,
    };
    await seedWindow(rows);
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    expect(alertKinds(res.body)).toContain('full_rest');
  });

  it('is all-clear when the window is healthy', async () => {
    if (!live) return;
    const rows = {};
    for (const day of windowDays) {
      rows[day] = { sleep_hours: 8, energy: 8, stress: 1, sore_zones: [] };
    }
    await seedWindow(rows);
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    expect(res.body.data.all_clear).toBe(true);
    expect(res.body.data.alerts).toEqual([]);
  });

  it('stays silent on the multi-day rules when the window is too thin', async () => {
    if (!live) return;
    // Only the most recent day is logged: high_stress (needs N consecutive days) and
    // reduce_volume (needs N check-in days) must both stay silent (FR-011). The single
    // day is calm + no soreness so full_rest does not fire either → all-clear.
    const last = windowDays[windowDays.length - 1];
    await seedWindow({
      [last]: { sleep_hours: 8, energy: 8, stress: config.RECOVERY_STRESS_HIGH, sore_zones: [] },
    });
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    const kinds = alertKinds(res.body);
    expect(kinds).not.toContain('high_stress');
    expect(kinds).not.toContain('reduce_volume');
  });
});
