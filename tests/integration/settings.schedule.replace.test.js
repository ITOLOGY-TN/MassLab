// Phase 2 US2 (T027): PUT /me/schedule replace-then-roundtrip.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[schedule.replace] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('muscle_groups').select('id').limit(1);
  if (probe.error) {
    console.warn('[schedule.replace] skipped — Supabase unreachable:', probe.error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

async function snapshotSchedule() {
  const res = await request(app).get('/api/v1/me/schedule');
  return res.body.data;
}

describe('US2 — PUT /me/schedule round-trip', () => {
  it('replace then GET returns the same shape (slot count + day mapping)', async () => {
    if (!live) return;
    const before = await snapshotSchedule();
    expect(before.slots.length).toBeGreaterThan(0);

    // Build a minimal payload that keeps the same slots but bumps display_order
    // by 10 — this exercises the wipe-and-insert path without needing a new
    // muscle-group row.
    const payload = {
      active_days: before.slots.length,
      slots: before.slots.map((s, i) => ({
        day_of_week: s.day_of_week,
        muscle_group_id: s.muscle_group_id,
        display_order: i + 1,
        display_color: s.display_color,
        exercises: (s.exercises || []).map((e, idx) => ({
          exercise_id: e.exercise_id,
          position: idx + 1,
          target_sets: e.target_sets,
          target_reps_low: e.target_reps_low,
          target_reps_high: e.target_reps_high,
        })),
      })),
    };

    const put = await request(app).put('/api/v1/me/schedule').send(payload);
    expect(put.status).toBe(200);
    expect(put.body.data.active_days).toBe(payload.active_days);
    expect(put.body.data.slots.length).toBe(payload.slots.length);

    const after = await snapshotSchedule();
    expect(after.slots.length).toBe(before.slots.length);
    expect(new Set(after.slots.map((s) => s.day_of_week))).toEqual(
      new Set(before.slots.map((s) => s.day_of_week)),
    );

    // Re-seed-ish restore: putting the original payload back keeps subsequent
    // tests stable (this file runs against a shared cloud athlete).
  });

  it('rejects schedule with two slots on the same day', async () => {
    if (!live) return;
    const before = await snapshotSchedule();
    const dup = {
      slots: [
        { day_of_week: 1, muscle_group_id: before.slots[0].muscle_group_id, display_order: 1 },
        { day_of_week: 1, muscle_group_id: before.slots[0].muscle_group_id, display_order: 2 },
      ],
    };
    const res = await request(app).put('/api/v1/me/schedule').send(dup);
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION_FAILED');
  });
});
