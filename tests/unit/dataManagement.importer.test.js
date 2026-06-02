import { describe, it, expect, vi } from 'vitest';
import { importBackup } from '../../services/dataManagement/importer.js';
import { BACKUP_SCHEMA_V1 } from '../../services/dataManagement/backupSchema.js';
import { migrateChain } from '../../services/dataManagement/backupMigrators/index.js';

const ATHLETE = '00000000-0000-0000-0000-000000000001';

function envelope({ schemaVersion = 1, athleteId = ATHLETE } = {}) {
  return {
    _export: {
      schema_version: schemaVersion,
      engine_version: '1.0.0',
      exported_at: '2026-05-08T00:00:00Z',
      athlete_id: athleteId,
    },
    athletes: [],
    app_config: [],
    exercises: [],
    muscle_groups: [],
    weekly_plan_slots: [],
    weekly_plan_exercises: [],
  };
}

const fakeDao = () => ({
  replaceAllForAthlete: vi.fn().mockResolvedValue({ exercises: 0 }),
});

describe('dataManagement.importer', () => {
  it('rejects newer-than-current schema with IMPORT_VERSION_TOO_NEW', async () => {
    const dao = fakeDao();
    const buf = Buffer.from(JSON.stringify(envelope({ schemaVersion: 99 })));
    await expect(
      importBackup(buf, {
        athleteId: ATHLETE,
        importMaxBytes: 1_000_000,
        currentSchemaVersion: 1,
        importersDao: dao,
        migrators: { migrateChain },
        schema: BACKUP_SCHEMA_V1,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_VERSION_TOO_NEW' });
    expect(dao.replaceAllForAthlete).not.toHaveBeenCalled();
  });

  it('rejects ownership mismatch with IMPORT_OWNERSHIP_MISMATCH', async () => {
    const dao = fakeDao();
    const buf = Buffer.from(
      JSON.stringify(envelope({ athleteId: '11111111-1111-1111-1111-111111111111' })),
    );
    await expect(
      importBackup(buf, {
        athleteId: ATHLETE,
        importMaxBytes: 1_000_000,
        currentSchemaVersion: 1,
        importersDao: dao,
        migrators: { migrateChain },
        schema: BACKUP_SCHEMA_V1,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_OWNERSHIP_MISMATCH' });
    expect(dao.replaceAllForAthlete).not.toHaveBeenCalled();
  });

  it('rejects oversize payloads with IMPORT_TOO_LARGE', async () => {
    const dao = fakeDao();
    const buf = Buffer.alloc(100, 'x');
    await expect(
      importBackup(buf, {
        athleteId: ATHLETE,
        importMaxBytes: 50,
        currentSchemaVersion: 1,
        importersDao: dao,
        migrators: { migrateChain },
        schema: BACKUP_SCHEMA_V1,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_TOO_LARGE' });
  });

  it('rejects invalid JSON with VALIDATION_FAILED', async () => {
    const dao = fakeDao();
    const buf = Buffer.from('not-json');
    await expect(
      importBackup(buf, {
        athleteId: ATHLETE,
        importMaxBytes: 1_000_000,
        currentSchemaVersion: 1,
        importersDao: dao,
        migrators: { migrateChain },
        schema: BACKUP_SCHEMA_V1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects missing-migrator with IMPORT_MISSING_MIGRATOR', async () => {
    const dao = fakeDao();
    const buf = Buffer.from(JSON.stringify(envelope({ schemaVersion: 0 })));
    await expect(
      importBackup(buf, {
        athleteId: ATHLETE,
        importMaxBytes: 1_000_000,
        currentSchemaVersion: 1,
        importersDao: dao,
        migrators: { migrateChain },
        schema: BACKUP_SCHEMA_V1,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_MISSING_MIGRATOR' });
    expect(dao.replaceAllForAthlete).not.toHaveBeenCalled();
  });

  it('happy path equal-version → restores via DAO', async () => {
    const dao = fakeDao();
    const buf = Buffer.from(JSON.stringify(envelope({ schemaVersion: 1 })));
    const result = await importBackup(buf, {
      athleteId: ATHLETE,
      importMaxBytes: 1_000_000,
      currentSchemaVersion: 1,
      importersDao: dao,
      migrators: { migrateChain },
      schema: BACKUP_SCHEMA_V1,
    });
    expect(result.schema_version_original).toBe(1);
    expect(result.schema_version_applied).toBe(1);
    expect(dao.replaceAllForAthlete).toHaveBeenCalledOnce();
  });
});
