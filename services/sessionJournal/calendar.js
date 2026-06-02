// Pure — calendar helpers for the Session Journal. "Today's session" is the
// ISO calendar weekday matched against weekly_plan_slots.day_of_week (research
// D-1), NOT an offset from program_start_date. Staleness (D-2) compares the
// calendar day of `started_at` to `now`. Caller supplies the dates; no clock,
// no I/O, no globals (Constitution II + V).

/**
 * ISO weekday of a date: Monday = 1 … Sunday = 7.
 * @param {Date|string|number} date
 */
export function isoDayOfWeek(date) {
  const js = new Date(date).getDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

/**
 * True when two instants fall on the same calendar day (app/local timezone —
 * single-locale assumption). Used to decide same-day auto-resume vs. prior-day
 * resume/discard prompt (D-2).
 */
export function isSameAppDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
