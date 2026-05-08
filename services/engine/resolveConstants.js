import { DEFAULTS, OVERRIDE_KEYS } from './constants.js';

const OBJECT_VALUED_KEYS = new Set([
  'activity_factors',
  'default_body_fat_pct',
  'morphotype_carb_skew',
  'ranges',
]);

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const v of Object.values(obj)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}

/**
 * Merge per-athlete `app_config.engine_overrides` onto DEFAULTS.
 * Unknown keys are dropped. Object-valued keys are shallow-merged with their default.
 * Returns a deep-frozen object.
 */
export function resolveConstants(override = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(override)) {
    if (!OVERRIDE_KEYS.includes(key)) continue;
    const value = override[key];
    if (OBJECT_VALUED_KEYS.has(key) && value && typeof value === 'object') {
      out[key] = { ...DEFAULTS[key], ...value };
    } else {
      out[key] = value;
    }
  }
  return deepFreeze(out);
}
