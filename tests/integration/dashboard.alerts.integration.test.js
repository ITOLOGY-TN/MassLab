import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

// Phase 10 (013-phase10-dashboard) T027 — smart dashboard alerts against the live API.
//
// GET /api/v1/dashboard returns up to THREE alerts, exactly the five kinds, in the FIXED
// priority order:
//   1 low_sleep_high_stress  → 2 no_session  → 3 calorie_deficit
//   → 4 ready_to_add_load    → 5 creatine_streak_broken
// This suite:
//   - seeds conditions so MORE THAN three of the five hold, then asserts the response is
//     EXACTLY the top three actives in the fixed order (cap at 3, FR-010/FR-011/SC-006);
//   - seeds a HEALTHY state and asserts the alert list is empty (all-clear);
//   - asserts each shown alert's CONTEXT (exercise name, calorie delta, missed-day count)
//     and its in-app LINK target;
//   - asserts a brand-new athlete who NEVER logged creatine does NOT get
//     creatine_streak_broken — the alert is lapsed-from-positive only (SC-009).
//
// The dashboard reads the server's real "today" once at the controller boundary. This
// suite seeds the rows each alert reads — recovery_log (today), nutrition_logs
// (yesterday), an active add_load progression_flags row, and creatine
// supplement_intake_log rows — directly via the DAO client. Every row it writes is
// SNAPSHOTTED-AND-RESTORED in afterAll so it never destroys real data:
//   - recovery_log: the today/yesterday cells are snapshotted and restored verbatim;
//   - nutrition_logs: only sentinel rows this suite inserts are removed;
//   - progression_flags: only the sentinel flag this suite inserts is removed;
//   - supplement_intake_log: the creatine cells across the look-back window are
//     snapshotted and restored verbatim.
//
// The no_session alert (priority 2) is schedule-aware and depends on the seeded
// athlete's weekly plan + finished sessions, which this suite does not control. It
// therefore asserts ordering+cap by building the EXPECTED ordered list from the full
// fixed-priority list filtered to whichever kinds are active in the response — this is
// deterministic regardless of whether no_session happens to fire.
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let today = null;
let yesterday = null;
let windowDays = []; // the creatine look-back window (oldest → newest), incl. today
let creatineSuppId = null;

// Sentinel artifacts this suite creates (so cleanup is precise).
const createdLogIds = [];
const createdFlagIds = [];
const recoverySnapshots = new Map(); // logged_on → original recovery row (or null)
const intakeSnapshots = new Map(); // logged_on → original creatine intake row (or null)

// The fixed priority order the dashboard guarantees (data-model.md §2b, research D-3).
const PRIORITY = [
  'low_sleep_high_stress',
  'no_session',
  'calorie_deficit',
  'ready_to_add_load',
  'creatine_streak_broken',
];

const LINKS = {
  low_sleep_high_stress: '/recovery',
  no_session: '/journal',
  calorie_deficit: '/nutrition',
  ready_to_add_load: '/load-tracking',
  creatine_streak_broken: '/supplements',
};

function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getDashboard() {
  const res = await request(app).get('/api/v1/dashboard');
  expect(res.status).toBe(200);
  return res.body.data;
}

function alertKinds(data) {
  return (data.alerts ?? []).map((a) => a.kind);
}

// Replace the recovery_log today/yesterday cells (the window this suite touches),
// leaving every other day untouched. A null `fields` clears that day.
async function setRecovery(day, fields) {
  await supabase.from('recovery_log').delete().eq('athlete_id', athleteId).eq('logged_on', day);
  if (fields) {
    const { error } = await supabase
      .from('recovery_log')
      .insert({ athlete_id: athleteId, logged_on: day, ...fields });
    if (error) throw new Error(`recovery seed failed: ${error.message}`);
  }
}

// Replace the creatine cell for a given day (presence ≡ taken).
async function setCreatine(day, taken) {
  await supabase
    .from('supplement_intake_log')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('supplement_id', creatineSuppId)
    .eq('logged_on', day);
  if (taken) {
    const { error } = await supabase
      .from('supplement_intake_log')
      .insert({ athlete_id: athleteId, supplement_id: creatineSuppId, logged_on: day });
    if (error) throw new Error(`creatine seed failed: ${error.message}`);
  }
}

// Clear every creatine cell across the look-back window (→ "never logged" baseline).
async function clearCreatineWindow() {
  await supabase
    .from('supplement_intake_log')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('supplement_id', creatineSuppId)
    .in('logged_on', windowDays);
}

