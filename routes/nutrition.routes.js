import { Router } from 'express';
import { nutritionController } from '../controllers/nutrition.controller.js';

export function nutritionRoutes({ daos, config }) {
  const r = Router();
  const c = nutritionController({ daos, config });
  r.get('/template', c.getTemplate);
  r.get('/targets', c.getTargets);
  r.get('/day', c.getDay);
  r.get('/trends', c.getTrends);
  r.post('/load-plan', c.loadPlan);
  r.post('/hydration', c.addHydration);
  r.post('/log', c.logEntry);
  r.patch('/log/:id', c.editEntry);
  r.delete('/log/:id', c.deleteEntry);
  return r;
}
