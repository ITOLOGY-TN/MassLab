// CONSTITUTION v1.1.1, Principles II + V.
// PURE FUNCTION — no I/O, no env reads, no Date.now, no Supabase imports.
// Inputs: athleteProfile. Outputs: complete program (training + nutrition +
// supplements + recovery). All math is deterministic.

const ACTIVITY_MULTIPLIER = {
  3: 1.55,
  4: 1.625,
  5: 1.725,
  6: 1.8,
  7: 1.9,
};

function bmr({ biological_sex, starting_weight_kg, height_cm, age }) {
  // Mifflin-St Jeor
  const base = 10 * starting_weight_kg + 6.25 * height_cm - 5 * age;
  return Math.round(biological_sex === 'female' ? base - 161 : base + 5);
}

function tdee(profile) {
  const mult = ACTIVITY_MULTIPLIER[profile.weekly_session_count] ?? 1.55;
  return Math.round(bmr(profile) * mult);
}

function dailyKcal(profile, base) {
  if (profile.goal === 'cut') return base - 400;
  if (profile.goal === 'maintain') return base;
  return base + 400; // bulk: middle of the +300..+500 band
}

function macros(profile, daily_kcal) {
  const proteinPerKg = profile.experience_level === 'beginner' ? 1.6 : 1.9;
  const protein_g = Math.round(profile.starting_weight_kg * proteinPerKg);
  const fatPct = profile.morphotype === 'ectomorph' ? 0.22 : 0.28;
  const fat_g = Math.round((daily_kcal * fatPct) / 9);
  const remaining = daily_kcal - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remaining / 4));
  return { protein_g, carbs_g, fat_g };
}

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
    exercise_slugs: [
      'overhead-press',
      'lateral-raise',
      'rear-delt-fly',
      'face-pull',
      'shrug',
    ],
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

export function generateProgram(profile) {
  if (!profile) throw new Error('athleteProfile is required');
  const profileWithDefaults = { experience_level: 'intermediate', ...profile };
  const baseTdee = tdee(profileWithDefaults);
  const daily_kcal = dailyKcal(profileWithDefaults, baseTdee);
  const m = macros(profileWithDefaults, daily_kcal);

  return {
    training: {
      weeklyPlan: weeklyPlan(profileWithDefaults),
      phases: TRAINING_PHASES,
    },
    nutrition: {
      tdee: baseTdee,
      daily_kcal,
      macros: m,
      template: nutritionTemplate(daily_kcal, m),
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
  };
}
