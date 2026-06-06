import * as metricsView from '../services/statistics/metricsView.js';
import * as bodyTab from '../services/statistics/bodyTab.js';
import * as strengthTab from '../services/statistics/strengthTab.js';
import * as attendanceTab from '../services/statistics/attendanceTab.js';
import * as nutritionTab from '../services/statistics/nutritionTab.js';
import * as recoveryTab from '../services/statistics/recoveryTab.js';
import * as statisticsView from '../services/statistics/statisticsView.js';
import * as monthlyReport from '../services/statistics/monthlyReport.js';
import {
  buildWorkingWeightSeries,
  rankByWorkingWeightGain,
} from '../services/engine/exerciseImprovements.js';
import { buildRecommendations } from '../services/engine/reportRecommendations.js';
import { resolveTargets } from '../services/nutrition/targets.js';
import { HttpError } from '../middleware/errorHandler.js';

// Phase 11 (014-phase11-statistics) — the statistics screen: a single PURELY READ-ONLY
// composition of data the athlete already owns (Phases 0–10). Lifetime metrics, plus
// body / strength / attendance / nutrition / recovery trends, plus an exportable monthly
// progress report. This endpoint NEVER writes, NEVER re-runs the calculators/progression
// engine, and writes NO calculation/audit row. It composes existing readers (no new
// DAO/table/migration).
//
// The clock is read ONCE at the request boundary (`isoDay(now())` = server UTC day); the
// athlete-scoped reads fan out (every read parameterised by req.athleteId); the pure
// presenters/engine helpers receive injected, already-resolved values + the asOf string.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const GREY = '#6b7280';

// True only for a real calendar date in YYYY-MM-DD: the regex alone admits rollover
// dates (e.g. 2026-02-30) that new Date() silently coerces to another day. Round-trip
// through UTC to reject them. (Copied from dashboard.controller.js for a shared boundary.)
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

