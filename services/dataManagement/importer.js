// Phase 2 US6 (T085): pure orchestrator for /data/import.
// Steps: size check → JSON parse → envelope structural validation →
// ownership check → version compare → migrate chain (if older) →
// re-validate after migration → call importersDao.replaceAllForAthlete.
//
// The error classes here map 1:1 to the OpenAPI codes in
// specs/003-phase2-settings-data/contracts/openapi.yaml.

export class ImportError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function importBackup(
  buffer,
  {
    athleteId,
    sourceFilename = 'backup.json',
    importMaxBytes,
    currentSchemaVersion,
    importersDao,
    migrators,
    schema,
  },
) {
  // 1. Size guard.
  if (importMaxBytes && buffer.length > importMaxBytes) {
    throw new ImportError('IMPORT_TOO_LARGE', `Backup exceeds ${importMaxBytes} bytes.`, 400, {
      size: buffer.length,
      max: importMaxBytes,
    });
  }

  // 2. JSON parse.
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new ImportError('VALIDATION_FAILED', `Invalid JSON: ${err.message}`);
  }

  // 3. Header validation — must have _export with schema_version + athlete_id
  // even if the envelope shape is older.
  if (
    !parsed?._export ||
    typeof parsed._export.schema_version !== 'number' ||
    typeof parsed._export.athlete_id !== 'string'
  ) {
    throw new ImportError(
      'VALIDATION_FAILED',
      'Backup is missing _export.schema_version or _export.athlete_id.',
    );
  }

  // 4. Ownership.
  if (parsed._export.athlete_id !== athleteId) {
    throw new ImportError('IMPORT_OWNERSHIP_MISMATCH', 'Backup belongs to a different athlete.');
  }

  // 5. Version compare.
  const fromVersion = parsed._export.schema_version;
  if (fromVersion > currentSchemaVersion) {
    throw new ImportError(
      'IMPORT_VERSION_TOO_NEW',
      `Backup schema v${fromVersion} is newer than supported v${currentSchemaVersion}.`,
    );
  }
  let envelope = parsed;
  let appliedVersion = fromVersion;
  if (fromVersion < currentSchemaVersion) {
    const { migrateChain } = migrators ?? (await import('./backupMigrators/index.js'));
    try {
      envelope = migrateChain(envelope, { from: fromVersion, to: currentSchemaVersion });
      appliedVersion = currentSchemaVersion;
    } catch (err) {
      if (err instanceof ImportError) throw err;
      if (err?.code === 'IMPORT_MISSING_MIGRATOR') {
        throw new ImportError('IMPORT_MISSING_MIGRATOR', err.message, 400, {
          from: err.from,
          to: err.to,
        });
      }
      throw err;
    }
  }

  // 6. Validate against the current schema (v1 today).
  const validator = schema ?? (await import('./backupSchema.js')).BACKUP_SCHEMA_V1;
  const result = validator.safeParse(envelope);
  if (!result.success) {
    throw new ImportError(
      'VALIDATION_FAILED',
      `Envelope schema mismatch: ${result.error.issues[0].message}`,
      400,
      { issues: result.error.issues.slice(0, 5) },
    );
  }
  envelope = result.data;

  // 7. Restore.
  const counts = await importersDao.replaceAllForAthlete(athleteId, envelope);

  return {
    restored_at: new Date().toISOString(),
    schema_version_original: fromVersion,
    schema_version_applied: appliedVersion,
    source_filename: sourceFilename,
    engine_version_in_backup: envelope._export.engine_version,
    counts,
  };
}
