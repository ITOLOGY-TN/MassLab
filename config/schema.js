import { z } from 'zod';

export class ConfigError extends Error {
  constructor(message, { missingKey, forbiddenKey, malformedKey } = {}) {
    super(message);
    this.name = 'ConfigError';
    this.missingKey = missingKey ?? null;
    this.forbiddenKey = forbiddenKey ?? null;
    this.malformedKey = malformedKey ?? null;
  }
}

export const FORBIDDEN_LEGACY_KEYS = Object.freeze([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
]);

export const REQUIRED_KEYS = Object.freeze([
  'SINGLE_USER_MODE',
  'PORT',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'CORS_ORIGIN',
]);

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const portFromString = z
  .union([z.number().int(), z.string().regex(/^\d+$/, 'PORT must be an integer')])
  .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)))
  .refine((n) => n > 0 && n < 65536, 'PORT must be between 1 and 65535');

const secretKey = z
  .string()
  .min(1, 'SUPABASE_SECRET_KEY is required')
  .refine(
    (v) => v.startsWith('sb_secret_'),
    'SUPABASE_SECRET_KEY must start with "sb_secret_" (legacy service_role keys are forbidden)',
  );

const publishableKey = z
  .string()
  .min(1, 'SUPABASE_PUBLISHABLE_KEY is required')
  .refine(
    (v) => v.startsWith('sb_publishable_'),
    'SUPABASE_PUBLISHABLE_KEY must start with "sb_publishable_" (legacy anon keys are forbidden)',
  );

export const baseSchema = z.object({
  SINGLE_USER_MODE: booleanFromString,
  PORT: portFromString,
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SECRET_KEY: secretKey,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
});

/** Keys whose values must be redacted from logs (FR-014, Constitution §III). */
export const SECRET_KEYS = Object.freeze(['SUPABASE_SECRET_KEY']);

/**
 * Validate a flat object against the schema, rejecting forbidden legacy keys
 * with a named ConfigError per FR-010 / SC-008.
 */
export function validate(raw) {
  for (const forbidden of FORBIDDEN_LEGACY_KEYS) {
    if (raw[forbidden] !== undefined && raw[forbidden] !== '') {
      throw new ConfigError(
        `Configuration key "${forbidden}" is forbidden. Use SUPABASE_SECRET_KEY (sb_secret_…) and SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) instead.`,
        { forbiddenKey: forbidden },
      );
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (raw[key] === undefined || raw[key] === '') {
      throw new ConfigError(
        `Required configuration key "${key}" is missing. Add it to your .env file (see .env.example).`,
        { missingKey: key },
      );
    }
  }

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join('.');
    throw new ConfigError(`Configuration value for "${path}" is invalid: ${issue.message}`, {
      malformedKey: path,
    });
  }
  return parsed.data;
}
