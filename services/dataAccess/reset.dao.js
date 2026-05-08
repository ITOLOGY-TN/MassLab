// Phase 2 US7 (T092): per-module + full reset DAO.
// Each method returns a `{ count }` summary so the orchestrator can build the
// `deleted_counts` map in the API response.
import { HttpError } from '../../middleware/errorHandler.js';

const MODULE_TABLES = Object.freeze({
  sessions: ['session_journal', 'session_sets'],
  body_measurements: ['body_measurements'],
  nutrition_logs: ['nutrition_logs'],
  supplements: ['supplements'],
  recovery: ['recovery_log'],
  calculator_results: ['calculation_results'],
  preferences: [], // handled specially by resetPreferencesAndOverrides
});

async function deleteByAthlete(supabase, table, athleteId) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('athlete_id', athleteId);
  if (error) {
    if (error.code === '42P01') return 0; // table not present yet (Phase 4 etc.)
    throw new HttpError(500, 'DB_ERROR', `${table}: ${error.message}`);
  }
  return count ?? 0;
}

const FULL_WIPE_ORDER = Object.freeze([
  'session_sets',
  'session_journal',
  'weekly_plan_exercises',
  'weekly_plan_slots',
  'muscle_groups',
  'exercises',
  'training_phases',
  'nutrition_template_meals',
  'supplements',
  'foods',
  'quotes',
  'body_measurements',
  'body_composition_results',
  'calculation_results',
  'generated_programs',
  'progression_flags',
  'one_rep_max_records',
  'recovery_log',
  'nutrition_logs',
]);

export function resetDao(supabase) {
  return {
    MODULE_TABLES,

    async resetModule(athleteId, module) {
      const tables = MODULE_TABLES[module];
      if (!tables) {
        throw new HttpError(400, 'VALIDATION_FAILED', `Unknown module "${module}".`);
      }
      const counts = {};
      for (const table of tables) {
        counts[table] = await deleteByAthlete(supabase, table, athleteId);
      }
      return counts;
    },

    /**
     * Reset preferences + engine_overrides on app_config to documented
     * defaults. Keeps the row (one-to-one with athletes).
     */
    async resetPreferencesAndOverrides(athleteId) {
      const { error, count } = await supabase
        .from('app_config')
        .update(
          {
            theme: 'dark',
            units: 'kg',
            rest_timer_sound: true,
            engine_overrides: {},
            notification_acks: {},
          },
          { count: 'exact' },
        )
        .eq('athlete_id', athleteId);
      if (error) throw new HttpError(500, 'DB_ERROR', `app_config: ${error.message}`);
      return { app_config: count ?? 0 };
    },

    /**
     * Full reset: wipes every athlete-scoped collection and resets
     * preferences + engine_overrides. Profile (athletes row) is preserved.
     */
    async deleteAllExceptProfile(athleteId) {
      const counts = {};
      for (const table of FULL_WIPE_ORDER) {
        counts[table] = await deleteByAthlete(supabase, table, athleteId);
      }
      Object.assign(counts, await this.resetPreferencesAndOverrides(athleteId));
      return counts;
    },
  };
}
