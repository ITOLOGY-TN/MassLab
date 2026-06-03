import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { isoWeekStart, weekDays } from '../../services/supplements/week.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T030 — US3 trends against the live API:
//  - seed recovery check-ins + finished sessions across the current ISO week;
//  - the energy heatmap buckets each check-in to its calendar day (energy value),
//    leaving un-logged days null (per-day bucketing, FR-013);
//  - the sleep-vs-performance scatter emits a point ONLY for days having BOTH a
//    check-in (with a sleep value) AND a finished session — incomplete pairs drop
//    out (FR-014, "missing pairs" edge case);
//  - the 30-day overlay aligns energy/stress/sleep on a shared day axis, gaps null
//    not 0 (overlay alignment).
// Because the editable window is the current ISO week, the seeded check-ins land on
// real "today"-adjacent days. This suite SNAPSHOTS the current-week recovery rows up
// front and RESTORES them in afterAll so it never destroys real recovery data; the
// seeded finished sessions are sentinel rows removed in cleanup.
// Live-gated: skips when .env missing, Supabase unreachable, or the Phase 9
// recovery_log column migration is not yet applied (probe on recovery_log.sleep_quality).
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let today = null; // server "today", YYYY-MM-DD
let weekStart = null;
let days = []; // the 7 ISO-week days (Mon..Sun)

// Days within the current ISO week that are not in the future (<= today) — the only
// ones the upsert endpoint accepts, and where bucketing must hold.
let pastDays = [];

// The three days we author into precise, asserted states:
//   dayA — check-in (energy/sleep) + a finished session → emits a scatter point
//   dayB — check-in (energy/sleep) only, NO session       → no scatter point (missing pair)
//   dayC — finished session only, NO check-in             → no scatter point (missing pair)
let dayA = null;
let dayB = null;
let dayC = null;

const VOL_A = 4200.5;
const VOL_C = 3100.0;

// Snapshot of any pre-existing recovery_log rows in the current ISO week.
let snapshotRows = [];
const seededSessionIds = [];

function pickDistinct(pool) {
  // Choose up to 3 distinct days from the available (non-future) week days. When the
  // week is early (e.g. Monday) and fewer than 3 days exist, gracefully reuse what we
  // have — the assertions key on the specific roles, not on a full week.
  const a = pool[0] ?? null;
  const b = pool[1] ?? pool[0] ?? null;
  const c = pool[2] ?? pool[pool.length - 1] ?? null;
  return [a, b, c];
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.trends.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.trends.integration] skipped — Phase 9 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[recovery.trends.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;

  // Resolve the server's "today" via the read endpoint (default date == today).
  const checkin = await request(app).get('/api/v1/recovery/checkin');
  if (checkin.status !== 200) {
    console.warn('[recovery.trends.integration] skipped — /recovery/checkin not available');
    return;
  }
  today = checkin.body.data.date;
  weekStart = isoWeekStart(today);
  days = weekDays(weekStart); // Mon..Sun (7 ISO dates)
  pastDays = days.filter((d) => d <= today);
  if (pastDays.length === 0) {
    console.warn('[recovery.trends.integration] skipped — no in-week past days');
    return;
  }
  [dayA, dayB, dayC] = pickDistinct(pastDays);

  // Snapshot the current-week recovery rows so we can restore them verbatim.
  const { data: existing, error: snapErr } = await supabase
    .from('recovery_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('logged_on', days[0])
    .lte('logged_on', days[6]);
  if (snapErr) {
    console.warn('[recovery.trends.integration] skipped — snapshot read failed');
    return;
  }
  snapshotRows = existing ?? [];

  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Remove anything this test wrote in the current ISO week, then restore the snapshot.
  await supabase
    .from('recovery_log')
    .delete()
    .eq('athlete_id', athleteId)
    .gte('logged_on', days[0])
    .lte('logged_on', days[6]);
  if (snapshotRows.length) {
    // Re-insert the captured rows (drop server-managed id/created_at so identity/defaults reassign).
    const restore = snapshotRows.map(({ id: _id, created_at: _created_at, ...keep }) => keep);
    await supabase.from('recovery_log').insert(restore);
  }
  // Drop the seeded finished sessions (cascade clears any sets).
  for (const sid of seededSessionIds) {
    await supabase.from('session_journal_entries').delete().eq('id', sid);
  }
});

async function putCheckin(loggedOn, fields) {
  return request(app)
    .put('/api/v1/recovery/checkin')
    .send({ logged_on: loggedOn, ...fields });
}

