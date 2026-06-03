import { HttpError } from '../../middleware/errorHandler.js';

export function oneRepMaxRecordsDao(supabase) {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from('one_rep_max_records')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listForAthlete({ athleteId, exerciseId } = {}) {
      let q = supabase
        .from('one_rep_max_records')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false });
      if (exerciseId) q = q.eq('exercise_id', exerciseId);
      const { data, error } = await q;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    /**
     * Phase 5 (008-load-tracking, D-1) — the full estimated-1RM + working-load
     * time series for every exercise, ascending by created_at. One read powers
     * the overview trend, the detail charts, and the phase-comparison radar.
     */
    async seriesForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('one_rep_max_records')
        .select('exercise_id, created_at, source_weight_kg, source_reps, primary_estimate_kg')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async latestForAthletePerExercise(athleteId) {
      // Fetch all rows then reduce client-side; for Phase 1 the volume is tiny
      // (one athlete, dozens of records). Indexed (athlete_id, exercise_id, created_at desc).
      const { data, error } = await supabase
        .from('one_rep_max_records')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      const seen = new Set();
      const latest = [];
      for (const row of data ?? []) {
        if (!seen.has(row.exercise_id)) {
          seen.add(row.exercise_id);
          latest.push(row);
        }
      }
      return latest;
    },
  };
}
