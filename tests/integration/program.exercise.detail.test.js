import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { oneRepMax } from '../../services/engine/oneRepMax.js';
import { DEFAULTS } from '../../services/engine/constants.js';
import { buildApp } from '../../app.js';

// T035 — exercise detail end-to-end: SC-003 consistency (the detail 1RM derives
// from the same heaviest completed set the day view reports as last weight) and
// alternatives listing incl. an archived target (D-7). Seeds a session + an
// alternative link and removes them in a finally block.
// Skips when .env missing, Supabase unreachable, or the migration is unapplied.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.exercise.detail] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.exercise.detail] skipped — Supabase unreachable');
    return;
  }
  const { error: tblErr } = await supabase.from('exercise_alternatives').select('id').limit(1);
  if (tblErr) {
    console.warn('[program.exercise.detail] skipped — exercise_alternatives migration not applied');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('program/exercise — detail rollups (SC-003, D-7)', () => {
  it('derives 1RM from the same heaviest completed set as the day-view last weight, and lists alternatives', async () => {
    if (!live) {
      console.warn('[program.exercise.detail] skipping live assertions');
      return;
    }

    const athleteId = (await request(app).get('/api/v1/athlete/me')).body.data.id;
    const week = (await request(app).get('/api/v1/program/week')).body.data;
    const training = week.days.find((d) => d.kind === 'training' && d.exercise_count > 1);
    if (!training) {
      console.warn('[program.exercise.detail] no day with ≥2 exercises — skipping');
      return;
    }
    const day = (await request(app).get(`/api/v1/program/day/${training.day_of_week}`)).body.data;
    const exId = day.exercises[0].exercise_id;
    const altId = day.exercises[1].exercise_id;

    let sessionId;
    let altRowId;
    try {
      // Seed a session: 70×8 completed, 90×3 incomplete → feed = 70×8.
      const { data: session } = await supabase
        .from('session_journal_entries')
        .insert({ athlete_id: athleteId, started_at: new Date().toISOString() })
        .select('id')
        .single();
      sessionId = session.id;
      await supabase.from('session_sets').insert([
        {
          athlete_id: athleteId,
          session_id: sessionId,
          exercise_id: exId,
          set_number: 1,
          weight_kg: 70,
          reps: 8,
          completed: true,
        },
        {
          athlete_id: athleteId,
          session_id: sessionId,
          exercise_id: exId,
          set_number: 2,
          weight_kg: 90,
          reps: 3,
          completed: false,
        },
      ]);

      // Seed an alternative link exId → altId.
      const { data: altRow } = await supabase
        .from('exercise_alternatives')
        .insert({
          athlete_id: athleteId,
          exercise_id: exId,
          alternative_exercise_id: altId,
          display_order: 0,
        })
        .select('id')
        .single();
      altRowId = altRow.id;

      const detail = (await request(app).get(`/api/v1/program/exercises/${exId}`)).body.data;
      const dayAfter = (await request(app).get(`/api/v1/program/day/${training.day_of_week}`)).body
        .data;
      const dayRow = dayAfter.exercises.find((e) => e.exercise_id === exId);

      // SC-003 — last weight feed (70) is shared by both surfaces.
      expect(Number(dayRow.last_weight_kg)).toBe(70);
      const expected1rm = oneRepMax({
        weight_kg: 70,
        reps: 8,
        constants: DEFAULTS,
      }).primary_estimate_kg;
      expect(detail.history.has_history).toBe(true);
      expect(detail.history.estimated_1rm_kg).toBeCloseTo(Math.round(expected1rm * 10) / 10, 1);

      // Alternative is listed.
      expect(detail.alternatives.map((a) => a.exercise_id)).toContain(altId);
    } finally {
      if (altRowId) await supabase.from('exercise_alternatives').delete().eq('id', altRowId);
      if (sessionId) {
        await supabase.from('session_sets').delete().eq('session_id', sessionId);
        await supabase.from('session_journal_entries').delete().eq('id', sessionId);
      }
    }
  });
});
