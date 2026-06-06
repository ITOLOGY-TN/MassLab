import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { dashboardController } from '../../controllers/dashboard.controller.js';
import { weeklyPlanDao } from '../../services/dataAccess/weeklyPlan.dao.js';
import { sessionsDao } from '../../services/dataAccess/sessions.dao.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { trainingPhasesDao } from '../../services/dataAccess/trainingPhases.dao.js';
import { bodyMeasurementsDao } from '../../services/dataAccess/bodyMeasurements.dao.js';
import { nutritionLogsDao } from '../../services/dataAccess/nutritionLogs.dao.js';
import { supplementIntakeDao } from '../../services/dataAccess/supplementIntake.dao.js';
import { supplementsDao } from '../../services/dataAccess/supplements.dao.js';
import { recoveryDao } from '../../services/dataAccess/recovery.dao.js';
import { progressionFlagsDao } from '../../services/dataAccess/progressionFlags.dao.js';
import { exercisesDao } from '../../services/dataAccess/exercises.dao.js';
import { muscleGroupsDao } from '../../services/dataAccess/muscleGroups.dao.js';
import { quotesDao } from '../../services/dataAccess/quotes.dao.js';
import { appConfigDao } from '../../services/dataAccess/appConfig.dao.js';
import { buildApp } from '../../app.js';

// Phase 10 (013-phase10-dashboard) T038 — cross-cutting dashboard guarantees against the
// live API. PURELY READ-ONLY. Four concerns, none of which the per-tile suites cover end
// to end:
//   1. COLD-START (SC-009): a brand-new athlete with NO logged data anywhere still gets a
//      fully-shaped, error-free payload — every tile empty / null / has_data:false,
//      streak.count:0, zero alerts. Driven against a freshly-minted athlete id that owns
//      nothing, so there is nothing to seed and nothing to clean up.
//   2. READ-ONLY (SC-010): a GET leaves recovery_log / nutrition_logs /
//      session_journal_entries row counts unchanged AND writes no calculation_results —
//      the dashboard never writes and never re-runs the engine.
//   3. ATHLETE-SCOPING (FR-017/SC-011): GET /dashboard returns ONLY the requesting
//      athlete's data. The cold-start athlete's tiles must be disjoint from the seeded
//      athlete's (no rows leak across the tenant boundary).
//   4. FULL DashboardView SCHEMA (contracts/openapi.yaml): the complete today / week /
//      metrics / sparkline / alerts / quote shape now that every tile is wired —
//      completing the contract coverage T008 started for today + week only.
//
// The cold-start + scoping cases call the controller DIRECTLY with a controlled
// req.athleteId (the app runs in SINGLE_USER mode and would otherwise always resolve the
// seeded athlete). We mint a brand-new athlete id that owns ZERO rows — a random UUID the
// controller's reads all return empty for — so the suite SEEDS NOTHING and therefore needs
// no snapshot-and-restore. The read-only + schema cases use the real HTTP path (Supertest)
// against the seeded athlete, mirroring dashboard.today.integration.test.js.
//
// Live-gated: skips when .env is absent or Supabase is unreachable. Phase 10 adds no
// schema, so there is no migration probe.
let app;
let supabase;
let config;
let daos;
let seededAthleteId = null;
// A brand-new athlete id that owns nothing: a syntactically-valid UUID guaranteed not to
// collide with any real row. Reads scoped to it return empty everywhere (cold start).
const COLD_ATHLETE_ID = '00000000-0000-4000-8000-000000000abc';
let live = false;

