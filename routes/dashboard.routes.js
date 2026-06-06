import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';

// Phase 10 (013-phase10-dashboard) — dashboard router. The home-screen dashboard is a
// single PURELY READ-ONLY composition of data the athlete already owns (Phases 0–9):
// today's session card, a 7-day week overview, four quick metric cards, a 30-day weight
// sparkline, up to three prioritized alerts, and the quote of the day. It never writes,
// never re-runs the engine, and writes no calculation/audit record (FR-016). Additive
// within /api/v1 (Constitution IV).
export function dashboardRoutes({ daos, config }) {
  const r = Router();
  const c = dashboardController({ daos, config });
  r.get('/', c.getDashboard);
  return r;
}
