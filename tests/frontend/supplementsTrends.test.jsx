import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupplementsTrends from '../../frontend/src/pages/supplements/SupplementsTrends.jsx';

// Phase 8 (011-phase8-supplements) T038 — frontend smoke for the self-assessment
// trend: four dimension charts render from a stub; the empty state renders without error.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const row = (week, e, r, s, st) => ({
  week_start: week,
  energy: e,
  recovery: r,
  sleep_quality: s,
  strength: st,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplementsTrends />
    </MemoryRouter>,
  );
}

describe('SupplementsTrends (frontend smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders one trend panel per dimension when data exists', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/supplements/assessments')
        ? json(200, {
            data: {
              current: row('2026-06-01', 4, 3, 4, 4),
              editable: true,
              trend: [row('2026-05-25', 3, 3, 3, 3), row('2026-06-01', 4, 3, 4, 4)],
            },
          })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('trend-panel')).toHaveLength(4));
    // Each panel renders the bespoke SVG line chart.
    expect(screen.getAllByTestId('line-chart')).toHaveLength(4);
    expect(screen.getByText('Énergie')).toBeInTheDocument();
  });

  it('renders the empty state without error when there is no data', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/supplements/assessments')
        ? json(200, { data: { current: null, editable: true, trend: [] } })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Pas encore de données')).toBeInTheDocument());
    expect(screen.queryByTestId('trend-panel')).toBeNull();
  });
});
