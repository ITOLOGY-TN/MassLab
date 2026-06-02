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

const intFromString = (label) =>
  z
    .union([z.number().int(), z.string().regex(/^\d+$/, `${label} must be an integer`)])
    .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)));

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

// Comma-separated string → trimmed, de-duped, non-empty array. Also accepts an
// already-parsed array (e.g. when config is built programmatically in tests).
const csvList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .transform((arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))])
  .refine((arr) => arr.length > 0, 'must list at least one value');

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
  BACKUP_SCHEMA_VERSION: intFromString('BACKUP_SCHEMA_VERSION').default(1),
  IMPORT_MAX_BYTES: intFromString('IMPORT_MAX_BYTES').default(26214400),
  CSV_SEPARATOR: z.string().min(1).max(2).default(','),
  RESET_CONFIRM_TOKEN: z.string().min(1).default('RESET-MASSLAB'),
  // Phase 3 (exercise media). Size cap mirrors the import limit (25 MiB).
  EXERCISE_MEDIA_MAX_BYTES: intFromString('EXERCISE_MEDIA_MAX_BYTES').default(26214400),
  // Comma-separated MIME allowlists; parsed to a trimmed, non-empty array.
  EXERCISE_MEDIA_IMAGE_TYPES: csvList.default('image/jpeg,image/png,image/webp'),
  EXERCISE_MEDIA_VIDEO_TYPES: csvList.default('video/mp4,video/webm'),
  // Privacy-enhanced YouTube embed host (no SDK, no cookies, no key).
  YOUTUBE_EMBED_HOST: z.string().url().default('https://www.youtube-nocookie.com'),
  // Filesystem root for the default photo/media storage adapter.
  PHOTO_STORAGE_ROOT: z.string().min(1).default('data/photos'),
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
