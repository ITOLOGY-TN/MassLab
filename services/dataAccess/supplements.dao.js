import { HttpError } from '../../middleware/errorHandler.js';

export function supplementsDao(supabase) {
  return {
    async listForAthlete({ athleteId, locale = 'fr-FR' }) {
      const { data, error } = await supabase
        .from('supplements')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('display_order', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async upsertMany(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from('supplements')
        .upsert(rows, { onConflict: 'athlete_id,slug,locale' })
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