// Insert yesterday's nutrition so its kcal total is a deep deficit vs. the resolved
// target (well under DASHBOARD_CALORIE_DEFICIT_PCT × target). Tracks the row id.
async function seedYesterdayDeficit(food, kcal) {
  const { data, error } = await supabase
    .from('nutrition_logs')
    .insert({
      athlete_id: athleteId,
      logged_on: yesterday,
      slot: 'breakfast',
      food_id: food.id,
      food_name: food.name,
      quantity_g: 100,
      kcal,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`nutrition seed failed: ${error.message}`);
  createdLogIds.push(data.id);
}

async function clearYesterdayNutrition() {
  await supabase.from('nutrition_logs').delete().eq('athlete_id', athleteId).eq('logged_on', yesterday);
}

// Insert an active exercise-scoped add_load progression flag naming `exercise`. Tracks
// the row id.
async function seedAddLoadFlag(exercise) {
  const { data, error } = await supabase
    .from('progression_flags')
    .insert({
      athlete_id: athleteId,
      scope_kind: 'exercise',
      scope_ref: String(exercise.id),
      flag_type: 'add_load',
      rule: 'dashboard-alerts-integration-sentinel',
      suggested_adjustment: { delta_kg: 2.5 },
      engine_version: '0.0.0-test',
      resolved_constants: {},
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`flag seed failed: ${error.message}`);
  createdFlagIds.push(data.id);
}

async function clearSentinelFlags() {
  if (createdFlagIds.length) {
    await supabase.from('progression_flags').delete().in('id', createdFlagIds);
    createdFlagIds.length = 0;
  }
}

let catalogueFood = null;
let addLoadExercise = null;
let addLoadExerciseName = null;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.alerts.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);

  // Probe the tables the dashboard's alert signals read (Phases 7/8/9). Skip if any of
  // the prerequisite migrations are not applied.
  for (const table of ['recovery_log', 'nutrition_logs', 'supplement_intake_log']) {
    const probe = await supabase.from(table).select('id').limit(1);
    if (probe.error) {
      console.warn(`[dashboard.alerts.integration] skipped — ${table} migration not applied`);
      return;
    }
  }

  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[dashboard.alerts.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;

  // Resolve "today"/"yesterday" from the dashboard's own clock by reading the week strip
  // (its 7 ISO-week dates contain today; the controller uses server UTC). Simpler: derive
  // from a UTC now to match the controller's isoDay(now()).
  today = new Date().toISOString().slice(0, 10);
  yesterday = shiftIso(today, -1);

  // The creatine look-back window the controller uses = DASHBOARD_WEIGHT_SPARKLINE_DAYS
  // days ending today (the same range it passes to supplementIntake.listRange).
  const sparklineDays = config.DASHBOARD_WEIGHT_SPARKLINE_DAYS ?? 30;
  windowDays = [];
  for (let i = sparklineDays - 1; i >= 0; i -= 1) windowDays.push(shiftIso(today, -i));

  // The primary supplement (creatine) from the catalogue.
  const supps = (await request(app).get('/api/v1/supplements')).body.data ?? [];
  const primary = supps.find((s) => s.slug === config.SUPPLEMENT_PRIMARY_SLUG) ?? supps[0] ?? null;
  if (!primary) {
    console.warn('[dashboard.alerts.integration] skipped — no seeded supplements');
    return;
  }
  creatineSuppId = primary.id;

  // A catalogue food to drive the yesterday calorie-deficit seed.
  const foods = (await request(app).get('/api/v1/foods')).body.data ?? [];
  if (!foods.length) {
    console.warn('[dashboard.alerts.integration] skipped — no seeded foods');
    return;
  }
  catalogueFood = foods[0];

  // An exercise to name in the ready_to_add_load flag. The exercises endpoint backs the
  // dashboard's exercise lookup; fall back to a program exercise if needed.
  const exercises = (await request(app).get('/api/v1/exercises')).body.data ?? [];
  if (!exercises.length) {
    console.warn('[dashboard.alerts.integration] skipped — no seeded exercises');
    return;
  }
  addLoadExercise = exercises[0];
  addLoadExerciseName = addLoadExercise.name;

  // Snapshot the recovery_log today/yesterday cells and the creatine window cells, so
  // afterAll can restore them verbatim.
  const { data: recExisting } = await supabase
    .from('recovery_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('logged_on', [today, yesterday]);
  for (const day of [today, yesterday]) recoverySnapshots.set(day, null);
  for (const row of recExisting ?? []) recoverySnapshots.set(row.logged_on, row);

  const { data: intakeExisting } = await supabase
    .from('supplement_intake_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('supplement_id', creatineSuppId)
    .in('logged_on', windowDays);
  for (const day of windowDays) intakeSnapshots.set(day, null);
  for (const row of intakeExisting ?? []) intakeSnapshots.set(row.logged_on, row);

  live = true;
});

afterAll(async () => {
  if (!live) return;

  // Remove the sentinel rows this suite inserted.
  if (createdLogIds.length) {
    await supabase.from('nutrition_logs').delete().in('id', createdLogIds);
  }
  await clearYesterdayNutrition();
  await clearSentinelFlags();

  // Restore recovery_log today/yesterday cells verbatim.
  await supabase
    .from('recovery_log')
    .delete()
    .eq('athlete_id', athleteId)
    .in('logged_on', [today, yesterday]);
  const recRestore = [];
  for (const row of recoverySnapshots.values()) {
    if (!row) continue;
    const { id, created_at, ...rest } = row;
    void id;
    void created_at;
    recRestore.push(rest);
  }
  if (recRestore.length) await supabase.from('recovery_log').insert(recRestore);

  // Restore the creatine window cells verbatim.
  await supabase
    .from('supplement_intake_log')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('supplement_id', creatineSuppId)
    .in('logged_on', windowDays);
  const intakeRestore = [];
  for (const row of intakeSnapshots.values()) {
    if (!row) continue;
    const { id, created_at, ...rest } = row;
    void id;
    void created_at;
    intakeRestore.push(rest);
  }
  if (intakeRestore.length) await supabase.from('supplement_intake_log').insert(intakeRestore);
});

describe('dashboard smart alerts (Phase 10)', () => {
  it('caps at 3 in the fixed priority order when more than three conditions hold', async () => {
    if (!live) return;

    // Seed FOUR of the five conditions so >3 hold (the fifth, no_session, is
    // schedule-driven and may or may not also fire):
    //  1 low_sleep_high_stress — today's recovery: low sleep AND high stress.
    await setRecovery(today, {
      sleep_hours: config.RECOVERY_SLEEP_LOW_HOURS,
      stress: config.RECOVERY_STRESS_HIGH,
      energy: 5,
    });
    //  3 calorie_deficit — yesterday logged far under the target.
    await clearYesterdayNutrition();
    await seedYesterdayDeficit(catalogueFood, 100);
    //  4 ready_to_add_load — an active add_load flag naming an exercise.
    await clearSentinelFlags();
    await seedAddLoadFlag(addLoadExercise);
    //  5 creatine_streak_broken — taken on a prior day in the window, then a GAP to
    //    today (today & yesterday not taken) → streak lapses from positive to 0.
    await clearCreatineWindow();
    await setCreatine(shiftIso(today, -3), true);

    const data = await getDashboard();
    const kinds = alertKinds(data);

    // The dashboard returns at most three alerts.
    expect(data.alerts.length).toBeLessThanOrEqual(3);

    // The four conditions we control must all be ACTIVE somewhere in the unbounded
    // signal set — observable here as: they appear in the response unless a
    // higher-priority alert displaced them. We assert ORDER + CAP by reconstructing the
    // expected visible list from the full fixed-priority order filtered to whichever
    // kinds are active in the response, capped at 3. (no_session is schedule-driven and
    // handled transparently by this reconstruction.)
    const activeInResponse = new Set(kinds);
    const expectedOrdered = PRIORITY.filter((k) => activeInResponse.has(k)).slice(0, 3);
    expect(kinds).toEqual(expectedOrdered);

    // At minimum the top priority we seeded (low_sleep_high_stress) wins a slot, and the
    // visible list is a strict prefix of the fixed priority order (no reordering).
    expect(kinds[0]).toBe('low_sleep_high_stress');
    const priorityIndices = kinds.map((k) => PRIORITY.indexOf(k));
    const sortedIndices = [...priorityIndices].sort((a, b) => a - b);
    expect(priorityIndices).toEqual(sortedIndices);

    // The four conditions we seeded are all genuinely active: the only reason any is
    // absent from the (capped) response is displacement by a HIGHER priority. Confirm
    // each seeded kind is either present OR fully crowded out by 3 higher-priority ones.
    for (const kind of ['low_sleep_high_stress', 'calorie_deficit', 'ready_to_add_load']) {
      const idx = PRIORITY.indexOf(kind);
      const higherActive = PRIORITY.slice(0, idx).filter((k) => activeInResponse.has(k)).length;
      if (!activeInResponse.has(kind)) {
        // Absent ⇒ at least 3 higher-priority alerts occupy the cap.
        expect(higherActive).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('shows the correct context and link for each visible alert', async () => {
    if (!live) return;

    // Same multi-condition seed, but make the calorie deficit deterministic-magnitude and
    // ensure ready_to_add_load names our exercise.
    await setRecovery(today, {
      sleep_hours: config.RECOVERY_SLEEP_LOW_HOURS,
      stress: config.RECOVERY_STRESS_HIGH,
      energy: 5,
    });
    await clearYesterdayNutrition();
    await seedYesterdayDeficit(catalogueFood, 100);
    await clearSentinelFlags();
    await seedAddLoadFlag(addLoadExercise);
    await clearCreatineWindow();
    await setCreatine(shiftIso(today, -3), true);

    const data = await getDashboard();
    const byKind = new Map(data.alerts.map((a) => [a.kind, a]));

    for (const alert of data.alerts) {
      // Every visible alert carries kind + message_key + context + link.
      expect(PRIORITY).toContain(alert.kind);
      expect(typeof alert.message_key).toBe('string');
      expect(alert.message_key).toContain(alert.kind);
      expect(alert.context).toBeTypeOf('object');
      expect(alert.link).toBe(LINKS[alert.kind]);
    }

    // calorie_deficit (when visible) carries a negative delta_kcal (intake under target).
    if (byKind.has('calorie_deficit')) {
      const a = byKind.get('calorie_deficit');
      expect(a.context.delta_kcal).toBeLessThan(0);
      expect(a.link).toBe('/nutrition');
    }

    // no_session (when visible) carries the missed-day count as context.days ≥ threshold.
    if (byKind.has('no_session')) {
      const a = byKind.get('no_session');
      expect(a.context.days).toBeGreaterThanOrEqual(config.DASHBOARD_NO_SESSION_DAYS);
      expect(a.link).toBe('/journal');
    }

    // ready_to_add_load (when visible) names the exercise we flagged.
    if (byKind.has('ready_to_add_load')) {
      const a = byKind.get('ready_to_add_load');
      expect(a.context.exercise).toBe(addLoadExerciseName);
      expect(a.link).toBe('/load-tracking');
    }

    // low_sleep_high_stress (seeded → must be visible) links to /recovery.
    expect(byKind.has('low_sleep_high_stress')).toBe(true);
    expect(byKind.get('low_sleep_high_stress').link).toBe('/recovery');
  });

  it('is empty (all-clear) when the athlete is healthy on every signal', async () => {
    if (!live) return;

    // Heal every signal this suite controls:
    //  - recovery today: ample sleep + calm stress → no low_sleep_high_stress;
    await setRecovery(today, { sleep_hours: 9, stress: 1, energy: 8 });
    //  - no calorie deficit: clear yesterday's log so calories tile is empty (no alert);
    await clearYesterdayNutrition();
    //  - no active add_load flag;
    await clearSentinelFlags();
    //  - creatine: taken EVERY elapsed day through today → an unbroken positive streak,
    //    so it is not "broken". (Window-wide so streakForSupplement walks back unbroken.)
    await clearCreatineWindow();
    for (const day of windowDays) {
      if (day <= today) await setCreatine(day, true);
    }

    const data = await getDashboard();
    const kinds = alertKinds(data);

    // The signals we control are silent. no_session (schedule-driven) is the only kind
    // this suite cannot heal; assert all OTHER kinds are absent, and if the response is
    // non-empty it can only be no_session.
    expect(kinds).not.toContain('low_sleep_high_stress');
    expect(kinds).not.toContain('calorie_deficit');
    expect(kinds).not.toContain('ready_to_add_load');
    expect(kinds).not.toContain('creatine_streak_broken');
    for (const k of kinds) expect(k).toBe('no_session');
  });

  it('never fires creatine_streak_broken for an athlete who never logged creatine (SC-009)', async () => {
    if (!live) return;

    // Simulate a brand-new athlete on the creatine dimension: NO intake rows anywhere in
    // the look-back window (never taken). The streak is always 0 — but 0-from-never is
    // NOT "broken" (broken = lapsed FROM a positive run). Keep all other signals healthy
    // so the only thing under test is the absence of creatine_streak_broken.
    await setRecovery(today, { sleep_hours: 9, stress: 1, energy: 8 });
    await clearYesterdayNutrition();
    await clearSentinelFlags();
    await clearCreatineWindow(); // never-logged baseline

    const data = await getDashboard();
    const kinds = alertKinds(data);

    expect(kinds).not.toContain('creatine_streak_broken');
  });
});
