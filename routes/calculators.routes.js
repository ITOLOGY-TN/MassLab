import { Router } from 'express';
import { calculatorsController } from '../controllers/calculators.controller.js';

export function calculatorsRoutes({ daos }) {
  const r = Router();
  const c = calculatorsController({ daos });
  r.post('/bmr', c.bmr);
  r.post('/tdee', c.tdee);
  r.post('/macros', c.macros);
  r.post('/one-rep-max', c.oneRepMax);
  r.post('/body-composition', c.bodyComposition);
  return r;
}
