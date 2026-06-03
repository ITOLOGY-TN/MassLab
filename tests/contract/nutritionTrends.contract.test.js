import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 7 (010-phase7-nutrition-calories) T048 — US4 contract for the trends surface:
// GET /nutrition/trends, driven against
// specs/010-phase7-nutrition-calories/contracts/openapi.yaml via Supertest.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 7
// nutrition_logs migration is not applied. Read-only — creates no rows.
let app;
let supabase;
let live = false;

// A sentinel past date unlikely to collide with real data (never in the future).
const SENTINEL_DATE = '2000-01-03';

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[nutritionTrends.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[nutritionTrends.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('nutrition_logs').select('id').limit(1);
  if (mig.error) {
    console.warn('[nutritionTrends.contract] skipped — Phase 7 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: nutrition trends surface', () => {
  it('GET /nutrition/trends returns the Trends envelope (low/no-data state holds)', async () => {
    if (!live) return;
    const res = await request(app).get(`/api/v1/nutrition/trends?date=${SENTINEL_DATE}`);
    expect(res.status).toBe(200);
    const { data } = res.body;

    // calories: { points: [{date, kcal}], goalKcal }
    expect(data).toHaveProperty('calories');
    expect(Array.isArray(data.calories.points)).toBe(true);
    for (const p of data.calories.points) {
      expect(p).toHaveProperty('date');
      expect(p).toHaveProperty('kcal');
      expect(typeof p.kcal).toBe('number');
    }
    expect(data.calories).toHaveProperty('goalKcal');
    if (data.calories.goalKcal !== null) {
      expect(typeof data.calories.goalKcal).toBe('number');
    }

    // macroBreakdown: { protein_g, carbs_g, fat_g, fractions: { protein, carbs, fat } }
    expect(data).toHaveProperty('macroBreakdown');
    for (const k of ['protein_g', 'carbs_g', 'fat_g']) {
      expect(data.macroBreakdown).toHaveProperty(k);
      expect(typeof data.macroBreakdown[k]).toBe('number');
    }
    expect(data.macroBreakdown).toHaveProperty('fractions');
    for (const k of ['protein', 'carbs', 'fat']) {
      expect(data.macroBreakdown.fractions).toHaveProperty(k);
      expect(typeof data.macroBreakdown.fractions[k]).toBe('number');
    }

    // weeklyProtein: [{ weekStart, avgProteinG }]
    expect(Array.isArray(data.weeklyProtein)).toBe(true);
    for (const w of data.weeklyProtein) {
      expect(w).toHaveProperty('weekStart');
      expect(w).toHaveProperty('avgProteinG');
      expect(typeof w.avgProteinG).toBe('number');
    }
  });

  it('GET /nutrition/trends with no date param defaults to today → 200', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/nutrition/trends');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('calories');
    expect(res.body.data).toHaveProperty('macroBreakdown');
    expect(res.body.data).toHaveProperty('weeklyProtein');
  });
});
