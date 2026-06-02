// Phase 4 (007-session-journal) — the Session Journal write surface, mounted at
// /api/v1/sessions. `/active` is registered before `/:id` so it doesn't get
// captured by the id param. research D-13.
import { Router } from 'express';
import { sessionsController } from '../controllers/sessions.controller.js';

export function sessionsRoutes({ daos, config }) {
  const r = Router();
  const c = sessionsController({ daos, config });

  r.get('/active', c.getActive);
  r.post('/', c.start);
  r.get('/:id', c.get);
  r.delete('/:id', c.discard);
  r.put('/:id/sets', c.upsertSets);
  r.post('/:id/sets', c.addSet);
  r.patch('/:id/sets/:setId', c.updateSet);
  r.delete('/:id/sets/:setId', c.deleteSet);
  r.post('/:id/finish', c.finish);

  return r;
}
