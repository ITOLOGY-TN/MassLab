// Phase 2 US5 (T068/T069): export integration tests against the cloud athlete.
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
      console.warn('[data.export] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const probe = await getSupabase(config).from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[data.export] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US5 — JSON + CSV export', () => {
  it('POST /data/export/json returns the v1 envelope', async () => {
    if (!live) return;
    const res = await request(app).post('/api/v1/data/export/json');
    expect(res.status).toBe(200);
    expect(res.body.data._export.schema_version).toBe(1);
    expect(res.body.data._export.engine_version).toBeDefined();
    for (const k of [
      'athletes',
      'app_config',
      'exercises',
      'muscle_groups',
      'weekly_plan_slots',
      'weekly_plan_exercises',
    ]) {
      expect(res.body.data).toHaveProperty(k);
    }
    // Secret stripping.
    for (const a of res.body.data.athletes) {
      expect(a).not.toHaveProperty('auth_user_id');
    }
  });

  it('GET /data/export/sessions.csv returns header-only CSV when no sessions', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/data/export/sessions.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\n').filter(Boolean);
    expect(lines[0]).toMatch(/session_id,started_at/);
  });
});
