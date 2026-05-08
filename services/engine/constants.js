// CONSTITUTION v1.1.1, Principle III — engine constants live here as defaults.
// Per-athlete overrides are stored on `app_config.engine_overrides` (JSONB) and
// merged at runtime via `services/engine/resolveConstants.js`.
// Bump ENGINE_VERSION whenever a default changes (research.md §10):
//   PATCH = rounding fix, MINOR = new calculator/optional input, MAJOR = behavioural change.

export const ENGINE_VERSION = '1.0.0';

export const DEFAULTS = Object.freeze({
  // ---- Energy and macro targets ------------------------------------------
  bulk_surplus_kcal: 400, // FR-003 default; allowed range 300..500
  cut_deficit_kcal: 400, // FR-003 default
  protein_g_per_kg_lbm: 2.2, // FR-004 default
  fat_floor_pct: 0.25, // FR-004 fat floor (≥ 25 % of kcal)

  // Activity factor lookup for TDEE (FR-002).
  activity_factors: Object.freeze({
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  }),

  // Default body-fat % per morphotype, used when LBM is omitted from a macros call
  // (contracts/openapi.yaml: macros endpoint). lean_mass = weight × (1 − bf%).
  default_body_fat_pct: Object.freeze({
    ectomorph: 0.12,
    mesomorph: 0.15,
    endomorph: 0.20,
  }),

  // Morphotype carb skew applied to the macros calculator (FR-005).
  // Higher = more carbs / less fat for the morphotype.
  morphotype_carb_skew: Object.freeze({
    ectomorph: 1.1, // pushes carb share up to ~55 %
    mesomorph: 1.0,
    endomorph: 0.85,
  }),

  // ---- 1RM (FR-007 / FR-008 / FR-009) ------------------------------------
  one_rep_max_reduced_confidence_reps: 10, // > this → reduced_confidence: true
  percentage_table_default: Object.freeze([
    { pct: 60, reps_low: 12, reps_high: 15 },
    { pct: 70, reps_low: 10, reps_high: 12 },
    { pct: 75, reps_low: 8, reps_high: 10 },
    { pct: 80, reps_low: 6, reps_high: 8 },
    { pct: 85, reps_low: 4, reps_high: 6 },
    { pct: 90, reps_low: 2, reps_high: 4 },
  ]),
  // Month-over-month "on pace" threshold for 1RM trend (FR-017).
  on_pace_pct_per_month: 2,

  // ---- Progression rule engine (FR-012..FR-016) --------------------------
  load_increment_upper_kg: 2.5,
  load_increment_lower_kg: 5,
  deload_volume_cut_pct: 30,
  stagnation_window_weeks: 3,
  double_progression_window_sessions: 2,
  deload_rpe_threshold: 9,
  regression_window_weeks: 2,
  rpe_coverage_minimum_pct: 60,

  // ---- Plausibility ranges (FR-022 / FR-030 / SC-010) --------------------
  // Bounds used by services/engine/inputSchemas.js to reject typos.
  ranges: Object.freeze({
    weight_kg: { min: 30, max: 250 },
    height_cm: { min: 100, max: 250 },
    age: { min: 10, max: 100 },
    waist_cm: { min: 50, max: 200 },
    neck_cm: { min: 25, max: 60 },
    hip_cm: { min: 60, max: 200 },
    reps: { min: 1, max: 30 },
  }),
});

/**
 * Phase 2 US4: documented JSONB shape for `engine_overrides.nutrition`.
 * Any subset of these four keys may be present. Resolver semantics live in
 * services/engine/macros.js (FR-017a/b).
 *
 * Example payload:
 *   {
 *     "nutrition": {
 *       "daily_kcal": 3500,
 *       "daily_protein_g": 200,
 *       "daily_carbs_g": 430,
 *       "daily_fat_g": 90
 *     }
 *   }
 */
export const NUTRITION_OVERRIDE_KEYS = Object.freeze([
  'daily_kcal',
  'daily_protein_g',
  'daily_carbs_g',
  'daily_fat_g',
]);

/** Keys allowed in `app_config.engine_overrides`. Unknown keys are ignored. */
export const OVERRIDE_KEYS = Object.freeze([
  'bulk_surplus_kcal',
  'cut_deficit_kcal',
  'protein_g_per_kg_lbm',
  'fat_floor_pct',
  'activity_factors',
  'default_body_fat_pct',
  'morphotype_carb_skew',
  'one_rep_max_reduced_confidence_reps',
  'percentage_table_default',
  'on_pace_pct_per_month',
  'load_increment_upper_kg',
  'load_increment_lower_kg',
  'deload_volume_cut_pct',
  'stagnation_window_weeks',
  'double_progression_window_sessions',
  'deload_rpe_threshold',
  'regression_window_weeks',
  'rpe_coverage_minimum_pct',
  'ranges',
]);
