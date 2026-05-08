// Phase 2 US5/US6/US7: data-management controller (export, import, reset).
import { HttpError } from '../middleware/errorHandler.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { buildEnvelope } from '../services/dataManagement/exporter.js';
import { serializeSessionsCsv } from '../services/dataManagement/csvSerializer.js';

export function dataManagementController({ daos, config }) {
  return {
    async exportJson(req, res, next) {
      try {
        const records = await daos.exporters.readAllForAthlete(req.athleteId);
        const envelope = buildEnvelope(records, {
          engineVersion: ENGINE_VERSION,
          athleteId: req.athleteId,
          schemaVersion: config.BACKUP_SCHEMA_VERSION ?? 1,
        });
        res.json({ data: envelope });
      } catch (err) {
        next(err);
      }
    },

    async exportCsv(req, res, next) {
      try {
        const sessions = await daos.exporters.readSessionRowsForCsv(req.athleteId);
        const csv = serializeSessionsCsv(sessions, { separator: config.CSV_SEPARATOR ?? ',' });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="masslab-sessions-${new Date().toISOString().slice(0, 10)}.csv"`,
        );
        res.send(csv);
      } catch (err) {
        next(err);
      }
    },

    async importJson(req, res, next) {
      try {
        if (!req.file) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'file is required (multipart/form-data).');
        }
        const { importBackup } = await import('../services/dataManagement/importer.js');
        const migratorsModule = await import('../services/dataManagement/backupMigrators/index.js');
        try {
          const result = await importBackup(req.file.buffer, {
            athleteId: req.athleteId,
            sourceFilename: req.file.originalname ?? req.body?.source_filename ?? 'backup.json',
            importMaxBytes: config.IMPORT_MAX_BYTES,
            currentSchemaVersion: config.BACKUP_SCHEMA_VERSION ?? 1,
            importersDao: daos.importers,
            migrators: migratorsModule,
          });
          res.json({ data: result });
        } catch (err) {
          if (err?.code && err?.status) {
            // ImportError → canonical error envelope.
            return next(new HttpError(err.status, err.code, err.message, err.details));
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    },

    async reset(req, res, next) {
      try {
        const { module, confirm_token: token, export_first: exportFirst } = req.body ?? {};
        if (!token || token !== config.RESET_CONFIRM_TOKEN) {
          throw new HttpError(400, 'RESET_TOKEN_MISMATCH', 'Confirmation token does not match.');
        }
        if (!module) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'module is required.');
        }
        const { resetModule } = await import('../services/dataManagement/resetter.js');
        const result = await resetModule({
          athleteId: req.athleteId,
          module,
          exportFirst: Boolean(exportFirst),
          daos,
          engineVersion: ENGINE_VERSION,
          schemaVersion: config.BACKUP_SCHEMA_VERSION ?? 1,
        });
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    },
  };
}
