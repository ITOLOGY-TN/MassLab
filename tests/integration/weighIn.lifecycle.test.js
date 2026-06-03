import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 6 (009-body-weight-measurements) T010 [US1] — weigh-in lifecycle against
// the live API:
//  - upsert one-per-day (FR-002);
//  - partial re-save MERGES (save weight+arm, re-save weight-only same date →
//    arm_cm retained, M1/FR-006);
//  - the 201 response carries body_composition + program_id (FR-007/U1 cascade);
//  - FR-003 (no value) and FR-005 (future date) rejections;
//  - photo upload → athlete_photos row + a file served from /static (FR-009);
//  - oversized upload (> BODY_PHOTO_MAX_BYTES) → 413 and non-image mimetype → 400
//    (SC-008/FR-010/S1).
// Live-gated: skips when .env missing or Supabase unreachable. Cleans up the
// sentinel rows + the uploaded photo file in afterAll.
let app;
let config;
let supabase;
let live = false;

const SENTINEL_DATE = '2000-01-03';
let uploadedPhotoId = null;
let testAthleteId = null;

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[weighIn.lifecycle] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('body_measurements').select('id').limit(1);
  if (probe.error) {
    console.warn('[weighIn.lifecycle] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
  await supabase.from('body_measurements').delete().eq('measured_on', SENTINEL_DATE);
});

afterAll(async () => {
  if (!live) return;
  if (uploadedPhotoId) {
    await request(app).delete(`/api/v1/body-tracking/photos/${uploadedPhotoId}`);
  }
  // Scope the cleanup to the test athlete when known, so a real row sharing the
  // sentinel date for another athlete can never be collaterally deleted.
  let del = supabase.from('body_measurements').delete().eq('measured_on', SENTINEL_DATE);
  if (testAthleteId) del = del.eq('athlete_id', testAthleteId);
  await del;
});

describe('weigh-in lifecycle (US1)', () => {
  it('saves a weigh-in and cascades to body_composition + program (FR-007)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: SENTINEL_DATE, weight_kg: 61.5, arm_cm: 38.5 });
    expect(res.status).toBe(201);
    expect(res.body.data.body_composition).toBeTruthy();
    expect(res.body.data.program_id).toBeTruthy();
    expect(res.body.data.measurement.arm_cm).toBe(38.5);
    testAthleteId = res.body.data.measurement.athlete_id;
  });

  it('partial re-save merges — weight-only re-save keeps the stored arm_cm (M1/FR-006)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: SENTINEL_DATE, weight_kg: 62 });
    expect(res.status).toBe(201);
    expect(res.body.data.measurement.weight_kg).toBe(62);
    // arm_cm was NOT in this payload, yet it must survive the merge.
    expect(res.body.data.measurement.arm_cm).toBe(38.5);

    // And there is still exactly one row for the day (one-per-day, FR-002).
    const { data } = await supabase
      .from('body_measurements')
      .select('id')
      .eq('measured_on', SENTINEL_DATE);
    expect(data.length).toBe(1);
  });

  it('rejects a value-less weigh-in (FR-003)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: SENTINEL_DATE, note: 'no numbers' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a future date with 400 VALIDATION_FAILED (FR-005)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-measurements')
      .send({ measured_on: '2999-12-31', weight_kg: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('uploads a progress photo → athlete_photos row + served file (FR-009)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-tracking/photos')
      .field('taken_on', SENTINEL_DATE)
      .field('weight_overlay_kg', '62')
      .attach('file', PNG, { filename: 'progress.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/static\//);
    expect(res.body.data.weightKg).toBe(62);
    uploadedPhotoId = res.body.data.id;

    const served = await request(app).get(res.body.data.url);
    expect(served.status).toBe(200);

    const { data } = await supabase.from('athlete_photos').select('id').eq('id', uploadedPhotoId);
    expect(data.length).toBe(1);
  });

  it('rejects a non-image mimetype with 400 (S1/FR-010)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/body-tracking/photos')
      .field('taken_on', SENTINEL_DATE)
      .attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an oversized upload with 413 (SC-008/FR-010)', async () => {
    if (!live) return;
    const tooBig = Buffer.alloc((config.BODY_PHOTO_MAX_BYTES ?? 26214400) + 1024, 0);
    const res = await request(app)
      .post('/api/v1/body-tracking/photos')
      .field('taken_on', SENTINEL_DATE)
      .attach('file', tooBig, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('MEDIA_TOO_LARGE');
  });
});
