// Phase 6 (009-body-weight-measurements) — progress-photo persistence.
// Constitution II: only this directory imports `@supabase/supabase-js`.
// Every query is scoped by `athlete_id` (Constitution I). Shared by the US1
// upload path and the US4 gallery/delete path.
import { HttpError } from '../../middleware/errorHandler.js';

export function athletePhotosDao(supabase) {
  return {
    /** Persist a photo row after the file is stored via the photoStorage adapter. */
    async insert(row) {
      const { data, error } = await supabase
        .from('athlete_photos')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /** Date-desc list for the gallery (FR-015). */
    async listForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('athlete_photos')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('taken_on', { ascending: false });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    /** Fetch one photo scoped to the athlete; returns null when absent. */
    async findById(athleteId, id) {
      const { data, error } = await supabase
        .from('athlete_photos')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
    },

    /** Remove a photo row (scoped by athlete_id). */
    async delete(athleteId, id) {
      const { error } = await supabase
        .from('athlete_photos')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },
  };
}
