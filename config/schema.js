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

const floatFromString = (label) =>
  z
    .union([
      z.number(),
      z.string().regex(/^-?\d+(\.\d+)?$/, `${label} must be a number`),
    ])
    .transform((v) => (typeof v === 'number' ? v : Number.parseFloat(v)));

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
  // Phase 6 (body progress photos). Size cap mirrors the import limit (25 MiB).
  BODY_PHOTO_MAX_BYTES: intFromString('BODY_PHOTO_MAX_BYTES').default(26214400),
  // Comma-separated MIME allowlist for progress photos (no video).
  BODY_PHOTO_IMAGE_TYPES: csvList.default('image/jpeg,image/png,image/webp'),
  // Phase 7 (nutrition & calories). Daily hydration goal (mL); must be > 0.
  HYDRATION_GOAL_ML: intFromString('HYDRATION_GOAL_ML')
    .default(3000)
    .refine((n) => n > 0, 'HYDRATION_GOAL_ML must be > 0'),
  // Rolling window (days) for nutrition trends; must be > 0.
  NUTRITION_TREND_DAYS: intFromString('NUTRITION_TREND_DAYS')
    .default(30)
    .refine((n) => n > 0, 'NUTRITION_TREND_DAYS must be > 0'),
  // Locale for nutrition number/date formatting.
  NUTRITION_LOCALE: z.string().min(1).default('fr-FR'),
  // Phase 8 (supplements). The supplement whose streak is shown most prominently
  // (the "most critical" supplement is athlete/program data, not a code literal).
  SUPPLEMENT_PRIMARY_SLUG: z.string().min(1).default('creatine-monohydrate'),
  // Rolling window (weeks) for the supplement self-assessment trend; must be > 0.
  SUPPLEMENT_ASSESSMENT_TREND_WEEKS: intFromString('SUPPLEMENT_ASSESSMENT_TREND_WEEKS')
    .default(12)
    .refine((n) => n > 0, 'SUPPLEMENT_ASSESSMENT_TREND_WEEKS must be > 0'),
  // Phase 9 (recovery & well-being). Rolling window (days) for the energy/stress/sleep
  // overlay; must be > 0.
  RECOVERY_TREND_DAYS: intFromString('RECOVERY_TREND_DAYS')
    .default(30)
    .refine((n) => n > 0, 'RECOVERY_TREND_DAYS must be > 0'),
  // Stress ≥ this counts as "high" (0–10).
  RECOVERY_STRESS_HIGH: intFromString('RECOVERY_STRESS_HIGH')
    .default(7)
    .refine((n) => n >= 0 && n <= 10, 'RECOVERY_STRESS_HIGH must be between 0 and 10'),
  // Consecutive high-stress days that trigger the cortisol warning; must be > 0.
  RECOVERY_STRESS_HIGH_DAYS: intFromString('RECOVERY_STRESS_HIGH_DAYS')
    .default(3)
    .refine((n) => n > 0, 'RECOVERY_STRESS_HIGH_DAYS must be > 0'),
  // Average sleep ≤ this is "low"; must be > 0.
  RECOVERY_SLEEP_LOW_HOURS: intFromString('RECOVERY_SLEEP_LOW_HOURS')
    .default(6)
    .refine((n) => n > 0, 'RECOVERY_SLEEP_LOW_HOURS must be > 0'),
  // Average energy ≤ this is "low" (0–10).
  RECOVERY_ENERGY_LOW: intFromString('RECOVERY_ENERGY_LOW')
    .default(4)
    .refine((n) => n >= 0 && n <= 10, 'RECOVERY_ENERGY_LOW must be between 0 and 10'),
  // Window (days) for the reduce-volume averages; must be > 0.
  RECOVERY_LOW_WINDOW_DAYS: intFromString('RECOVERY_LOW_WINDOW_DAYS')
    .default(3)
    .refine((n) => n > 0, 'RECOVERY_LOW_WINDOW_DAYS must be > 0'),
  // Poor-signal count in a day that triggers full-rest; must be > 0.
  RECOVERY_REST_SIGNALS: intFromString('RECOVERY_REST_SIGNALS')
    .default(3)
    .refine((n) => n > 0, 'RECOVERY_REST_SIGNALS must be > 0'),
  // Sore-zone count in a day that triggers full-rest; must be > 0.
  RECOVERY_SORE_ZONES_REST: intFromString('RECOVERY_SORE_ZONES_REST')
    .default(4)
    .refine((n) => n > 0, 'RECOVERY_SORE_ZONES_REST must be > 0'),
  // Allowed mood keys (UI maps to emoji + localized label).
  RECOVERY_MOOD_OPTIONS: csvList.default('great,good,ok,low,bad'),
  // Allowed body-diagram zones for soreness.
  RECOVERY_SORE_ZONES: csvList.default(
    'neck,shoulders,chest,upper_back,lower_back,biceps,triceps,forearms,abs,glutes,quads,hamstrings,calves',
  ),
  // Phase 10 (dashboard). Days without a finished session before the "no recent
  // session" nudge shows; must be > 0.
  DASHBOARD_NO_SESSION_DAYS: intFromString('DASHBOARD_NO_SESSION_DAYS')
    .default(2)
    .refine((n) => n > 0, 'DASHBOARD_NO_SESSION_DAYS must be > 0'),
  // Fraction of the kcal target below which the day reads as a deficit; (0, 1].
  DASHBOARD_CALORIE_DEFICIT_PCT: floatFromString('DASHBOARD_CALORIE_DEFICIT_PCT')
    .default(0.9)
    .refine(
      (n) => n > 0 && n <= 1,
      'DASHBOARD_CALORIE_DEFICIT_PCT must be > 0 and <= 1',
    ),
  // Window (days) for the weight sparkline; must be > 0.
  DASHBOARD_WEIGHT_SPARKLINE_DAYS: intFromString('DASHBOARD_WEIGHT_SPARKLINE_DAYS')
    .default(30)
    .refine((n) => n > 0, 'DASHBOARD_WEIGHT_SPARKLINE_DAYS must be > 0'),
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
