// Pure — schedule-aware session streak + missed-day math (Phase 10, data-model.md §2a,
// research D-4). The streak is the count of scheduled training days COMPLETED in an
// unbroken run ending at the most recent ELAPSED scheduled day; rest days are skipped
// (never break a run), a future scheduled day not yet reached doesn't count, and counting
// never precedes programStart. missedScheduledDays counts the consecutive elapsed
// scheduled training days at the tail with no completed session (drives the no_session
// alert). Caller supplies asOf (server UTC day); no clock, no I/O, no globals
// (Constitution II + V).

function shiftDay(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ISO weekday, Mon=1 … Sun=7, for a YYYY-MM-DD date.
function isoWeekday(isoDate) {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function asSet(value) {
  return value instanceof Set ? value : new Set(value ?? []);
}

function asScheduleSet(scheduleDays) {
  return scheduleDays instanceof Set ? scheduleDays : new Set(scheduleDays ?? []);
}

// The most recent scheduled training day on or before `from` that is not in the future,
// i.e. the latest ELAPSED scheduled day at-or-before `from`. Returns null if there is no
// such day on/after `floor` (when a floor is supplied).
function latestElapsedScheduledDay(from, schedule, floor) {
  let cursor = from;
  // Bound the scan to one week; a schedule repeats weekly so 7 steps is enough.
  for (let i = 0; i < 7; i += 1) {
    if (floor && cursor < floor) return null;
    if (schedule.has(isoWeekday(cursor))) return cursor;
    cursor = shiftDay(cursor, -1);
  }
  return null;
}

/**
 * @param {object} args
 * @param {Set<string>|string[]} args.finishedDays  YYYY-MM-DD dates with a completed session
 * @param {number[]|Set<number>} args.scheduleDays  ISO weekdays (1–7) that are training days
 * @param {string} args.asOf          server "today" (YYYY-MM-DD)
 * @param {string} args.programStart  the streak lower bound (YYYY-MM-DD)
 * @returns {number} scheduled training days completed in an unbroken run ending at the
 *   most recent elapsed scheduled day; 0 when that day was missed.
 */
export function consecutiveSessionStreak({ finishedDays, scheduleDays, asOf, programStart } = {}) {
  const finished = asSet(finishedDays);
  const schedule = asScheduleSet(scheduleDays);
  if (schedule.size === 0) return 0;

  // Anchor at the most recent elapsed scheduled day. If today is itself a scheduled day
  // but not yet completed, it is not "missed" — fall back to the prior scheduled day so an
  // as-yet-undone today doesn't zero the streak.
  let cursor = latestElapsedScheduledDay(asOf, schedule, programStart);
  if (cursor && cursor === asOf && !finished.has(cursor)) {
    cursor = latestElapsedScheduledDay(shiftDay(asOf, -1), schedule, programStart);
  }

  let count = 0;
  while (cursor && cursor >= programStart) {
    if (!schedule.has(isoWeekday(cursor))) {
      // Rest day — skip without breaking the run.
      cursor = shiftDay(cursor, -1);
      continue;
    }
    if (!finished.has(cursor)) break; // a missed scheduled day ends the run
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}

/**
 * @param {object} args
 * @param {Set<string>|string[]} args.finishedDays  YYYY-MM-DD dates with a completed session
 * @param {number[]|Set<number>} args.scheduleDays  ISO weekdays (1–7) that are training days
 * @param {string} args.asOf          server "today" (YYYY-MM-DD)
 * @returns {number} consecutive elapsed scheduled training days at the tail with no session
 */
export function missedScheduledDays({ finishedDays, scheduleDays, asOf } = {}) {
  const finished = asSet(finishedDays);
  const schedule = asScheduleSet(scheduleDays);
  if (schedule.size === 0) return 0;

  // Today, if a scheduled day not yet done, is not retrospectively "missed" — start from
  // the latest ELAPSED scheduled day strictly before today in that case.
  let cursor = latestElapsedScheduledDay(asOf, schedule);
  if (cursor && cursor === asOf && !finished.has(cursor)) {
    cursor = latestElapsedScheduledDay(shiftDay(asOf, -1), schedule);
  }

  let count = 0;
  // Guard the scan length: a tail of missed scheduled days; stop at the first completed
  // one. Bounded loop in case of a degenerate schedule.
  for (let i = 0; cursor && i < 366; i += 1) {
    if (!schedule.has(isoWeekday(cursor))) {
      cursor = shiftDay(cursor, -1);
      continue;
    }
    if (finished.has(cursor)) break; // a completed scheduled day ends the missed tail
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
