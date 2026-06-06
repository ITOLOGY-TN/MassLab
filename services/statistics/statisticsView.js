// Pure top-level statistics assembler (Phase 11, data-model §3/§4). Bundles the six
// statistics slices (metrics, body, strength, attendance, nutrition, recovery) into the
// composed view model. Each slice falls back to its documented cold-start shape so a
// brand-new athlete with no logged data still renders without error (FR / SC).
// No I/O, no clock, no globals, no @supabase import.

/** Cold-start defaults — one per slice (data-model §4). */
function metricsDefault() {
  return {
    total_weight_gained_kg: null,
    total_volume_kg: 0,
    session_completion_rate: { completed: 0, scheduled: 0, pct: null },
    avg_weekly_calories: null,
  };
}

function bodyDefault() {
  return {
    weight: { points: [], goal_kg: null, has_data: false },
    measurements: [],
  };
}

function strengthDefault() {
  return {
    top_progressions: [],
    weekly_volume: [],
    muscle_radar: { axes: [], values: [] },
  };
}

function attendanceDefault() {
  return { from: '', to: '', levels: 0, days: [] };
}

function nutritionDefault() {
  return { weekly: [], weekly_target_kcal: null };
}

function recoveryDefault() {
  return {
    sleep: { points: [], average_hours: null },
    stress_weight: { points: [], sufficient: false },
  };
}

/**
 * @param {object} [slices]
 * @param {object} [slices.metrics]
 * @param {object} [slices.body]
 * @param {object} [slices.strength]
 * @param {object} [slices.attendance]
 * @param {object} [slices.nutrition]
 * @param {object} [slices.recovery]
 * @returns {object} composed statistics view model
 */
export function build(slices = {}) {
  return {
    metrics: slices.metrics ?? metricsDefault(),
    body: slices.body ?? bodyDefault(),
    strength: slices.strength ?? strengthDefault(),
    attendance: slices.attendance ?? attendanceDefault(),
    nutrition: slices.nutrition ?? nutritionDefault(),
    recovery: slices.recovery ?? recoveryDefault(),
  };
}
