import { HttpError } from '../../middleware/errorHandler.js';

// Phase 7 (010-phase7-nutrition-calories) T005 — sole reader/writer of
// public.nutrition_logs. Every query is scoped by athlete_id (Constitution I).
export function nutritionLogsDao(supabase) {
  return {
    // FR-001 — persist a log entry with its macro snapshot.
    async insert(row) {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .insert(row)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    // FR-021 — the day's entries, oldest-first (grouped client-side by slot).
    async listForDay(athleteId, loggedOn) {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('logged_on', loggedOn)
        .order('created_at', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    // FR-022 — entries over a date range (inclusive), oldest-first → trends.
    async listRange(athleteId, { from, to }) {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    // Scoped fetch before edit/delete. Returns null when absent.
    async findById(athleteId, id) {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
    },

    // FR-005 — edit quantity_g + rewritten macro snapshot. 404 if none match.
    async update(athleteId, id, fields) {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .update(fields)
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      if (!data) throw new HttpError(404, 'NOT_FOUND', 'Nutrition log entry not found');
      return data;
    },

    // FR-005 — remove one entry.
    async delete(athleteId, id) {
      const { error } = await supabase
        .from('nutrition_logs')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    // D-6 — clear a day (load-plan `replace`).
    async deleteForDay(athleteId, loggedOn) {
      const { error } = await supabase
        .from('nutrition_logs')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('logged_on', loggedOn);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },
  };
}
