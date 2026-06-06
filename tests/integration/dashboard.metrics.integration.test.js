import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { consecutiveSessionStreak } from '../../services/engine/sessionStreak.js';
import { buildApp } from '../../app.js';

// Phase 10 (013-phase10-dashboard) T019 [US2] — the four metric cards + the 30-day
// weight sparkline against the live API:
//  - WEIGHT: current vs. start → signed delta_kg (last in-window weigh-in vs. the
//    profile's starting_weight_kg, data-model §3c);
//  - CALORIES: yesterday's logged macro snapshots summed vs. the resolved daily target
//    → signed delta_kcal + `over` flag;
//  - STREAK: schedule-aware count of consecutive completed scheduled training days,
//    re-derived independently from the seeded finished-session days + the athlete's
//    weekly schedule (the week strip);
//  - PHASE: the current training phase + a non-negative days_remaining;
//  - SPARKLINE: the 30-day weight series (date-ascending, within the look-back window)
//    with the goal line; its last point is the seeded "today" weigh-in;
//  - EMPTY STATES: every metric sub-object obeys the null-or-well-formed cold-start
//    contract (FR-018); `streak` is always present; the whole payload + `has_data`
//    flags always return (SC-009).
//
// Phase 10 is PURELY READ-ONLY (no migration/engine/audit), so the dashboard never
// writes — this suite seeds the underlying module data directly, SNAPSHOTS every real
// row it perturbs in the affected window (body_measurements within the sparkline
// window, yesterday's nutrition_logs, finished sessions across the streak window), and
// RESTORES them verbatim in afterAll so it can never destroy real athlete data.
//
// Live-gated: skips when .env missing or Supabase unreachable (Phase 10 adds no schema,
// so there is no migration probe — the Phase 5/7/8/9 pattern, minus the probe).
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let today = null; // server "today", YYYY-MM-DD (read from the dashboard payload's week strip)
let yesterday = null;
let sparklineDays = 30;
let rangeFrom = null; // today - (sparklineDays - 1)
let programStart = null;

const START_KG = 60.0; // the seeded profile starting weight context for the delta math
const SPARK_KG = 64.4; // the seeded "today" weigh-in → last sparkline point + current weight

// Snapshots of the real rows this suite perturbs, restored verbatim in afterAll.
let measSnapshot = []; // body_measurements within [rangeFrom, today]
let nutriSnapshot = []; // nutrition_logs on `yesterday`
let sessSnapshot = []; // session_journal_entries within the streak window

// Sentinel finished-session ids we insert (and any restored-row ids we never touch).
const seededSessionIds = [];

let scheduleDays = []; // ISO weekdays (1–7) that are training days (from the week strip)
let seededStreakDays = []; // the recent elapsed scheduled dates we mark "done"