// Seed a finished session for a given calendar day via direct DB insert (Phase 9 is
// read-only over the session journal; the scatter only reads ended_at + volume).
async function seedFinishedSession(day, volumeKg) {
  const startedAt = `${day}T08:00:00.000Z`;
  const endedAt = `${day}T09:30:00.000Z`;
  const { data, error } = await supabase
    .from('session_journal_entries')
    .insert({
      athlete_id: athleteId,
      started_at: startedAt,
      ended_at: endedAt,
      total_volume_kg: volumeKg,
    })
    .select('id')
    .single();
  expect(error).toBeFalsy();
  seededSessionIds.push(data.id);
  return data.id;
}

describe('recovery trends — per-day bucketing, scatter pairing, overlay alignment (Phase 9)', () => {
  it('buckets check-ins per day, pairs scatter only on complete days, aligns the overlay', async () => {
    if (!live) {
      console.warn('[recovery.trends.integration] skipping live assertions');
      return;
    }

    // --- Seed ---------------------------------------------------------------
    // dayA: full check-in (energy + sleep) AND a finished session → scatter point.
    const aRes = await putCheckin(dayA, { energy: 7, stress: 4, sleep_hours: 7.5, sleep_quality: 4 });
    expect(aRes.status).toBe(200);
    await seedFinishedSession(dayA, VOL_A);

    // dayB: check-in only (energy + sleep), NO session → no scatter point.
    if (dayB && dayB !== dayA) {
      const bRes = await putCheckin(dayB, { energy: 3, stress: 8, sleep_hours: 5 });
      expect(bRes.status).toBe(200);
    }

    // dayC: finished session only, NO check-in → no scatter point.
    if (dayC && dayC !== dayA && dayC !== dayB) {
      // Make sure no check-in lingers on dayC from a prior interrupted run.
      await supabase
        .from('recovery_log')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('logged_on', dayC);
      await seedFinishedSession(dayC, VOL_C);
    }

    // --- Trends for the current month --------------------------------------
    const month = today.slice(0, 7); // YYYY-MM
    const res = await request(app).get(`/api/v1/recovery/trends?month=${month}`);
    expect(res.status).toBe(200);
    const { heatmap, scatter, overlap } = res.body.data;

    // --- Heatmap: per-day bucketing ----------------------------------------
    expect(heatmap.year).toBe(Number(month.slice(0, 4)));
    expect(heatmap.month).toBe(Number(month.slice(5, 7)));
    const cellByDate = new Map(heatmap.cells.map((c) => [c.date, c.energy]));
    // dayA's energy lands on dayA's cell.
    expect(cellByDate.get(dayA)).toBe(7);
    if (dayB && dayB !== dayA) {
      expect(cellByDate.get(dayB)).toBe(3);
    }
    // A day with no check-in is null (uncolored) — dayC has only a session.
    if (dayC && dayC !== dayA && dayC !== dayB) {
      expect(cellByDate.get(dayC)).toBeNull();
    }

    // --- Scatter: only complete (check-in + session) pairs emit a point -----
    expect(scatter.has_data).toBe(true);
    const scatterDates = scatter.points.map((p) => p.date);
    expect(scatterDates).toContain(dayA);
    const ptA = scatter.points.find((p) => p.date === dayA);
    expect(ptA.sleep_hours).toBeCloseTo(7.5, 2);
    expect(ptA.volume_kg).toBeCloseTo(VOL_A, 2);
    // dayB (check-in, no session) and dayC (session, no check-in) must NOT appear.
    if (dayB && dayB !== dayA) expect(scatterDates).not.toContain(dayB);
    if (dayC && dayC !== dayA && dayC !== dayB) expect(scatterDates).not.toContain(dayC);

    // --- Overlay: aligned arrays, gaps null not 0 --------------------------
    const n = overlap.days.length;
    expect(overlap.energy).toHaveLength(n);
    expect(overlap.stress).toHaveLength(n);
    expect(overlap.sleep).toHaveLength(n);
    const idxA = overlap.days.indexOf(dayA);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(overlap.energy[idxA]).toBe(7);
    expect(overlap.stress[idxA]).toBe(4);
    expect(overlap.sleep[idxA]).toBeCloseTo(7.5, 2);
    if (dayC && dayC !== dayA && dayC !== dayB) {
      const idxC = overlap.days.indexOf(dayC);
      if (idxC >= 0) {
        // No check-in on dayC → every overlay series is a null gap (never 0).
        expect(overlap.energy[idxC]).toBeNull();
        expect(overlap.stress[idxC]).toBeNull();
        expect(overlap.sleep[idxC]).toBeNull();
      }
    }
  });
});
