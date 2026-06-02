// CONSTITUTION v1.1.1, Principles II + V.
// PURE FUNCTION — no I/O, no env reads, no Date.now, no Supabase imports.
// Inputs: athleteProfile (+ optional resolved constants). Outputs: complete
// program (training + nutrition + supplements + recovery) plus engine_version
// and resolved_constants snapshot for replayability (research.md §10).

import { ENGINE_VERSION, DEFAULTS } from './engine/constants.js';
import { bmr } from './engine/bmr.js';
import { tdee } from './engine/tdee.js';
import { macros } from './engine/macros.js';

const SPLIT_5_DAY = [
  {
    day_of_week: 1,
    muscle_group: 'chest_triceps',
    display_color: '#ff6b6b',
    exercise_slugs: [
      'bench-press',
      'incline-dumbbell-press',
      'cable-fly',
      'triceps-pushdown',
      'overhead-triceps-extension',
    ],
  },
  {
    day_of_week: 2,
    muscle_group: 'back_biceps',
    display_color: '#4ecdc4',
    exercise_slugs: [
      'deadlift',
      'pull-up',
      'barbell-row',
      'seated-cable-row',
      'barbell-curl',
      'hammer-curl',
    ],
  },
  {
    day_of_week: 3,
    muscle_group: 'legs',
    display_color: '#ffd166',
    exercise_slugs: [
      'back-squat',
      'romanian-deadlift',
      'leg-press',
      'leg-curl',
      'standing-calf-raise',
    ],
  },
  {
    day_of_week: 4,
    muscle_group: 'shoulders_traps',
    display_color: '#9b8cff',
    exercise_slugs: ['overhead-press', 'lateral-raise', 'rear-delt-fly', 'face-pull', 'shrug'],
  },
  {
    day_of_week: 5,
    muscle_group: 'arms_core',
    display_color: '#06d6a0',
    exercise_slugs: [
      'close-grip-bench',
      'preacher-curl',
      'plank',
      'hanging-leg-raise',
      'cable-crunch',
    ],
  },
];

function weeklyPlan(profile) {
  const target = profile.weekly_session_count ?? 5;
  const slots = SPLIT_5_DAY.slice(0, target);
  return slots.map((s, i) => ({
    day_of_week: s.day_of_week,
    muscle_group: s.muscle_group,
    display_color: s.display_color,
    display_order: i + 1,
    exercises: s.exercise_slugs.map((slug, idx) => ({
      slug,
      position: idx + 1,
      target_sets: idx === 0 ? 4 : 3,
      target_reps_low: profile.experience_level === 'beginner' ? 8 : 6,
      target_reps_high: profile.experience_level === 'beginner' ? 12 : 10,
    })),
  }));
}

const TRAINING_PHASES = [
  {
    slug: 'hypertrophy-foundation',
    name: 'Hypertrophie — fondations',
    description: 'Volume modéré, focus technique et progression linéaire.',
    weeks: 6,
    rest_seconds: 90,
    intensity_pct_min: 65,
    intensity_pct_max: 75,
    display_order: 1,
  },
  {
    slug: 'hypertrophy-overload',
    name: 'Hypertrophie — surcharge',
    description: 'Augmentation du volume, techniques d’intensification.',
    weeks: 6,
    rest_seconds: 75,
    intensity_pct_min: 70,
    intensity_pct_max: 80,
    display_order: 2,
  },
  {
    slug: 'strength-peak',
    name: 'Force — pic',
    description: 'Charges lourdes, séries plus courtes, pause active.',
    weeks: 4,
    rest_seconds: 150,
    intensity_pct_min: 80,
    intensity_pct_max: 90,
    display_order: 3,
  },
];

