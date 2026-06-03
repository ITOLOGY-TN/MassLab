import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { isCurrentIsoWeek } from '../services/supplements/week.js';
import { build as buildCheckin } from '../services/recovery/checkinView.js';
import { build as buildAlerts } from '../services/recovery/alertsView.js';
import { build as buildTrends } from '../services/recovery/trendsView.js';
import { evaluateAlerts } from '../services/engine/recoveryAlerts.js';
import {
  energyHeatmap,
  sleepPerformanceScatter,
  overlapSeries,
} from '../services/engine/recoveryTrends.js';

// Phase 9 (012-phase9-recovery-wellbeing) — daily recovery check-in + smart alerts +
// trend visuals over the existing recovery_log table (read-only over the session
// journal for the scatter). Recovery logging is subjective journaling — it runs NO
// calculator/progression/audit engine (FR-020). Pure status/number logic lives in
// services/engine + services/recovery; this controller orchestrates DAOs and reads
// the clock once at the request boundary.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// True only for a real calendar date in YYYY-MM-DD: the regex alone admits
// rollover dates (e.g. 2026-02-30) that new Date() silently coerces to another day
// (mis-bucketing rather than rejecting). Round-trip through UTC to reject them.
function isRealIsoDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Format a Date as YYYY-MM-DD (UTC) — the calendar-day convention shared with the
// schema, DAOs, and week.js. The caller injects `now` so guards are deterministic
// (read the clock once at the request boundary, never inside a pure fn).
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Shift a YYYY-MM-DD day by n calendar days (UTC), returning YYYY-MM-DD.
function shiftDay(isoDate, n) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Resolve a read endpoint's ?date= param: default to today when absent, else require
// a real YYYY-MM-DD (guards downstream date math from a bad string).
function resolveDateParam(raw, now) {
  if (raw == null || raw === '') return isoDay(now());
  if (!isRealIsoDate(raw)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'date must be a valid YYYY-MM-DD');
  }
  return raw;
}

// Resolve the heatmap ?month= param: default to the current month, else require a
// real YYYY-MM. Returns { year, month } with month 1–12.
function resolveMonthParam(raw, now) {
  let value;
  if (raw == null || raw === '') {
    value = isoDay(now()).slice(0, 7);
  } else if (typeof raw === 'string' && MONTH_RE.test(raw)) {
    value = raw;
  } else {
    throw new HttpError(400, 'VALIDATION_FAILED', 'month must be a valid YYYY-MM');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'month must be a valid YYYY-MM');
  }
  return { year, month };
}

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

