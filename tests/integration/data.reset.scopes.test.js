// Phase 2 US7 (T091): reset scopes — token mismatch + module-specific.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[data.reset] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const probe = await getSupabase(config).from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[data.reset] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US7 — /data/reset', () => {
  it('returns RESET_TOKEN_MISMATCH when the token is wrong', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/data/reset')
      .send({ module: 'calculator_results', confirm_token: 'WRONG' });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('RESET_TOKEN_MISMATCH');
  });

  it('returns VALIDATION_FAILED when module is unknown', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/data/reset')
      .send({ module: 'not-a-module', confirm_token: 'RESET-MASSLAB' });
    expect(res.status).toBe(400);
  });

  it('module=preferences resets app_config to defaults', async () => {
    if (!live) return;
    // Mutate first.
    await request(app).patch('/api/v1/me/preferences').send({ theme: 'light' });
    const res = await request(app)
      .post('/api/v1/data/reset')
      .send({ module: 'preferences', confirm_token: 'RESET-MASSLAB' });
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/v1/me/preferences');
    expect(after.body.data.theme).toBe('dark');
  });
});
