import { Router } from 'express';
import { statisticsController } from '../controllers/statistics.controller.js';

// Phase 11 (014-phase11-statistics) — statistics router. The statistics screen is a
// single PURELY READ-ONLY composition of data the athlete already owns (Phases 0–10):
// lifetime metrics, body/strength/attendance/nutrition/recovery trends, plus an
// exportable monthly progress report. It never writes, never re-runs the engine, and
// writes no calculation/audit record. Additive within /api/v1 (Constitution IV).
export function statisticsRoutes({ daos, config }) {
  const r = Router();
  const c = statisticsController({ daos, config });
  r.get('/', c.getStatistics);
  r.get('/report', c.getReport);
  return r;
}
