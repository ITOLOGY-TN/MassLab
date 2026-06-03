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

    async listTemplateItems(athleteId) {
      const { data, error } = await supabase
        .from('nutrition_template_meal_items')
        .select(
          'id, slot, food_id, quantity_g, display_order, ' +
            'foods ( name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g )',
        )
        .eq('athlete_id', athleteId)
        .order('slot', { ascending: true })
        .order('display_order', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return (data ?? []).map((row) => {
        const food = row.foods ?? {};
        return {
          id: row.id,
          slot: row.slot,
          food_id: row.food_id,
          food_name: food.name ?? null,
          quantity_g: row.quantity_g,
          display_order: row.display_order,
          food: {
            name: food.name ?? null,
            kcal_per_100g: food.kcal_per_100g ?? null,
            protein_per_100g: food.protein_per_100g ?? null,
            carbs_per_100g: food.carbs_per_100g ?? null,
            fat_per_100g: food.fat_per_100g ?? null,
          },
        };
      });
    },

    async deleteTemplateItemsForAthlete(athleteId) {
      const { error } = await supabase
        .from('nutrition_template_meal_items')
        .delete()
        .eq('athlete_id', athleteId);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    async insertTemplateItems(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from('nutrition_template_meal_items')
        .insert(rows)
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
