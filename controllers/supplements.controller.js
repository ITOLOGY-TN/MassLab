import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { isoWeekStart, weekDays, isCurrentIsoWeek } from '../services/supplements/week.js';
import { streakForSupplement } from '../services/engine/supplementStreaks.js';
import { build as buildChecklist } from '../services/supplements/checklistView.js';
import { build as buildGrid } from '../services/supplements/weekGridView.js';
import { build as buildAssessment } from '../services/supplements/assessmentView.js';

// Phase 8 (011-phase8-supplements) — adherence tracking over the seeded supplements
// catalogue (read-only here). Supplement logging runs NO calculator/progression/audit
// engine (FR-020). Pure status/number logic lives in services/engine + services/supplements;
// this controller orchestrates DAOs and reads the clock once at the request boundary.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// True only for a real calendar date in YYYY-MM-DD: the regex alone admits
// rollover dates (e.g. 2026-02-30) that new Date() silently coerces to another day
// (mis-bucketing rather than rejecting — FR-005). Round-trip through UTC to reject them.
function isRealIsoDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// T013 — toggle a supplement's taken state for a day.
const intakeSchema = z
  .object({
    supplement_id: z.number().int().positive(),
    logged_on: z
      .string()
      .regex(DATE_RE, 'logged_on must be YYYY-MM-DD')
      .refine(isRealIsoDate, 'logged_on must be a real calendar date'),
    taken: z.boolean(),
  })
  .strict();

// T036 — the weekly self-assessment (four 1–5 dimensions).
const rating = z.number().int().min(1, 'must be 1–5').max(5, 'must be 1–5');
const assessmentSchema = z
  .object({
    energy: rating,
    recovery: rating,
    sleep_quality: rating,
    strength: rating,
  })
  .strict();

function parse(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
  }
  return parsed.data;
}

// Format a Date as YYYY-MM-DD (UTC) — the calendar-day convention shared with the
// schema, DAOs, and week.js. The caller injects `now` so guards are deterministic
// (read the clock once at the request boundary, never inside a pure fn).
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Resolve a read endpoint's ?date= / ?week= param: default to today when absent,
// else require a real YYYY-MM-DD (guards downstream date math from a bad string).
function resolveDateParam(raw, now) {
  if (raw == null || raw === '') return isoDay(now());
  if (!isRealIsoDate(raw)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'date must be a valid YYYY-MM-DD');
  }
  return raw;
}

