// JSDoc typedefs for DAO row shapes and program-generator I/O.
// These are not runtime types — they exist so editors can show shape hints
// and so reviewers have one canonical reference for the v1 envelope.

/**
 * @typedef {Object} AthleteProfile
 * @property {number} age
 * @property {'male'|'female'} biological_sex
 * @property {number} height_cm
 * @property {number} starting_weight_kg
 * @property {number} target_weight_kg
 * @property {'ectomorph'|'mesomorph'|'endomorph'} morphotype
 * @property {'bulk'|'cut'|'maintain'} goal
 * @property {number} weekly_session_count
 * @property {string[]} available_equipment
 * @property {string[]} injuries
 * @property {'beginner'|'intermediate'|'advanced'} [experience_level]
 */

/**
 * @typedef {Object} Macros
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 */

/**
 * @typedef {Object} ProgramNutrition
 * @property {number} tdee
 * @property {number} daily_kcal
 * @property {Macros} macros
 * @property {Array<{slot:string,display_order:number,target_kcal:number,target_protein_g:number,target_carbs_g:number,target_fat_g:number}>} template
 */

/**
 * @typedef {Object} Program
 * @property {{ weeklyPlan: object[], phases: object[] }} training
 * @property {ProgramNutrition} nutrition
 * @property {object[]} supplements
 * @property {{ sleep_hours:number, rest_days_per_week:number, hydration_l:number, notes:string[] }} recovery
 */

/** @typedef {{ id: string, email: string, display_name: string|null, ... }} AthleteRow */
/** @typedef {{ id: number, athlete_id: string, slug: string, locale: string, name: string, ... }} ExerciseRow */
/** @typedef {{ id: number, athlete_id: string, day_of_week: number, muscle_group: string }} WeeklyPlanSlotRow */
/** @typedef {{ id: number, athlete_id: string, slot: string, target_kcal: number }} NutritionMealRow */
/** @typedef {{ id: number, athlete_id: string, slug: string, locale: string, name: string, dosage: string }} SupplementRow */
/** @typedef {{ id: number, athlete_id: string, slug: string, locale: string, name: string, kcal_per_100g: number }} FoodRow */
/** @typedef {{ id: number, athlete_id: string, slug: string, locale: string, text: string, author: string|null }} QuoteRow */

export {};
