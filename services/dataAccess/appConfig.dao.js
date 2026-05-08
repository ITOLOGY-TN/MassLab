import { HttpError } from '../../middleware/errorHandler.js';

export function appConfigDao(supabase) {
  return {
    async getOverridesFor(athleteId) {
      const { data, error } = await supabase
        .from('app_config')
        .select('engine_overrides')
        .eq('athlete_id', athleteId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data?.engine_overrides ?? {};
    },

    async setOverridesFor(athleteId, overrides) {
      const { data, error } = await supabase
        .from('app_config')
        .upsert(
          { athlete_id: athleteId, engine_overrides: overrides ?? {} },
          { onConflict: 'athlete_id' },
        )
        .select('engine_overrides')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data.engine_overrides;
    },
  };
}
