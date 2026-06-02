import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 4 (T014/T033) — session write lifecycle: start → auto-save upsert → get
// resume; per-exercise set numbering (two exercises both at set 1); ad-hoc/extra
// sets accepted (FR-011a). Skips offline / unmigrated. Cleans up its session.
let app;
let supabase;
let athleteId;
let exerciseIds = [];
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[sessions.lifecycle] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('session_journal_entries').select('day_of_week').limit(1);
  if (probe.error) {
    console.warn('[sessions.lifecycle] skipped — Supabase unreachable or migration unapplied');
    return;
  }
  const { data: athlete } = await supabase.from('athletes').select('id').limit(1).single();
  athleteId = athlete?.id;
  const { data: exs } = await supabase
    .from('exercises')
    .select('id')
    .eq('athlete_id', athleteId)
    .limit(2);
  exerciseIds = (exs ?? []).map((e) => e.id);
  if (!athleteId || exerciseIds.length < 2) {
    console.warn('[sessions.lifecycle] skipped — insufficient seed data');
    return;
  }
  app = buildApp({ config });
  live = true;
});

async function discardActive() {
  const res = await request(app).get('/api/v1/sessions/active');
  const id = res.body?.data?.session_id;
  if (id) await request(app).delete(`/api/v1/sessions/${id}`);
}

describe('integration: session lifecycle', () => {
  it('logs two exercises at set 1 each + an ad-hoc set, then resumes them', async () => {
    if (!live) {
      console.warn('[sessions.lifecycle] skipping live assertions');
      return;
    }
    await discardActive();
    const start = await request(app).post('/api/v1/sessions').send({});
    const sid = start.body.data.session_id;

    try {
      const [exA, exB] = exerciseIds;
      const put = await request(app)
        .put(`/api/v1/sessions/${sid}/sets`)
        .send({
          sets: [
            { exercise_id: exA, set_number: 1, weight_kg: 60, reps: 8, completed: true },
            { exercise_id: exA, set_number: 2, weight_kg: 62.5, reps: 6, completed: false },
            // Per-exercise numbering: exB also starts at set 1.
            { exercise_id: exB, set_number: 1, weight_kg: 40, reps: 10, completed: true },
          ],
        });
      expect(put.status).toBe(200);
      // Volume counts completed only: 60*8 + 40*10 = 880.
      expect(put.body.data.total_volume_kg).toBe(880);

      // Resume returns the logged sets intact.
      const got = await request(app).get(`/api/v1/sessions/${sid}`);
      expect(got.status).toBe(200);
      const byId = Object.fromEntries(got.body.data.exercises.map((e) => [e.exercise_id, e]));
      expect(byId[exA].sets.length).toBe(2);
      expect(byId[exB].sets.length).toBe(1);
      expect(byId[exB].sets[0].set_number).toBe(1); // no collision with exA set 1
    } finally {
      await request(app).delete(`/api/v1/sessions/${sid}`);
    }
  });

  it('resumes the same in-progress session rather than creating a duplicate', async () => {
    if (!live) return;
    await discardActive();
    const a = await request(app).post('/api/v1/sessions').send({});
    const sid = a.body.data.session_id;
    try {
      const active = await request(app).get('/api/v1/sessions/active');
      expect(active.body.data.session_id).toBe(sid);
      const dup = await request(app).post('/api/v1/sessions').send({});
      expect(dup.status).toBe(409);
    } finally {
      await request(app).delete(`/api/v1/sessions/${sid}`);
    }
  });
});
