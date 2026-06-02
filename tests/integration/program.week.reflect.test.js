import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// SC-002 (remediation G1): the weekly planning view is DERIVED from the live
// schedule, so it reflects whatever /me/schedule currently holds — no stale
// day/muscle-group/count labels. This is the NON-DESTRUCTIVE form: rather than
// mutating the shared cloud athlete's schedule, it asserts /program/week is
// consistent with /me/schedule (the configuration source of truth). If the
// resolver stopped reading the live schedule, this fails.
// Skips when .env is missing or Supabase is unreachable.
let app;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[program.week.reflect] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[program.week.reflect] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('SC-002 — week view reflects the live schedule', () => {
  it('mirrors /me/schedule on /program/week (training days + counts)', async () => {
    if (!live) {
      console.warn('[program.week.reflect] skipping live assertions');
      return;
    }

    const [schedRes, weekRes, groupsRes] = await Promise.all([
      request(app).get('/api/v1/me/schedule'),
      request(app).get('/api/v1/program/week'),
      request(app).get('/api/v1/muscle-groups?include_archived=true'),
    ]);
    expect(schedRes.status).toBe(200);
    expect(weekRes.status).toBe(200);
    expect(groupsRes.status).toBe(200);

    const slots = schedRes.body.data.slots ?? [];
    const week = weekRes.body.data;
    const groupName = new Map(groupsRes.body.data.map((g) => [g.id, g.name]));

    // Training days in the week view exactly match the configured slots.
    const scheduleDays = slots.map((s) => s.day_of_week).sort((a, b) => a - b);
    const weekTrainingDays = week.days
      .filter((d) => d.kind === 'training')
      .map((d) => d.day_of_week)
      .sort((a, b) => a - b);
    expect(weekTrainingDays).toEqual(scheduleDays);
    expect(week.training_day_count).toBe(slots.length);
    expect(week.empty).toBe(slots.length === 0);

    // Per training day: muscle-group name and exercise count match the source.
    for (const slot of slots) {
      const day = week.days.find((d) => d.day_of_week === slot.day_of_week);
      expect(day.kind).toBe('training');
      expect(day.muscle_group.name).toBe(groupName.get(slot.muscle_group_id));
      expect(day.exercise_count).toBe((slot.exercises ?? []).length);
    }
  });
});
