# Backup forward-migrators

Each file here exports one pure function `(oldEnvelope) => newEnvelope` that
walks an exported backup forward by exactly one schema version. The manifest
in `index.js` registers them under the key `vN->vN+1`.

Phase 2 ships the v1 envelope; no older versions exist yet, so the manifest
is empty. The first migrator lands the next time the envelope shape changes.

Convention:
- Pure: no I/O, no DAO imports.
- One step at a time: do not skip versions.
- Tests live alongside the migrator under `tests/unit/backupMigrators.<name>.test.js`.
