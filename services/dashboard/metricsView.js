// Pure metrics-card assembler (Phase 10, data-model §3c, FR-018).
// Shapes the four quick metric cards (weight, calories, streak, phase) for the dashboard.
// Each card is `null` when its source data is missing so the frontend renders a cold-start
// empty state without error; `streak` is always present (cold-start default `{ count: 0 }`).
// The controller injects already-resolved inputs — this module derives only the two simple
// signed deltas (weight delta vs. start, calories delta vs. target) and the `over` flag.
// No I/O, no clock, no globals.

// Round to one decimal to keep derived deltas free of binary-float noise.
function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {object} args
 * @param {{current_kg:number,start_kg:number}|null} [args.weight]    current vs. start weight
 * @param {{yesterday_kcal:number,target_kcal:number}|null} [args.calories]  intake vs. target
 * @param {{count:number}} [args.streak]                              completed-session streak
 * @param {{name:string,days_remaining:number}|null} [args.phase]     current training phase
 * @returns {{
 *   weight:{current_kg,start_kg,delta_kg}|null,
 *   calories:{yesterday_kcal,target_kcal,delta_kcal,over:boolean}|null,
 *   streak:{count:number},
 *   phase:{name,days_remaining}|null
 * }}
 */
export function build({ weight, calories, streak, phase } = {}) {
  return {
    weight: weight
      ? {
          current_kg: weight.current_kg,
          start_kg: weight.start_kg,
          delta_kg: round1(weight.current_kg - weight.start_kg),
        }
      : null,
    calories: calories
      ? {
          yesterday_kcal: calories.yesterday_kcal,
          target_kcal: calories.target_kcal,
          delta_kcal: calories.yesterday_kcal - calories.target_kcal,
          over: calories.yesterday_kcal > calories.target_kcal,
        }
      : null,
    streak: { count: streak?.count ?? 0 },
    phase: phase ? { name: phase.name, days_remaining: phase.days_remaining } : null,
  };
}
