import { Router } from 'express';
import { exercisesController } from '../controllers/exercises.controller.js';

export function exercisesRoutes(exercisesDao) {
  const r = Router();
  const c = exercisesController(exercisesDao);
  r.get('/', c.list);
  r.post('/', c.create);
  r.patch('/:id', c.patch);
  r.delete('/:id', c.destroy);
  return r;
}
