import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { athletesDao } from '../../services/dataAccess/athletes.dao.js';
import { isoWeekStart } from '../../services/supplements/week.js';
import { buildApp } from '../../app.js';

// Phase 8 (011-phase8-supplements) T034 — weekly self-assessment against the live API:
//  - PUT then re-PUT → one row per ISO week, updated in place (FR-013);
//  - the week is server-derived (the client cannot target another week → elapsed weeks
//    are read-only);
//  - a rating outside 1–5 → 400 (FR-014);
//  - an RLS probe: the publishable-key client cannot read supplement_weekly_assessment.
// Operates on the CURRENT ISO week, so it snapshots the week's row up front and
// restores it in afterAll — it never destroys a real assessment.
let app;
let config;
let supabase;
let live = false;

let athleteId = null;
let weekStart = null;
// The week actually written by the server (from the PUT response). Captured so
// cleanup removes the real mutated row even if an ISO-week boundary is crossed
// between beforeAll's isoWeekStart(today) and the PUT.
let writtenWeekStart = null;
let preRow = null;
let today = null;

async function weekCount() {
  const { data } = await supabase
    .from('supplement_weekly_assessment')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('week_start', weekStart);
  return (data ?? []).length;
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[supplementAssessment.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const mig = await supabase.from('supplement_weekly_assessment').select('id').limit(1);
  if (mig.error) {
    console.warn('[supplementAssessment.integration] skipped — Phase 8 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  const athlete = await athletesDao(supabase).findBySeed();
  if (!athlete) {
    console.warn('[supplementAssessment.integration] skipped — no seeded athlete');
    return;
  }
  athleteId = athlete.id;
  today = (await request(app).get('/api/v1/supplements/checklist')).body.data.date;
  weekStart = isoWeekStart(today);
  const { data } = await supabase
    .from('supplement_weekly_assessment')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('week_start', weekStart)
    .maybeSingle();
  preRow = data ?? null;
  live = true;
});

afterAll(async () => {
  if (!live) return;
  // Remove both the snapshotted week and the week the server actually wrote
  // (they differ only if an ISO-week boundary was crossed mid-run).
  const weeks = [...new Set([weekStart, writtenWeekStart].filter(Boolean))];
  await supabase
    .from('supplement_weekly_assessment')
    .delete()
    .eq('athlete_id', athleteId)
    .in('week_start', weeks);
  if (preRow) {
    await supabase.from('supplement_weekly_assessment').insert({
      athlete_id: athleteId,
      week_start: weekStart,
      energy: preRow.energy,
      recovery: preRow.recovery,
      sleep_quality: preRow.sleep_quality,
      strength: preRow.strength,
    });
  }
});

describe('supplement weekly self-assessment (Phase 8)', () => {
  it('upserts the current week — one row, updated in place (FR-013)', async () => {
    if (!live) return;

    const first = await request(app)
      .put('/api/v1/supplements/assessment')
      .send({ energy: 4, recovery: 3, sleep_quality: 4, strength: 4 });
    expect(first.status).toBe(200);
    writtenWeekStart = first.body.data.week_start; // server-derived week actually upserted
    expect(first.body.data.week_start).toBe(weekStart);
    expect(await weekCount()).toBe(1);

    // GET reflects it as the current week.
    const get1 = await request(app).get('/api/v1/supplements/assessments');
    expect(get1.body.data.current).toMatchObject({ week_start: weekStart, energy: 4, strength: 4 });

    // Re-PUT updates in place (still one row).
    const second = await request(app)
      .put('/api/v1/supplements/assessment')
      .send({ energy: 5, recovery: 5, sleep_quality: 5, strength: 5 });
    expect(second.status).toBe(200);
    expect(second.body.data.energy).toBe(5);
    expect(await weekCount()).toBe(1);

    const get2 = await request(app).get('/api/v1/supplements/assessments');
    expect(get2.body.data.current.energy).toBe(5);
  });

  it('rejects a rating outside 1–5 with 400 (FR-014)', async () => {
    if (!live) return;
    const res = await request(app)
      .put('/api/v1/supplements/assessment')
      .send({ energy: 0, recovery: 3, sleep_quality: 3, strength: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('RLS — the publishable-key client cannot read supplement_weekly_assessment', async () => {
    if (!live) return;
    const anon = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.from('supplement_weekly_assessment').select('*');
    if (!error) {
      expect(data).toEqual([]);
    } else {
      expect(error.message).toMatch(/permission|policy|jwt|denied/i);
    }
  });
});
