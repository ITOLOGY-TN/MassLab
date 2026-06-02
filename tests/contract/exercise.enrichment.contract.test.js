import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// T042 — exercise media + alternatives contract. Confirms the Phase 3 openapi
// documents the enrichment paths, and (live) that responses match the shapes.
const here = path.dirname(fileURLToPath(import.meta.url));
const openapi = yaml.load(
  readFileSync(
    path.join(here, '..', '..', 'specs', '006-training-program-library', 'contracts', 'openapi.yaml'),
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
      console.warn('[exercise.enrichment.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[exercise.enrichment.contract] skipped — Supabase unreachable');
    return;
  }
  const { error: tblErr } = await supabase.from('exercise_alternatives').select('id').limit(1);
  if (!tblErr) {
    app = buildApp({ config });
    live = true;
  } else {
    console.warn('[exercise.enrichment.contract] live skipped — migration not applied');
  }
});

describe('contract — exercise enrichment paths', () => {
  it('documents media + alternatives paths in the openapi', () => {
    const paths = Object.keys(openapi.paths);
    expect(paths).toContain('/exercises/{id}/media/image');
    expect(paths).toContain('/exercises/{id}/media/video');
    expect(paths).toContain('/exercises/{id}/alternatives');
    expect(paths).toContain('/exercises/{id}/alternatives/{alternativeId}');
  });

  it('returns documented shapes for alternatives + media (live)', async () => {
    if (!live) {
      console.warn('[exercise.enrichment.contract] skipping live assertions');
      return;
    }
    const ex = (await request(app).get('/api/v1/exercises')).body.data;
    if (!Array.isArray(ex) || ex.length < 2) {
      console.warn('[exercise.enrichment.contract] skipping — need >= 2 exercises');
      return;
    }
    const a = ex[0].id;
    const b = ex[1].id;
    try {
      const add = await request(app)
        .post(`/api/v1/exercises/${a}/alternatives`)
        .send({ alternative_exercise_id: b });
      expect(add.status).toBe(201);
      expect(add.body.data).toMatchObject({
        exercise_id: b,
        name: expect.any(String),
        is_active: expect.any(Boolean),
      });

      const yt = await request(app)
        .post(`/api/v1/exercises/${a}/media/video`)
        .send({ video_url: 'https://youtu.be/rT7DgCr-3pg' });
      expect(yt.status).toBe(200);
      expect(yt.body.data).toHaveProperty('image_url');
      expect(yt.body.data.video).toMatchObject({ kind: 'youtube' });
    } finally {
      await request(app).delete(`/api/v1/exercises/${a}/alternatives/${b}`);
      await request(app).delete(`/api/v1/exercises/${a}/media/video`);
    }
  });
});