export function supplementsController({ daos, config, now = () => new Date() }) {
  return {
    // Existing catalogue list (unchanged behavior; now reads daos.supplements).
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const data = await daos.supplements.listForAthlete({ athleteId: req.athleteId, locale });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T013 — daily checklist: cards + taken-state + per-supplement streak.
    async getChecklist(req, res, next) {
      try {
        const date = resolveDateParam(req.query.date, now);
        const locale = req.query.locale ?? config.NUTRITION_LOCALE ?? 'fr-FR';
        const [catalogue, athlete] = await Promise.all([
          daos.supplements.listForAthlete({ athleteId: req.athleteId, locale }),
          daos.athletes.findById(req.athleteId),
        ]);

        // Streak window: program start … the requested day (research D-5).
        const programStart = athlete?.program_start_date ?? date;
        const from = programStart <= date ? programStart : date;
        const takenRows = await daos.supplementIntake.listRange(req.athleteId, { from, to: date });
        const takenIdsForDay = new Set(
          takenRows.filter((r) => r.logged_on === date).map((r) => r.supplement_id),
        );

        // Per-supplement set of taken dates for streak computation.
        const datesBySupp = new Map();
        for (const r of takenRows) {
          if (!datesBySupp.has(r.supplement_id)) datesBySupp.set(r.supplement_id, new Set());
          datesBySupp.get(r.supplement_id).add(r.logged_on);
        }
        const streaks = {};
        for (const s of catalogue) {
          streaks[s.id] = streakForSupplement(datesBySupp.get(s.id) ?? new Set(), {
            asOf: date,
            programStart,
          });
        }

        const data = buildChecklist({
          catalogue,
          takenIds: takenIdsForDay,
          streaks,
          primarySlug: config.SUPPLEMENT_PRIMARY_SLUG,
          date,
        });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T013 — toggle a supplement's taken state for a day. Editable window =
    // current ISO week only (FR-005a); future date rejected (FR-005).
    async toggleIntake(req, res, next) {
      try {
        const body = parse(intakeSchema, req.body);
        const today = isoDay(now());

        if (body.logged_on > today) {
          throw new HttpError(422, 'FUTURE_DATE', 'logged_on must not be in the future');
        }
        if (!isCurrentIsoWeek(body.logged_on, today)) {
          throw new HttpError(
            422,
            'OUTSIDE_EDIT_WINDOW',
            'Only the current ISO week is editable',
          );
        }

        // The supplement must belong to the athlete's catalogue.
        const catalogue = await daos.supplements.listForAthlete({
          athleteId: req.athleteId,
          locale: req.body.locale ?? config.NUTRITION_LOCALE ?? 'fr-FR',
        });
        if (!catalogue.some((s) => s.id === body.supplement_id)) {
          throw new HttpError(404, 'NOT_FOUND', 'Supplement not found');
        }

        if (body.taken) {
          await daos.supplementIntake.markTaken(req.athleteId, body.supplement_id, body.logged_on);
        } else {
          await daos.supplementIntake.unmark(req.athleteId, body.supplement_id, body.logged_on);
        }
        res.json({
          data: {
            supplement_id: body.supplement_id,
            logged_on: body.logged_on,
            taken: body.taken,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // T029 — weekly grid: supplements × 7 days, each cell taken/missed/upcoming.
    async getGrid(req, res, next) {
      try {
        // Read the clock once so the default anchor and the grid asOf share a day.
        const today = isoDay(now());
        const anchor = resolveDateParam(req.query.week, () => new Date(`${today}T00:00:00.000Z`));
        const weekStart = isoWeekStart(anchor);
        const days = weekDays(weekStart);
        const locale = req.query.locale ?? config.NUTRITION_LOCALE ?? 'fr-FR';
        const [catalogue, takenRows] = await Promise.all([
          daos.supplements.listForAthlete({ athleteId: req.athleteId, locale }),
          daos.supplementIntake.listRange(req.athleteId, {
            from: days[0],
            to: days[days.length - 1],
          }),
        ]);
        const data = buildGrid({
          catalogue,
          takenRows,
          weekStart,
          asOf: today,
        });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T036 — current-week assessment + trend window.
    async getAssessments(req, res, next) {
      try {
        const today = isoDay(now());
        const weekStart = isoWeekStart(today);
        const weeks = config.SUPPLEMENT_ASSESSMENT_TREND_WEEKS;
        const fromTrend = shiftWeeks(weekStart, -(weeks - 1));
        const [current, trendRows] = await Promise.all([
          daos.supplementAssessments.getForWeek(req.athleteId, weekStart),
          daos.supplementAssessments.listRange(req.athleteId, { from: fromTrend, to: weekStart }),
        ]);
        const data = buildAssessment({ currentRow: current, trendRows, weekStart });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T036 — upsert the CURRENT ISO week's assessment (server-derived week, so
    // elapsed weeks are read-only). Ratings validated 1–5 (FR-014).
    async putAssessment(req, res, next) {
      try {
        const body = parse(assessmentSchema, req.body);
        const weekStart = isoWeekStart(isoDay(now()));
        const row = await daos.supplementAssessments.upsert(req.athleteId, weekStart, body);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },
  };
}

// Subtract `n` ISO weeks (×7 days) from a YYYY-MM-DD week-start string.
function shiftWeeks(weekStart, n) {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
