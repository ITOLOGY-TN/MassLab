// Phase 1, T021a — Zod schemas for every calculator + persistence endpoint.
// Resolves FR-022 / FR-030 / SC-010: every surface validates against documented
// plausibility ranges from research.md §9 before any compute runs.
import { z } from 'zod';
import { HttpError } from '../../middleware/errorHandler.js';
import { DEFAULTS } from './constants.js';

const r = DEFAULTS.ranges;

const weight_kg = z.number().min(r.weight_kg.min).max(r.weight_kg.max);
const height_cm = z.number().min(r.height_cm.min).max(r.height_cm.max);
const age = z.number().int().min(r.age.min).max(r.age.max);
const biological_sex = z.enum(['male', 'female']);
const activity_level = z.enum([
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extremely_active',
]);
const morphotype = z.enum(['ectomorph', 'mesomorph', 'endomorph']);
const goal = z.enum(['bulk', 'cut', 'maintain']);
const reps = z.number().int().min(r.reps.min).max(r.reps.max);
const lift_weight_kg = z
  .number()
  .min(1)
  .max(r.weight_kg.max * 2); // bar can exceed bodyweight

const measurement_optional = (range) =>
  z.number().min(range.min).max(range.max).nullable().optional();

export const bmrSchema = z.object({
  weight_kg,
  height_cm,
  age,
  biological_sex,
});

export const tdeeSchema = bmrSchema.extend({ activity_level });

export const macrosSchema = tdeeSchema.extend({
  morphotype,
  goal,
  lean_body_mass_kg: z.number().min(20).max(150).optional(),
});

export const oneRepMaxSchema = z.object({
  weight_kg: lift_weight_kg,
  reps,
});

export const oneRepMaxRecordSchema = oneRepMaxSchema.extend({
  exercise_id: z.number().int().positive(),
});

export const bodyCompositionSchema = z.object({
  weight_kg,
  height_cm,
  age,
  biological_sex,
  waist_cm: measurement_optional(r.waist_cm),
  neck_cm: measurement_optional(r.neck_cm),
  hip_cm: measurement_optional(r.hip_cm),
});

export const bodyMeasurementSchema = z.object({
  measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'measured_on must be ISO date YYYY-MM-DD'),
  weight_kg: z.number().min(r.weight_kg.min).max(r.weight_kg.max).optional(),
  arm_cm: measurement_optional({ min: 15, max: 80 }),
  chest_cm: measurement_optional({ min: 60, max: 200 }),
  thigh_cm: measurement_optional({ min: 30, max: 120 }),
  shoulder_cm: measurement_optional({ min: 60, max: 200 }),
  waist_cm: measurement_optional(r.waist_cm),
  neck_cm: measurement_optional(r.neck_cm),
  hip_cm: measurement_optional(r.hip_cm),
  note: z.string().max(500).nullable().optional(),
});

// Phase 2 (T015) broadens the patch surface to accept the contract-aliased
// keys used by the Phase 2 OpenAPI (current_weight_kg / sessions_per_week /
// equipment / program_start_date) alongside the Phase 0 column names.
// Translation to DB columns happens in the controller.
export const profilePatchSchema = z
  .object({
    // engine-name + contract aliases
    weight_kg: weight_kg.optional(),
    current_weight_kg: weight_kg.optional(),
    height_cm: height_cm.optional(),
    age: age.optional(),
    biological_sex: biological_sex.optional(),
    morphotype: morphotype.optional(),
    goal: goal.optional(),
    activity_level: activity_level.optional(),
    weekly_session_count: z.number().int().min(1).max(7).optional(),
    sessions_per_week: z.number().int().min(1).max(7).optional(),
    available_equipment: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    injuries: z.array(z.string()).optional(),
    display_name: z.string().min(1).max(100).optional(),
    target_weight_kg: z.number().min(r.weight_kg.min).max(r.weight_kg.max).optional(),
    program_start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export const PROFILE_OUTPUT_AFFECTING_FIELDS = Object.freeze([
  'weight_kg',
  'current_weight_kg',
  'height_cm',
  'age',
  'biological_sex',
  'morphotype',
  'goal',
  'activity_level',
  'weekly_session_count',
  'sessions_per_week',
  'available_equipment',
  'equipment',
  'injuries',
  'target_weight_kg',
]);

// Phase 4 (007-session-journal) — session journal write surface. A set may only
// be `completed: true` when weight_kg > 0 and reps > 0 (FR-009); incomplete sets
// may carry zeros (entered but not yet done).
const sessionSetSchema = z
  .object({
    exercise_id: z.number().int().positive(),
    set_number: z.number().int().positive(),
    weight_kg: z
      .number()
      .min(0)
      .max(r.weight_kg.max * 2),
    reps: z.number().int().min(0).max(r.reps.max),
    rpe: z.number().int().min(1).max(10).nullable().optional(),
    completed: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.completed && !(val.weight_kg > 0 && val.reps > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['completed'],
        message: 'a completed set requires weight_kg > 0 and reps > 0',
      });
    }
  });

export const setInputSchema = sessionSetSchema;
export const upsertSetsSchema = z.object({ sets: z.array(sessionSetSchema) });
export const sessionStartSchema = z.object({
  day_of_week: z.number().int().min(1).max(7).optional(),
});
export const finishSessionSchema = z.object({
  note: z.string().max(2000).nullable().optional(),
  energy_rating: z.number().int().min(1).max(5).nullable().optional(),
});

/**
 * Run a Zod schema against a body and throw the canonical 422 envelope on failure.
 */
export function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join('.') || '<root>';
    throw new HttpError(422, 'OUT_OF_RANGE', `Invalid input for "${field}": ${issue.message}`);
  }
  return parsed.data;
}