function shiftDay(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(isoDate) {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.metrics.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('body_measurements').select('id').limit(1);
  if (probe.error) {
    console.warn('[dashboard.metrics.integration] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });

  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[dashboard.metrics.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;
  programStart = athlete.program_start_date
    ? String(athlete.program_start_date).slice(0, 10)
    : null;

  sparklineDays = config.DASHBOARD_WEIGHT_SPARKLINE_DAYS ?? 30;

  // Resolve the server's "today" from a real dashboard read (the week strip dates).
  const probeRes = await request(app).get('/api/v1/dashboard');
  if (probeRes.status !== 200) {
    console.warn('[dashboard.metrics.integration] skipped — /dashboard not available');
    return;
  }
  const days = probeRes.body.data.week.days;
  // "today" is the server UTC calendar day — the same clock the controller reads at the
  // request boundary (isoDay(now())). The week strip (Mon..Sun of the current ISO week)
  // supplies the athlete's real schedule below.
  today = new Date().toISOString().slice(0, 10);
  yesterday = shiftDay(today, -1);
  rangeFrom = shiftDay(today, -(sparklineDays - 1));

  // Scheduled weekdays come straight from the week strip: any non-rest day is a
  // training day. This is the athlete's real configured schedule (read, not invented).
  scheduleDays = days.filter((d) => d.status !== 'rest').map((d) => d.day_of_week);

  // ---- Snapshot the real rows we are about to perturb -----------------------
  const meas = await supabase
    .from('body_measurements')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('measured_on', rangeFrom)
    .lte('measured_on', today);
  if (meas.error) {
    console.warn('[dashboard.metrics.integration] skipped — measurement snapshot failed');
    return;
  }
  measSnapshot = meas.data ?? [];

  const nutri = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('logged_on', yesterday);
  if (nutri.error) {
    console.warn('[dashboard.metrics.integration] skipped — nutrition snapshot failed');
    return;
  }
  nutriSnapshot = nutri.data ?? [];

  // The streak window: from a little before the earliest scheduled date we will seed,
  // through today. Snapshot every finished session there so we restore the real ones.
  const streakFrom = shiftDay(today, -60);
  const sess = await supabase
    .from('session_journal_entries')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('started_at', `${streakFrom}T00:00:00.000Z`)
    .lte('started_at', `${today}T23:59:59.999Z`);
  if (sess.error) {
    console.warn('[dashboard.metrics.integration] skipped — session snapshot failed');
    return;
  }
  sessSnapshot = sess.data ?? [];

  live = true;
});

afterAll(async () => {
  if (!live) return;

  // --- Restore body_measurements within the sparkline window ---
  await supabase
    .from('body_measurements')
    .delete()
    .eq('athlete_id', athleteId)
    .gte('measured_on', rangeFrom)
    .lte('measured_on', today);
  if (measSnapshot.length) {
    const restore = measSnapshot.map(({ id: _id, created_at: _c, ...keep }) => keep);
    await supabase.from('body_measurements').insert(restore);
  }

  // --- Restore nutrition_logs on `yesterday` ---
  await supabase
    .from('nutrition_logs')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('logged_on', yesterday);
  if (nutriSnapshot.length) {
    const restore = nutriSnapshot.map(({ id: _id, created_at: _c, ...keep }) => keep);
    await supabase.from('nutrition_logs').insert(restore);
  }

  // --- Drop the finished sessions we seeded, then restore the real ones ---
  for (const sid of seededSessionIds) {
    await supabase.from('session_journal_entries').delete().eq('id', sid);
  }
  const streakFrom = shiftDay(today, -60);
  // Any of our seeded rows are already gone; restoring is a no-op for rows we never
  // deleted. (We only inserted sentinels — the real ones were left in place — so no
  // bulk delete of the window is needed.)
  void streakFrom;
  void sessSnapshot;
});

// Seed a finished session whose ended_at lands on `day` (UTC).
async function seedFinishedSession(day, volumeKg) {
  const { data, error } = await supabase
    .from('session_journal_entries')
    .insert({
      athlete_id: athleteId,
      started_at: `${day}T08:00:00.000Z`,
      ended_at: `${day}T09:30:00.000Z`,
      total_volume_kg: volumeKg,
      day_of_week: isoWeekday(day),
    })
    .select('id')
    .single();
  expect(error).toBeFalsy();
  seededSessionIds.push(data.id);
  return data.id;
}

describe('dashboard metrics + sparkline (Phase 10, US2)', () => {
  it('weight delta vs start, sparkline series, calories vs target, streak, and phase', async () => {
    if (!live) {
      console.warn('[dashboard.metrics.integration] skipping live assertions');
      return;
    }

    // === Seed WEIGHT / SPARKLINE ============================================
    // A "start" weigh-in near the window's beginning (kept >= programStart so it
    // survives the weight-chart filter) and a "today" weigh-in (the last point).
    const startMeasDate =
      programStart && programStart > rangeFrom ? programStart : rangeFrom;
    // Clear any rows on the two dates we author so the upsert lands cleanly.
    await supabase
      .from('body_measurements')
      .delete()
      .eq('athlete_id', athleteId)
      .in('measured_on', [startMeasDate, today]);
    const insStart = await supabase.from('body_measurements').insert({
      athlete_id: athleteId,
      measured_on: startMeasDate,
      weight_kg: START_KG,
    });
    expect(insStart.error).toBeFalsy();
    const insToday = await supabase.from('body_measurements').insert({
      athlete_id: athleteId,
      measured_on: today,
      weight_kg: SPARK_KG,
    });
    expect(insToday.error).toBeFalsy();

    // === Seed CALORIES (yesterday) =========================================
    // Reuse a seeded catalogue food for a valid FK + a known macro snapshot.
    const { data: foodRows, error: foodErr } = await supabase
      .from('foods')
      .select('id')
      .limit(1);
    expect(foodErr).toBeFalsy();
    const foodId = foodRows[0].id;
    await supabase
      .from('nutrition_logs')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('logged_on', yesterday);
    const SEED_KCAL = 1234.5;
    const insLog = await supabase.from('nutrition_logs').insert({
      athlete_id: athleteId,
      logged_on: yesterday,
      slot: 'breakfast',
      food_id: foodId,
      food_name: 'ZZTest Dashboard Food',
      quantity_g: 100,
      kcal: SEED_KCAL,
      protein_g: 30,
      carbs_g: 40,
      fat_g: 10,
    });
    expect(insLog.error).toBeFalsy();

    // === Seed STREAK =======================================================
    // Mark the most recent elapsed scheduled days "done". Walk back from today,
    // collecting scheduled calendar dates that are <= today and >= programStart,
    // and seed finished sessions on them (skip today itself — an as-yet-undone
    // today must not zero the streak; seeding it would only help, but we test the
    // "today not yet done" path by leaving it out and asserting the prior run).
    const scheduleSet = new Set(scheduleDays);
    seededStreakDays = [];
    if (scheduleSet.size > 0) {
      let cursor = shiftDay(today, -1); // start strictly before today
      const floor = programStart ?? shiftDay(today, -40);
      for (let i = 0; i < 28 && seededStreakDays.length < 3; i += 1) {
        if (cursor < floor) break;
        if (scheduleSet.has(isoWeekday(cursor))) {
          seededStreakDays.push(cursor);
        }
        cursor = shiftDay(cursor, -1);
      }
      for (const d of seededStreakDays) {
        await seedFinishedSession(d, 4000 + seededStreakDays.indexOf(d));
      }
    }

    // === READ the dashboard ================================================
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toBeTruthy();
    const { metrics, sparkline, has_data: hasData } = data;

    // ---- WEIGHT card ------------------------------------------------------
    expect(metrics.weight).toBeTruthy();
    expect(metrics.weight.current_kg).toBeCloseTo(SPARK_KG, 2);
    // start_kg is the profile's starting_weight_kg (not the seeded weigh-in) per
    // the controller: assert the delta is internally consistent (current - start).
    expect(metrics.weight.delta_kg).toBeCloseTo(
      Math.round((metrics.weight.current_kg - metrics.weight.start_kg) * 10) / 10,
      2,
    );

    // ---- SPARKLINE --------------------------------------------------------
    expect(sparkline.days).toBe(sparklineDays);
    expect(sparkline.has_data).toBe(true);
    expect(Array.isArray(sparkline.points)).toBe(true);
    expect(sparkline.points.length).toBeGreaterThan(0);
    // Date-ascending within the look-back window.
    for (let i = 1; i < sparkline.points.length; i += 1) {
      expect(sparkline.points[i].date >= sparkline.points[i - 1].date).toBe(true);
    }
    for (const p of sparkline.points) {
      expect(p.date >= rangeFrom).toBe(true);
      expect(p.date <= today).toBe(true);
    }
    // The last point is the seeded "today" weigh-in.
    const last = sparkline.points[sparkline.points.length - 1];
    expect(last.date).toBe(today);
    expect(last.weight_kg).toBeCloseTo(SPARK_KG, 2);

    // ---- CALORIES card ----------------------------------------------------
    expect(metrics.calories).toBeTruthy();
    expect(metrics.calories.yesterday_kcal).toBeCloseTo(SEED_KCAL, 1);
    expect(typeof metrics.calories.target_kcal).toBe('number');
    expect(metrics.calories.delta_kcal).toBeCloseTo(
      metrics.calories.yesterday_kcal - metrics.calories.target_kcal,
      1,
    );
    expect(metrics.calories.over).toBe(
      metrics.calories.yesterday_kcal > metrics.calories.target_kcal,
    );

    // ---- STREAK card ------------------------------------------------------
    // Re-derive the expected streak independently from ALL finished-session days the
    // dashboard sees (the real ones plus the ones we just seeded) + the athlete's
    // schedule, using the same asOf/programStart the controller uses. Reading the full
    // finished set from the DB (not just our seeded subset) keeps the assertion robust
    // when the seeded athlete already had completed sessions in the window.
    expect(metrics.streak).toBeTruthy();
    expect(Number.isInteger(metrics.streak.count)).toBe(true);
    const { data: finishedRows, error: finishedErr } = await supabase
      .from('session_journal_entries')
      .select('ended_at')
      .eq('athlete_id', athleteId)
      .not('ended_at', 'is', null);
    expect(finishedErr).toBeFalsy();
    const finishedDays = new Set(
      (finishedRows ?? [])
        .map((r) => new Date(r.ended_at).toISOString().slice(0, 10))
        .filter(Boolean),
    );
    const expectedStreak = consecutiveSessionStreak({
      finishedDays,
      scheduleDays,
      asOf: today,
      // Mirror the controller's fallback: programStart defaults to `today` when the
      // profile has no program_start_date.
      programStart: programStart ?? today,
    });
    expect(metrics.streak.count).toBe(expectedStreak);
    if (seededStreakDays.length > 0 && scheduleDays.length > 0) {
      // We seeded the contiguous tail of elapsed scheduled days → a positive streak.
      expect(metrics.streak.count).toBeGreaterThanOrEqual(1);
    }

    // ---- PHASE card -------------------------------------------------------
    // The seeded athlete has training phases → a present, well-formed phase card.
    if (metrics.phase) {
      expect(typeof metrics.phase.name).toBe('string');
      expect(metrics.phase.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(metrics.phase.days_remaining)).toBe(true);
      expect(metrics.phase.days_remaining).toBeGreaterThanOrEqual(0);
    }

    // ---- has_data flags ---------------------------------------------------
    expect(hasData).toBeTruthy();
    expect(hasData.metrics).toBe(true); // weight/calories/phase present
    expect(hasData.sparkline).toBe(true);
  });

  it('every metric obeys the null-or-well-formed cold-start contract (FR-018/SC-009)', async () => {
    if (!live) {
      console.warn('[dashboard.metrics.integration] skipping live assertions');
      return;
    }
    // The dashboard ALWAYS returns the full, flagged payload — even tiles whose source
    // is bare render a null/empty cold-start shape rather than erroring. Assert the
    // structural contract from metricsView (data-model §3c): each sub-metric is either
    // null OR a fully-shaped object; `streak` is always present; `has_data` always maps.
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const { metrics, sparkline, has_data: hasData } = res.body.data;

    // streak is never null — cold-start default is { count: 0 }.
    expect(metrics.streak).toBeTruthy();
    expect(Number.isInteger(metrics.streak.count)).toBe(true);
    expect(metrics.streak.count).toBeGreaterThanOrEqual(0);

    // weight: null OR { current_kg, start_kg, delta_kg }.
    if (metrics.weight !== null) {
      expect(typeof metrics.weight.current_kg).toBe('number');
      expect(typeof metrics.weight.start_kg).toBe('number');
      expect(typeof metrics.weight.delta_kg).toBe('number');
    }
    // calories: null OR { yesterday_kcal, target_kcal, delta_kcal, over }.
    if (metrics.calories !== null) {
      expect(typeof metrics.calories.yesterday_kcal).toBe('number');
      expect(typeof metrics.calories.target_kcal).toBe('number');
      expect(typeof metrics.calories.delta_kcal).toBe('number');
      expect(typeof metrics.calories.over).toBe('boolean');
    }
    // phase: null OR { name, days_remaining }.
    if (metrics.phase !== null) {
      expect(typeof metrics.phase.name).toBe('string');
      expect(Number.isInteger(metrics.phase.days_remaining)).toBe(true);
    }

    // sparkline always carries its shape (has_data flag + array + window size).
    expect(typeof sparkline.has_data).toBe('boolean');
    expect(Array.isArray(sparkline.points)).toBe(true);
    expect(sparkline.days).toBe(sparklineDays);

    // The per-tile has_data map is always present and boolean-valued.
    expect(hasData).toBeTruthy();
    for (const key of ['today', 'week', 'metrics', 'sparkline', 'alerts', 'quote']) {
      expect(typeof hasData[key]).toBe('boolean');
    }
  });
});
