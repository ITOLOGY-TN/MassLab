import { describe, it, expect } from 'vitest';
import { validate, ConfigError, SECRET_KEYS, FORBIDDEN_LEGACY_KEYS } from '../../config/schema.js';

const valid = {
  SINGLE_USER_MODE: 'true',
  PORT: '3000',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_dev_only_dummy',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dev_only_dummy',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('config schema', () => {
  it('accepts a valid configuration', () => {
    const out = validate(valid);
    expect(out.SINGLE_USER_MODE).toBe(true);
    expect(out.PORT).toBe(3000);
  });

  it('rejects the legacy SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(() =>
      validate({ ...valid, SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y' }),
    ).toThrow(ConfigError);
  });

  it('rejects the legacy SUPABASE_ANON_KEY', () => {
    expect(() => validate({ ...valid, SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.x.y' })).toThrow(
      ConfigError,
    );
  });

  it.each([
    'SINGLE_USER_MODE',
    'PORT',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'CORS_ORIGIN',
  ])('fails fast when %s is missing', (key) => {
    const broken = { ...valid };
    delete broken[key];
    try {
      validate(broken);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.missingKey).toBe(key);
    }
  });

  it('rejects malformed key prefixes', () => {
    expect(() => validate({ ...valid, SUPABASE_SECRET_KEY: 'service_role_xxx' })).toThrow(
      /must start with "sb_secret_"/,
    );
    expect(() => validate({ ...valid, SUPABASE_PUBLISHABLE_KEY: 'anon_xxx' })).toThrow(
      /must start with "sb_publishable_"/,
    );
  });

  it('marks SUPABASE_SECRET_KEY as a redactable secret', () => {
    expect(SECRET_KEYS).toContain('SUPABASE_SECRET_KEY');
    expect(SECRET_KEYS).not.toContain('SUPABASE_PUBLISHABLE_KEY');
  });

  it('exposes the forbidden legacy keys for tooling', () => {
    expect(FORBIDDEN_LEGACY_KEYS).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);
  });

  // Phase 3 — exercise media config (T002).
  describe('exercise media keys', () => {
    it('applies documented defaults when the keys are absent', () => {
      const out = validate(valid);
      expect(out.EXERCISE_MEDIA_MAX_BYTES).toBe(26214400);
      expect(out.EXERCISE_MEDIA_IMAGE_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      expect(out.EXERCISE_MEDIA_VIDEO_TYPES).toEqual(['video/mp4', 'video/webm']);
      expect(out.YOUTUBE_EMBED_HOST).toBe('https://www.youtube-nocookie.com');
    });

    it('parses a comma-separated MIME allowlist into a trimmed, de-duped array', () => {
      const out = validate({
        ...valid,
        EXERCISE_MEDIA_IMAGE_TYPES: 'image/jpeg, image/png , image/jpeg',
      });
      expect(out.EXERCISE_MEDIA_IMAGE_TYPES).toEqual(['image/jpeg', 'image/png']);
    });

    it('coerces EXERCISE_MEDIA_MAX_BYTES from a string', () => {
      const out = validate({ ...valid, EXERCISE_MEDIA_MAX_BYTES: '1048576' });
      expect(out.EXERCISE_MEDIA_MAX_BYTES).toBe(1048576);
    });

    it('rejects a non-integer EXERCISE_MEDIA_MAX_BYTES', () => {
      expect(() => validate({ ...valid, EXERCISE_MEDIA_MAX_BYTES: '10mb' })).toThrow(ConfigError);
    });
  });
});
