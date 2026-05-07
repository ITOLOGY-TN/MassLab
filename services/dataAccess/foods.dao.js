import { HttpError } from '../../middleware/errorHandler.js';

export function foodsDao(supabase) {
  return {
    async list({ athleteId, locale = 'fr-FR', category }) {
      let q = supabase
        .from('foods')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('name', { ascending: true });
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async upsertMany(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from('foods')
        .upsert(rows, { onConflict: 'athlete_id,slug,locale' })
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
