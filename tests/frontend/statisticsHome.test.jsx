// Phase 11 (014-phase11-statistics) — frontend smoke for the wired StatisticsHome page.
// getStatistics + the PDF builder are mocked (no network). Asserts: the four headline
// metric cards render, the default (Corps) tab renders, and a cold-start payload (every
// slice in its documented empty shape, data-model §4) renders with no error.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../frontend/src/lib/statisticsApi.js', () => ({
  getStatistics: vi.fn(),
  getReport: vi.fn(),
}));
vi.mock('../../frontend/src/lib/pdfReport.js', () => ({
  generateReportPdf: vi.fn(),
}));

import { getStatistics } from '../../frontend/src/lib/statisticsApi.js';
import StatisticsHome from '../../frontend/src/pages/statistics/StatisticsHome.jsx';

// The cold-start payload exactly mirrors statisticsView.js defaults (data-model §4).
function coldStart() {
  return {
    metrics: {
      total_weight_gained_kg: null,
      total_volume_kg: 0,
      session_completion_rate: { completed: 0, scheduled: 0, pct: null },
      avg_weekly_calories: null,
    },
    body: { weight: { points: [], goal_kg: null, has_data: false }, measurements: [] },
    strength: { top_progressions: [], weekly_volume: [], muscle_radar: { axes: [], values: [] } },
    attendance: { from: '2026-01-01', to: '2026-06-06', levels: 4, days: [] },
    nutrition: { weekly: [], weekly_target_kcal: null },
    recovery: {
      sleep: { points: [], average_hours: null },
      stress_weight: { points: [], sufficient: false },
    },
  };
}

function populated() {
  return {
    metrics: {
      total_weight_gained_kg: 3.5,
      total_volume_kg: 12500,
      session_completion_rate: { completed: 8, scheduled: 10, pct: 80 },
      avg_weekly_calories: 14200,
    },
    body: {
      weight: {
        points: [
          { date: '2026-05-01', weight_kg: 80 },
          { date: '2026-06-01', weight_kg: 83.5 },
        ],
        goal_kg: 90,
        has_data: true,
      },
      measurements: [],
    },
    strength: { top_progressions: [], weekly_volume: [], muscle_radar: { axes: [], values: [] } },
    attendance: { from: '2026-05-01', to: '2026-06-06', levels: 4, days: [] },
    nutrition: { weekly: [], weekly_target_kcal: 2100 },
    recovery: {
      sleep: { points: [], average_hours: 7.2 },
      stress_weight: { points: [], sufficient: false },
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatisticsHome />
    </MemoryRouter>,
  );
}

describe('StatisticsHome — wired statistics screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the four headline metric cards and the default tab when populated', async () => {
    getStatistics.mockResolvedValue(populated());
    renderPage();

    await waitFor(() => expect(screen.getByTestId('stat-metrics')).toBeTruthy());

    // Four metric cards, one per lifetime figure. Scope label lookups to the metric
    // region — "Assiduité" also appears as a tab label.
    const metrics = within(screen.getByTestId('stat-metrics'));
    const cards = screen.getAllByTestId('stat-metric-card');
    expect(cards).toHaveLength(4);
    expect(metrics.getByText('Poids gagné')).toBeTruthy();
    expect(metrics.getByText('Volume total')).toBeTruthy();
    expect(metrics.getByText('Assiduité')).toBeTruthy();
    expect(metrics.getByText('Calories / sem.')).toBeTruthy();
    // Populated values render (not the dash).
    expect(metrics.getByText('3.5')).toBeTruthy();
    expect(metrics.getByText('80')).toBeTruthy();

    // The default tab (Corps / body) panel renders.
    expect(screen.getByTestId('stat-tab-panel')).toBeTruthy();
    // The report export control is mounted in the header.
    expect(screen.getByTestId('report-button')).toBeTruthy();
  });

  it('renders the cold-start payload without error (brand-new athlete)', async () => {
    getStatistics.mockResolvedValue(coldStart());
    renderPage();

    await waitFor(() => expect(screen.getByTestId('stat-metrics')).toBeTruthy());

    const cards = screen.getAllByTestId('stat-metric-card');
    expect(cards).toHaveLength(4);
    // Null lifetime metrics render their muted empty state (the dash placeholder).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // The tab panel still renders without throwing.
    expect(screen.getByTestId('stat-tab-panel')).toBeTruthy();
  });
});
