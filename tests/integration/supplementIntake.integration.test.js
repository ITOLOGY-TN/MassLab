import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { buildApp } from '../../app.js';

// Phase 8 (011-phase8-supplements) T011 — supplement intake against the live API:
//  - toggle taken=true creates a row; taken=true again is idempotent (one row, SC-002);
//  - taken=false removes it (FR-002);
//  - a future date → 422 FUTURE_DATE; a prior-week date → 422 OUTSIDE_EDIT_WINDOW (FR-005/FR-005a);
//  - an unknown supplement → 404;
//  - an RLS probe: the publishable-key client cannot read supplement_intake_log.
// Because the editable window is the CURRENT ISO week, this suite operates on the
// server's real "today". It snapshots the (athlete, supplement, today) cell up front
// and restores it in afterAll so it never destroys real adherence data.
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let suppId = null;
let today = null;
let preExisted = false;

function shiftIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function cellCount() {
  const { data } = await supabase
    .from('supplement_intake_log')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('supplement_id', suppId)
    .eq('logged_on', today);
  return (data ?? []).length;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[supplementIntake.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const mig = await supabase.from('supplement_intake_log').select('id').limit(1);
  if (mig.error) {
    console.warn('[supplementIntake.integration] skipped — Phase 8 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[supplementIntake.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;
  const supps = (await request(app).get('/api/v1/supplements')).body.data ?? [];
  if (!supps.length) {
    console.warn('[supplementIntake.integration] skipped — no seeded supplements');
    return;
  }
  suppId = supps[0].id;
  today = (await request(app).get('/api/v1/supplements/checklist')).body.data.date;
  preExisted = (await cellCount()) > 0;
  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Restore the (athlete, supplement, today) cell to its pre-test state.
  await supabase
    .from('supplement_intake_log')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('supplement_id', suppId)
    .eq('logged_on', today);
  if (preExisted) {
    await supabase
      .from('supplement_intake_log')
      .insert({ athlete_id: athleteId, supplement_id: suppId, logged_on: today });
  }
});

describe('supplement intake lifecycle (Phase 8)', () => {
  it('marks taken (idempotently) then un-marks for today', async () => {
    if (!live) return;

    const on = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: suppId, logged_on: today, taken: true });
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ supplement_id: suppId, logged_on: today, taken: true });
    expect(await cellCount()).toBe(1);

    // Idempotent — a second taken=true does not create a duplicate (SC-002).
    const again = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: suppId, logged_on: today, taken: true });
    expect(again.status).toBe(200);
    expect(await cellCount()).toBe(1);

    // The checklist reflects the taken state.
    const checklist = await request(app).get('/api/v1/supplements/checklist');
    const card = checklist.body.data.supplements.find((s) => s.id === suppId);
    expect(card.taken).toBe(true);

    // Un-mark removes the row.
    const off = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: suppId, logged_on: today, taken: false });
    expect(off.status).toBe(200);
    expect(off.body.data.taken).toBe(false);
    expect(await cellCount()).toBe(0);
  });

  it('rejects a future date with 422 FUTURE_DATE (FR-005)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: suppId, logged_on: shiftIso(today, 1), taken: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FUTURE_DATE');
  });

  it('rejects a prior-week date with 422 OUTSIDE_EDIT_WINDOW (FR-005a)', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: suppId, logged_on: shiftIso(today, -8), taken: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_EDIT_WINDOW');
  });

  it('rejects an unknown supplement with 404', async () => {
    if (!live) return;
    const res = await request(app)
      .post('/api/v1/supplements/intake')
      .send({ supplement_id: 999999999, logged_on: today, taken: true });
    expect(res.status).toBe(404);
  });

  it('RLS — the publishable-key client cannot read supplement_intake_log', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('supplement_intake_log').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
