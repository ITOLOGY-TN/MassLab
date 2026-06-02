// Pure helpers — derive read-only history facts for one exercise from already
// logged sessions/sets. No clock, no I/O, no globals (Constitution II + V).
// Ordering is driven by the caller-supplied `started_at`, never the wall clock.
// Phase 3: research D-2 (last weight = heaviest completed set in the most
// recent session), FR-009 / FR-016 / FR-027 (ignore incomplete/invalid sets).

function isValidCompletedSet(s) {
  return Boolean(s) && s.completed === true && Number(s.weight_kg) > 0 && Number(s.reps) > 0;
}

/**
 * The heaviest *completed* set among `sets`, ignoring warm-up/incomplete and
 * non-positive weight/reps. Strict `>` keeps the first set on a tie.
 * @returns the winning set object, or null when none qualify.
 */
export function heaviestCompletedSet(sets = []) {
  let best = null;
  for (const s of sets) {
    if (!isValidCompletedSet(s)) continue;
    if (best === null || Number(s.weight_kg) > Number(best.weight_kg)) best = s;
  }
  return best;
}

function byStartedAtDesc(sessions) {
  return [...sessions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}

/**
 * Last weight used = the heaviest completed set's weight in the MOST RECENT
 * session that contains a qualifying completed set. Sessions without any valid
 * completed set are skipped. Returns a number or null.
 * @param {Array<{ started_at: string, sets: Array }>} sessions
 */
export function lastWeightUsed(sessions = []) {
  for (const session of byStartedAtDesc(sessions)) {
    const best = heaviestCompletedSet(session.sets ?? []);
    if (best) return Number(best.weight_kg);
  }
  return null;
}

/**
 * Up to `n` most-recent sessions, newest first, normalized for the API model.
 * @param {Array<{ id?: number, session_id?: number, started_at: string, sets: Array }>} sessions
 */
export function recentSessions(sessions = [], n = 5) {
  return byStartedAtDesc(sessions)
    .slice(0, n)
    .map((s) => ({
      session_id: s.id ?? s.session_id ?? null,
      date: toCalendarDate(s.started_at),
      sets: (s.sets ?? []).map((x) => ({
        weight_kg: Number(x.weight_kg),
        reps: x.reps,
        rpe: x.rpe ?? null,
        completed: Boolean(x.completed),
      })),
    }));
}

function toCalendarDate(ts) {
  if (typeof ts === 'string') return ts.slice(0, 10);
  return new Date(ts).toISOString().slice(0, 10);
}
