import { Router } from 'express';
import { nutritionController } from '../controllers/nutrition.controller.js';

export function nutritionRoutes({ daos }) {
  const r = Router();
  const c = nutritionController({ daos });
  r.get('/template', c.getTemplate);
  r.get('/targets', c.getTargets);
  return r;
}
