// Pure — supplement streak math (Phase 8, research D-5). A streak is the count of
// consecutive calendar days the supplement was taken, ending at the most recent
// applicable day: today if taken, else the run ending at the latest taken day
// (today-not-yet-taken does NOT break an existing streak). A fully-elapsed day with
// no record breaks it; counting never reaches before program_start_date. Caller
// supplies asOf/programStart; no clock, no I/O, no globals (Constitution II + V).

function shiftDay(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {Set<string>|string[]} takenDates  YYYY-MM-DD dates the supplement was taken
 * @param {{ asOf: string, programStart: string }} opts  server "today" + the streak lower bound
 * @returns {number} consecutive taken days ending at the most recent applicable day
 */
export function streakForSupplement(takenDates, { asOf, programStart } = {}) {
  const set = takenDates instanceof Set ? takenDates : new Set(takenDates ?? []);
  if (set.size === 0) return 0;

  // Today not-yet-taken doesn't break a streak: start from yesterday in that case.
  let cursor = set.has(asOf) ? asOf : shiftDay(asOf, -1);
  let count = 0;
  while (cursor >= programStart && set.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
