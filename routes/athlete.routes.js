import { Router } from 'express';
import { athleteController } from '../controllers/athlete.controller.js';

export function athleteRoutes({ daos }) {
  const r = Router();
  const c = athleteController({ daos });
  r.get('/me', c.getMe);
  r.patch('/me', c.patchMe);
  return r;
}
