import { Router } from 'express';
import { nutritionTargetsController } from '../controllers/nutritionTargets.controller.js';

export function nutritionTargetsRoutes({ daos }) {
  const r = Router();
  const c = nutritionTargetsController({ daos });
  r.get('/', c.get);
  r.put('/', c.put);
  r.delete('/', c.destroy);
  return r;
}
