// Pure function — 1RM via four standard formulas + percentage table (FR-007..FR-009).
import { DEFAULTS } from './constants.js';

function epley(w, r) {
  return r === 1 ? w : w * (1 + r / 30);
}
function brzycki(w, r) {
  return r === 1 ? w : (w * 36) / (37 - r);
}
function lander(w, r) {
  return r === 1 ? w : (100 * w) / (101.3 - 2.67123 * r);
}
function lombardi(w, r) {
  return w * Math.pow(r, 0.1);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function oneRepMax({ weight_kg, reps, constants = DEFAULTS }) {
  if (!(weight_kg > 0) || !(reps > 0)) {
    throw new Error('weight_kg and reps must be positive numbers');
  }
  const epley_kg = round1(epley(weight_kg, reps));
  const brzycki_kg = round1(brzycki(weight_kg, reps));
  const lander_kg = round1(lander(weight_kg, reps));
  const lombardi_kg = round1(lombardi(weight_kg, reps));
  const primary_estimate_kg = round1((epley_kg + brzycki_kg + lander_kg + lombardi_kg) / 4);

  const reduced_confidence = reps > constants.one_rep_max_reduced_confidence_reps;

  const percentage_table = constants.percentage_table_default.map(
    ({ pct, reps_low, reps_high }) => ({
      pct,
      load_kg: round1((pct / 100) * primary_estimate_kg),
      reps_low,
      reps_high,
    }),
  );

  return {
    primary_estimate_kg,
    epley_kg,
    brzycki_kg,
    lander_kg,
    lombardi_kg,
    reduced_confidence,
    percentage_table,
  };
}
