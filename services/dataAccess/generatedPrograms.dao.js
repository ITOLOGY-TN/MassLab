import { HttpError } from '../../middleware/errorHandler.js';

export function generatedProgramsDao(supabase) {
  return {
    async findActiveForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('generated_programs')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listHistoryForAthlete(athleteId, { limit = 20 } = {}) {
      const { data, error } = await supabase
        .from('generated_programs')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('generated_at', { ascending: false })
        .limit(limit);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    /**
     * Soft-archive the prior active row (if any) and insert a new active row in
     * a single logical operation. The partial-unique index on
     * `(athlete_id) where is_active = true` enforces the invariant; we archive
     * first to avoid violating it during the insert.
     */
    async archiveAndInsert(athleteId, { payload, engine_version, resolved_constants }) {
      const { error: updateErr } = await supabase
        .from('generated_programs')
        .update({ is_active: false, superseded_at: new Date().toISOString() })
        .eq('athlete_id', athleteId)
        .eq('is_active', true);
      if (updateErr) throw new HttpError(500, 'DB_ERROR', updateErr.message);

      const { data, error } = await supabase
        .from('generated_programs')
        .insert({
          athlete_id: athleteId,
          payload,
          engine_version,
          resolved_constants,
          is_active: true,
        })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },
  };
}
