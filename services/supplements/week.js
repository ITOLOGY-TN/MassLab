// Pure — ISO-week helpers for Phase 8 supplements (research D-6). Weeks are
// Monday–Sunday, matching the app's isoDayOfWeek convention (services/sessionJournal/
// calendar.js). Operates on YYYY-MM-DD strings anchored at UTC midnight so results
// are deterministic (no DST/locale drift), mirroring the nutrition controller's date
// arithmetic. No clock, no I/O, no globals (Constitution II + V).

// ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD string, via UTC.
function isoDow(isoDate) {
  const js = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

function shift(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The Monday on or before `date` (the ISO week start), as YYYY-MM-DD.
 * @param {string} date  YYYY-MM-DD
 */
export function isoWeekStart(date) {
  return shift(date, -(isoDow(date) - 1));
}

/**
 * The 7 ascending ISO dates of the week beginning at `weekStart` (a Monday).
 * @param {string} weekStart  YYYY-MM-DD (Monday)
 */
export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
}

/**
 * True when `date` falls in the same ISO week as `asOf` — the editable-window
 * predicate (research D-4).
 * @param {string} date   YYYY-MM-DD
 * @param {string} asOf   YYYY-MM-DD (server "today")
 */
export function isCurrentIsoWeek(date, asOf) {
  return isoWeekStart(date) === isoWeekStart(asOf);
}