export function statisticsController({ daos, config, now = () => new Date() }) {
  // exercise_id → muscle-group ref + name (first slot wins), plus the ordered group list —
  // mirrors loadTracking.controller.js#muscleGroupMaps. The slot's display_color overrides
  // the group's, falling back to grey.
  function buildMuscleGroupMaps({ slots, groups }) {
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const exMuscleGroup = new Map(); // exercise_id → group name
    for (const slot of slots) {
      const g = groupById.get(slot.muscle_group_id);
      const name = g?.name ?? 'Unassigned';
      for (const ex of slot.exercises ?? []) {
        if (!exMuscleGroup.has(ex.exercise_id)) exMuscleGroup.set(ex.exercise_id, name);
      }
    }
    // Ordered groups for the radar axes (sort_order already applied by the DAO).
    const muscleGroups = groups.map((g) => ({
      name: g.name,
      display_color: g.display_color ?? GREY,
    }));
    return { exMuscleGroup, muscleGroups };
  }

  return {
    // GET /statistics — the composed statistics view model in one response. Read-only:
    // the clock is read once here; the athlete-scoped reads fan out; the pure assembler
    // bundles the slices. Every slice carries an empty/cold-start shape so a brand-new
    // athlete with no logged data still gets a fully-rendered payload.
    async getStatistics(req, res, next) {
      try {
        // Read the clock once at the request boundary (server UTC day).
        const asOf = isoDay(now());
        const athleteId = req.athleteId;

        const profile = await daos.athletes.findById(athleteId);
        const programStart = profile?.program_start_date ?? asOf;

        const [
          measurements,
          records,
          dailyVolumes,
          slots,
          exercises,
          groups,
          nutritionLogs,
          recoveryRows,
          trainingPhases,
          targetsResult,
        ] = await Promise.all([
          daos.bodyMeasurements.listForAthlete(athleteId, { limit: 365 }),
          daos.oneRepMaxRecords.seriesForAthlete(athleteId),
          daos.sessions.dailyTrainingVolumes(athleteId, { from: programStart, to: asOf }),
          daos.weeklyPlan.listSlotsWithExercises(athleteId),
          daos.exercises.listForAthlete({ athleteId, includeArchived: true }),
          daos.muscleGroups.listForAthlete(athleteId, { includeArchived: true }),
          daos.nutritionLogs.listRange(athleteId, { from: programStart, to: asOf }),
          daos.recovery.listRange(athleteId, { from: programStart, to: asOf }),
          daos.trainingPhases.listForAthlete({ athleteId }),
          resolveTargets({ daos, athleteId }).catch(() => null),
        ]);

        // exercise_id → display name (from the exercise catalogue).
        const names = new Map(exercises.map((e) => [e.id, e.name]));
        const { exMuscleGroup, muscleGroups } = buildMuscleGroupMaps({ slots, groups });

        // Unique ISO weekdays (1..7) the athlete trains on (from the weekly plan slots).
        const trainingWeekdays = new Set(slots.map((s) => s.day_of_week).filter((d) => d != null));
        // UTC calendar days with a finished session (drives the completion rate).
        const finishedDays = new Set(dailyVolumes.map((v) => String(v.ended_at).slice(0, 10)));
        const dailyTargetKcal = targetsResult?.targets?.daily_kcal ?? null;

        const metrics = metricsView.build({
          measurements,
          startingWeightKg: profile?.starting_weight_kg,
          dailyVolumes,
          trainingWeekdays,
          finishedDays,
          nutritionEntries: nutritionLogs,
          programStart,
          asOf,
        });

        const body = bodyTab.build({ measurements, profile, phases: trainingPhases, asOf });

        const strength = strengthTab.build({
          records,
          names,
          exerciseMuscleGroup: exMuscleGroup,
          muscleGroups,
          dailyVolumes,
          programStart,
          asOf,
          topN: config.STATISTICS_TOP_EXERCISES,
        });

        const attendance = attendanceTab.build({
          dailyVolumes,
          from: programStart,
          to: asOf,
          levels: config.STATISTICS_HEATMAP_LEVELS,
        });

        const nutrition = nutritionTab.build({
          nutritionEntries: nutritionLogs,
          dailyTargetKcal,
        });

        const recovery = recoveryTab.build({
          checkins: recoveryRows,
          weights: measurements,
          minPoints: config.STATISTICS_MIN_CORRELATION_POINTS,
        });

        res.json({
          data: statisticsView.build({
            metrics,
            body,
            strength,
            attendance,
            nutrition,
            recovery,
          }),
        });
      } catch (err) {
        next(err);
      }
    },

    // GET /statistics/report?month=YYYY-MM — the monthly progress report payload that the
    // frontend renders to a PDF. The optional `month` selects the reporting period
    // (defaults to the most recently COMPLETED calendar month). Read-only, same
    // boundaries as getStatistics.
    async getReport(req, res, next) {
      try {
        const monthParam = req.query.month;
        if (monthParam != null && monthParam !== '' && !MONTH_RE.test(String(monthParam))) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'month must be YYYY-MM');
        }

        // Read the clock once at the request boundary (server UTC day).
        const asOf = isoDay(now());
        const athleteId = req.athleteId;

        // Resolve the reporting month. Default = the month BEFORE the asOf month (the
        // most recently completed calendar month; January rolls to previous-year Dec).
        let year;
        let monthIndex; // 0..11
        if (monthParam != null && monthParam !== '') {
          const [y, m] = String(monthParam).split('-');
          year = Number(y);
          monthIndex = Number(m) - 1;
        } else {
          const [y, m] = asOf.split('-');
          year = Number(y);
          monthIndex = Number(m) - 1 - 1; // previous month
          if (monthIndex < 0) {
            monthIndex = 11;
            year -= 1;
          }
        }

        const monthStr = `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
        const from = `${monthStr}-01`;
        // First of the next month minus one day = last day of the target month.
        const nextMonthFirst = new Date(Date.UTC(year, monthIndex + 1, 1));
        const to = shiftDay(nextMonthFirst.toISOString().slice(0, 10), -1);
        const label = new Intl.DateTimeFormat(config.NUTRITION_LOCALE, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(year, monthIndex, 1)));
        const period = { month: monthStr, from, to, label };

        const profile = await daos.athletes.findById(athleteId);
        const programStart = profile?.program_start_date ?? asOf;

        const [
          monthDailyVolumes,
          monthNutritionEntries,
          monthCheckins,
          measurements,
          records,
          dailyVolumes,
          slots,
          exercises,
          nutritionLogs,
          activeFlags,
          targetsResult,
        ] = await Promise.all([
          daos.sessions.dailyTrainingVolumes(athleteId, { from, to }),
          daos.nutritionLogs.listRange(athleteId, { from, to }),
          daos.recovery.listRange(athleteId, { from, to }),
          daos.bodyMeasurements.listForAthlete(athleteId, { limit: 365 }),
          daos.oneRepMaxRecords.seriesForAthlete(athleteId),
          daos.sessions.dailyTrainingVolumes(athleteId, { from: programStart, to: asOf }),
          daos.weeklyPlan.listSlotsWithExercises(athleteId),
          daos.exercises.listForAthlete({ athleteId, includeArchived: true }),
          daos.nutritionLogs.listRange(athleteId, { from: programStart, to: asOf }),
          daos.progressionFlags.findActiveForAthlete(athleteId),
          resolveTargets({ daos, athleteId }).catch(() => null),
        ]);

        // Month-scoped measurements (filtered from the full list, within [from,to]).
        const monthWeights = measurements.filter(
          (m) => m?.measured_on >= from && m?.measured_on <= to,
        );

        // The report has no strength tab/radar, so it needs only the exercise→name map
        // (for top progressions + add-load recommendations), not the muscle-group maps.
        const names = new Map(exercises.map((e) => [e.id, e.name]));
        const trainingWeekdays = new Set(slots.map((s) => s.day_of_week).filter((d) => d != null));
        const finishedDays = new Set(dailyVolumes.map((v) => String(v.ended_at).slice(0, 10)));
        const dailyTargetKcal = targetsResult?.targets?.daily_kcal ?? null;

        // Lifetime stats — same inputs as getStatistics, remapped to the report shape.
        const metrics = metricsView.build({
          measurements,
          startingWeightKg: profile?.starting_weight_kg,
          dailyVolumes,
          trainingWeekdays,
          finishedDays,
          nutritionEntries: nutritionLogs,
          programStart,
          asOf,
        });
        const lifetime = {
          total_weight_gained_kg: metrics.total_weight_gained_kg,
          total_volume_kg: metrics.total_volume_kg,
          session_completion_pct: metrics.session_completion_rate.pct,
          avg_weekly_calories: metrics.avg_weekly_calories,
        };

        // Top progressions (abs working-weight gain since start), stripped to the report
        // shape { exercise_id, name, gain_kg }.
        const seriesByExercise = buildWorkingWeightSeries(records, { programStart, asOf });
        const topProgressions = rankByWorkingWeightGain({
          seriesByExercise,
          names,
          topN: config.STATISTICS_REPORT_TOP_PROGRESSIONS,
        }).map((p) => ({ exercise_id: p.exercise_id, name: p.name, gain_kg: p.gain_kg }));

        // Month body-weight series for the report chart.
        const weightSeries = monthWeights
          .filter((m) => m?.weight_kg != null)
          .map((m) => ({ date: m.measured_on, weight_kg: Number(m.weight_kg) }));

        // Build the deterministic recommendation signals from the active flags + month
        // aggregates. (No engine re-run — these are the already-persisted flags.)
        const addLoad = activeFlags
          .filter((f) => f.is_active && f.flag_type === 'add_load')
          .map((f) => ({ exercise: names.get(Number(f.scope_ref)) ?? String(f.scope_ref) }));
        const stagnationGroups = activeFlags
          .filter(
            (f) => f.is_active && f.flag_type === 'stagnation' && f.scope_kind === 'muscle_group',
          )
          .map((f) => f.scope_ref);
        const regressionOrDeload = activeFlags.some(
          (f) =>
            f.is_active && (f.flag_type === 'regression' || f.flag_type === 'deload_suggested'),
        );

        // month average calories (mean per logged day) and month sleep/stress means.
        const perDayKcal = new Map();
        for (const e of monthNutritionEntries) {
          const day = String(e?.logged_on).slice(0, 10);
          perDayKcal.set(day, (perDayKcal.get(day) ?? 0) + (Number(e?.kcal) || 0));
        }
        const monthAvgCalories =
          perDayKcal.size > 0
            ? Math.round(
                ([...perDayKcal.values()].reduce((a, b) => a + b, 0) / perDayKcal.size) * 100,
              ) / 100
            : null;

        const sleeps = monthCheckins
          .filter((c) => c?.sleep_hours != null)
          .map((c) => Number(c.sleep_hours));
        const avgSleepHours =
          sleeps.length > 0
            ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 100) / 100
            : null;

        const stresses = monthCheckins
          .filter((c) => c?.stress != null)
          .map((c) => Number(c.stress));
        const avgStress =
          stresses.length > 0
            ? Math.round((stresses.reduce((a, b) => a + b, 0) / stresses.length) * 100) / 100
            : null;

        const recommendations = buildRecommendations(
          {
            addLoad,
            stagnationGroups,
            regressionOrDeload,
            monthAvgCalories,
            targetKcal: dailyTargetKcal,
            avgSleepHours,
            avgStress,
            sleepLowHours: config.RECOVERY_SLEEP_LOW_HOURS,
            stressHigh: config.RECOVERY_STRESS_HIGH,
          },
          {},
        );

        res.json({
          data: monthlyReport.build({
            period,
            monthDailyVolumes,
            monthMeasurements: monthWeights,
            monthNutritionEntries,
            monthCheckins,
            lifetime,
            topProgressions,
            weightSeries,
            recommendations,
          }),
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export { isoDay, isRealIsoDate, shiftDay };
