// Phase 2 US2 (T030): pure validation of a proposed weekly schedule.
// No I/O, no Supabase imports. Mirrored on the frontend for instant feedback;
// the backend is the source of truth.
// Rules from FR-008 / data-model.md:
//   - 1 ≤ active_days ≤ 7
//   - day_of_week ∈ [1, 7], unique within the week
//   - muscle_group_id non-null and unique per slot within the week
//   - muscle-group name length ≤ 40 (when names are passed alongside ids,
//     the controller is expected to validate against the catalogue separately —
//     this validator only sees ids).

const ERROR_CODES = Object.freeze({
  ZERO_DAYS: 'SCHEDULE_ZERO_DAYS',
  TOO_MANY_DAYS: 'SCHEDULE_TOO_MANY_DAYS',
  INVALID_DAY_OF_WEEK: 'SCHEDULE_INVALID_DAY_OF_WEEK',
  DUPLICATE_DAY: 'SCHEDULE_DUPLICATE_DAY',
  DUPLICATE_MUSCLE_GROUP: 'SCHEDULE_DUPLICATE_MUSCLE_GROUP',
  MISSING_MUSCLE_GROUP_ID: 'SCHEDULE_MISSING_MUSCLE_GROUP_ID',
  ACTIVE_DAYS_MISMATCH: 'SCHEDULE_ACTIVE_DAYS_MISMATCH',
});

export { ERROR_CODES };

/**
 * @param {{ active_days?: number, slots: Array<{
 *   day_of_week: number,
 *   muscle_group_id: number,
 *   display_order?: number,
 *   exercises?: Array<unknown>,
 * }> }} payload
 * @returns {{ ok: true } | { ok: false, errors: Array<{ code: string, message: string, path?: string }> }}
 */
export function validateSchedule(payload) {
  const errors = [];
  const slots = Array.isArray(payload?.slots) ? payload.slots : [];

  if (slots.length === 0) {
    errors.push({
      code: ERROR_CODES.ZERO_DAYS,
      message: 'A schedule must contain at least one active day.',
      path: 'slots',
    });
  }
  if (slots.length > 7) {
    errors.push({
      code: ERROR_CODES.TOO_MANY_DAYS,
      message: 'A schedule cannot contain more than seven days.',
      path: 'slots',
    });
  }

  const seenDays = new Set();
  const seenMuscleGroups = new Set();

  slots.forEach((slot, idx) => {
    const path = `slots[${idx}]`;
    const dow = slot?.day_of_week;
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
      errors.push({
        code: ERROR_CODES.INVALID_DAY_OF_WEEK,
        message: `day_of_week must be an integer between 1 and 7 (got ${dow}).`,
        path: `${path}.day_of_week`,
      });
    } else if (seenDays.has(dow)) {
      errors.push({
        code: ERROR_CODES.DUPLICATE_DAY,
        message: `Two slots share day_of_week=${dow}.`,
        path: `${path}.day_of_week`,
      });
    } else {
      seenDays.add(dow);
    }

    const mgid = slot?.muscle_group_id;
    if (mgid == null) {
      errors.push({
        code: ERROR_CODES.MISSING_MUSCLE_GROUP_ID,
        message: 'muscle_group_id is required on every slot.',
        path: `${path}.muscle_group_id`,
      });
    } else if (seenMuscleGroups.has(mgid)) {
      errors.push({
        code: ERROR_CODES.DUPLICATE_MUSCLE_GROUP,
        message: `muscle_group_id=${mgid} appears on more than one day.`,
        path: `${path}.muscle_group_id`,
      });
    } else {
      seenMuscleGroups.add(mgid);
    }
  });

  if (
    payload?.active_days != null &&
    Number.isInteger(payload.active_days) &&
    payload.active_days !== slots.length
  ) {
    errors.push({
      code: ERROR_CODES.ACTIVE_DAYS_MISMATCH,
      message: `active_days=${payload.active_days} does not match slots.length=${slots.length}.`,
      path: 'active_days',
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
