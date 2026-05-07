import { loadFromDotenv } from './dotenvAdapter.js';
import { validate, SECRET_KEYS } from './schema.js';

export { ConfigError } from './schema.js';

/**
 * Load and freeze configuration via the supplied adapter.
 * @param {() => Record<string, string>} [adapter]
 */
export function loadConfig(adapter = loadFromDotenv) {
  const raw = adapter();
  const parsed = validate(raw);
  return Object.freeze(parsed);
}

export function isSecretKey(name) {
  return SECRET_KEYS.includes(name);
}