const SUPPLEMENT_STACK = [
  {
    slug: 'creatine-monohydrate',
    name: 'Créatine monohydrate',
    dosage: '5 g',
    recommended_time: 'morning',
    notes: 'Quotidien, hors entraînement compris.',
    display_order: 1,
  },
  {
    slug: 'serious-mass',
    name: 'Serious Mass (gainer)',
    dosage: '1 dose (≈ 165 g) dans 500 ml de lait',
    recommended_time: 'post_workout',
    notes: 'Optionnel les jours sans surplus suffisant.',
    display_order: 2,
  },
  {
    slug: 'vitamin-d3',
    name: 'Vitamine D3',
    dosage: '2000 UI',
    recommended_time: 'morning',
    notes: 'Avec un repas contenant des lipides.',
    display_order: 3,
  },
  {
    slug: 'magnesium',
    name: 'Magnésium bisglycinate',
    dosage: '300 mg',
    recommended_time: 'evening',
    notes: 'Améliore la récupération et le sommeil.',
    display_order: 4,
  },
  {
    slug: 'omega-3',
    name: 'Oméga-3 EPA/DHA',
    dosage: '2 g (≥ 1 g EPA+DHA combinés)',
    recommended_time: 'with_meal',
    notes: 'Réduit l’inflammation post-effort.',
    display_order: 5,
  },
];

function nutritionTemplate(daily_kcal, m) {
  const slots = [
    { slot: 'breakfast', share: 0.22 },
    { slot: 'lunch', share: 0.28 },
    { slot: 'pre_workout', share: 0.12 },
    { slot: 'dinner', share: 0.26 },
    { slot: 'evening_snack', share: 0.12 },
  ];
  return slots.map((s, i) => ({
    slot: s.slot,
    display_order: i + 1,
    target_kcal: Math.round(daily_kcal * s.share),
    target_protein_g: Math.round(m.protein_g * s.share),
    target_carbs_g: Math.round(m.carbs_g * s.share),
    target_fat_g: Math.round(m.fat_g * s.share),
  }));
}

/**
 * Generate a complete program for the given athlete profile.
 *
 * @param {object} profile - athlete profile (Phase 0 columns + activity_level)
 * @param {object} [options]
 * @param {object} [options.constants] - resolved engine constants (defaults ⊕ override)
 * @param {number} [options.lean_body_mass_kg] - optional override; falls back to morphotype default
 */
export function generateProgram(profile, { constants = DEFAULTS, lean_body_mass_kg } = {}) {
  if (!profile) throw new Error('athleteProfile is required');
  const profileWithDefaults = {
    experience_level: 'intermediate',
    activity_level: 'moderately_active',
    ...profile,
  };

  const weight_kg = profileWithDefaults.starting_weight_kg ?? profileWithDefaults.weight_kg;
  if (weight_kg == null) throw new Error('profile.starting_weight_kg is required');

  const bmr_kcal = bmr({
    weight_kg,
    height_cm: profileWithDefaults.height_cm,
    age: profileWithDefaults.age,
    biological_sex: profileWithDefaults.biological_sex,
  });
  const tdee_kcal = tdee({
    bmr_kcal,
    activity_level: profileWithDefaults.activity_level,
    constants,
  });
  const macroTargets = macros({
    weight_kg,
    morphotype: profileWithDefaults.morphotype,
    goal: profileWithDefaults.goal,
    tdee_kcal,
    lean_body_mass_kg,
    constants,
  });

  return {
    training: {
      weeklyPlan: weeklyPlan(profileWithDefaults),
      phases: TRAINING_PHASES,
    },
    nutrition: {
      bmr_kcal,
      tdee_kcal,
      tdee: tdee_kcal, // back-compat alias for Phase 0 tests
      daily_kcal: macroTargets.daily_kcal,
      macros: {
        protein_g: macroTargets.protein_g,
        carbs_g: macroTargets.carbs_g,
        fat_g: macroTargets.fat_g,
      },
      template: nutritionTemplate(macroTargets.daily_kcal, macroTargets),
    },
    supplements: SUPPLEMENT_STACK,
    recovery: {
      sleep_hours: 8,
      rest_days_per_week: 7 - (profileWithDefaults.weekly_session_count ?? 5),
      hydration_l: 3,
      notes: [
        'Mobilité 10 min après chaque séance.',
        'Marche légère les jours OFF.',
        'Stretching post-séance ciblé sur le groupe travaillé.',
      ],
    },
    engine_version: ENGINE_VERSION,
    resolved_constants: constants,
  };
}
