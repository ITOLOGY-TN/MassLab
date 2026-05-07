import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { validate, ConfigError } from '../../config/schema.js';
import { _resetSupabaseCache, getSupabase } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

const baseEnv = {
  SINGLE_USER_MODE: 'true',
  PORT: '3000',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  CORS_ORIGIN: 'http://localhost:5173',
};

let live = false;
let supabase;

beforeAll(async () => {
  try {
    validate(baseEnv);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[auth.modeSwitch] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(validate(baseEnv));
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (!probe.error) live = true;
});

describe('US3 — flag flip changes auth without source edits', () => {
  it('returns 200 in single-user mode without an Authorization header', async () => {
    if (!live) return;
    const config = validate(baseEnv);
    const app = buildApp({ config, supabase, daos: undefined });
    const res = await request(app).get('/api/v1/athlete/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/i);
  });

  it('returns 401 in multi-user mode without an Authorization header', async () => {
    if (!live) return;
    const config = validate({ ...baseEnv, SINGLE_USER_MODE: 'false' });
    const app = buildApp({ config, supabase });
    const res = await request(app).get('/api/v1/athlete/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.request_id).toMatch(/[0-9a-f-]{36}/i);
  });
});
