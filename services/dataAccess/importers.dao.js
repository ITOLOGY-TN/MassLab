// Phase 2 US6 (T084): write-side counterpart to exporters.dao.
// Wraps DELETE+INSERT for every athlete-scoped collection.
import { HttpError } from '../../middleware/errorHandler.js';

/**
 * Order matters because of FK constraints:
 *   muscle_groups before weekly_plan_slots before weekly_plan_exercises;
 *   exercises before weekly_plan_exercises;
 *   the athletes row itself is patched, not replaced.
 */
const RESTORE_ORDER = Object.freeze([
  'muscle_groups',
  'exercises',
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
  'app_config',
]);

const WIPE_ORDER = Object.freeze([...RESTORE_ORDER].reverse());

export function importersDao(supabase) {
  return {
    /**
     * Replace every athlete-scoped row with the contents of `records`.
     * Athletes themselves are patched in place to preserve PK + auth_user_id.
     *
     * If a step fails the caller is left with a partially-empty schedule;
     * the controller surfaces ATOMIC_ROLLBACK and the operator can re-run
     * the import (idempotent because records carry their original ids).
     */
    async replaceAllForAthlete(athleteId, records) {
      // 1. Patch the athletes row in place.
      if (Array.isArray(records.athletes) && records.athletes.length) {
        const me = records.athletes.find((a) => a.id === athleteId) ?? records.athletes[0];
        const patch = { ...me };
        delete patch.id;
        delete patch.auth_user_id;
        delete patch.created_at;
        const { error } = await supabase.from('athletes').update(patch).eq('id', athleteId);
        if (error) throw new HttpError(500, 'ATOMIC_ROLLBACK', `athletes: ${error.message}`);
      }

      // 2. Wipe athlete-scoped rows in dependency-safe order.
      for (const table of WIPE_ORDER) {
        const { error } = await supabase.from(table).delete().eq('athlete_id', athleteId);
        if (error) {
          if (error.code === '42P01') continue;
          throw new HttpError(500, 'ATOMIC_ROLLBACK', `wipe ${table}: ${error.message}`);
        }
      }

      // 3. Insert the new state.
      const counts = {};
      for (const table of RESTORE_ORDER) {
        const rows = records[table];
        if (!Array.isArray(rows) || rows.length === 0) {
          counts[table] = 0;
          continue;
        }
        const sanitised = rows.map((row) => {
          const out = { ...row, athlete_id: athleteId };
          // Drop generated columns the DB will (re-)assign.
          if (table !== 'app_config') delete out.id;
          delete out.created_at;
          return out;
        });
        const { error } = await supabase.from(table).insert(sanitised);
        if (error) {
          if (error.code === '42P01') {
            counts[table] = 0;
            continue;
          }
          throw new HttpError(500, 'ATOMIC_ROLLBACK', `restore ${table}: ${error.message}`);
        }
        counts[table] = sanitised.length;
      }
      return counts;
    },
  };
}
