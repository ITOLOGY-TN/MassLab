// Pure presenter — the compact 7-day week strip (Phase 10, data-model §3b, US1).
// For each ISO-week day it classifies a status:
//   - done = a finished session that day,
//   - rest = the ISO weekday is not a scheduled training day,
//   - todo = a scheduled training day with no finished session — including FUTURE
//     days; the strip never reports "missed" (a not-yet-completed scheduled day is
//     simply still to do).
// Rest takes precedence: a non-scheduled day is always 'rest', regardless of any
// stray finished session on it. No clock, no I/O, no globals (Constitution II + V).

// ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD string, via UTC — mirrors
// services/supplements/week.js#isoDow / sessionJournal/calendar.js#isoDayOfWeek.
function isoDow(isoDate) {
  const js = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

/**
 * @param {object} args
 * @param {string[]} args.weekDays       the 7 ascending ISO dates of the week (YYYY-MM-DD)
 * @param {number[]} [args.scheduleDays] ISO weekdays (1–7) that are training days
 * @param {Set<string>} [args.finishedDays]  dates (YYYY-MM-DD) with a finished session
 * @param {string} args.asOf             server "today" (YYYY-MM-DD) — injected, unused
 *                                       for classification (future days are 'todo'),
 *                                       kept for symmetry with the other presenters.
 * @returns {{ days: Array<{date, day_of_week, status:'done'|'todo'|'rest'}> }}
 */
export function build({ weekDays = [], scheduleDays = [], finishedDays = new Set() } = {}) {
  const scheduled = new Set(scheduleDays);

  return {
    days: weekDays.map((date) => {
      const dayOfWeek = isoDow(date);
      let status;
      if (!scheduled.has(dayOfWeek)) {
        status = 'rest';
      } else if (finishedDays.has(date)) {
        status = 'done';
      } else {
        status = 'todo'; // scheduled, not finished — incl. future days; never "missed"
      }
      return { date, day_of_week: dayOfWeek, status };
    }),
  };
}
