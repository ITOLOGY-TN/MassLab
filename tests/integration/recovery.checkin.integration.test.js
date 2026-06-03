import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T009 — daily recovery check-in against the
// live API:
//  - PUT upsert → one row per (athlete, day);
//  - a partial save stores ONLY the provided fields, leaving the rest untouched (SC-003);
//  - sore_zones: [] is persisted as an explicit "no soreness" (distinct from no row);
//  - a re-save updates the same row in place — no duplicate (SC-002);
//  - a future date → 422 FUTURE_DATE;
//  - a prior-ISO-week day → 422 OUTSIDE_EDIT_WINDOW;
//  - a bad rating / unknown mood / unknown zone → 400.
// Because the editable window is the CURRENT ISO week, this suite operates on the
// server's real "today". It snapshots the (athlete, today) recovery_log row up front
// and restores it in afterAll so it never destroys real check-in data (Phase 8 pattern).
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let today = null;
let preRow = null;

function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function dayCount() {
  const { data } = await supabase
    .from('recovery_log')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('logged_on', today);
  return (data ?? []).length;
}

async function dayRow() {
  const { data } = await supabase
    .from('recovery_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('logged_on', today)
    .maybeSingle();
  return data ?? null;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.checkin.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  // Probe for the Phase 9 migration (the new sleep_quality column) — skip until applied.
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.checkin.integration] skipped — Phase 9 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[recovery.checkin.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;
  // The server's "today" (its editable ISO-week anchor) is what GET /checkin reports.
  today = (await request(app).get('/api/v1/recovery/checkin')).body.data.date;
  // Snapshot the current-day row so it is restored verbatim in afterAll.
  preRow = await dayRow();
  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Restore the (athlete, today) row to its pre-test state.
  await supabase
    .from('recovery_log')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('logged_on', today);
  if (preRow) {
    const { id, created_at, ...rest } = preRow;
    void id;
    void created_at;
    await supabase.from('recovery_log').insert(rest);
  }
});

describe('recovery check-in lifecycle (Phase 9)', () => {
  it('upserts one row per (athlete, day) and re-saves it in place (SC-002)', async () => {
    if (!live) return;

    const first = await request(app).put('/api/v1/recovery/checkin').send({
      logged_on: today,
      sleep_quality: 4,
      sleep_hours: 7.5,
      energy: 6,
      stress: 5,
      mood: config.RECOVERY_MOOD_OPTIONS[1],
      sore_zones: [config.RECOVERY_SORE_ZONES[0]],
      note: 'first',
    });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      logged_on: today,
      sleep_quality: 4,
      energy: 6,
      stress: 5,
      mood: config.RECOVERY_MOOD_OPTIONS[1],
      sore_zones: [config.RECOVERY_SORE_ZONES[0]],
      note: 'first',
    });
    expect(Number(first.body.data.sleep_hours)).toBe(7.5);
    expect(await dayCount()).toBe(1);

    // GET reflects the saved state.
    const get1 = await request(app).get(`/api/v1/recovery/checkin?date=${today}`);
    expect(get1.status).toBe(200);
    expect(get1.body.data.editable).toBe(true);
    expect(get1.body.data.checkin).toMatchObject({
      sleep_quality: 4,
      energy: 6,
      stress: 5,
      mood: config.RECOVERY_MOOD_OPTIONS[1],
    });

    // Re-save updates the same row in place — still exactly one row (SC-002).
    const second = await request(app).put('/api/v1/recovery/checkin').send({
      logged_on: today,
      sleep_quality: 2,
      energy: 3,
      stress: 8,
      note: 'second',
    });
    expect(second.status).toBe(200);
    expect(second.body.data.sleep_quality).toBe(2);
    expect(second.body.data.energy).toBe(3);
    expect(second.body.data.stress).toBe(8);
    expect(second.body.data.note).toBe('second');
    expect(await dayCount()).toBe(1);
  });

  it('partial save stores only the provided fields, leaving the rest untouched (SC-003)', async () => {
    if (!live) return;

    // Establish a full baseline row.
    await request(app).put('/api/v1/recovery/checkin').send({
      logged_on: today,
      sleep_quality: 5,
      sleep_hours: 8,
      energy: 7,
      stress: 2,
      mood: config.RECOVERY_MOOD_OPTIONS[0],
      note: 'baseline',
    });

    // A partial save touching only `energy` must not clobber the other fields.
    const patch = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, energy: 1 });
    expect(patch.status).toBe(200);

    const row = await dayRow();
    expect(row.energy).toBe(1); // updated
    expect(row.sleep_quality).toBe(5); // untouched
    expect(Number(row.sleep_hours)).toBe(8); // untouched
    expect(row.stress).toBe(2); // untouched
    expect(row.mood).toBe(config.RECOVERY_MOOD_OPTIONS[0]); // untouched
    expect(row.note).toBe('baseline'); // untouched
    expect(await dayCount()).toBe(1);
  });

  it('persists sore_zones: [] as an explicit "no soreness" (distinct from no row)', async () => {
    if (!live) return;

    // Start with a soreness reported.
    await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sore_zones: [config.RECOVERY_SORE_ZONES[0]] });

    // An explicit empty set clears the soreness — the row still exists.
    const cleared = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sore_zones: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.sore_zones).toEqual([]);

    const row = await dayRow();
    expect(row).not.toBeNull(); // explicit "no soreness" is a row, not the absence of one
    expect(row.sore_zones).toEqual([]);
    expect(await dayCount()).toBe(1);
  });

  it('rejects a future date with 422 FUTURE_DATE', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: shiftIso(today, 1), energy: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FUTURE_DATE');
  });

  it('rejects a prior-ISO-week day with 422 OUTSIDE_EDIT_WINDOW', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: shiftIso(today, -8), energy: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_EDIT_WINDOW');
  });

  it('rejects an out-of-range rating with 400 VALIDATION_FAILED', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sleep_quality: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unknown mood with 400 VALIDATION_FAILED', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, mood: '___not_a_mood___' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an unknown sore zone with 400 VALIDATION_FAILED', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/recovery/checkin')
      .send({ logged_on: today, sore_zones: ['___not_a_zone___'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
