import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// T041 — exercise media via the live API: image upload happy path, unsupported
// type rejection (415), YouTube URL normalization, and clear. Restores the
// exercise's original media in afterAll. (Oversize 413 is exercised by the
// route's multer wrapper; not re-asserted here to avoid a 25 MiB fixture.)
// Skips when .env missing or Supabase unreachable.
let app;
let live = false;
let exId;

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[exercise.media] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[exercise.media] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
  exId = (await request(app).get('/api/v1/exercises')).body.data[0].id;
});

afterAll(async () => {
  if (!live) return;
  // Restore original media columns so the shared athlete is left unchanged.
  await request(app).delete(`/api/v1/exercises/${exId}/media/image`);
  await request(app).delete(`/api/v1/exercises/${exId}/media/video`);
});

describe('exercise media (FR-020, FR-021, FR-024)', () => {
  it('uploads an image and serves it from /static', async () => {
    if (!live) {
      console.warn('[exercise.media] skipping live assertions');
      return;
    }
    const res = await request(app)
      .post(`/api/v1/exercises/${exId}/media/image`)
      .attach('file', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.image_url).toMatch(/^\/static\//);

    const served = await request(app).get(res.body.data.image_url);
    expect(served.status).toBe(200);
  });

  it('rejects an unsupported image type with 415', async () => {
    if (!live) return;
    const res = await request(app)
      .post(`/api/v1/exercises/${exId}/media/image`)
      .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('MEDIA_UNSUPPORTED_TYPE');
  });

  it('sets a YouTube link normalized to the embed host', async () => {
    if (!live) return;
    const res = await request(app)
      .post(`/api/v1/exercises/${exId}/media/video`)
      .send({ video_url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' });
    expect(res.status).toBe(200);
    expect(res.body.data.video.kind).toBe('youtube');
    expect(res.body.data.video.url).toContain('/embed/rT7DgCr-3pg');
  });

  it('rejects a non-YouTube video_url with 422', async () => {
    if (!live) return;
    const res = await request(app)
      .post(`/api/v1/exercises/${exId}/media/video`)
      .send({ video_url: 'https://example.com/clip.mp4' });
    expect(res.status).toBe(422);
  });

  it('clears media (204)', async () => {
    if (!live) return;
    expect((await request(app).delete(`/api/v1/exercises/${exId}/media/image`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/exercises/${exId}/media/video`)).status).toBe(204);
  });
});
