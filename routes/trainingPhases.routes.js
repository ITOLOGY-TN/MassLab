import { Router } from 'express';
import { trainingPhasesController } from '../controllers/trainingPhases.controller.js';

export function trainingPhasesRoutes(trainingPhasesDao) {
  const r = Router();
  const c = trainingPhasesController(trainingPhasesDao);
  r.get('/', c.list);
  return r;
}
