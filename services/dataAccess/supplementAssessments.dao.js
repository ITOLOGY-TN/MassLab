import { HttpError } from '../../middleware/errorHandler.js';

// Phase 8 (011-phase8-supplements) T007 — sole reader/writer of
// public.supplement_weekly_assessment. One row per athlete per ISO week
// (research D-2). Every query is scoped by athlete_id (Constitution I).
export function supplementAssessmentsDao(supabase) {
  return {
    // FR-012 — the week's assessment (or null).
    async getForWeek(athleteId, weekStart) {
      const { data, error } = await supabase
        .from('supplement_weekly_assessment')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('week_start', weekStart)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? null;
    },

    // FR-013 — upsert the week's ratings; updates in place (one row per week).
    // Refresh updated_at on the UPDATE path (the column default only fires on INSERT).
    async upsert(athleteId, weekStart, { energy, recovery, sleep_quality, strength }) {
      const { data, error } = await supabase
        .from('supplement_weekly_assessment')
        .upsert(
          {
            athlete_id: athleteId,
            week_start: weekStart,
            energy,
            recovery,
            sleep_quality,
            strength,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'athlete_id,week_start' },
        )
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    // FR-015/FR-018 — assessments over a window (inclusive), oldest-first → trend.
    async listRange(athleteId, { from, to }) {
      const { data, error } = await supabase
        .from('supplement_weekly_assessment')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('week_start', from)
        .lte('week_start', to)
        .order('week_start', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
