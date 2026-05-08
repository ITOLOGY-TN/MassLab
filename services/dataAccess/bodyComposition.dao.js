import { HttpError } from '../../middleware/errorHandler.js';

export function bodyCompositionDao(supabase) {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from('body_composition_results')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async latestForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('body_composition_results')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listForAthlete(athleteId, { limit = 50 } = {}) {
      const { data, error } = await supabase
        .from('body_composition_results')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
