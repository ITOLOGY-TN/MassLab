import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// T027 — end-to-end wiring of last weight used (D-2): a logged session's
// heaviest COMPLETED set surfaces as last_weight_kg on /program/day, while a
// heavier incomplete set is ignored (FR-009/FR-027). Inserts a temporary
// session + sets and removes them in a finally block (non-persistent).
// Skips when .env is missing or Supabase is unreachable.
let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.day.history] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.day.history] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('program/day — last weight = heaviest completed set (D-2)', () => {
  it('ignores a heavier incomplete set and reflects the heaviest completed one', async () => {
    if (!live) {
      console.warn('[program.day.history] skipping live assertions');
      return;
    }

    const athleteId = (await request(app).get('/api/v1/athlete/me')).body.data.id;
    const week = (await request(app).get('/api/v1/program/week')).body.data;
    const training = week.days.find((d) => d.kind === 'training' && d.exercise_count > 0);
    if (!training) {
      console.warn('[program.day.history] no training day with exercises — skipping');
      return;
    }
    const day = (await request(app).get(`/api/v1/program/day/${training.day_of_week}`)).body.data;
    const exerciseId = day.exercises[0].exercise_id;

    let sessionId;
    try {
      const { data: session, error: sErr } = await supabase
        .from('session_journal_entries')
        .insert({ athlete_id: athleteId, started_at: new Date().toISOString() })
        .select('id')
        .single();
      if (sErr) throw new Error(`seed session failed: ${sErr.message}`);
      sessionId = session.id;

      const { error: setErr } = await supabase.from('session_sets').insert([
        { athlete_id: athleteId, session_id: sessionId, exercise_id: exerciseId, set_number: 1, weight_kg: 60, reps: 10, completed: true },
        { athlete_id: athleteId, session_id: sessionId, exercise_id: exerciseId, set_number: 2, weight_kg: 80, reps: 5, completed: true },
        { athlete_id: athleteId, session_id: sessionId, exercise_id: exerciseId, set_number: 3, weight_kg: 100, reps: 1, completed: false },
      ]);
      if (setErr) throw new Error(`seed sets failed: ${setErr.message}`);

      const after = (await request(app).get(`/api/v1/program/day/${training.day_of_week}`)).body.data;
      const row = after.exercises.find((e) => e.exercise_id === exerciseId);
      expect(Number(row.last_weight_kg)).toBe(80); // heaviest COMPLETED, not the 100 incomplete
    } finally {
      if (sessionId) {
        await supabase.from('session_sets').delete().eq('session_id', sessionId);
        await supabase.from('session_journal_entries').delete().eq('id', sessionId);
      }
    }
  });
});
