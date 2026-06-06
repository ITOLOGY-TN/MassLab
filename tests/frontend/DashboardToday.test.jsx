import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 10 (013-phase10-dashboard) T010 — frontend smoke for US1 on the home
// screen: the TodaySessionCard shows today's muscle group + first three exercises
// + a state-aware start link into the journal, a rest day hides the CTA entirely,
// and the WeekStrip renders the seven done/todo/rest status cells. A brand-new
// (cold-start) athlete with no today/week data still renders without error
// (FR-018/SC-009). dashboardApi.getDashboard is mocked (no network).

vi.mock('../../frontend/src/lib/dashboardApi.js', () => ({
  getDashboard: vi.fn(),
}));

import { getDashboard } from '../../frontend/src/lib/dashboardApi.js';
import DashboardHome from '../../frontend/src/pages/dashboard/DashboardHome.jsx';

// A full payload shape mirrors GET /api/v1/dashboard (contracts/openapi.yaml).
// Tiles other than today/week carry their own empty/null shapes — the page must
// still render the whole screen without error.
function weekDays(statuses) {
  // statuses: 7-length array of 'done'|'todo'|'rest' for Mon→Sun.
  return statuses.map((status, i) => ({
    date: `2026-06-0${i + 1}`,
    day_of_week: i + 1,
    status,
  }));
}

function dashboardView({ today, week } = {}) {
  return {
    today: today ?? null,
    week: week ?? { days: [] },
    metrics: { weight: null, calories: null, streak: { count: 0 }, phase: null },
    sparkline: { has_data: false, days: 30, goal_kg: null, points: [] },
    alerts: [],
    quote: null,
  };
}

const TRAINING_TODAY = {
  is_rest: false,
  muscle_group: 'Pectoraux + Triceps',
  exercises: [
    { id: 12, name: 'Développé couché' },
    { id: 13, name: 'Développé incliné' },
    { id: 14, name: 'Dips' },
    { id: 15, name: 'Extension triceps' },
  ],
  state: 'not_started',
  cta: 'start',
  day_of_week: 1,
};

const REST_TODAY = {
  is_rest: true,
  muscle_group: null,
  exercises: [],
  state: 'rest',
  cta: null,
  day_of_week: 7,
};

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

describe('DashboardHome — today + week (US1 frontend smoke)', () => {
  it('renders the muscle group, the first three exercises, and a start link to the journal', async () => {
    getDashboard.mockResolvedValue(
      dashboardView({
        today: TRAINING_TODAY,
        week: { days: weekDays(['done', 'todo', 'todo', 'rest', 'todo', 'rest', 'rest']) },
      }),
    );

    renderPage();

    const card = await screen.findByTestId('today-session-card');
    expect(card).toHaveAttribute('data-state', 'not_started');

    // Muscle group of today's planned session.
    expect(within(card).getByText('Pectoraux + Triceps')).toBeInTheDocument();

    // Only the first three planned exercises, in order.
    const exercises = within(card).getAllByTestId('today-exercise');
    expect(exercises).toHaveLength(3);
    expect(exercises[0]).toHaveTextContent('Développé couché');
    expect(exercises[1]).toHaveTextContent('Développé incliné');
    expect(exercises[2]).toHaveTextContent('Dips');
    // The fourth exercise is collapsed, not listed as a row.
    expect(within(card).queryByText('Extension triceps')).toBeNull();

    // A single state-aware start CTA pointing into the live journal.
    const cta = within(card).getByTestId('today-cta');
    expect(cta).toHaveAttribute('data-cta', 'start');
    expect(cta).toHaveAttribute('href', '/journal');
  });

  it('renders a rest-day state with no CTA', async () => {
    getDashboard.mockResolvedValue(dashboardView({ today: REST_TODAY }));

    renderPage();

    const card = await screen.findByTestId('today-session-card');
    expect(card).toHaveAttribute('data-state', 'rest');
    expect(card).toHaveAttribute('data-is-rest', 'true');
    // A rest day shows no start/resume/review action at all.
    expect(within(card).queryByTestId('today-cta')).toBeNull();
  });

  it('renders the 7-day week strip with one status cell per day', async () => {
    getDashboard.mockResolvedValue(
      dashboardView({
        today: TRAINING_TODAY,
        week: { days: weekDays(['done', 'todo', 'done', 'rest', 'todo', 'rest', 'todo']) },
      }),
    );

    renderPage();

    const strip = await screen.findByTestId('week-strip');
    const cells = within(strip).getAllByTestId('week-strip-cell');
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveAttribute('data-status', 'done');
    expect(cells[1]).toHaveAttribute('data-status', 'todo');
    expect(cells[3]).toHaveAttribute('data-status', 'rest');
    // Future training days remain 'todo', never 'missed'.
    expect(cells.map((c) => c.getAttribute('data-status'))).not.toContain('missed');
  });

  it('renders the cold-start empty state without error', async () => {
    // Brand-new athlete: no today session, no week days.
    getDashboard.mockResolvedValue(dashboardView({ today: null, week: { days: [] } }));

    renderPage();

    // The grid still mounts and the today/week slots fall back to neutral tiles.
    await waitFor(() => expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument());
    expect(screen.getByTestId('tile-today')).toBeInTheDocument();
    expect(screen.getByTestId('tile-week')).toBeInTheDocument();
    // No real card/strip is rendered when their sources are empty.
    expect(screen.queryByTestId('today-session-card')).toBeNull();
    expect(screen.queryByTestId('week-strip')).toBeNull();
  });
});
