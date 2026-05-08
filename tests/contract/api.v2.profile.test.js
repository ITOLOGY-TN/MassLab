// Phase 2 contract surface for /me (T011).
// Keys off specs/003-phase2-settings-data/contracts/openapi.yaml.
// Skipped automatically when .env / Supabase are unavailable, matching the
// Phase 0 contract test's pattern.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const openapi = yaml.load(
  readFileSync(
    path.join(here, '..', '..', 'specs', '003-phase2-settings-data', 'contracts', 'openapi.yaml'),
    'utf8',
  ),
);

let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[contract.v2] skipped — .env not configured:', err.message);
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[contract.v2] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('Phase 2 contract — /me profile surface', () => {
  it('OpenAPI declares both /me and /me PATCH', () => {
    expect(openapi.paths).toHaveProperty('/me');
    expect(openapi.paths['/me']).toHaveProperty('get');
    expect(openapi.paths['/me']).toHaveProperty('patch');
  });

  it('GET /api/v1/me returns the canonical { data } envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(typeof res.body.data).toBe('object');
    // Phase 0 columns we expect to be present on the seeded athlete.
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('display_name');
  });

  it('PATCH /api/v1/me accepts the contract aliases and returns recompute summary', async () => {
    if (!live) return;
    const before = await request(app).get('/api/v1/me');
    expect(before.status).toBe(200);
    const startWeight = before.body.data.starting_weight_kg ?? before.body.data.weight_kg ?? 75;
    const next = Number(startWeight) + 0.1;

    const res = await request(app).patch('/api/v1/me').send({ current_weight_kg: next });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('profile');
    expect(res.body.data).toHaveProperty('recompute');
    expect(res.body.data.recompute).toHaveProperty('calculation_audit_id');
    expect(res.body.data.recompute).toHaveProperty('engine_version');
  });

  it('PATCH /api/v1/me rejects invalid bodies with VALIDATION_FAILED', async () => {
    if (!live) return;
    const res = await request(app).patch('/api/v1/me').send({ age: 200 });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION_FAILED');
  });
});
