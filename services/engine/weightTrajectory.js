// Pure — geometry for the body-weight chart's reference overlays (Phase 6,
// research D-6/D-7). `idealZone` returns the steady lean-gain band from the
// athlete's starting weight to their target across the program window;
// `phaseBoundaries` returns the cumulative training-phase boundary dates for the
// chart markers. No clock, no I/O, no globals — the caller supplies `asOf`
// (Constitution II + V).
import { phaseForDate } from '../sessionJournal/currentPhase.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

// Half-width of the ideal band as a fraction of the start→target gain. The zone
// is a presentation detail (spec Assumptions); ±15 % gives a visible, steady
// band around the straight lean-gain line without being so wide it loses meaning.
const BAND_FRACTION = 0.15;

function toIsoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The steady lean-gain band from `startKg` to `targetKg` across the program
 * window (FR-018). The centre line rises linearly from start to target over
 * `totalWeeks`; `lower`/`upper` are that line offset by ±`BAND_FRACTION` of the
 * total gain. Endpoints are produced at the program start and at every whole
 * week up to (and including) the program end. Returns `null` when any required
 * input is missing (graceful omission, FR-018) — the caller drops the overlay.
 *
 * @param {object} args
 * @param {number} args.startKg     starting body weight
 * @param {number} args.targetKg    target body weight
 * @param {Date|string|number} args.startDate  program start date
 * @param {number} args.totalWeeks  total program length in weeks
 * @param {Date|string|number} [args.asOf]  caller-supplied "now" (currently
 *   unused for the band geometry but kept in the signature so the presenter can
 *   pass it uniformly and future on-pace shading stays clock-free).
 * @returns {{ lower: Array<{date:string, kg:number}>, upper: Array<{date:string, kg:number}> }|null}
 */
export function idealZone({ startKg, targetKg, startDate, totalWeeks, asOf: _asOf } = {}) {
  if (
    startKg == null ||
    targetKg == null ||
    startDate == null ||
    totalWeeks == null ||
    !(Number(totalWeeks) > 0)
  ) {
    return null;
  }

  const start = Number(startKg);
  const target = Number(targetKg);
  const weeks = Number(totalWeeks);
  const startMs = new Date(startDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(target) || Number.isNaN(startMs)) return null;

  const gain = target - start;
  const halfBand = Math.abs(gain) * BAND_FRACTION;

  const lower = [];
  const upper = [];
  for (let week = 0; week <= weeks; week += 1) {
    const center = start + (gain * week) / weeks;
    const date = toIsoDate(startMs + week * MS_PER_WEEK);
    lower.push({ date, kg: round2(center - halfBand) });
    upper.push({ date, kg: round2(center + halfBand) });
  }
  return { lower, upper };
}

/**
 * Cumulative phase-boundary dates for the chart markers (FR-019). Each marker is
 * the date a phase *begins*, walking phases in `display_order` and accumulating
 * whole weeks from `startDate`. Reuses the cumulative-weeks idea shared with
 * `currentPhase.phaseForDate` (the same MS_PER_WEEK stepping). Returns `[]` when
 * `startDate` or `phases` are missing.
 *
 * @param {object} args
 * @param {Date|string|number} args.startDate
 * @param {Array<{ name?: string, slug?: string, weeks: number, display_order?: number }>} args.phases
 * @returns {Array<{ name: string|null, date: string }>}
 */
export function phaseBoundaries({ startDate, phases = [] } = {}) {
  if (startDate == null || !phases.length) return [];
  const startMs = new Date(startDate).getTime();
  if (Number.isNaN(startMs)) return [];

  const ordered = [...phases].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const markers = [];
  let cumulativeWeeks = 0;
  for (const phase of ordered) {
    const date = toIsoDate(startMs + cumulativeWeeks * MS_PER_WEEK);
    markers.push({ name: phase.name ?? phase.slug ?? null, date });
    cumulativeWeeks += Number(phase.weeks) || 0;
  }
  return markers;
}

// Re-export so callers that need date-bucketing share the one implementation
// rather than re-deriving the cumulative-weeks math (research D-6).
export { phaseForDate };
