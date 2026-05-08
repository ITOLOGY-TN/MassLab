// Idempotent, transactional-ish seed runner.
// Uses the data-access modules (Constitution Principle II): no direct supabase
// imports here. Safe to re-run — every upsert is keyed on a stable natural key.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/index.js';
import { getSupabase } from '../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../services/dataAccess/athletes.dao.js';
import { exercisesDao } from '../services/dataAccess/exercises.dao.js';
import { weeklyPlanDao } from '../services/dataAccess/weeklyPlan.dao.js';
import { trainingPhasesDao } from '../services/dataAccess/trainingPhases.dao.js';
import { nutritionDao } from '../services/dataAccess/nutrition.dao.js';
import { supplementsDao } from '../services/dataAccess/supplements.dao.js';
import { foodsDao } from '../services/dataAccess/foods.dao.js';
import { quotesDao } from '../services/dataAccess/quotes.dao.js';
import { generatedProgramsDao } from '../services/dataAccess/generatedPrograms.dao.js';
import { calculationResultsDao } from '../services/dataAccess/calculationResults.dao.js';
import { appConfigDao } from '../services/dataAccess/appConfig.dao.js';
import { logger } from '../services/logger.js';
import { generateProgram } from '../services/programGenerator.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { seededAthlete } from './athlete.seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadJson(rel) {
  const buf = await readFile(path.join(here, rel), 'utf8');
  return JSON.parse(buf);
}

export async function runSeed({ config = loadConfig() } = {}) {
  const supabase = getSupabase(config);
  const daos = {
    athletes: athletesDao(supabase),
    exercises: exercisesDao(supabase),
    weeklyPlan: weeklyPlanDao(supabase),
    trainingPhases: trainingPhasesDao(supabase),
    nutrition: nutritionDao(supabase),
    supplements: supplementsDao(supabase),
    foods: foodsDao(supabase),
    quotes: quotesDao(supabase),
    generatedPrograms: generatedProgramsDao(supabase),
    calculationResults: calculationResultsDao(supabase),
    appConfig: appConfigDao(supabase),
  };

  // 1. Athlete
  const profile = { ...seededAthlete };
  delete profile.experience_level;
  const athlete = await daos.athletes.upsertProfile(profile);
  logger.info({ athlete_id: athlete.id }, 'seed_athlete_upserted');
  const athleteId = athlete.id;

  // 2. Generate program for this athlete using engine constants (defaults)
  const overrides = await daos.appConfig.getOverridesFor(athleteId);
  const constants = resolveConstants(overrides);
  const program = generateProgram({ ...seededAthlete }, { constants });

  // 3. Catalogues (locale fr-FR)
  const exercises = await loadJson('exercises.seed.json');
  const exerciseRows = exercises.exercises.map((e) => ({
    athlete_id: athleteId,
    slug: e.slug,
    locale: exercises.locale,
    name: e.name,
    targeted_muscles: e.targeted_muscles,
    instructions: e.instructions,
    technique_points: e.technique_points,
  }));
  const upsertedEx = await daos.exercises.upsertMany(exerciseRows);

  const foods = await loadJson('foods.seed.json');
  await daos.foods.upsertMany(
    foods.foods.map((f) => ({
      athlete_id: athleteId,
      slug: f.slug,
      locale: foods.locale,
      name: f.name,
      kcal_per_100g: f.kcal_per_100g,
      protein_per_100g: f.protein_per_100g,
      carbs_per_100g: f.carbs_per_100g,
      fat_per_100g: f.fat_per_100g,
      category: f.category,
    })),
  );

  const supplements = await loadJson('supplements.seed.json');
  await daos.supplements.upsertMany(
    supplements.supplements.map((s) => ({
      athlete_id: athleteId,
      slug: s.slug,
      locale: supplements.locale,
      name: s.name,
      dosage: s.dosage,
      recommended_time: s.recommended_time,
      notes: s.notes,
      display_order: s.display_order,
    })),
  );

  const phases = await loadJson('trainingPhases.seed.json');
  await daos.trainingPhases.upsertMany(
    phases.phases.map((p) => ({
      athlete_id: athleteId,
      slug: p.slug,
      locale: phases.locale,
      name: p.name,
      description: p.description,
      weeks: p.weeks,
      rest_seconds: p.rest_seconds,
      intensity_pct_min: p.intensity_pct_min,
      intensity_pct_max: p.intensity_pct_max,
      display_order: p.display_order,
    })),
  );

  const quotes = await loadJson('quotes.seed.json');
  await daos.quotes.upsertMany(
    quotes.quotes.map((q) => ({
      athlete_id: athleteId,
      slug: q.slug,
      locale: quotes.locale,
      text: q.text,
      author: q.author,
    })),
  );

  // 4. Weekly plan (slots + exercises) from the program
  const slugToExerciseId = new Map(upsertedEx.map((e) => [e.slug, e.id]));
  for (const slot of program.training.weeklyPlan) {
    const upsertedSlot = await daos.weeklyPlan.upsertSlot({
      athlete_id: athleteId,
      day_of_week: slot.day_of_week,
      muscle_group: slot.muscle_group,
      display_color: slot.display_color,
      display_order: slot.display_order,
    });
    for (const ex of slot.exercises) {
      const exerciseId = slugToExerciseId.get(ex.slug);
      if (!exerciseId) {
        logger.warn({ slug: ex.slug }, 'seed_missing_exercise_for_slot');
        continue;
      }
      await daos.weeklyPlan.upsertSlotExercise({
        athlete_id: athleteId,
        slot_id: upsertedSlot.id,
        exercise_id: exerciseId,
        position: ex.position,
        target_sets: ex.target_sets,
        target_reps_low: ex.target_reps_low,
        target_reps_high: ex.target_reps_high,
      });
    }
  }

  // 5. Nutrition template
  for (const meal of program.nutrition.template) {
    await daos.nutrition.upsertMeal({
      athlete_id: athleteId,
      slot: meal.slot,
      display_order: meal.display_order,
      target_kcal: meal.target_kcal,
      target_protein_g: meal.target_protein_g,
      target_carbs_g: meal.target_carbs_g,
      target_fat_g: meal.target_fat_g,
    });
  }

  // 6. Persist the active program (soft-archive any prior row) + audit log entry.
  const activeProgram = await daos.generatedPrograms.archiveAndInsert(athleteId, {
    payload: program,
    engine_version: program.engine_version,
    resolved_constants: program.resolved_constants,
  });
  await writeAudit({
    daos,
    athleteId,
    calculator: 'program_generate',
    inputs: { profile: seededAthlete },
    outputs: { program_id: activeProgram.id, daily_kcal: program.nutrition.daily_kcal },
    resolvedConstants: program.resolved_constants,
    engineVersion: program.engine_version,
    producedRecord: { kind: 'generated_programs', id: activeProgram.id },
  });
  logger.info(
    { athlete_id: athleteId, program_id: activeProgram.id },
    'seed_active_program_written',
  );

  logger.info({ athlete_id: athleteId }, 'seed_complete');
  return { athleteId, programId: activeProgram.id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed().catch((err) => {
    logger.fatal({ err }, 'seed_failed');
    process.exitCode = 1;
  });
}
