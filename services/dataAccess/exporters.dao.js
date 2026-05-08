// Phase 2 US5 (T071): read-only aggregator for the backup envelope.
// Confined to data-access (Constitution Principle II).
import { HttpError } from '../../middleware/errorHandler.js';

const COLLECTIONS = Object.freeze([
  'athletes',
  'app_config',
  'exercises',
  'muscle_groups',
  'weekly_plan_slots',
  'weekly_plan_exercises',
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
]);

export function exportersDao(supabase) {
  return {
    COLLECTIONS,

    /**
     * Fan out to every athlete-scoped table and return the assembled
     * record set keyed by collection name.
     */
    async readAllForAthlete(athleteId) {
      const out = {};
      for (const table of COLLECTIONS) {
        const filterCol = table === 'athletes' ? 'id' : 'athlete_id';
        const { data, error } = await supabase.from(table).select('*').eq(filterCol, athleteId);
        if (error) {
          // A table the project hasn't shipped yet returns 42P01; skip gracefully.
          if (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')) {
            continue;
          }
          throw new HttpError(500, 'DB_ERROR', `${table}: ${error.message}`);
        }
        out[table] = data ?? [];
      }
      return out;
    },

    /**
     * Phase 4 ships session_journal + session_sets. For Phase 2 the join
     * resolves to an empty array — the CSV exporter emits header-only.
     */
    async readSessionRowsForCsv(_athleteId) {
      return [];
    },
  };
}
