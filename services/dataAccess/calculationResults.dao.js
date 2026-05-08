import { HttpError } from '../../middleware/errorHandler.js';

export function calculationResultsDao(supabase) {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from('calculation_results')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async listForAthlete({ athleteId, calculator, limit = 100 }) {
      let q = supabase
        .from('calculation_results')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (calculator) q = q.eq('calculator', calculator);
      const { data, error } = await q;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
