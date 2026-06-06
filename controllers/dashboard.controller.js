import { build as buildDashboard } from '../services/dashboard/dashboardView.js';
import { build as buildTodayCard } from '../services/dashboard/todayCard.js';
import { build as buildWeekOverview } from '../services/dashboard/weekOverview.js';
import { build as buildMetrics } from '../services/dashboard/metricsView.js';
import { build as buildWeightChart } from '../services/bodyTracking/weightChartView.js';
import { resolveTargets } from '../services/nutrition/targets.js';
import { currentTrainingPhase } from '../services/sessionJournal/currentPhase.js';
import { isoWeekStart, weekDays } from '../services/supplements/week.js';
import { consecutiveSessionStreak, missedScheduledDays } from '../services/engine/sessionStreak.js';
import { dayTotals } from '../services/engine/nutritionMath.js';
import { streakForSupplement } from '../services/engine/supplementStreaks.js';
import { aggregateAlerts } from '../services/engine/dashboardAlerts.js';

// Phase 10 (013-phase10-dashboard) — the home-screen dashboard: a single PURELY
// READ-ONLY composition of data the athlete already owns (Phases 0–9). Today's session
// card, a 7-day week overview, four quick metric cards, a 30-day weight sparkline, up to
// three prioritized smart alerts, and the quote of the day. This endpoint NEVER writes,
// NEVER re-runs the calculators/progression engine, and writes NO calculation/audit row
// (FR-016/SC-010). It composes existing readers (no new DAO/table/migration).
//
// The clock is read ONCE at the request boundary (`isoDay(now())` = server UTC day); the
// athlete-scoped reads fan out (every read parameterised by req.athleteId, FR-017); the
// pure presenters/engine helpers receive injected, already-resolved values (FR-019).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// True only for a real calendar date in YYYY-MM-DD: the regex alone admits rollover
// dates (e.g. 2026-02-30) that new Date() silently coerces to another day. Round-trip
// through UTC to reject them. (Copied from recovery.controller.js for a shared boundary.)
function isRealIsoDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Format a Date as YYYY-MM-DD (UTC) — the calendar-day convention shared with the schema,
// DAOs, and the pure week/calendar helpers. The caller injects `now` so guards are
// deterministic (read the clock once at the request boundary, never inside a pure fn).
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Shift a YYYY-MM-DD day by n calendar days (UTC), returning YYYY-MM-DD.
function shiftDay(isoDate, n) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD string, via UTC — consistent with
// supplements/week.js and dashboard/weekOverview.js (NOT the local-tz calendar.js
// helper) so today's weekday agrees with the UTC week strip.
function isoWeekdayOf(isoDate) {
  const js = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

// The UTC calendar day (YYYY-MM-DD) of a timestamptz value, or null.
function utcDayOf(ts) {
  if (ts == null) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function dashboardController({ daos, config, now = () => new Date() }) {
  return {
    // GET /dashboard — the composed home-screen view model in one response. Read-only:
    // the clock is read once here; the athlete-scoped reads fan out; the pure assembler
    // bundles the tiles. Every tile carries an empty/cold-start shape so a brand-new
    // athlete with no logged data still gets a fully-rendered payload (FR-018/SC-009).
    async getDashboard(req, res, next) {
      try {
        const athleteId = req.athleteId;
        const today = isoDay(now());
        const yesterday = shiftDay(today, -1);
        const todayDow = isoWeekdayOf(today);

        // Sparkline / range look-back window (config-driven, default 30 days).
        const sparklineDays = config.DASHBOARD_WEIGHT_SPARKLINE_DAYS ?? 30;
        const rangeFrom = shiftDay(today, -(sparklineDays - 1));

        // Current ISO week (Mon–Sun) for the week strip.
        const weekStart = isoWeekStart(today);
        const isoWeekDates = weekDays(weekStart);

        const locale = config.NUTRITION_LOCALE;

        // Fan out the athlete-scoped reads. Every read is parameterised by
        // req.athleteId (FR-017 tenant scoping); none write. resolveTargets reads its
        // own DAOs (athlete profile + overrides) internally.
        const [
          slots,
          activeSession,
          history,
          profile,
          phases,
          measurements,
          yesterdayLog,
          intakeRows,
          supplements,
          recoveryRows,
          activeFlags,
          exercises,
          muscleGroups,
          targetsResult,
          quote,
        ] = await Promise.all([
          daos.weeklyPlan.listSlotsWithExercises(athleteId),
          daos.sessions.findActiveForAthlete(athleteId),
          daos.sessions.historyForEngine(athleteId),
          daos.athletes.findById(athleteId),
          daos.trainingPhases.listForAthlete({ athleteId, locale }),
          daos.bodyMeasurements.listForAthlete(athleteId, { limit: 365 }),
          daos.nutritionLogs.listForDay(athleteId, yesterday),
          daos.supplementIntake.listRange(athleteId, { from: rangeFrom, to: today }),
          daos.supplements.listForAthlete({ athleteId, locale }),
          daos.recovery.listRange(athleteId, { from: rangeFrom, to: today }),
          daos.progressionFlags.findActiveForAthlete(athleteId),
          daos.exercises.listForAthlete({ athleteId, locale, includeArchived: true }),
          daos.muscleGroups.listForAthlete(athleteId, { includeArchived: true }),
          resolveTargets({ daos, athleteId }).catch(() => null),
          daos.quotes.pickToday({ athleteId, locale, now: now() }),
        ]);

        const programStart = profile?.program_start_date
          ? String(profile.program_start_date).slice(0, 10)
          : today;

        // ---- TODAY + WEEK (T013) ---------------------------------------------------
        // Today's plan slot is the slot whose day_of_week matches today's ISO weekday;
        // absence ≡ a rest day.
        const exerciseById = new Map(exercises.map((e) => [e.id, e]));
        const muscleGroupById = new Map(muscleGroups.map((g) => [g.id, g]));

        const todaySlot = slots.find((s) => s.day_of_week === todayDow) ?? null;
        const isRestDay = todaySlot == null;

        // Resolve the slot's exercises into { id, name } in planned order (todayCard
        // keeps only the first three). The slot exercises carry exercise_id only.
        const todayExercises = (todaySlot?.exercises ?? []).map((e) => ({
          id: e.exercise_id,
          name: exerciseById.get(e.exercise_id)?.name ?? null,
        }));
        const todayMuscleGroup = todaySlot
          ? (muscleGroupById.get(todaySlot.muscle_group_id)?.name ?? null)
          : null;

        // finishedDays — the UTC calendar days with a completed (ended_at) session.
        const finishedSessions = (history.sessions ?? []).filter((s) => s.ended_at != null);
        const finishedDays = new Set(
          finishedSessions.map((s) => utcDayOf(s.ended_at)).filter(Boolean),
        );

        // scheduleDays — the ISO weekdays (1–7) that are configured training days.
        const scheduleDays = slots.map((s) => s.day_of_week);

        // Today's session state for the card: an in-progress session (active) → resume;
        // else a finished session today → review; else not_started. A rest day is
        // resolved inside todayCard.build (it wins over any state).
        let sessionState = 'not_started';
        if (activeSession != null) {
          sessionState = 'in_progress';
        } else if (finishedDays.has(today)) {
          sessionState = 'finished';
        }

        const todayCard = buildTodayCard({
          slot: todaySlot
            ? { day_of_week: todaySlot.day_of_week, muscle_group: todayMuscleGroup }
            : null,
          isRestDay,
          sessionState,
          exercises: todayExercises,
        });

        const weekOverview = buildWeekOverview({
          weekDays: isoWeekDates,
          scheduleDays,
          finishedDays,
          asOf: today,
        });

        // ---- METRICS + SPARKLINE (T023) -------------------------------------------
        // Weight: the weight-chart presenter gives the date-ascending point series +
        // goal line; the current/start come from the series + profile.
        const weightChart = buildWeightChart({
          measurements,
          profile: profile ?? {},
          phases,
          asOf: today,
        });
        const weightPoints = weightChart.points ?? [];
        // Only weigh-ins up to today count: a future-dated entry must never be the
        // "current" weight nor a sparkline point (the series is date-ascending, so the
        // last in-window point is the most recent elapsed weigh-in).
        const inWindowPoints = weightPoints.filter((p) => p.date >= rangeFrom && p.date <= today);
        const elapsedPoints = weightPoints.filter((p) => p.date <= today);
        const currentWeight = elapsedPoints.length
          ? elapsedPoints[elapsedPoints.length - 1].kg
          : null;
        const startWeight =
          profile?.starting_weight_kg != null
            ? Number(profile.starting_weight_kg)
            : elapsedPoints.length
              ? elapsedPoints[0].kg
              : null;
        const weightMetric =
          currentWeight != null && startWeight != null
            ? { current_kg: currentWeight, start_kg: startWeight }
            : null;

        // Sparkline: the weight series sliced to the look-back window + goal line.
        const sparkPoints = inWindowPoints.map((p) => ({ date: p.date, weight_kg: p.kg }));
        const sparkline = {
          has_data: sparkPoints.length > 0,
          days: sparklineDays,
          goal_kg: weightChart.goalKg ?? null,
          points: sparkPoints,
        };

        // Calories: yesterday's logged macro snapshots summed vs. the resolved target.
        const yesterdayKcal = dayTotals(yesterdayLog ?? []).kcal;
        const targetKcal = targetsResult?.targets?.daily_kcal ?? null;
        const caloriesMetric =
          (yesterdayLog?.length ?? 0) > 0 && targetKcal != null
            ? { yesterday_kcal: yesterdayKcal, target_kcal: targetKcal }
            : null;

        // Streak: schedule-aware consecutive completed training days.
        const streakCount = consecutiveSessionStreak({
          finishedDays,
          scheduleDays,
          asOf: today,
          programStart,
        });

        // Phase: the current training phase + its days-remaining. phaseForDate/
        // currentTrainingPhase return the phase row (no end date), so days-remaining is
        // computed from program_start_date + the cumulative weeks THROUGH the active
        // phase (its window end), relative to today.
        const phase = currentTrainingPhase({
          phases,
          programStartDate: programStart,
          now: today,
        });
        let phaseMetric = null;
        if (phase) {
          const ordered = [...phases].sort(
            (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
          );
          let cumulativeWeeks = 0;
          for (const p of ordered) {
            cumulativeWeeks += Number(p.weeks) || 0;
            if (p === phase) break;
          }
          const phaseEnd = shiftDay(programStart, cumulativeWeeks * 7);
          const remainingMs =
            new Date(`${phaseEnd}T00:00:00.000Z`).getTime() -
            new Date(`${today}T00:00:00.000Z`).getTime();
          const daysRemaining = Math.max(0, Math.round(remainingMs / MS_PER_DAY));
          phaseMetric = { name: phase.name, days_remaining: daysRemaining };
        }

        const metrics = buildMetrics({
          weight: weightMetric,
          calories: caloriesMetric,
          streak: { count: streakCount },
          phase: phaseMetric,
        });

        // ---- ALERTS (T030) ---------------------------------------------------------
        // low_sleep_high_stress — from the latest recovery row (sleep ≤ low AND
        // stress ≥ high). recoveryRows are oldest-first → the last is the most recent.
        const latestRecovery = recoveryRows.length ? recoveryRows[recoveryRows.length - 1] : null;
        const lowSleepHighStress =
          latestRecovery != null &&
          latestRecovery.sleep_hours != null &&
          latestRecovery.stress != null &&
          Number(latestRecovery.sleep_hours) <= config.RECOVERY_SLEEP_LOW_HOURS &&
          Number(latestRecovery.stress) >= config.RECOVERY_STRESS_HIGH;

        // no_session — consecutive elapsed scheduled training days missed at the tail.
        const missedDays = missedScheduledDays({ finishedDays, scheduleDays, asOf: today });
        const noSession = missedDays >= config.DASHBOARD_NO_SESSION_DAYS;

        // calorie_deficit — yesterday's intake under DASHBOARD_CALORIE_DEFICIT_PCT × target.
        const calorieDeficit =
          caloriesMetric != null &&
          targetKcal != null &&
          yesterdayKcal < config.DASHBOARD_CALORIE_DEFICIT_PCT * targetKcal;

        // ready_to_add_load — an active exercise-scoped add_load progression flag; name
        // the exercise from the scope_ref (exercise_id).
        const addLoadFlag = activeFlags.find(
          (f) => f.flag_type === 'add_load' && f.scope_kind === 'exercise',
        );
        const addLoadExercise = addLoadFlag
          ? exerciseById.get(Number(addLoadFlag.scope_ref))
          : null;
        const readyToAddLoad = addLoadFlag != null;

        // creatine_streak_broken — the primary supplement's streak has LAPSED FROM A
        // POSITIVE RUN TO 0: streak is 0 today, but it WAS taken on a recent prior day
        // (a positive prior run that has since broken). A brand-new athlete who never
        // logged creatine (no taken rows at all) must NOT trigger it (SC-009).
        const primarySlug = config.SUPPLEMENT_PRIMARY_SLUG;
        const primarySupp = supplements.find((s) => s.slug === primarySlug) ?? null;
        let creatineStreakBroken = false;
        if (primarySupp) {
          const takenDates = new Set(
            intakeRows.filter((r) => r.supplement_id === primarySupp.id).map((r) => r.logged_on),
          );
          const streak = streakForSupplement(takenDates, { asOf: today, programStart });
          // Lapsed-from-positive: streak now 0, yet there is at least one prior taken
          // day before today within the window (a run that has since broken). Never
          // fire for an athlete who has never taken it (empty set).
          const tookBeforeToday = [...takenDates].some((d) => d < today);
          creatineStreakBroken = streak === 0 && tookBeforeToday;
        }

        const alerts = aggregateAlerts(
          {
            lowSleepHighStress: { active: lowSleepHighStress, context: {} },
            noSession: { active: noSession, context: { days: missedDays } },
            calorieDeficit: {
              active: calorieDeficit,
              context: { delta_kcal: yesterdayKcal - (targetKcal ?? 0) },
            },
            readyToAddLoad: {
              active: readyToAddLoad,
              context: addLoadExercise?.name ? { exercise: addLoadExercise.name } : {},
            },
            creatineStreakBroken: { active: creatineStreakBroken, context: {} },
          },
          {},
        );

        // ---- QUOTE (T035) ----------------------------------------------------------
        const quoteTile = quote ? { text: quote.text, author: quote.author ?? null } : null;

        // Assemble + return the composed view model.
        const data = buildDashboard({
          today: todayCard,
          week: weekOverview,
          metrics,
          sparkline,
          alerts,
          quote: quoteTile,
        });

        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}

export { isoDay, isRealIsoDate, shiftDay };
