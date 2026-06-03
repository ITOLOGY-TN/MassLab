// Phase 6 (009-body-weight-measurements) T026 [US2] — BodyHome weight-chart smoke:
// the curve renders from a stubbed series with the zone, goal line, and phase
// markers; the "<2 entries" low-data empty state shows when only one point exists.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BodyHome from '../../frontend/src/pages/body/BodyHome.jsx';

function chartResponse(chart) {
  return new Response(JSON.stringify({ data: chart }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubChart(chart) {
  globalThis.fetch = vi.fn(async (url) => {
    const path = String(url);
    if (path.endsWith('/api/v1/body-tracking/weight-chart')) return chartResponse(chart);
    return new Response('not found', { status: 404 });
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BodyHome />
    </MemoryRouter>,
  );
}

const MULTI = {
  points: [
    { date: '2026-01-01', kg: 70 },
    { date: '2026-02-01', kg: 71.5 },
    { date: '2026-03-01', kg: 73 },
  ],
  goalKg: 78,
  zone: {
    lower: [
      { date: '2026-01-01', kg: 69 },
      { date: '2026-03-01', kg: 74 },
    ],
    upper: [
      { date: '2026-01-01', kg: 71 },
      { date: '2026-03-01', kg: 76 },
    ],
  },
  phaseMarkers: [
    { name: 'Volume', date: '2026-01-01' },
    { name: 'Force', date: '2026-02-15' },
  ],
  hasTrend: true,
};

describe('BodyHome weight chart (US2 smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the curve, zone, goal line, and phase markers from a stub series', async () => {
    stubChart(MULTI);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('weight-chart')).toBeInTheDocument());
    expect(screen.getByTestId('weight-chart-curve')).toBeInTheDocument();
    expect(screen.getByTestId('weight-chart-zone')).toBeInTheDocument();
    expect(screen.getByTestId('weight-chart-goal')).toBeInTheDocument();
    expect(screen.getAllByTestId('weight-chart-phase-marker').length).toBe(2);
    // No low-data note when there are >= 2 points (hasTrend true).
    expect(screen.queryByTestId('weight-chart-low-data')).not.toBeInTheDocument();
  });

  it('shows the low-data note with a single entry (hasTrend=false)', async () => {
    stubChart({
      points: [{ date: '2026-01-01', kg: 70 }],
      goalKg: null,
      zone: null,
      phaseMarkers: [],
      hasTrend: false,
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('weight-chart')).toBeInTheDocument());
    expect(screen.getByTestId('weight-chart-low-data')).toBeInTheDocument();
  });

  it('shows a designed empty state when no weigh-ins are logged (FR-027)', async () => {
    stubChart({ points: [], goalKg: null, zone: null, phaseMarkers: [], hasTrend: false });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('weight-chart-empty')).toBeInTheDocument());
  });
});
