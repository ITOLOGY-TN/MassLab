import { Router } from 'express';
import { oneRepMaxRecordsController } from '../controllers/oneRepMaxRecords.controller.js';

export function oneRepMaxRecordsRoutes({ daos }) {
  const r = Router();
  const c = oneRepMaxRecordsController({ daos });
  r.post('/', c.create);
  r.get('/', c.list);
  r.get('/latest', c.latest);
  r.get('/trend', c.trend);
  return r;
}
