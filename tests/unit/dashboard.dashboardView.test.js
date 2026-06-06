import { describe, it, expect } from 'vitest';
import { build } from '../../services/dashboard/dashboardView.js';

// Phase 10 (013-phase10-dashboard) T002 — pure top-level dashboard assembler (data-model
// §3d, FR-018/SC-009). Bundles the six tiles (today, week, metrics, sparkline, alerts,
// quote) under `data` and sets a per-tile `has_data` flag so the frontend renders
// cold-start empty states without error. No I/O.

const TODAY = {
  is_rest: false,
  muscle_group: 'Pectoraux + Triceps',
  exercises: [{ id: 12, name: 'Développé couché' }],
  state: 'not_started',
  cta: 'start',
  day_of_week: 1,
};

const WEEK = {
  days: [
    { date: '2026-06-01', day_of_week: 1, status: 'done' },
    { date: '2026-06-02', day_of_week: 2, status: 'rest' },
    { date: '2026-06-03', day_of_week: 3, status: 'todo' },
    { date: '2026-06-04', day_of_week: 4, status: 'rest' },
    { date: '2026-06-05', day_of_week: 5, status: 'todo' },
    { date: '2026-06-06', day_of_week: 6, status: 'rest' },
    { date: '2026-06-07', day_of_week: 7, status: 'rest' },
  ],
};

const METRICS = {
  weight: { current_kg: 60.2, start_kg: 58.0, delta_kg: 2.2 },
  calories: { yesterday_kcal: 2900, target_kcal: 3300, delta_kcal: -400, over: false },
  streak: { count: 4 },
  phase: { name: 'Hypertrophie', days_remaining: 19 },
};

const SPARKLINE = {
  has_data: true,
  days: 30,
  goal_kg: 65,
  points: [{ date: '2026-05-05', weight_kg: 58.4 }],
};

const ALERTS = [
  { kind: 'no_session', message_key: 'dashboard.alert.no_session', context: { days: 2 }, link: '/journal' },
];

const QUOTE = { text: 'No pain, no gain.', author: 'Anonyme' };

describe('dashboardView.build', () => {
  it('bundles the six tiles under a single view model', () => {
    const view = build({
      today: TODAY,
      week: WEEK,
      metrics: METRICS,
      sparkline: SPARKLINE,
      alerts: ALERTS,
      quote: QUOTE,
    });

    expect(view.today).toEqual(TODAY);
    expect(view.week).toEqual(WEEK);
    expect(view.metrics).toEqual(METRICS);
    expect(view.sparkline).toEqual(SPARKLINE);
    expect(view.alerts).toEqual(ALERTS);
    expect(view.quote).toEqual(QUOTE);
  });

  it('sets a has_data flag per tile (all populated)', () => {
    const view = build({
      today: TODAY,
      week: WEEK,
      metrics: METRICS,
      sparkline: SPARKLINE,
      alerts: ALERTS,
      quote: QUOTE,
    });

    expect(view.has_data).toEqual({
      today: true,
      week: true,
      metrics: true,
      sparkline: true,
      alerts: true,
      quote: true,
    });
  });

  it('cold-start: every tile flagged false without error (SC-009)', () => {
    const view = build({
      today: null,
      week: { days: [] },
      metrics: { weight: null, calories: null, streak: { count: 0 }, phase: null },
      sparkline: { has_data: false, days: 30, goal_kg: null, points: [] },
      alerts: [],
      quote: null,
    });

    expect(view.has_data).toEqual({
      today: false,
      week: false,
      metrics: false,
      sparkline: false,
      alerts: false,
      quote: false,
    });
    // The whole payload still returns; tiles carry their empty shapes.
    expect(view.today).toBeNull();
    expect(view.week).toEqual({ days: [] });
    expect(view.metrics.streak).toEqual({ count: 0 });
    expect(view.sparkline.has_data).toBe(false);
    expect(view.alerts).toEqual([]);
    expect(view.quote).toBeNull();
  });

  it('metrics has_data is true when any single sub-metric is present', () => {
    const onlyStreak = build({
      today: null,
      week: { days: [] },
      metrics: { weight: null, calories: null, streak: { count: 3 }, phase: null },
      sparkline: { has_data: false, points: [] },
      alerts: [],
      quote: null,
    });
    // streak.count > 0 counts as data; a streak of 0 alone does not.
    expect(onlyStreak.has_data.metrics).toBe(true);

    const onlyWeight = build({
      today: null,
      week: { days: [] },
      metrics: { weight: { current_kg: 60 }, calories: null, streak: { count: 0 }, phase: null },
      sparkline: { has_data: false, points: [] },
      alerts: [],
      quote: null,
    });
    expect(onlyWeight.has_data.metrics).toBe(true);
  });

  it('sparkline has_data mirrors the sparkline tile own flag', () => {
    const withData = build({
      today: null,
      week: { days: [] },
      metrics: {},
      sparkline: { has_data: true, points: [{ date: '2026-05-05', weight_kg: 58.4 }] },
      alerts: [],
      quote: null,
    });
    expect(withData.has_data.sparkline).toBe(true);
  });

  it('tolerates missing/undefined inputs (defensive cold-start)', () => {
    const view = build({});
    expect(view.has_data).toEqual({
      today: false,
      week: false,
      metrics: false,
      sparkline: false,
      alerts: false,
      quote: false,
    });
    expect(view.alerts).toEqual([]);
  });
});