// Invoke the controller out-of-band with a fabricated athlete id, capturing the JSON the
// handler would have sent. No HTTP, no auth middleware — so we control req.athleteId.
async function dashboardFor(athleteId) {
  const controller = dashboardController({ daos, config });
  let captured = null;
  let failure = null;
  const req = { athleteId };
  const res = {
    json(body) {
      captured = body;
      return res;
    },
    status() {
      return res;
    },
  };
  await controller.getDashboard(req, res, (err) => {
    failure = err;
  });
  if (failure) throw failure;
  return captured?.data ?? null;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.coldstart.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  // Connectivity probe (Phase 10 adds no schema — probe an existing table).
  const probe = await supabase.from('weekly_plan_slots').select('day_of_week').limit(1);
  if (probe.error) {
    console.warn('[dashboard.coldstart.integration] skipped — Supabase unreachable');
    return;
  }
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  seededAthleteId = athlete?.id;
  if (!seededAthleteId) {
    console.warn('[dashboard.coldstart.integration] skipped — no seeded athlete');
    return;
  }

  // Build the daos the controller fans out over, the same way app.js does.
  daos = {
    weeklyPlan: weeklyPlanDao(supabase),
    sessions: sessionsDao(supabase),
    athletes: athletesDao(supabase),
    trainingPhases: trainingPhasesDao(supabase),
    bodyMeasurements: bodyMeasurementsDao(supabase),
    nutritionLogs: nutritionLogsDao(supabase),
    supplementIntake: supplementIntakeDao(supabase),
    supplements: supplementsDao(supabase),
    recovery: recoveryDao(supabase),
    progressionFlags: progressionFlagsDao(supabase),
    exercises: exercisesDao(supabase),
    muscleGroups: muscleGroupsDao(supabase),
    quotes: quotesDao(supabase),
    appConfig: appConfigDao(supabase),
  };

  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: dashboard cold-start, read-only, scoping, full schema (Phase 10)', () => {
  it('cold-start: a brand-new athlete gets a fully-shaped, empty payload with no error (SC-009)', async () => {
    if (!live) {
      console.warn('[dashboard.coldstart.integration] skipping live assertions');
      return;
    }

    const data = await dashboardFor(COLD_ATHLETE_ID);
    expect(data).not.toBeNull();

    // The whole envelope is present and shaped even though the athlete owns nothing.
    expect(data).toHaveProperty('today');
    expect(data).toHaveProperty('week');
    expect(data).toHaveProperty('metrics');
    expect(data).toHaveProperty('sparkline');
    expect(data).toHaveProperty('alerts');
    expect(data).toHaveProperty('quote');
    expect(data).toHaveProperty('has_data');

    // Today: no schedule for any weekday → a rest card with no CTA / muscle group /
    // exercises, regardless of which weekday "today" lands on.
    expect(data.today.is_rest).toBe(true);
    expect(data.today.state).toBe('rest');
    expect(data.today.cta).toBeNull();
    expect(data.today.muscle_group).toBeNull();
    expect(data.today.exercises).toEqual([]);

    // Week: still 7 days, every one a rest day (no scheduled training days).
    expect(data.week.days.length).toBe(7);
    for (const cell of data.week.days) {
      expect(cell.status).toBe('rest');
    }

    // Metrics: every value-bearing sub-metric is null; the streak is exactly 0.
    expect(data.metrics.weight).toBeNull();
    expect(data.metrics.calories).toBeNull();
    expect(data.metrics.phase).toBeNull();
    expect(data.metrics.streak.count).toBe(0);

    // Sparkline: no weight points → has_data:false, empty series.
    expect(data.sparkline.has_data).toBe(false);
    expect(data.sparkline.points).toEqual([]);

    // No conditions hold for an athlete with no logs → zero alerts. Critically, a
    // never-logged-creatine athlete must NOT trip creatine_streak_broken (SC-009).
    expect(data.alerts).toEqual([]);

    // The per-tile has_data map reflects the cold start (week may flag false since every
    // day is a rest day, but the tiles that depend on logged data are all false).
    expect(data.has_data.metrics).toBe(false);
    expect(data.has_data.sparkline).toBe(false);
    expect(data.has_data.alerts).toBe(false);
  });

  it('read-only: a GET leaves row counts unchanged and writes no calculation_results (SC-010)', async () => {
    if (!live) return;

    const countOwn = (table) =>
      supabase
        .from(table)
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', seededAthleteId);

    const before = await Promise.all([
      countOwn('recovery_log'),
      countOwn('nutrition_logs'),
      countOwn('session_journal_entries'),
      countOwn('calculation_results'),
    ]);

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);

    const after = await Promise.all([
      countOwn('recovery_log'),
      countOwn('nutrition_logs'),
      countOwn('session_journal_entries'),
      countOwn('calculation_results'),
    ]);

    // None of the read sources gained or lost a row across the GET.
    expect(after[0].count ?? 0).toBe(before[0].count ?? 0); // recovery_log
    expect(after[1].count ?? 0).toBe(before[1].count ?? 0); // nutrition_logs
    expect(after[2].count ?? 0).toBe(before[2].count ?? 0); // session_journal_entries
    // The dashboard never re-runs the engine → no new calculation/audit rows (SC-010).
    expect(after[3].count ?? 0).toBe(before[3].count ?? 0);
  });

  it('athlete-scoping: GET /dashboard returns only the requesting athlete data (FR-017/SC-011)', async () => {
    if (!live) return;

    // The seeded athlete's dashboard (HTTP path → resolves the seeded athlete) and the
    // cold-start athlete's dashboard (controller-direct) must be DISJOINT: the cold athlete
    // owns nothing, so none of the seeded athlete's exercises / week-statuses / weight
    // points leak into it.
    const seededRes = await request(app).get('/api/v1/dashboard');
    expect(seededRes.status).toBe(200);
    const seeded = seededRes.body.data;
    const cold = await dashboardFor(COLD_ATHLETE_ID);

    // Independently read the seeded athlete's own exercise universe + schedule, so we can
    // prove the cold athlete shares none of it.
    const slots = await daos.weeklyPlan.listSlotsWithExercises(seededAthleteId);
    const seededExerciseIds = new Set(
      slots.flatMap((s) => (s.exercises ?? []).map((e) => e.exercise_id)),
    );

    // The cold athlete's today card exposes NONE of the seeded athlete's exercises.
    for (const ex of cold.today.exercises) {
      expect(seededExerciseIds.has(ex.id)).toBe(false);
    }
    // And it has no exercises at all (owns no schedule).
    expect(cold.today.exercises).toEqual([]);

    // The cold athlete's week is entirely rest, whereas the seeded athlete (if it has any
    // schedule) has at least one non-rest cell — confirming the strips are not shared.
    expect(cold.week.days.every((d) => d.status === 'rest')).toBe(true);
    const seededHasTraining = seeded.week.days.some((d) => d.status !== 'rest');
    if (seededHasTraining) {
      // Proves the seeded athlete's schedule did NOT bleed into the cold athlete's tiles.
      expect(cold.week.days.some((d) => d.status !== 'rest')).toBe(false);
    }

    // The cold athlete has no weight series; the seeded athlete's points (if any) never
    // appear in the cold athlete's sparkline.
    const seededPointDates = new Set((seeded.sparkline.points ?? []).map((p) => p.date));
    for (const p of cold.sparkline.points ?? []) {
      expect(seededPointDates.has(p.date)).toBe(false);
    }
    expect(cold.sparkline.points).toEqual([]);

    // The cold athlete has no metrics-bearing data either (full tenant isolation).
    expect(cold.metrics.weight).toBeNull();
    expect(cold.metrics.calories).toBeNull();
    expect(cold.metrics.streak.count).toBe(0);
    expect(cold.alerts).toEqual([]);
  });

  it('full DashboardView schema: today/week/metrics/sparkline/alerts/quote match the contract', async () => {
    if (!live) return;

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    const data = res.body.data;

    // ---- today (TodayCard) ----------------------------------------------------------
    const today = data.today;
    expect(typeof today.is_rest).toBe('boolean');
    expect(today.muscle_group === null || typeof today.muscle_group === 'string').toBe(true);
    expect(Array.isArray(today.exercises)).toBe(true);
    expect(today.exercises.length).toBeLessThanOrEqual(3);
    for (const ex of today.exercises) {
      expect(Number.isInteger(ex.id)).toBe(true);
      expect(ex).toHaveProperty('name');
    }
    expect(['not_started', 'in_progress', 'finished', 'rest']).toContain(today.state);
    expect([null, 'start', 'resume', 'review']).toContain(today.cta);
    expect(today.day_of_week).toBeGreaterThanOrEqual(1);
    expect(today.day_of_week).toBeLessThanOrEqual(7);

    // ---- week (WeekOverview) --------------------------------------------------------
    expect(Array.isArray(data.week.days)).toBe(true);
    expect(data.week.days.length).toBe(7);
    for (const cell of data.week.days) {
      expect(typeof cell.date).toBe('string');
      expect(cell.day_of_week).toBeGreaterThanOrEqual(1);
      expect(cell.day_of_week).toBeLessThanOrEqual(7);
      expect(['done', 'todo', 'rest']).toContain(cell.status);
    }

    // ---- metrics (Metrics) ----------------------------------------------------------
    const m = data.metrics;
    if (m.weight !== null) {
      expect(typeof m.weight.current_kg).toBe('number');
      expect(typeof m.weight.start_kg).toBe('number');
      expect(typeof m.weight.delta_kg).toBe('number');
    }
    if (m.calories !== null) {
      expect(typeof m.calories.yesterday_kcal).toBe('number');
      expect(typeof m.calories.target_kcal).toBe('number');
      expect(typeof m.calories.delta_kcal).toBe('number');
      expect(typeof m.calories.over).toBe('boolean');
    }
    expect(Number.isInteger(m.streak.count)).toBe(true);
    if (m.phase !== null) {
      expect(typeof m.phase.name).toBe('string');
      expect(Number.isInteger(m.phase.days_remaining)).toBe(true);
    }

    // ---- sparkline (Sparkline) ------------------------------------------------------
    const sp = data.sparkline;
    expect(typeof sp.has_data).toBe('boolean');
    expect(Number.isInteger(sp.days)).toBe(true);
    expect(sp.goal_kg === null || typeof sp.goal_kg === 'number').toBe(true);
    expect(Array.isArray(sp.points)).toBe(true);
    for (const pt of sp.points) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.weight_kg).toBe('number');
    }

    // ---- alerts (Alert[]) -----------------------------------------------------------
    const KINDS = [
      'low_sleep_high_stress',
      'no_session',
      'calorie_deficit',
      'ready_to_add_load',
      'creatine_streak_broken',
    ];
    expect(Array.isArray(data.alerts)).toBe(true);
    expect(data.alerts.length).toBeLessThanOrEqual(3);
    // The alerts are a strict prefix of the fixed priority order (no reordering).
    const idx = data.alerts.map((a) => KINDS.indexOf(a.kind));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    for (const a of data.alerts) {
      expect(KINDS).toContain(a.kind);
      expect(typeof a.message_key).toBe('string');
      expect(a.context).toBeTypeOf('object');
      expect(typeof a.link).toBe('string');
    }

    // ---- quote (Quote | null) -------------------------------------------------------
    if (data.quote !== null) {
      expect(typeof data.quote.text).toBe('string');
      expect(data.quote.author === null || typeof data.quote.author === 'string').toBe(true);
    }

    // ---- has_data map ---------------------------------------------------------------
    expect(data.has_data).toBeTypeOf('object');
    for (const k of ['today', 'week', 'metrics', 'sparkline', 'alerts', 'quote']) {
      expect(typeof data.has_data[k]).toBe('boolean');
    }
  });
});
