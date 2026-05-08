import { Router } from 'express';
import { weeklyPlanController } from '../controllers/weeklyPlan.controller.js';

/**
 * Phase 2 US2 (T036): two route surfaces share the controller.
 * - Legacy `/api/v1/weekly-plan` (Phase 0) returns the slot list.
 * - `/api/v1/me/schedule` (Phase 2 contract) wraps it in the schedule envelope
 *   and adds PUT (replace) + POST /slots/:slotId/exercises/reorder.
 *
 * Two factories keep route registration explicit in app.js while sharing the
 * same controller construction.
 */
export function weeklyPlanRoutes(weeklyPlanDaoOrDeps) {
  // Tolerate both call shapes: `weeklyPlanRoutes(weeklyPlanDao)` (Phase 0
  // legacy) and `weeklyPlanRoutes({ daos })` (newer pattern).
  const daos = weeklyPlanDaoOrDeps?.daos
    ? weeklyPlanDaoOrDeps.daos
    : { weeklyPlan: weeklyPlanDaoOrDeps };
  const r = Router();
  const c = weeklyPlanController({ daos });
  r.get('/', c.list);
  return r;
}

export function meScheduleRoutes({ daos }) {
  const r = Router();
  const c = weeklyPlanController({ daos });
  r.get('/', c.getSchedule);
  r.put('/', c.replaceSchedule);
  r.post('/slots/:slotId/exercises/reorder', c.reorderSlotExercises);
  return r;
}
