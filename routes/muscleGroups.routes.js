import { Router } from 'express';
import { muscleGroupsController } from '../controllers/muscleGroups.controller.js';

export function muscleGroupsRoutes({ daos }) {
  const r = Router();
  const c = muscleGroupsController({ daos });
  r.get('/', c.list);
  r.post('/', c.create);
  r.patch('/:id', c.patch);
  r.delete('/:id', c.destroy);
  r.post('/:id/merge', c.merge);
  return r;
}
