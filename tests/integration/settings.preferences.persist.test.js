// Phase 2 US4 (T052): preferences round-trip + notification_acks deep merge.
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
      console.warn('[preferences.persist] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const probe = await getSupabase(config).from('app_config').select('athlete_id').limit(1);
  if (probe.error) {
    console.warn('[preferences.persist] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US4 — preferences round-trip', () => {
  it('PATCH theme persists, GET returns the new value', async () => {
    if (!live) return;
    await request(app).patch('/api/v1/me/preferences').send({ theme: 'light' });
    const res = await request(app).get('/api/v1/me/preferences');
    expect(res.status).toBe(200);
    expect(res.body.data.theme).toBe('light');
    // restore
    await request(app).patch('/api/v1/me/preferences').send({ theme: 'dark' });
  });

  it('notification_acks deep-merges: setting one key keeps the others', async () => {
    if (!live) return;
    await request(app)
      .patch('/api/v1/me/preferences')
      .send({ notification_acks: { foo: '2026-05-08T08:00:00Z' } });
    await request(app)
      .patch('/api/v1/me/preferences')
      .send({ notification_acks: { bar: '2026-05-08T09:00:00Z' } });
    const res = await request(app).get('/api/v1/me/preferences');
    expect(res.body.data.notification_acks.foo).toBeTruthy();
    expect(res.body.data.notification_acks.bar).toBeTruthy();
    // null clears a single key
    await request(app)
      .patch('/api/v1/me/preferences')
      .send({ notification_acks: { foo: null } });
    const after = await request(app).get('/api/v1/me/preferences');
    expect(after.body.data.notification_acks.foo).toBeUndefined();
    expect(after.body.data.notification_acks.bar).toBeTruthy();
    // cleanup
    await request(app)
      .patch('/api/v1/me/preferences')
      .send({ notification_acks: { bar: null } });
  });
});
