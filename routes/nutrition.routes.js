import { Router } from 'express';
import { nutritionController } from '../controllers/nutrition.controller.js';

export function nutritionRoutes(nutritionDao) {
  const r = Router();
  const c = nutritionController(nutritionDao);
  r.get('/template', c.getTemplate);
  return r;
}
