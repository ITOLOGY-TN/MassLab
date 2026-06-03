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

    // Phase 6 (009-body-weight-measurements) T012 [US1] — fetch the existing row
    // for a date so the controller can MERGE the provided fields over it before
    // upserting (M1/FR-006). Returns null when the day has no entry yet.
    async findByDate(athleteId, measuredOn) {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('measured_on', measuredOn)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
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
