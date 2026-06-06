import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { dashboardController } from '../../controllers/dashboard.controller.js';

// DAO factories — mirror app.js's `resolved` set so the dashboard controller's read
// fan-out (and resolveTargets' internal reads) resolve against the live stack.
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { exercisesDao } from '../../services/dataAccess/exercises.dao.js';
import { weeklyPlanDao } from '../../services/dataAccess/weeklyPlan.dao.js';
import { trainingPhasesDao } from '../../services/dataAccess/trainingPhases.dao.js';
import { supplementsDao } from '../../services/dataAccess/supplements.dao.js';
import { quotesDao } from '../../services/dataAccess/quotes.dao.js';
import { appConfigDao } from '../../services/dataAccess/appConfig.dao.js';
import { progressionFlagsDao } from '../../services/dataAccess/progressionFlags.dao.js';
import { bodyMeasurementsDao } from '../../services/dataAccess/bodyMeasurements.dao.js';
import { muscleGroupsDao } from '../../services/dataAccess/muscleGroups.dao.js';
import { sessionsDao } from '../../services/dataAccess/sessions.dao.js';
import { nutritionLogsDao } from '../../services/dataAccess/nutritionLogs.dao.js';
import { supplementIntakeDao } from '../../services/dataAccess/supplementIntake.dao.js';
import { recoveryDao } from '../../services/dataAccess/recovery.dao.js';

// Phase 10 (013-phase10-dashboard) T033 — US4 quote of the day against the live stack.
// The dashboard composes quotes.pickToday, which is a deterministic function of the
// athlete's quotes and the server day (dayIndex(now) % quotes.length). This suite drives
// the controller directly with its INJECTABLE `now` (rather than the HTTP app, whose
// router pins now to the real clock) so the three assertions are fully deterministic:
//   - data.quote is STABLE for a fixed `now` (two invocations → identical quote);
//   - data.quote CHANGES across the daily cycle (a next-day `now` rotates to a different
//     quote, given the athlete has >1 quote);
//   - data.quote is NULL when the athlete has no quotes — without error (cold start).
// To prove the null case without destroying real data, it SNAPSHOTS the athlete's quotes
// up front, deletes them, asserts null, then RESTORES the captured rows in afterAll.
// Read-only otherwise: invoking getDashboard writes nothing.
// Live-gated: skips when .env is missing or Supabase is unreachable (no migration probe —
// Phase 10 adds no schema).
let config;
let supabase;
let live = false;

let daos = null;
let athleteId = null;
let locale = null;

// Snapshot of the athlete's quote rows so the null-case deletion is reversible.
let snapshotQuotes = [];

// A fixed server instant we control; the controller reads it once via its `now` seam.
const FIXED_NOW = new Date('2026-06-04T08:30:00.000Z');

