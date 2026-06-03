import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 8 (011-phase8-supplements) T033 — contract for the weekly self-assessment.
// GET shape + PUT rejection path only (the successful upsert lifecycle lives in the
// integration suite with snapshot/restore). Live-gated on the supplement_weekly_assessment
// migration.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[supplementsAssessment.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[supplementsAssessment.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('supplement_weekly_assessment').select('id').limit(1);
  if (mig.error) {
    console.warn('[supplementsAssessment.contract] skipped — Phase 8 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: supplements weekly self-assessment', () => {
  it('GET /supplements/assessments returns the AssessmentBundle envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/supplements/assessments');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data).toHaveProperty('current'); // object or null
    expect(typeof data.editable).toBe('boolean');
    expect(Array.isArray(data.trend)).toBe(true);
    for (const t of data.trend) {
      for (const k of ['week_start', 'energy', 'recovery', 'sleep_quality', 'strength']) {
        expect(t).toHaveProperty(k);
      }
    }
  });

  it('PUT /supplements/assessment with a rating outside 1–5 → 400', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/supplements/assessment')
      .send({ energy: 6, recovery: 3, sleep_quality: 3, strength: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PUT /supplements/assessment with a missing dimension → 400', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/supplements/assessment')
      .send({ energy: 3, recovery: 3, sleep_quality: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});
