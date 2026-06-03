import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 8 (011-phase8-supplements) T010 — contract for the checklist + intake surface,
// driven against specs/011-phase8-supplements/contracts/openapi.yaml via Supertest.
// Read shapes + rejection paths only (no real-data mutation; the write lifecycle lives
// in the integration suite with snapshot/restore). Live-gated: skips when .env is
// missing, Supabase is unreachable, or the supplement_intake_log migration is unapplied.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[supplementsChecklist.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[supplementsChecklist.contract] skipped — Supabase unreachable');
    return;
  }
  const mig = await supabase.from('supplement_intake_log').select('id').limit(1);
  if (mig.error) {
    console.warn('[supplementsChecklist.contract] skipped — Phase 8 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

// A date in a prior ISO week (and a future date) for the rejection paths. Computed
// from the server's "today" returned by the checklist so it tracks the real clock.
function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('contract: supplements checklist + intake', () => {
  it('GET /supplements/checklist returns the Checklist envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/supplements/checklist');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(typeof data.date).toBe('string');
    expect(Array.isArray(data.supplements)).toBe(true);
    for (const s of data.supplements) {
      for (const k of ['id', 'slug', 'name', 'dosage', 'recommended_time', 'taken', 'streak', 'is_primary']) {
        expect(s).toHaveProperty(k);
      }
      expect(typeof s.taken).toBe('boolean');
      expect(typeof s.streak).toBe('number');
    }
  });

  it('POST /supplements/intake with a future date → 422 FUTURE_DATE', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/supplements/checklist')).body.data.date;
    const supp = (await request(app).get('/api/v1/supplements')).body.data[0];
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: supp.id, logged_on: shiftIso(today, 1), taken: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FUTURE_DATE');
  });

  it('POST /supplements/intake outside the current ISO week → 422 OUTSIDE_EDIT_WINDOW', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/supplements/checklist')).body.data.date;
    const supp = (await request(app).get('/api/v1/supplements')).body.data[0];
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: supp.id, logged_on: shiftIso(today, -8), taken: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_EDIT_WINDOW');
  });

  it('POST /supplements/intake with a malformed body → 400', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: 'nope', taken: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('POST /supplements/intake with an invalid calendar date → 400 (FR-005)', async () => {
    if (!live) return;
    const supp = (await request(app).get('/api/v1/supplements')).body.data[0];
    // 2026-02-30 passes the YYYY-MM-DD regex but is not a real date — must be rejected,
    // never silently rolled over.
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: supp.id, logged_on: '2026-02-30', taken: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
