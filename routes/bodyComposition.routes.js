import { Router } from 'express';
import { bodyCompositionController } from '../controllers/bodyComposition.controller.js';

export function bodyCompositionRoutes({ daos }) {
  const r = Router();
  const c = bodyCompositionController({ daos });
  r.get('/', c.list);
  r.get('/latest', c.latest);
  return r;
}
