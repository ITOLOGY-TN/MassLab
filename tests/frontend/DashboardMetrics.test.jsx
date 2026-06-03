import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 10 (013-phase10-dashboard) T020 — frontend smoke for the US2 "see progress at a
// glance" tiles on the dashboard home: the four MetricCards (weight, calories, session
// streak, current phase) render their derived values, the 30-day weight sparkline renders
// from a stub series (reusing the shared LineChart), and the cold-start empty states render
// without error. getDashboard is mocked (no network); it already unwraps `{ data }`, so the
// mock resolves the bare DashboardView.

vi.mock('../../frontend/src/lib/dashboardApi.js', () => ({
  getDashboard: vi.fn(),
}));

import { getDashboard } from '../../frontend/src/lib/dashboardApi.js';
import DashboardHome from '../../frontend/src/pages/dashboard/DashboardHome.jsx';

// A populated DashboardView with all four metric sources present and a 30-day sparkline.
function fullView(overrides = {}) {
  return {
    today: { is_rest: true, muscle_group: null, exercises: [], state: 'rest', cta: null, day_of_week: 3 },
    week: { days: [] },
    metrics: {
      weight: { current_kg: 82.4, start_kg: 80.2, delta_kg: 2.2 },
      calories: { yesterday_kcal: 2600, target_kcal: 3000, delta_kcal: -400, over: false },
      streak: { count: 4 },
      phase: { name: 'Hypertrophie', days_remaining: 12 },
    },
    sparkline: {
      has_data: true,
      days: 30,
      goal_kg: 85,
      points: [
        { date: '2026-05-06', weight_kg: 80.2 },
        { date: '2026-05-20', weight_kg: 81.3 },
        { date: '2026-06-03', weight_kg: 82.4 },
      ],
    },
    alerts: [],
    quote: null,
    ...overrides,
  };
}

// A brand-new athlete: every metric source null and an empty sparkline (cold start).
function coldStartView() {
  return {
    today: { is_rest: true, muscle_group: null, exercises: [], state: 'rest', cta: null, day_of_week: 3 },
    week: { days: [] },
    metrics: { weight: null, calories: null, streak: { count: 0 }, phase: null },
    sparkline: { has_data: false, days: 30, goal_kg: null, points: [] },
    alerts: [],
    quote: null,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardHome metrics tiles (frontend smoke)', () => {
  it('renders the four metric cards with their derived values', async () => {
    getDashboard.mockResolvedValue(fullView());
    renderPage();

    await waitFor(() => expect(screen.getByTestId('metric-weight')).toBeInTheDocument());

    // Weight card: current value + signed delta vs. start.
    const weight = screen.getByTestId('metric-weight');
    expect(weight).toHaveTextContent('82,4');
    expect(within(weight).getByTestId('metric-delta')).toHaveAttribute('data-tone', 'up');
    expect(weight).toHaveTextContent('+2,2 kg');

    // Calories card: yesterday vs. resolved target, under-budget tone.
    const calories = screen.getByTestId('metric-calories');
    expect(calories).toHaveTextContent('2 600');
    expect(within(calories).getByTestId('metric-delta')).toHaveAttribute('data-tone', 'under');

    // Streak card: the consecutive-session count.
    const streak = screen.getByTestId('metric-streak');
    expect(streak).toHaveTextContent('4');

    // Phase card: name + days remaining.
    const phase = screen.getByTestId('metric-phase');
    expect(phase).toHaveTextContent('Hypertrophie');
    expect(phase).toHaveTextContent('12 jours restants');
  });

  it('renders the 30-day weight sparkline from a stub series', async () => {
    getDashboard.mockResolvedValue(fullView());
    renderPage();

    const tile = await screen.findByTestId('tile-sparkline');
    // The shared LineChart SVG renders inside the sparkline tile.
    expect(within(tile).getByTestId('line-chart')).toBeInTheDocument();
    // Goal line legend reflects the goal weight.
    expect(tile).toHaveTextContent('Objectif');
  });

  it('renders cold-start empty states without error', async () => {
    getDashboard.mockResolvedValue(coldStartView());
    renderPage();

    await waitFor(() => expect(screen.getByTestId('metric-weight')).toBeInTheDocument());

    // Null sources flag their card empty (FR-018) — no crash, designed empty copy.
    expect(screen.getByTestId('metric-weight')).toHaveAttribute('data-empty', 'true');
    expect(screen.getByTestId('metric-calories')).toHaveAttribute('data-empty', 'true');
    expect(screen.getByTestId('metric-phase')).toHaveAttribute('data-empty', 'true');

    // Streak is never null — a cold-start athlete shows a 0 streak, not an empty tile.
    expect(screen.getByTestId('metric-streak')).toHaveAttribute('data-empty', 'false');
    expect(screen.getByTestId('metric-streak')).toHaveTextContent('0');

    // No sparkline data → the dashed cold-start tile renders, with no LineChart.
    const sparkTile = screen.getByTestId('tile-sparkline');
    expect(sparkTile).toBeInTheDocument();
    expect(within(sparkTile).queryByTestId('line-chart')).toBeNull();
  });
});
