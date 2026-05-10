// Phase 2 US6 (T084): write-side counterpart to exporters.dao.
// The wipe + reinsert is delegated to the public.replace_athlete_dataset
// Postgres function so the whole restore runs in a single transaction —
// any failure rolls back automatically and the previous dataset survives.
import { HttpError } from '../../middleware/errorHandler.js';

export function importersDao(supabase) {
  return {
    /**
     * Replace every athlete-scoped row with the contents of `records`,
     * atomically. Athletes themselves are patched in place to preserve PK
     * + auth_user_id. On any DB error the transaction is rolled back inside
     * Postgres and we surface ATOMIC_ROLLBACK to the caller.
     */
    async replaceAllForAthlete(athleteId, records) {
      const { data, error } = await supabase.rpc('replace_athlete_dataset', {
        p_athlete_id: athleteId,
        p_payload: records ?? {},
      });
      if (error) {
        throw new HttpError(500, 'ATOMIC_ROLLBACK', error.message);
      }
      return data ?? {};
    },
  };
}
