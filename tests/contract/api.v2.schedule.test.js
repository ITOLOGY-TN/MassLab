// Phase 2 US2 (T026): contract tests for the schedule + muscle-groups surface.
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
      console.warn('[contract.v2.schedule] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('muscle_groups').select('id').limit(1);
  if (error) {
    console.warn('[contract.v2.schedule] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('Phase 2 contract — schedule + muscle-groups paths', () => {
  it('OpenAPI declares every Phase 2 schedule + muscle-groups path', () => {
    for (const p of [
      '/me/schedule',
      '/me/schedule/slots/{slotId}/exercises/reorder',
      '/muscle-groups',
      '/muscle-groups/{id}',
      '/muscle-groups/{id}/merge',
    ]) {
      expect(openapi.paths).toHaveProperty(p);
    }
  });

  it('GET /api/v1/me/schedule returns the schedule envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/me/schedule');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('active_days');
    expect(Array.isArray(res.body.data.slots)).toBe(true);
    if (res.body.data.slots.length) {
      const slot = res.body.data.slots[0];
      expect(slot).toHaveProperty('day_of_week');
      expect(slot).toHaveProperty('muscle_group_id');
    }
  });

  it('GET /api/v1/muscle-groups returns the catalogue', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/muscle-groups');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/v1/muscle-groups creates and DELETE removes', async () => {
    if (!live) return;
    const created = await request(app)
      .post('/api/v1/muscle-groups')
      .send({ name: `Test ${Date.now()}`, display_color: '#abcdef' });
    expect(created.status).toBe(201);
    expect(created.body.data).toHaveProperty('id');
    const removed = await request(app).delete(`/api/v1/muscle-groups/${created.body.data.id}`);
    expect(removed.status).toBe(204);
  });
});
