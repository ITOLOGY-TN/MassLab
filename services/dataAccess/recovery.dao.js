import { HttpError } from '../../middleware/errorHandler.js';

// Phase 9 (012-phase9-recovery-wellbeing) T003 — sole reader/writer of
// public.recovery_log. Every query is scoped by athlete_id (Constitution I).
export function recoveryDao(supabase) {
  return {
    // FR-001 — the check-in for one day (form state). Returns null when absent.
    async getForDay(athleteId, loggedOn) {
      const { data, error } = await supabase
        .from('recovery_log')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('logged_on', loggedOn)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
    },

    // FR-002/FR-003 — create/replace the day's check-in. Partial save: the payload
    // is built from ONLY the keys present in `fields`, so omitted signals are left
    // untouched on an existing row (never substituted). `sore_zones: []` is an
    // explicit value ("no soreness"), distinct from omitting it.
    async upsert(athleteId, loggedOn, fields) {
      const payload = { athlete_id: athleteId, logged_on: loggedOn };
      for (const key of Object.keys(fields)) payload[key] = fields[key];
      const { data, error } = await supabase
        .from('recovery_log')
        .upsert(payload, { onConflict: 'athlete_id,logged_on' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    // FR-011/FR-013/FR-014 — check-ins over a date range (inclusive), oldest-first →
    // alerts (recent window) + trends (heatmap/overlay).
    async listRange(athleteId, { from, to }) {
      const { data, error } = await supabase
        .from('recovery_log')
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
