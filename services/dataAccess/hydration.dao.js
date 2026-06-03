import { HttpError } from '../../middleware/errorHandler.js';

export function hydrationDao(supabase) {
  return {
    async getForDay(athleteId, loggedOn) {
      const { data, error } = await supabase
        .from('hydration_log')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('logged_on', loggedOn)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? { athlete_id: athleteId, logged_on: loggedOn, total_ml: 0 };
    },

    async upsertDelta(athleteId, loggedOn, deltaMl) {
      const current = await this.getForDay(athleteId, loggedOn);
      const next = Math.max(0, (current.total_ml ?? 0) + deltaMl);
      const { data, error } = await supabase
        .from('hydration_log')
        .upsert(
          { athlete_id: athleteId, logged_on: loggedOn, total_ml: next },
          { onConflict: 'athlete_id,logged_on' },
        )
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listRange(athleteId, { from, to }) {
      const { data, error } = await supabase
        .from('hydration_log')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
