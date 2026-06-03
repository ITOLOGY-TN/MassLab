import { HttpError } from '../../middleware/errorHandler.js';
import { slugify } from '../nutrition/foodSlug.js';

export function foodsDao(supabase) {
  return {
    async list({ athleteId, locale = 'fr-FR', category, q }) {
      let query = supabase
        .from('foods')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('name', { ascending: true });
      if (category) query = query.eq('category', category);
      if (q) query = query.ilike('name', '%' + q + '%');
      const { data, error } = await query;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async findById(athleteId, id) {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
    },

    async createForAthlete({
      athleteId,
      name,
      kcalPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      locale,
      category = 'custom',
    }) {
      const slug = slugify(name);
      const { data, error } = await supabase
        .from('foods')
        .upsert(
          {
            athlete_id: athleteId,
            slug,
            locale,
            name,
            kcal_per_100g: kcalPer100g,
            protein_per_100g: proteinPer100g,
            carbs_per_100g: carbsPer100g,
            fat_per_100g: fatPer100g,
            category,
          },
          { onConflict: 'athlete_id,slug,locale' },
        )
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
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
