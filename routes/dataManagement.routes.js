import { Router } from 'express';
import multer from 'multer';
import { dataManagementController } from '../controllers/dataManagement.controller.js';

export function dataManagementRoutes({ daos, config }) {
  const r = Router();
  const c = dataManagementController({ daos, config });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.IMPORT_MAX_BYTES ?? 26214400 },
  });

  r.post('/export/json', c.exportJson);
  r.get('/export/sessions.csv', c.exportCsv);
  r.post('/import', upload.single('file'), c.importJson);
  r.post('/reset', c.reset);
  return r;
}
