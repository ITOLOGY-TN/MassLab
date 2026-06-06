import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 10 (013-phase10-dashboard) T034 — frontend smoke for the quote-of-the-day
// tile. The QuoteCard renders the daily motivational quote from the composed
// dashboard payload (`data.quote`) and falls back to a graceful placeholder —
// never disappearing — when no quote exists (cold start / empty catalogue,
// FR-018). getDashboard is mocked (no network).

vi.mock('../../frontend/src/lib/dashboardApi.js', () => ({
  getDashboard: vi.fn(),
}));

import { getDashboard } from '../../frontend/src/lib/dashboardApi.js';
import DashboardHome from '../../frontend/src/pages/dashboard/DashboardHome.jsx';

// A minimal, fully-cold dashboard payload: every other tile is empty so the only
// thing under test is the quote slot.
function dashboardView({ quote = null } = {}) {
  return {
    today: null,
    week: { days: [] },
    metrics: {},
    sparkline: null,
    alerts: [],
    quote,
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

describe('DashboardHome quote tile (frontend smoke)', () => {
  it('renders the quote text and author when a quote is present', async () => {
    getDashboard.mockResolvedValue(
      dashboardView({ quote: { text: 'No pain, no gain.', author: 'Anonyme' } }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-quote')).toBeInTheDocument());

    const quote = screen.getByTestId('dashboard-quote');
    expect(quote).toHaveAttribute('data-empty', 'false');
    expect(within(quote).getByText('No pain, no gain.')).toBeInTheDocument();
    expect(within(quote).getByText('— Anonyme')).toBeInTheDocument();
  });

  it('renders the quote text without an author line when author is absent', async () => {
    getDashboard.mockResolvedValue(
      dashboardView({ quote: { text: 'Reste régulier.' } }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-quote')).toBeInTheDocument());

    const quote = screen.getByTestId('dashboard-quote');
    expect(quote).toHaveAttribute('data-empty', 'false');
    expect(within(quote).getByText('Reste régulier.')).toBeInTheDocument();
    expect(within(quote).queryByText(/^—/)).toBeNull();
  });

  it('renders a graceful placeholder (not nothing) when no quote exists', async () => {
    getDashboard.mockResolvedValue(dashboardView({ quote: null }));

    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-quote')).toBeInTheDocument());

    const quote = screen.getByTestId('dashboard-quote');
    expect(quote).toHaveAttribute('data-empty', 'true');
    expect(
      within(quote).getByText('Pas de citation du jour pour le moment.'),
    ).toBeInTheDocument();
  });

  it('treats a blank/whitespace quote text as empty (placeholder shown)', async () => {
    getDashboard.mockResolvedValue(
      dashboardView({ quote: { text: '   ', author: 'Ignoré' } }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByTestId('dashboard-quote')).toBeInTheDocument());

    const quote = screen.getByTestId('dashboard-quote');
    expect(quote).toHaveAttribute('data-empty', 'true');
    expect(within(quote).queryByText('— Ignoré')).toBeNull();
  });
});
