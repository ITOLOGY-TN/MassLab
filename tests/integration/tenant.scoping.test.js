import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

let config;
let supabase;
let live = false;
let secondAthleteId;

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[tenant.scoping] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[tenant.scoping] skipped — Supabase unreachable');
    return;
  }
  // Insert a second athlete with no seeded data attached.
  const dao = athletesDao(supabase);
  const second = await dao.upsertProfile({
    email: 'second@masslab.local',
    display_name: 'Second Athlete',
    age: 30,
    biological_sex: 'female',
    height_cm: 165,
    starting_weight_kg: 60,
    target_weight_kg: 60,
    morphotype: 'mesomorph',
    goal: 'maintain',
    weekly_session_count: 3,
    available_equipment: [],
    injuries: [],
    program_start_date: '2026-05-01',
  });
  secondAthleteId = second.id;
  live = true;
});

const PATHS = [
  '/api/v1/exercises',
  '/api/v1/weekly-plan',
  '/api/v1/training-phases',
  '/api/v1/nutrition/template',
  '/api/v1/supplements',
  '/api/v1/foods',
  '/api/v1/quotes',
];

describe('US2 — every domain row is athlete-scoped', () => {
  it.each(PATHS)(
    "%s returns only the second athlete's rows (none from seeded athlete)",
    async (path) => {
      if (!live) return;
      // Build an app whose auth middleware resolves to the second athlete via a
      // stub DAO — this exercises the controller/DAO chain with a different
      // req.athleteId than the seeded one.
      const stubAthletes = {
        ...athletesDao(supabase),
        findBySeed: async () => ({ id: secondAthleteId }),
      };
      const app = buildApp({
        config,
        supabase,
        daos: {
          athletes: stubAthletes,
          exercises: (await import('../../services/dataAccess/exercises.dao.js')).exercisesDao(
            supabase,
          ),
          weeklyPlan: (await import('../../services/dataAccess/weeklyPlan.dao.js')).weeklyPlanDao(
            supabase,
          ),
          trainingPhases: (
            await import('../../services/dataAccess/trainingPhases.dao.js')
          ).trainingPhasesDao(supabase),
          nutrition: (await import('../../services/dataAccess/nutrition.dao.js')).nutritionDao(
            supabase,
          ),
          supplements: (
            await import('../../services/dataAccess/supplements.dao.js')
          ).supplementsDao(supabase),
          foods: (await import('../../services/dataAccess/foods.dao.js')).foodsDao(supabase),
          quotes: (await import('../../services/dataAccess/quotes.dao.js')).quotesDao(supabase),
        },
      });
      const res = await request(app).get(path);
      expect(res.status).toBeLessThan(500);
      if (Array.isArray(res.body.data)) {
        // No row should reference any other athlete
        for (const row of res.body.data) {
          if (row.athlete_id !== undefined) {
            expect(row.athlete_id).toBe(secondAthleteId);
          }
        }
      }
    },
  );
});
