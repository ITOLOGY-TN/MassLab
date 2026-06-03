import { Router } from 'express';
import { bodyMeasurementsController } from '../controllers/bodyMeasurements.controller.js';

export function bodyMeasurementsRoutes({ daos }) {
  const r = Router();
  const c = bodyMeasurementsController({ daos });
  r.get('/', c.list);
  r.post('/', c.create);
  return r;
}
