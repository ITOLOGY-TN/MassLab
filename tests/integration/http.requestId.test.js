import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { validate, ConfigError } from '../../config/schema.js';
import { _resetSupabaseCache, getSupabase } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

const baseEnv = {
  SINGLE_USER_MODE: 'false',
  PORT: '3000',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  CORS_ORIGIN: 'http://localhost:5173',
};

let live = false;
let app;

beforeAll(async () => {
  let config;
  try {
    config = validate(baseEnv);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[http.requestId] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) return;
  app = buildApp({ config, supabase });
  live = true;
});

describe('FR-018 — every response carries X-Request-Id', () => {
  it('echoes a client-supplied UUID', async () => {
    if (!live) return;
    const id = '11111111-2222-3333-4444-555555555555';
    const res = await request(app).get('/api/v1/athlete/me').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('generates one when the client omits the header', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/athlete/me');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/i);
  });

  it('attaches the request id to the 401 envelope on unauthenticated requests', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/athlete/me');
    expect(res.status).toBe(401);
    expect(res.body.error.request_id).toBe(res.headers['x-request-id']);
  });
});
