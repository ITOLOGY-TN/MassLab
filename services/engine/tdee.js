// Pure function — Total Daily Energy Expenditure from BMR + activity factor.
import { DEFAULTS } from './constants.js';

export function tdee({ bmr_kcal, activity_level, constants = DEFAULTS }) {
  const factor = constants.activity_factors?.[activity_level];
  if (factor == null) {
    throw new Error(`unknown activity_level: "${activity_level}"`);
  }
  return Math.round(bmr_kcal * factor);
}
