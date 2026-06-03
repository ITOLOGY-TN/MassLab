import { Router } from 'express';
import { supplementsController } from '../controllers/supplements.controller.js';

// Phase 8 (011-phase8-supplements) — supplements router. The catalogue list (GET /)
// is unchanged from Phase 0; checklist/intake/grid/assessment paths are added (all
// additive within /api/v1, Constitution IV).
export function supplementsRoutes({ daos, config }) {
  const r = Router();
  const c = supplementsController({ daos, config });
  r.get('/', c.list);
  r.get('/checklist', c.getChecklist);
  r.post('/intake', c.toggleIntake);
  r.get('/grid', c.getGrid);
  r.get('/assessments', c.getAssessments);
  r.put('/assessment', c.putAssessment);
  return r;
}
