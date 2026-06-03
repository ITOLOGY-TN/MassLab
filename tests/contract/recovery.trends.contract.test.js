import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T029 — US3 contract for the trends surface:
// GET /recovery/trends, driven against
// specs/012-phase9-recovery-wellbeing/contracts/openapi.yaml via Supertest.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 9
// recovery_log column migration is not applied (probe-and-skip on
// recovery_log.sleep_quality — Phase 7/8 pattern). Read-only — creates no rows.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.trends.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[recovery.trends.contract] skipped — Supabase unreachable');
    return;
  }
  // Probe the new Phase 9 column; absent → migration unapplied, skip.
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.trends.contract] skipped — Phase 9 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: recovery trends surface', () => {
  it('GET /recovery/trends returns the TrendsView envelope (heatmap, scatter, overlap)', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/trends');
    expect(res.status).toBe(200);
    const { data } = res.body;

    // heatmap: { year, month, cells: [{ date, energy|null }] }
    expect(data).toHaveProperty('heatmap');
    expect(typeof data.heatmap.year).toBe('number');
    expect(typeof data.heatmap.month).toBe('number');
    expect(data.heatmap.month).toBeGreaterThanOrEqual(1);
    expect(data.heatmap.month).toBeLessThanOrEqual(12);
    expect(Array.isArray(data.heatmap.cells)).toBe(true);
    for (const cell of data.heatmap.cells) {
      expect(cell).toHaveProperty('date');
      expect(typeof cell.date).toBe('string');
      expect(cell).toHaveProperty('energy');
      if (cell.energy !== null) {
        expect(typeof cell.energy).toBe('number');
        expect(cell.energy).toBeGreaterThanOrEqual(0);
        expect(cell.energy).toBeLessThanOrEqual(10);
      }
    }

    // scatter: { has_data, points: [{ date, sleep_hours, volume_kg }] }
    expect(data).toHaveProperty('scatter');
    expect(typeof data.scatter.has_data).toBe('boolean');
    expect(Array.isArray(data.scatter.points)).toBe(true);
    for (const p of data.scatter.points) {
      expect(p).toHaveProperty('date');
      expect(typeof p.sleep_hours).toBe('number');
      expect(typeof p.volume_kg).toBe('number');
    }

    // overlap: aligned arrays; energy/stress/sleep same length as days; gaps null.
    expect(data).toHaveProperty('overlap');
    expect(Array.isArray(data.overlap.days)).toBe(true);
    expect(Array.isArray(data.overlap.energy)).toBe(true);
    expect(Array.isArray(data.overlap.stress)).toBe(true);
    expect(Array.isArray(data.overlap.sleep)).toBe(true);
    const n = data.overlap.days.length;
    expect(data.overlap.energy).toHaveLength(n);
    expect(data.overlap.stress).toHaveLength(n);
    expect(data.overlap.sleep).toHaveLength(n);
    for (const v of data.overlap.energy) {
      expect(v === null || typeof v === 'number').toBe(true);
    }
    for (const v of data.overlap.stress) {
      expect(v === null || typeof v === 'number').toBe(true);
    }
    for (const v of data.overlap.sleep) {
      expect(v === null || typeof v === 'number').toBe(true);
    }
  });

  it('GET /recovery/trends?month=YYYY-MM scopes the heatmap to that month', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/trends?month=2026-06');
    expect(res.status).toBe(200);
    expect(res.body.data.heatmap.year).toBe(2026);
    expect(res.body.data.heatmap.month).toBe(6);
    // Every heatmap cell falls within the requested month.
    for (const cell of res.body.data.heatmap.cells) {
      expect(cell.date.startsWith('2026-06')).toBe(true);
    }
  });

  it('GET /recovery/trends with a malformed month → 400', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/trends?month=not-a-month');
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});
