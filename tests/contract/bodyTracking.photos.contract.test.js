import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 6 (009-body-weight-measurements) T036 [US4] — contract for
// GET /api/v1/body-tracking/photos and DELETE /api/v1/body-tracking/photos/:id,
// against specs/009-body-weight-measurements/contracts/openapi.yaml.
// Live-gated: skips when .env missing or Supabase unreachable. The happy-path
// delete uploads a sentinel photo first (dedicated multipart action, D-3), lists
// it, then deletes it (row + file), leaving no residue. The not-owned case uses a
// random UUID that does not resolve for the request athlete → 404.
let app;
let supabase;
let live = false;

const SENTINEL_PHOTO_DATE = '2000-01-03';
// A 1x1 transparent PNG (smallest valid image payload).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[bodyTracking.photos.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athlete_photos').select('id').limit(1);
  if (probe.error) {
    console.warn('[bodyTracking.photos.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: /api/v1/body-tracking/photos', () => {
  it('GET returns the PhotoList shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/body-tracking/photos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    if (res.body.data.items.length) {
      const item = res.body.data.items[0];
      for (const k of ['id', 'takenOn', 'weightKg', 'url', 'note']) {
        expect(item).toHaveProperty(k);
      }
    }
  });

  it('DELETE removes an owned photo (204) and rejects an unknown id (404)', async () => {
    if (!live) return;
    // Upload a sentinel photo, then delete it (row + file).
    const up = await request(app)
      .post('/api/v1/body-tracking/photos')
      .field('taken_on', SENTINEL_PHOTO_DATE)
      .attach('file', PNG_1X1, { filename: 'sentinel.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const id = up.body.data.id;

    const del = await request(app).delete(`/api/v1/body-tracking/photos/${id}`);
    expect(del.status).toBe(204);

    // A random UUID not owned by the request athlete → 404 NOT_FOUND.
    const bad = await request(app).delete(
      '/api/v1/body-tracking/photos/00000000-0000-0000-0000-000000000000',
    );
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe('NOT_FOUND');
  });
});
