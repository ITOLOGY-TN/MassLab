import { Router } from 'express';
import { trainingProgramController } from '../controllers/trainingProgram.controller.js';

/**
 * Phase 3 read-only Training Program views. Mounted at /api/v1/program AFTER
 * the program-generator router; their paths are disjoint (`/`, `/regenerate`,
 * `/history` vs `/week`, `/day/:dayOfWeek`, `/exercises/:id`) so unmatched
 * requests fall through to this router. research D-9.
 *
 * US2 adds GET /day/:dayOfWeek; US3 adds GET /exercises/:id.
 */
export function trainingProgramRoutes({ daos }) {
  const r = Router();
  const c = trainingProgramController({ daos });
  r.get('/week', c.getWeek);
  return r;
}