// Partial check-in upsert (every field optional except logged_on; an empty
// sore_zones is an explicit "no soreness reported"). Mood/zone membership is
// validated against config in the controller, not here (the option lists are
// config-sourced so the schema cannot enumerate them).
const checkinSchema = z
  .object({
    logged_on: z
      .string()
      .regex(DATE_RE, 'logged_on must be YYYY-MM-DD')
      .refine(isRealIsoDate, 'logged_on must be a real calendar date'),
    sleep_quality: z.number().int().min(1).max(5).optional(),
    sleep_hours: z.number().min(0).max(24).optional(),
    energy: z.number().int().min(0).max(10).optional(),
    stress: z.number().int().min(0).max(10).optional(),
    mood: z.string().optional(),
    sore_zones: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .strict();

export function recoveryController({ daos, config, now = () => new Date() }) {
  return {
    // GET /recovery/checkin — the day's saved check-in (or null) + editable flag +
    // config-driven mood/zone option lists.
    async getCheckin(req, res, next) {
      try {
        const today = isoDay(now());
        const date = resolveDateParam(req.query.date, now);
        const editable = isCurrentIsoWeek(date, today);
        const row = await daos.recovery.getForDay(req.athleteId, date);
        const data = buildCheckin({
          row,
          date,
          editable,
          moodOptions: config.RECOVERY_MOOD_OPTIONS,
          soreZoneList: config.RECOVERY_SORE_ZONES,
        });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // PUT /recovery/checkin — upsert the current-ISO-week day's check-in. Partial
    // save: only the validated-present fields are written. Runs NO engine/audit
    // (FR-020 — recovery journaling is not a calculation).
    async putCheckin(req, res, next) {
      try {
        const body = parse(checkinSchema, req.body);
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

        // Mood/zone membership against the config-sourced option lists.
        if (body.mood !== undefined && !config.RECOVERY_MOOD_OPTIONS.includes(body.mood)) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'mood: not an allowed mood');
        }
        if (body.sore_zones !== undefined) {
          const allowed = new Set(config.RECOVERY_SORE_ZONES);
          if (!body.sore_zones.every((z2) => allowed.has(z2))) {
            throw new HttpError(400, 'VALIDATION_FAILED', 'sore_zones: contains a disallowed zone');
          }
        }

        // Partial save: only the keys the body actually carried (excluding logged_on,
        // which is the conflict key). An omitted signal is left untouched on an
        // existing row; sore_zones: [] is an explicit "no soreness" value.
        const fields = {};
        for (const key of Object.keys(body)) {
          if (key === 'logged_on') continue;
          fields[key] = body[key];
        }

        const row = await daos.recovery.upsert(req.athleteId, body.logged_on, fields);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    // GET /recovery/alerts — smart contextual alerts recomputed on read (never
    // persisted). Rules + thresholds from config; the look-back window spans the
    // widest rule window so every rule has the rows it needs.
    async getAlerts(req, res, next) {
      try {
        const today = isoDay(now());
        const thresholds = {
          stressHigh: config.RECOVERY_STRESS_HIGH,
          stressHighDays: config.RECOVERY_STRESS_HIGH_DAYS,
          sleepLowHours: config.RECOVERY_SLEEP_LOW_HOURS,
          energyLow: config.RECOVERY_ENERGY_LOW,
          lowWindowDays: config.RECOVERY_LOW_WINDOW_DAYS,
          restSignals: config.RECOVERY_REST_SIGNALS,
          soreZonesRest: config.RECOVERY_SORE_ZONES_REST,
        };

        // Look back far enough to cover the widest rule window (in days).
        const lookBack = Math.max(thresholds.stressHighDays, thresholds.lowWindowDays);
        const from = shiftDay(today, -(lookBack - 1));
        const rows = await daos.recovery.listRange(req.athleteId, { from, to: today });

        const alerts = evaluateAlerts(rows, { asOf: today, thresholds });
        const data = buildAlerts({ alerts });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // GET /recovery/trends — monthly energy heatmap + sleep-vs-performance scatter +
    // energy/stress/sleep overlay over RECOVERY_TREND_DAYS. Read-only over the
    // session journal for the scatter's training volume.
    async getTrends(req, res, next) {
      try {
        const today = isoDay(now());
        const { year, month } = resolveMonthParam(req.query.month, now);

        // The overlay window: the last RECOVERY_TREND_DAYS ending today.
        const overlapFrom = shiftDay(today, -(config.RECOVERY_TREND_DAYS - 1));
        const overlapTo = today;

        // The heatmap month bounds.
        const monthFrom = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const monthTo = `${monthFrom.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`;

        // One range read covering both windows (heatmap month + overlay window).
        const from = overlapFrom < monthFrom ? overlapFrom : monthFrom;
        const to = overlapTo > monthTo ? overlapTo : monthTo;
        const [checkins, volumes] = await Promise.all([
          daos.recovery.listRange(req.athleteId, { from, to }),
          daos.sessions.dailyTrainingVolumes(req.athleteId, { from, to }),
        ]);

        // Bucket finished-session volume by UTC calendar day, summing per day.
        const volumeByDay = {};
        for (const v of volumes ?? []) {
          if (v?.ended_at == null) continue;
          const day = new Date(v.ended_at).toISOString().slice(0, 10);
          const kg = Number(v.total_volume_kg) || 0;
          volumeByDay[day] = (volumeByDay[day] ?? 0) + kg;
        }

        const heatmap = energyHeatmap(checkins, { year, month });
        const scatter = sleepPerformanceScatter(checkins, volumeByDay);
        const overlap = overlapSeries(checkins, { from: overlapFrom, to: overlapTo });

        const data = buildTrends({ heatmap, scatter, overlap });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
