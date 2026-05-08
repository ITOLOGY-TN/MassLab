// Phase 2 US5 (T072): pure envelope builder. No I/O. No Supabase imports.
// Constitution Principle II: this directory never imports `@supabase/supabase-js`.

const SECRET_KEYS_TO_STRIP = new Set(['auth_user_id']);

function stripSecrets(row) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    if (SECRET_KEYS_TO_STRIP.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * @param {Record<string, Array<object>>} records keyed by collection name
 * @param {{ engineVersion: string, athleteId: string, exportedAt?: string,
 *           schemaVersion?: number }} meta
 */
export function buildEnvelope(records, { engineVersion, athleteId, exportedAt, schemaVersion = 1 }) {
  if (!engineVersion) throw new Error('engineVersion is required');
  if (!athleteId) throw new Error('athleteId is required');

  const collections = {};
  for (const [k, rows] of Object.entries(records ?? {})) {
    collections[k] = (rows ?? []).map((row) => stripSecrets(row));
  }

  return {
    _export: {
      schema_version: schemaVersion,
      engine_version: engineVersion,
      exported_at: exportedAt ?? new Date().toISOString(),
      athlete_id: athleteId,
    },
    // Required collections per BackupEnvelope contract — emit empty arrays if absent.
    athletes: collections.athletes ?? [],
    app_config: collections.app_config ?? [],
    exercises: collections.exercises ?? [],
    muscle_groups: collections.muscle_groups ?? [],
    weekly_plan_slots: collections.weekly_plan_slots ?? [],
    weekly_plan_exercises: collections.weekly_plan_exercises ?? [],
    // Additional collections pass through unchanged.
    ...Object.fromEntries(
      Object.entries(collections).filter(
        ([k]) =>
          ![
            'athletes',
            'app_config',
            'exercises',
            'muscle_groups',
            'weekly_plan_slots',
            'weekly_plan_exercises',
          ].includes(k),
      ),
    ),
  };
}
