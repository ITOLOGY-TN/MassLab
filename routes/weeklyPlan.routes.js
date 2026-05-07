import { Router } from 'express';
import { weeklyPlanController } from '../controllers/weeklyPlan.controller.js';

export function weeklyPlanRoutes(weeklyPlanDao) {
  const r = Router();
  const c = weeklyPlanController(weeklyPlanDao);
  r.get('/', c.list);
  return r;
}
