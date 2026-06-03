import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecoveryTrends from '../../frontend/src/pages/recovery/RecoveryTrends.jsx';

// Phase 9 (012-phase9-recovery-wellbeing) T038 — frontend smoke for the recovery
// trends: the energy heatmap, sleep-vs-performance scatter and 30-day overlay render
// from a stub; each per-chart empty state (has_data:false) renders without error.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecoveryTrends />
    </MemoryRouter>,
  );
}

const fullTrends = {
  heatmap: {
    year: 2026,
    month: 6,
    has_data: true,
    cells: [
      { date: '2026-06-01', energy: 6 },
      { date: '2026-06-02', energy: 8 },
      { date: '2026-06-03', energy: null },
    ],
  },
  scatter: {
    has_data: true,
    points: [
      { date: '2026-06-01', sleep_hours: 7, volume_kg: 4200 },
      { date: '2026-06-02', sleep_hours: 6.5, volume_kg: 3900 },
    ],
  },
  overlap: {
    has_data: true,
    days: ['2026-06-01', '2026-06-02', '2026-06-03'],
    energy: [6, null, 7],
    stress: [5, 4, 6],
    sleep: [7, 6.5, null],
  },
};

const emptyTrends = {
  heatmap: { year: 2026, month: 6, has_data: false, cells: [{ date: '2026-06-01', energy: null }] },
  scatter: { has_data: false, points: [] },
  overlap: { has_data: false, days: [], energy: [], stress: [], sleep: [] },
};

function stubTrends(body) {
  globalThis.fetch = vi.fn(async (url) =>
    String(url).includes('/recovery/trends')
      ? json(200, { data: body })
      : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
}

describe('RecoveryTrends (frontend smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the three charts when data exists', async () => {
    stubTrends(fullTrends);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('trend-panel')).toHaveLength(3));
    expect(screen.getByTestId('calendar-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-plot')).toBeInTheDocument();
    // Overlay renders energy/stress + sleep as two bespoke line charts.
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThanOrEqual(2);
  });

  it('renders each empty state without error when has_data is false', async () => {
    stubTrends(emptyTrends);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('trend-panel')).toHaveLength(3));
    // No chart bodies are drawn; each panel falls back to its empty StateBlock.
    expect(screen.queryByTestId('calendar-heatmap')).toBeNull();
    expect(screen.queryByTestId('scatter-plot')).toBeNull();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.getByText('Aucun suivi ce mois-ci')).toBeInTheDocument();
    expect(screen.getByText('Pas encore assez de données')).toBeInTheDocument();
    expect(screen.getByText('Pas encore de tendance')).toBeInTheDocument();
  });

  it('renders the page-level error state without crashing', async () => {
    globalThis.fetch = vi.fn(async () => json(500, { error: { code: 'DB_ERROR', message: 'x' } }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Erreur')).toBeInTheDocument());
    expect(screen.queryByTestId('trend-panel')).toBeNull();
  });
});
