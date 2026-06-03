import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T008 — contract for the daily recovery
// check-in surface: GET /recovery/checkin and PUT /recovery/checkin, driven against
// specs/012-phase9-recovery-wellbeing/contracts/openapi.yaml via Supertest.
// Live-gated: skips when .env is missing, Supabase is unreachable, or the Phase 9
// recovery_log column extension (sleep_quality/mood/sore_zones) is not yet applied.
// The single mutating test (a successful PUT for "today") snapshots-and-restores the
// current-week row so real data is never destroyed (Phase 8 pattern).
let app;
let supabase;
let live = false;
let athleteId;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.checkin.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[recovery.checkin.contract] skipped — Supabase unreachable');
    return;
  }
  // Probe the Phase 9 column extension; skip the suite until the migration is applied.
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.checkin.contract] skipped — Phase 9 migration not applied');
    return;
  }
  athleteId = probe.data?.[0]?.id ?? null;
  app = buildApp({ config, supabase });
  live = true;
});

// Shift an ISO date (YYYY-MM-DD) by a number of UTC days; tracks the real server clock
// via the date the GET endpoint returns, so the rejection paths stay correct over time.
function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('contract: recovery check-in (GET + PUT /recovery/checkin)', () => {
  it('GET /recovery/checkin returns the CheckinView envelope (empty state holds)', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/checkin');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(typeof data.date).toBe('string');
    expect(typeof data.editable).toBe('boolean');
    // checkin is either null (nothing logged) or a Checkin object.
    expect(data.checkin === null || typeof data.checkin === 'object').toBe(true);
    expect(data).toHaveProperty('options');
    expect(Array.isArray(data.options.moods)).toBe(true);
    expect(Array.isArray(data.options.sore_zones)).toBe(true);
  });

  it('GET /recovery/checkin?date=YYYY-MM-DD echoes the requested date and is non-editable for a prior week', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const priorWeek = shiftIso(today, -14);
    const res = await request(app).get(`/api/v1/recovery/checkin?date=${priorWeek}`);
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe(priorWeek);
    expect(res.body.data.editable).toBe(false);
  });

  it('GET /recovery/checkin with a malformed date → 400', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/checkin?date=not-a-date');
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PUT /recovery/checkin upserts the current-day check-in → 200 { data } Checkin', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;

    // Snapshot-and-restore the real current-day row so this mutation never destroys data.
    let snapshot = null;
    if (athleteId) {
      const before = await supabase
        .from('recovery_log')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('logged_on', today)
        .maybeSingle();
      snapshot = before.data ?? null;
    }

    try {
      const res = await request(app)
        .put('/api/v1/recovery/checkin')
        .send({
          logged_on: today,
          sleep_quality: 4,
          sleep_hours: 7.5,
          energy: 6,
          stress: 5,
          sore_zones: [],
        });
      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data).toBeTruthy();
      expect(data.sleep_quality).toBe(4);
      expect(data.energy).toBe(6);
      expect(data.stress).toBe(5);
      // Empty sore_zones is an explicit "no soreness reported", not omitted.
      expect(Array.isArray(data.sore_zones)).toBe(true);
    } finally {
      if (athleteId) {
        if (snapshot) {
          await supabase
            .from('recovery_log')
            .update(snapshot)
            .eq('athlete_id', athleteId)
            .eq('logged_on', today);
        } else {
          await supabase
            .from('recovery_log')
            .delete()
            .eq('athlete_id', athleteId)
            .eq('logged_on', today);
        }
      }
    }
  });

  it('PUT /recovery/checkin with a future date → 422 FUTURE_DATE', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: shiftIso(today, 1), energy: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FUTURE_DATE');
  });

  it('PUT /recovery/checkin outside the current ISO week → 422 OUTSIDE_EDIT_WINDOW', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: shiftIso(today, -8), energy: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_EDIT_WINDOW');
  });

  it('PUT /recovery/checkin with an invalid calendar date → 400 VALIDATION_FAILED', async () => {
    if (!live) return;
    // 2026-02-30 passes the YYYY-MM-DD shape but is not a real date — must be rejected,
    // never silently rolled over.
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: '2026-02-30', energy: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PUT /recovery/checkin with an out-of-range rating → 400', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sleep_quality: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PUT /recovery/checkin with an unknown mood → 400', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, mood: '__not_a_mood__' });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PUT /recovery/checkin with an unknown sore zone → 400', async () => {
    if (!live) return;
    const today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sore_zones: ['__not_a_zone__'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });

  it('PUT /recovery/checkin with a missing logged_on → 400', async () => {
    if (!live) return;
    const res = await request(app).put('/api/v1/recovery/checkin').send({ energy: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code');
  });
});

afterAll(() => {
  // No suite-level cleanup needed — the only mutating test restores its own row.
});
