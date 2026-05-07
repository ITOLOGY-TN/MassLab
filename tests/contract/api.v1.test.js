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
    path.join(here, '..', '..', 'specs', '001-phase0-foundation', 'contracts', 'openapi.yaml'),
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
      console.warn('[contract] skipped — .env not configured:', err.message);
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[contract] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

const expectations = [
  ['/api/v1/athlete/me', 200, 'object'],
  ['/api/v1/exercises', 200, 'array'],
  ['/api/v1/weekly-plan', 200, 'array'],
  ['/api/v1/training-phases', 200, 'array'],
  ['/api/v1/nutrition/template', 200, 'array'],
  ['/api/v1/supplements', 200, 'array'],
  ['/api/v1/foods', 200, 'array'],
  ['/api/v1/quotes', 200, 'array'],
  ['/api/v1/quotes/today', 200, 'object'],
];

describe('OpenAPI contract — every documented path', () => {
  it('lists every documented path under /api/v1/', () => {
    const documented = Object.keys(openapi.paths).map((p) => `/api/v1${p}`);
    const tested = expectations.map(([p]) => p);
    for (const path of documented) expect(tested).toContain(path);
  });

  it.each(expectations)('GET %s returns %i with X-Request-Id', async (path, status, kind) => {
    if (!live) return;
    const res = await request(app).get(path);
    expect(res.status).toBe(status);
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/i);
    expect(res.body).toHaveProperty('data');
    if (kind === 'array') expect(Array.isArray(res.body.data)).toBe(true);
    else expect(typeof res.body.data).toBe('object');
  });
});
