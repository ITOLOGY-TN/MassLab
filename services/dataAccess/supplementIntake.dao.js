import { HttpError } from '../../middleware/errorHandler.js';

// Phase 8 (011-phase8-supplements) T006 — sole reader/writer of
// public.supplement_intake_log. Presence of a row ≡ taken that day (research D-1).
// Every query is scoped by athlete_id (Constitution I).
export function supplementIntakeDao(supabase) {
  return {
    // FR-002/FR-003 — mark taken; idempotent via the (athlete, supplement, day)
    // unique constraint (ignoreDuplicates → no double-count, SC-002).
    async markTaken(athleteId, supplementId, loggedOn) {
      const { error } = await supabase.from('supplement_intake_log').upsert(
        { athlete_id: athleteId, supplement_id: supplementId, logged_on: loggedOn },
        { onConflict: 'athlete_id,supplement_id,logged_on', ignoreDuplicates: true },
      );
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    // FR-002 — un-mark (delete the presence row).
    async unmark(athleteId, supplementId, loggedOn) {
      const { error } = await supabase
        .from('supplement_intake_log')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('supplement_id', supplementId)
        .eq('logged_on', loggedOn);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    // FR-017 — taken rows for one day (checklist taken-state).
    async listForDay(athleteId, loggedOn) {
      const { data, error } = await supabase
        .from('supplement_intake_log')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('logged_on', loggedOn);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    // FR-017 — taken rows over a date range (inclusive) → streaks + weekly grid.
    async listRange(athleteId, { from, to }) {
      const { data, error } = await supabase
        .from('supplement_intake_log')
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
