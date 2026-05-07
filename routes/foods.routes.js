import { Router } from 'express';
import { foodsController } from '../controllers/foods.controller.js';

export function foodsRoutes(foodsDao) {
  const r = Router();
  const c = foodsController(foodsDao);
  r.get('/', c.list);
  return r;
}
