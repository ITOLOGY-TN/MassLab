// Sessions DAO — Phase 3 (006) shipped the READ side (history for the program
// views); Phase 4 (007-session-journal) adds the WRITE path: start / auto-save
// upsert / finish / discard, plus active-session lookup for resume (research
// D-2…D-7). Constitution II: only this directory imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

export function sessionsDao(supabase) {
  // ---- Phase 3 read side (unchanged) -------------------------------------
  /**
   * Fetch the most recent sessions in which `exerciseId` was performed, each
   * with its sets for that exercise, newest first.
   * @returns {Promise<Array<{ id, started_at, ended_at, sets: Array }>>}
   */
  async function recentSessionsForExercise(athleteId, exerciseId, { limit = 5 } = {}) {
    const { data: setRows, error: setErr } = await supabase
      .from('session_sets')
      .select('session_id, set_number, weight_kg, reps, rpe, completed')
      .eq('athlete_id', athleteId)
      .eq('exercise_id', exerciseId);
    if (setErr) throw new HttpError(500, 'DB_ERROR', setErr.message);
    if (!setRows?.length) return [];

    const sessionIds = [...new Set(setRows.map((r) => r.session_id))];

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

  // ---- Phase 4 write side ------------------------------------------------
  async function listSets(athleteId, sessionId) {
    const { data, error } = await supabase
      .from('session_sets')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('session_id', sessionId)
      .order('exercise_id', { ascending: true })
      .order('set_number', { ascending: true });
    if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    return data ?? [];
  }

  return {
    recentSessionsForExercise,

    /** Convenience: the single most recent session with its sets, or null. */
    async latestSessionWithSets(athleteId, exerciseId) {
      const [latest] = await recentSessionsForExercise(athleteId, exerciseId, { limit: 1 });
      return latest ?? null;
    },

    listSets,

    /** The athlete's single in-progress session (ended_at IS NULL) + its sets, or null. (D-2) */
    async findActiveForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('session_journal_entries')
        .select('*')
        .eq('athlete_id', athleteId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      if (!data) return null;
      return { ...data, sets: await listSets(athleteId, data.id) };
    },

    async getByIdWithSets(athleteId, sessionId) {
      const { data, error } = await supabase
        .from('session_journal_entries')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', sessionId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      if (!data) return null;
      return { ...data, sets: await listSets(athleteId, sessionId) };
    },

    /** Create a new in-progress session for `day_of_week` (null for ad-hoc). (D-3) */
    async startSession(athleteId, { day_of_week = null, started_at } = {}) {
      const { data, error } = await supabase
        .from('session_journal_entries')
        .insert({
          athlete_id: athleteId,
          started_at: started_at ?? new Date().toISOString(),
          day_of_week,
        })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /**
     * Auto-save (D-5): converge the session's stored sets to `sets` — upsert the
     * provided rows on (session_id, exercise_id, set_number), delete any stored
     * set not present. Idempotent. Never touches ended_at / the engine.
     */
    async upsertSets(athleteId, sessionId, sets = []) {
      const rows = sets.map((s) => ({
        athlete_id: athleteId,
        session_id: sessionId,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe ?? null,
        completed: Boolean(s.completed),
      }));

      const existing = await listSets(athleteId, sessionId);
      const keep = new Set(rows.map((r) => `${r.exercise_id}:${r.set_number}`));
      const toDelete = existing
        .filter((e) => !keep.has(`${e.exercise_id}:${e.set_number}`))
        .map((e) => e.id);
      if (toDelete.length) {
        const { error } = await supabase
          .from('session_sets')
          .delete()
          .eq('athlete_id', athleteId)
          .in('id', toDelete);
        if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      }
      if (rows.length) {
        const { error } = await supabase
          .from('session_sets')
          .upsert(rows, { onConflict: 'session_id,exercise_id,set_number' });
        if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      }
      return listSets(athleteId, sessionId);
    },

    async insertSet(athleteId, sessionId, s) {
      const { data, error } = await supabase
        .from('session_sets')
        .insert({
          athlete_id: athleteId,
          session_id: sessionId,
          exercise_id: s.exercise_id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
          rpe: s.rpe ?? null,
          completed: Boolean(s.completed),
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(
            409,
            'CONFLICT',
            `Set ${s.set_number} already exists for this exercise.`,
          );
        }
        throw new HttpError(500, 'DB_ERROR', error.message);
      }
      return data;
    },

    async updateSet(athleteId, sessionId, setId, patch) {
      const { data, error } = await supabase
        .from('session_sets')
        .update(patch)
        .eq('athlete_id', athleteId)
        .eq('session_id', sessionId)
        .eq('id', setId)
        .select('*')
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async deleteSet(athleteId, sessionId, setId) {
      const { error } = await supabase
        .from('session_sets')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('session_id', sessionId)
        .eq('id', setId);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    async setRunningVolume(athleteId, sessionId, totalVolumeKg) {
      const { error } = await supabase
        .from('session_journal_entries')
        .update({ total_volume_kg: totalVolumeKg })
        .eq('athlete_id', athleteId)
        .eq('id', sessionId);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    /**
     * Finish (D-6/D-7): discard incomplete sets, then finalize ended_at +
     * aggregates. The finish-once guard lives in the controller (rejects when
     * ended_at is already set).
     */
    async finishSession(
      athleteId,
      sessionId,
      { note = null, energy_rating = null, total_volume_kg = null, ended_at } = {},
    ) {
      const { error: delErr } = await supabase
        .from('session_sets')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('session_id', sessionId)
        .eq('completed', false);
      if (delErr) throw new HttpError(500, 'DB_ERROR', delErr.message);

      const { data, error } = await supabase
        .from('session_journal_entries')
        .update({
          ended_at: ended_at ?? new Date().toISOString(),
          note,
          energy_rating,
          total_volume_kg,
        })
        .eq('athlete_id', athleteId)
        .eq('id', sessionId)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /**
     * Full athlete history for the finish-time progression engine (D-6):
     * sessions (id, started_at) + a flat sets array. Called after finishSession
     * so the just-completed session's sets are included.
     */
    async historyForEngine(athleteId) {
      const { data: sessions, error: sErr } = await supabase
        .from('session_journal_entries')
        .select('id, started_at, ended_at, day_of_week')
        .eq('athlete_id', athleteId)
        .order('started_at', { ascending: true });
      if (sErr) throw new HttpError(500, 'DB_ERROR', sErr.message);
      const { data: sets, error: setErr } = await supabase
        .from('session_sets')
        .select('session_id, exercise_id, set_number, weight_kg, reps, rpe, completed')
        .eq('athlete_id', athleteId);
      if (setErr) throw new HttpError(500, 'DB_ERROR', setErr.message);
      return { sessions: sessions ?? [], sets: sets ?? [] };
    },

    async discardSession(athleteId, sessionId) {
      const { error } = await supabase
        .from('session_journal_entries')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', sessionId);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },
  };
}
