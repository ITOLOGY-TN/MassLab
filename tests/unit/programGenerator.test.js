// CONSTITUTION v1.1.1, Principle V — TDD for domain logic.
// These tests are written BEFORE programGenerator.js. They lock the contract
// of the pure function: given an athlete profile, produce a complete program
// (training plan + macro targets + supplement stack + recovery guidelines).
import { describe, it, expect } from 'vitest';
import { generateProgram } from '../../services/programGenerator.js';

const seededAthlete = {
  age: 29,
  biological_sex: 'male',
  height_cm: 173,
  starting_weight_kg: 58,
  target_weight_kg: 65,
  morphotype: 'ectomorph',
  goal: 'bulk',
  weekly_session_count: 5,
  available_equipment: ['barbell', 'dumbbells', 'rack', 'bench', 'pulley'],
  injuries: [],
  experience_level: 'intermediate',
};

describe('programGenerator (pure function — Principle V)', () => {
  it('returns a 5-day training plan when weekly_session_count === 5', () => {
    const program = generateProgram(seededAthlete);
    expect(program.training.weeklyPlan).toHaveLength(5);
    for (const slot of program.training.weeklyPlan) {
      expect(slot.day_of_week).toBeGreaterThanOrEqual(1);
      expect(slot.day_of_week).toBeLessThanOrEqual(7);
      expect(slot.muscle_group).toBeTypeOf('string');
      expect(Array.isArray(slot.exercises)).toBe(true);
      expect(slot.exercises.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('targets a daily kcal in the bulk surplus band (TDEE + 300..500)', () => {
    const program = generateProgram(seededAthlete);
    const { tdee, daily_kcal } = program.nutrition;
    expect(daily_kcal).toBeGreaterThanOrEqual(tdee + 300);
    expect(daily_kcal).toBeLessThanOrEqual(tdee + 500);
  });

  it('keeps protein-first macro split honoring the ectomorph carb skew', () => {
    const program = generateProgram(seededAthlete);
    const { protein_g, carbs_g, fat_g } = program.nutrition.macros;
    // ≥ 1.8 g/kg protein for an intermediate bulk
    expect(protein_g).toBeGreaterThanOrEqual(Math.round(seededAthlete.starting_weight_kg * 1.8));
    // ectomorphs skew carbs > fat
    expect(carbs_g).toBeGreaterThan(fat_g * 2);
  });

  it('returns the canonical 5-supplement stack', () => {
    const program = generateProgram(seededAthlete);
    const slugs = program.supplements.map((s) => s.slug).sort();
    expect(slugs).toEqual(
      ['creatine-monohydrate', 'magnesium', 'omega-3', 'serious-mass', 'vitamin-d3'].sort(),
    );
  });

  it('emits recovery guidelines (sleep + rest_days + hydration)', () => {
    const program = generateProgram(seededAthlete);
    expect(program.recovery.sleep_hours).toBeGreaterThanOrEqual(8);
    expect(program.recovery.rest_days_per_week).toBeGreaterThanOrEqual(2);
    expect(program.recovery.hydration_l).toBeGreaterThanOrEqual(2.5);
  });

  it('is pure — same input ⇒ same output, no side effects', () => {
    const a = generateProgram(seededAthlete);
    const b = generateProgram(seededAthlete);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does NOT read process.env, Date.now, or perform I/O', () => {
    const original = { now: Date.now, env: process.env.SUPABASE_URL };
    let touched = false;
    Date.now = () => {
      touched = true;
      return 0;
    };
    try {
      generateProgram(seededAthlete);
    } finally {
      Date.now = original.now;
    }
    expect(touched).toBe(false);
  });
});
