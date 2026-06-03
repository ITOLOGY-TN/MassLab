import { Router } from 'express';
import { foodsController } from '../controllers/foods.controller.js';

export function foodsRoutes({ daos, config }) {
  const r = Router();
  const c = foodsController({ daos, config });
  r.get('/', c.list);
  r.post('/', c.create);
  return r;
}
