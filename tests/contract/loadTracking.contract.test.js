import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 5 (T010/T020/T027) — contract for /api/v1/load-tracking/*. Read-only, so
// the shapes hold even with no history (empty states). Skips when .env missing
// or Supabase unreachable.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[loadTracking.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('one_rep_max_records').select('id').limit(1);
  if (probe.error) {
    console.warn('[loadTracking.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: /api/v1/load-tracking', () => {
  it('overview returns the OverviewView shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/load-tracking/overview');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.exercises)).toBe(true);
    expect(Array.isArray(res.body.data.deload_notices)).toBe(true);
    expect(typeof res.body.data.empty).toBe('boolean');
    if (res.body.data.exercises.length) {
      const row = res.body.data.exercises[0];
      for (const k of ['exercise_id', 'name', 'is_active', 'status']) {
        expect(row).toHaveProperty(k);
      }
      expect(['ready_to_increase', 'maintain', 'stagnation', 'regressing']).toContain(row.status);
    }
  });

  it('exercise detail returns the ExerciseProgressView shape (404 on bad id)', async () => {
    if (!live) return;
    const { data: ex } = await supabase
      .from('exercises')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ex) {
      const res = await request(app).get(`/api/v1/load-tracking/exercises/${ex.id}`);
      expect(res.status).toBe(200);
      for (const k of [
        'exercise_id',
        'load_series',
        'volume_series',
        'recent_sessions',
        'projection',
      ]) {
        expect(res.body.data).toHaveProperty(k);
      }
      expect(Array.isArray(res.body.data.load_series)).toBe(true);
    }
    const bad = await request(app).get('/api/v1/load-tracking/exercises/99999999');
    expect(bad.status).toBe(404);
  });

  it('phase-comparison returns the PhaseRadarView shape', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/load-tracking/phase-comparison');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.muscle_groups)).toBe(true);
    expect(Array.isArray(res.body.data.phases)).toBe(true);
    expect(typeof res.body.data.empty).toBe('boolean');
  });
});
