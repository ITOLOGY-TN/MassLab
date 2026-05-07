import { Router } from 'express';
import { exercisesController } from '../controllers/exercises.controller.js';

export function exercisesRoutes(exercisesDao) {
  const r = Router();
  const c = exercisesController(exercisesDao);
  r.get('/', c.list);
  return r;
}
