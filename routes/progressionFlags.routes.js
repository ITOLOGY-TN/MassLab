import { Router } from 'express';
import { progressionFlagsController } from '../controllers/progressionFlags.controller.js';

export function progressionFlagsRoutes({ daos }) {
  const r = Router();
  const c = progressionFlagsController({ daos });
  r.get('/', c.listActive);
  r.get('/history', c.listHistory);
  r.post('/evaluate', c.evaluate);
  return r;
}
