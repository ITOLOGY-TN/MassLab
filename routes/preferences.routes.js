import { Router } from 'express';
import { preferencesController } from '../controllers/preferences.controller.js';

export function preferencesRoutes({ daos }) {
  const r = Router();
  const c = preferencesController({ daos });
  r.get('/', c.get);
  r.patch('/', c.patch);
  return r;
}
