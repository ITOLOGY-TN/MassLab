import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { weeklyPlanDao } from '../../services/dataAccess/weeklyPlan.dao.js';
import { sessionsDao } from '../../services/dataAccess/sessions.dao.js';
import { buildApp } from '../../app.js';

// Phase 10 (013-phase10-dashboard) T009 — GET /api/v1/dashboard today-card + week-strip
// against the live API. PURELY READ-ONLY: this suite issues a single GET and writes NO
// rows. It cross-validates the composed `today` card and 7-day `week` strip against the
// athlete's already-seeded weekly schedule + session history (read independently through
// the same DAOs the controller uses), so the assertions hold for whatever the seed left:
//   - today-card state ∈ {rest, not_started, in_progress, finished}, derived exactly as
//     the controller does (active session → in_progress, else finished-today → finished,
//     else not_started; no slot for today's ISO weekday → rest, which wins);
//   - the 7-day week strip marks every day done / todo / rest, with FUTURE training days
//     reported as 'todo' (never 'missed').
// Live-gated: skips when .env is absent or Supabase is unreachable. Phase 10 adds no
// schema, so there is no migration probe.
let app;
let supabase;
let config;
let athleteId = null;
let live = false;

// ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD string, via UTC — matches the
// controller / weekOverview / supplements week helpers.
function isoDow(isoDate) {
  const js = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

// The UTC calendar day (YYYY-MM-DD) of a timestamptz value, or null.
function utcDayOf(ts) {
  if (ts == null) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[dashboard.today.integration] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  // Connectivity probe (Phase 10 adds no schema — probe an existing table).
  const probe = await supabase.from('weekly_plan_slots').select('day_of_week').limit(1);
  if (probe.error) {
    console.warn('[dashboard.today.integration] skipped — Supabase unreachable');
    return;
  }
  // The app's SINGLE_USER auth resolves the OLDEST (seeded) athlete, so match it.
  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  athleteId = athlete?.id;
  if (!athleteId) {
    console.warn('[dashboard.today.integration] skipped — no seeded athlete');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('integration: dashboard today card + week strip (Phase 10)', () => {
  it('returns the { data } envelope with today + week tiles', async () => {
    if (!live) {
      console.warn('[dashboard.today.integration] skipping live assertions');
      return;
    }
    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('today');
    expect(res.body.data).toHaveProperty('week');
  });

  it('today-card state matches rest / not_started / in_progress / finished for the seeded athlete', async () => {
    if (!live) return;

    // Read the inputs the controller reads, independently, to derive the expected state.
    const sessions = sessionsDao(supabase);
    const wp = weeklyPlanDao(supabase);

    const [slots, active, history] = await Promise.all([
      wp.listSlotsWithExercises(athleteId),
      sessions.findActiveForAthlete(athleteId),
      sessions.historyForEngine(athleteId),
    ]);

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const card = res.body.data.today;

    // The server's "today" is the day_of_week the card reports on a training day; on a
    // rest day the card has no day_of_week, so use the week strip's flagged status to
    // identify today's ISO weekday. The card is internally consistent either way.
    const todayDow =
      card.day_of_week != null
        ? card.day_of_week
        : isoDow(res.body.data.week.days.find((d) => d.status !== undefined)?.date ?? null);

    const todaySlot = slots.find((s) => s.day_of_week === todayDow) ?? null;
    const isRestDay = todaySlot == null;

    if (isRestDay) {
      // Rest day wins over any session state (FR-003).
      expect(card.is_rest).toBe(true);
      expect(card.state).toBe('rest');
      expect(card.cta).toBeNull();
      expect(card.muscle_group).toBeNull();
      expect(card.exercises).toEqual([]);
      return;
    }

    // Training day: state must be one of the three non-rest states with the matching CTA.
    expect(card.is_rest).toBe(false);
    expect(['not_started', 'in_progress', 'finished']).toContain(card.state);

    const finishedDays = new Set(
      (history.sessions ?? [])
        .filter((s) => s.ended_at != null)
        .map((s) => utcDayOf(s.ended_at))
        .filter(Boolean),
    );

    // Derive the expected state exactly as controllers/dashboard.controller.js does.
    let expectedState = 'not_started';
    if (active != null) {
      expectedState = 'in_progress';
    } else if (card.day_of_week != null) {
      // Reconstruct "today" (YYYY-MM-DD) from the week strip entry for today's weekday.
      const todayDate = res.body.data.week.days.find((d) => d.day_of_week === todayDow)?.date;
      if (todayDate && finishedDays.has(todayDate)) expectedState = 'finished';
    }
    expect(card.state).toBe(expectedState);

    const ctaByState = { not_started: 'start', in_progress: 'resume', finished: 'review' };
    expect(card.cta).toBe(ctaByState[card.state]);

    // At most the first three exercises, in planned order, with id + name.
    expect(card.exercises.length).toBeLessThanOrEqual(3);
    const plannedIds = (todaySlot.exercises ?? []).map((e) => e.exercise_id).slice(0, 3);
    expect(card.exercises.map((e) => e.id)).toEqual(plannedIds);
    for (const ex of card.exercises) {
      expect(ex).toHaveProperty('id');
      expect(ex).toHaveProperty('name');
    }
  });

  it('week strip reports 7 days, each done/todo/rest, with future training days as todo (never missed)', async () => {
    if (!live) return;

    const sessions = sessionsDao(supabase);
    const wp = weeklyPlanDao(supabase);
    const [slots, history] = await Promise.all([
      wp.listSlotsWithExercises(athleteId),
      sessions.historyForEngine(athleteId),
    ]);
    const scheduleDays = new Set(slots.map((s) => s.day_of_week));
    const finishedDays = new Set(
      (history.sessions ?? [])
        .filter((s) => s.ended_at != null)
        .map((s) => utcDayOf(s.ended_at))
        .filter(Boolean),
    );

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const days = res.body.data.week.days;

    // Exactly 7 ascending ISO-week days.
    expect(days.length).toBe(7);
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].date > days[i - 1].date).toBe(true);
    }

    // 'todo' / 'missed' is never emitted — the contract enum is done/todo/rest only.
    const statuses = days.map((d) => d.status);
    expect(statuses.every((s) => ['done', 'todo', 'rest'].includes(s))).toBe(true);
    expect(statuses).not.toContain('missed');

    // Each cell agrees with the schedule + finished history (rest wins for a
    // non-scheduled weekday; future scheduled days are 'todo', never 'missed').
    for (const cell of days) {
      expect(isoDow(cell.date)).toBe(cell.day_of_week);
      let expected;
      if (!scheduleDays.has(cell.day_of_week)) {
        expected = 'rest';
      } else if (finishedDays.has(cell.date)) {
        expected = 'done';
      } else {
        expected = 'todo';
      }
      expect(cell.status).toBe(expected);
    }

    // Explicitly assert FUTURE training days are 'todo', never 'missed'. Find a future
    // ISO-week date in the strip that is a scheduled training day; if the seed has one,
    // it must read 'todo'.
    const todayCard = res.body.data.today;
    const todayDow =
      todayCard.day_of_week ??
      isoDow(days.find((d) => scheduleDays.has(d.day_of_week) && d.status === 'todo')?.date ?? days[0].date);
    const todayDate = days.find((d) => d.day_of_week === todayDow)?.date;
    if (todayDate) {
      for (const cell of days) {
        if (cell.date > todayDate && scheduleDays.has(cell.day_of_week)) {
          expect(cell.status).toBe('todo');
        }
      }
    }
  });

  it('writes no rows: a GET leaves session + plan counts unchanged (read-only)', async () => {
    if (!live) return;
    const before = await Promise.all([
      supabase
        .from('session_journal_entries')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
      supabase
        .from('weekly_plan_slots')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
      supabase
        .from('calculation_results')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
    ]);

    const res = await request(app).get('/api/v1/dashboard');
    expect(res.status).toBe(200);

    const after = await Promise.all([
      supabase
        .from('session_journal_entries')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
      supabase
        .from('weekly_plan_slots')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
      supabase
        .from('calculation_results')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId),
    ]);

    expect(after[0].count ?? 0).toBe(before[0].count ?? 0);
    expect(after[1].count ?? 0).toBe(before[1].count ?? 0);
    // The dashboard never re-runs the engine → no new calculation_results (SC-010).
    expect(after[2].count ?? 0).toBe(before[2].count ?? 0);
  });
});
