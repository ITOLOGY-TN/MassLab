import { Router } from 'express';
import { programController } from '../controllers/program.controller.js';

export function programRoutes({ daos }) {
  const r = Router();
  const c = programController({ daos });
  r.get('/', c.getActive);
  r.post('/regenerate', c.regenerate);
  r.get('/history', c.listHistory);
  return r;
}
