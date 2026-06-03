// Phase 5 (008-load-tracking) — the read-only Load Tracking surface, mounted at
// /api/v1/load-tracking. research D-10.
import { Router } from 'express';
import { loadTrackingController } from '../controllers/loadTracking.controller.js';

export function loadTrackingRoutes({ daos, config }) {
  const r = Router();
  const c = loadTrackingController({ daos, config });

  r.get('/overview', c.overview);
  r.get('/exercises/:id', c.getExercise);
  r.get('/phase-comparison', c.getPhaseComparison);

  return r;
}
