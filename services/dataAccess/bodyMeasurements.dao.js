import { HttpError } from '../../middleware/errorHandler.js';

export function bodyMeasurementsDao(supabase) {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from('body_measurements')
        .upsert(row, { onConflict: 'athlete_id,measured_on' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listForAthlete(athleteId, { limit = 50 } = {}) {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('measured_on', { ascending: false })
        .limit(limit);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async latestForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('measured_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },
  };
}
