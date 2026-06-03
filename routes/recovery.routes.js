import { Router } from 'express';
import { recoveryController } from '../controllers/recovery.controller.js';

// Phase 9 (012-phase9-recovery-wellbeing) — recovery router. Daily check-in
// (GET/PUT), smart alerts, and trend visuals — all additive within /api/v1
// (Constitution IV).
export function recoveryRoutes({ daos, config }) {
  const r = Router();
  const c = recoveryController({ daos, config });
  r.get('/checkin', c.getCheckin);
  r.put('/checkin', c.putCheckin);
  r.get('/alerts', c.getAlerts);
  r.get('/trends', c.getTrends);
  return r;
}
