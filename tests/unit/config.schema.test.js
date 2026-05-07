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

  it.each(['SINGLE_USER_MODE', 'PORT', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'CORS_ORIGIN'])(
    'fails fast when %s is missing',
    (key) => {
      const broken = { ...valid };
      delete broken[key];
      try {
        validate(broken);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect(err.missingKey).toBe(key);
      }
    },
  );

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
});
