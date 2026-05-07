import { Router } from 'express';
import { athleteController } from '../controllers/athlete.controller.js';

export function athleteRoutes(athletesDao) {
  const r = Router();
  const c = athleteController(athletesDao);
  r.get('/me', c.getMe);
  return r;
}
