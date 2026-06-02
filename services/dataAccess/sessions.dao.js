// Phase 3 (006-training-program-library) — READ-ONLY reader of the Phase 0
// session tables (session_journal_entries + session_sets). Phase 3 only reads
// history (FR-026); Phase 4's journal adds the write path. research D-5.
// Constitution II: only this directory imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

export function sessionsDao(supabase) {
  /**
   * Fetch the most recent sessions in which `exerciseId` was performed, each
   * with its sets for that exercise, newest first.
   * @returns {Promise<Array<{ id, started_at, ended_at, sets: Array }>>}
   */
  async function recentSessionsForExercise(athleteId, exerciseId, { limit = 5 } = {}) {
    // 1. Sessions that contain at least one set for this exercise.
    const { data: setRows, error: setErr } = await supabase
      .from('session_sets')
      .select('session_id, set_number, weight_kg, reps, rpe, completed')
      .eq('athlete_id', athleteId)
      .eq('exercise_id', exerciseId);
    if (setErr) throw new HttpError(500, 'DB_ERROR', setErr.message);
    if (!setRows?.length) return [];

    const sessionIds = [...new Set(setRows.map((r) => r.session_id))];

    // 2. The journal entries for those sessions, newest first, capped.
    const { data: sessions, error: sessErr } = await supabase
      .from('session_journal_entries')
      .select('id, started_at, ended_at')
      .eq('athlete_id', athleteId)
      .in('id', sessionIds)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (sessErr) throw new HttpError(500, 'DB_ERROR', sessErr.message);
    if (!sessions?.length) return [];

    const setsBySession = new Map();
    for (const r of setRows) {
      if (!setsBySession.has(r.session_id)) setsBySession.set(r.session_id, []);
      setsBySession.get(r.session_id).push({
        set_number: r.set_number,
        weight_kg: r.weight_kg,
        reps: r.reps,
        rpe: r.rpe,
        completed: r.completed,
      });
    }

    return sessions.map((s) => ({
      id: s.id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      sets: (setsBySession.get(s.id) ?? []).sort(
        (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0),
      ),
    }));
  }

  return {
    recentSessionsForExercise,
    /** Convenience: the single most recent session with its sets, or null. */
    async latestSessionWithSets(athleteId, exerciseId) {
      const [latest] = await recentSessionsForExercise(athleteId, exerciseId, { limit: 1 });
      return latest ?? null;
    },
  };
}