function shiftNow(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Invoke the controller's getDashboard with a pinned `now`, returning the `{ data }`
// payload. Uses a minimal req/res harness; any error propagates (so the test fails loudly
// rather than swallowing it via the Express error middleware).
async function runDashboard(now) {
  const controller = dashboardController({ daos, config, now: () => now });
  const req = { athleteId };
  let captured;
  const res = {
    json(body) {
      captured = body;
      return res;
    },
  };
  await new Promise((resolve, reject) => {
    controller
      .getDashboard(req, res, (err) => (err ? reject(err) : resolve()))
      .then(resolve, reject);
  });
  return captured;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.quote.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);

  // Reachability probe — any seeded read confirms the live stack is up.
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[dashboard.quote.integration] skipped — Supabase unreachable');
    return;
  }

  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[dashboard.quote.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;
  locale = config.NUTRITION_LOCALE;

  // Build the full DAO set the controller fans out over (mirrors app.js's `resolved`).
  daos = {
    athletes: athletesDao(supabase),
    exercises: exercisesDao(supabase),
    weeklyPlan: weeklyPlanDao(supabase),
    trainingPhases: trainingPhasesDao(supabase),
    supplements: supplementsDao(supabase),
    quotes: quotesDao(supabase),
    appConfig: appConfigDao(supabase),
    progressionFlags: progressionFlagsDao(supabase),
    bodyMeasurements: bodyMeasurementsDao(supabase),
    muscleGroups: muscleGroupsDao(supabase),
    sessions: sessionsDao(supabase),
    nutritionLogs: nutritionLogsDao(supabase),
    supplementIntake: supplementIntakeDao(supabase),
    recovery: recoveryDao(supabase),
  };

  // Snapshot the athlete's quotes so the null-case deletion is fully reversible.
  const { data: existing, error: snapErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('locale', locale);
  if (snapErr) {
    console.warn('[dashboard.quote.integration] skipped — quotes snapshot read failed');
    return;
  }
  snapshotQuotes = existing ?? [];

  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Restore the captured quotes verbatim: wipe whatever is present now, then re-insert the
  // snapshot (dropping server-managed id/created_at so identity/defaults reassign).
  await supabase.from('quotes').delete().eq('athlete_id', athleteId).eq('locale', locale);
  if (snapshotQuotes.length) {
    const restore = snapshotQuotes.map(({ id: _id, created_at: _created_at, ...keep }) => keep);
    await supabase.from('quotes').insert(restore);
  }
});

describe('dashboard quote of the day — stable per day, rotates daily, null when empty (Phase 10)', () => {
  it('is stable for a fixed now (reuses quotes.pickToday)', async () => {
    if (!live) {
      console.warn('[dashboard.quote.integration] skipping live assertions');
      return;
    }
    if (snapshotQuotes.length === 0) {
      console.warn('[dashboard.quote.integration] skipping stable case — athlete has no quotes');
      return;
    }

    const a = await runDashboard(FIXED_NOW);
    const b = await runDashboard(FIXED_NOW);

    // A quote exists for the fixed day and is identical across invocations (deterministic
    // pickToday — same day index over the same catalogue).
    expect(a.data.quote).not.toBeNull();
    expect(a.data.quote).toEqual(b.data.quote);

    // The chosen quote agrees with the DAO it composes — pickToday is the single source.
    const expected = await daos.quotes.pickToday({ athleteId, locale, now: FIXED_NOW });
    expect(a.data.quote).toEqual({ text: expected.text, author: expected.author ?? null });
  });

  it('changes for a next-day now (rotates across the daily cycle)', async () => {
    if (!live) return;
    if (snapshotQuotes.length < 2) {
      console.warn(
        '[dashboard.quote.integration] skipping rotation case — needs >1 quote to rotate',
      );
      return;
    }

    const base = await runDashboard(FIXED_NOW);
    expect(base.data.quote).not.toBeNull();

    // With N>1 quotes, dayIndex % N cycles through every quote across N consecutive days,
    // so at least one of the next N-1 days must surface a different quote. Scan forward and
    // assert a rotation occurs (it always does for N>1).
    const n = snapshotQuotes.length;
    let rotated = false;
    for (let offset = 1; offset < n && !rotated; offset += 1) {
      const next = await runDashboard(shiftNow(FIXED_NOW, offset));
      expect(next.data.quote).not.toBeNull();
      if (
        next.data.quote.text !== base.data.quote.text ||
        next.data.quote.author !== base.data.quote.author
      ) {
        rotated = true;
      }
    }
    expect(rotated).toBe(true);
  });

  it('is null when the athlete has no quotes — without error', async () => {
    if (!live) return;

    // Empty the catalogue for this athlete (restored verbatim in afterAll).
    const del = await supabase
      .from('quotes')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('locale', locale);
    expect(del.error).toBeFalsy();

    // The dashboard still composes cleanly — the quote tile is null, no throw.
    const out = await runDashboard(FIXED_NOW);
    expect(out.data.quote).toBeNull();
  });
});
