import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 10 (013-phase10-dashboard) T008 — contract for GET /dashboard, driven against
// specs/013-phase10-dashboard/contracts/openapi.yaml via Supertest. Asserts the
// { data } envelope and the documented `today` + `week` shapes (the full DashboardView
// — metrics/sparkline/alerts/quote — is asserted in T038 once every tile is wired).
// Phase 10 is PURELY READ-ONLY and adds NO schema, so this suite performs no seeding/
// mutation and needs NO migration probe. Live-gated: skips when .env is missing or
// Supabase is unreachable.
let app;
let live = false;

const TODAY_STATES = ['not_started', 'in_progress', 'finished', 'rest'];
const TODAY_CTAS = ['start', 'resume', 'review', null];
const WEEK_STATUSES = ['done', 'todo', 'rest'];

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[dashboard.contract] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /dashboard', () => {
  it('returns the { data } envelope with the documented today + week shapes', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data).toBeTruthy();
    expect(typeof data).toBe('object');

    // --- today (TodayCard) ---
    const { today } = data;
    expect(today).toBeTruthy();
    expect(typeof today.is_rest).toBe('boolean');
    // muscle_group is nullable.
    if (today.muscle_group !== null) {
      expect(typeof today.muscle_group).toBe('string');
    }
    expect(Array.isArray(today.exercises)).toBe(true);
    // First three exercises of today's session, in planned order.
    expect(today.exercises.length).toBeLessThanOrEqual(3);
    for (const ex of today.exercises) {
      expect(typeof ex.id).toBe('number');
      expect(typeof ex.name).toBe('string');
    }
    expect(TODAY_STATES).toContain(today.state);
    expect(TODAY_CTAS).toContain(today.cta ?? null);
    expect(Number.isInteger(today.day_of_week)).toBe(true);
    expect(today.day_of_week).toBeGreaterThanOrEqual(1);
    expect(today.day_of_week).toBeLessThanOrEqual(7);

    // --- week (WeekOverview) ---
    const { week } = data;
    expect(week).toBeTruthy();
    expect(Array.isArray(week.days)).toBe(true);
    // The 7 days of the current ISO week.
    expect(week.days.length).toBe(7);
    for (const day of week.days) {
      // date is an ISO calendar date (YYYY-MM-DD).
      expect(typeof day.date).toBe('string');
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(day.day_of_week)).toBe(true);
      expect(day.day_of_week).toBeGreaterThanOrEqual(1);
      expect(day.day_of_week).toBeLessThanOrEqual(7);
      // future training days are 'todo', never 'missed'.
      expect(WEEK_STATUSES).toContain(day.status);
    }
    // The 7 days carry the ISO weekdays 1..7 in order.
    expect(week.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
