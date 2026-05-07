import { HttpError } from '../../middleware/errorHandler.js';

export function nutritionDao(supabase) {
  return {
    async listTemplateMeals(athleteId) {
      const { data, error } = await supabase
        .from('nutrition_template_meals')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('display_order', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async upsertMeal(row) {
      const { data, error } = await supabase
        .from('nutrition_template_meals')
        .upsert(row, { onConflict: 'athlete_id,slot' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },
  };
}
