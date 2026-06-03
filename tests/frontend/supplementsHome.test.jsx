import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupplementsHome from '../../frontend/src/pages/supplements/SupplementsHome.jsx';

// Phase 8 (011-phase8-supplements) T017/T023/T031 — frontend smoke for the daily
// checklist (toggle → taken), per-supplement streaks + creatine prominence, and the
// weekly grid.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DATE = '2026-06-03';

function checklist(takenCreatine) {
  return {
    date: DATE,
    supplements: [
      {
        id: 1,
        slug: 'creatine-monohydrate',
        name: 'Créatine',
        dosage: '5 g',
        recommended_time: 'morning',
        taken: takenCreatine,
        streak: takenCreatine ? 15 : 14,
        is_primary: true,
      },
      {
        id: 2,
        slug: 'omega-3',
        name: 'Oméga-3',
        dosage: '2 g',
        recommended_time: 'with_meal',
        taken: false,
        streak: 0,
        is_primary: false,
      },
    ],
  };
}

const GRID = {
  week_start: '2026-06-01',
  days: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
  rows: [
    {
      supplement_id: 1,
      slug: 'creatine-monohydrate',
      name: 'Créatine',
      cells: [
        { date: '2026-06-01', status: 'taken' },
        { date: '2026-06-02', status: 'missed' },
        { date: '2026-06-03', status: 'taken' },
        { date: '2026-06-04', status: 'upcoming' },
        { date: '2026-06-05', status: 'upcoming' },
        { date: '2026-06-06', status: 'upcoming' },
        { date: '2026-06-07', status: 'upcoming' },
      ],
    },
  ],
};

const ASSESSMENT = { current: null, editable: true, week_start: '2026-06-01', trend: [] };

function renderPage() {
  return render(
    <MemoryRouter>
      <SupplementsHome />
    </MemoryRouter>,
  );
}

describe('SupplementsHome (frontend smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders supplement cards with streaks and creatine prominence', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/supplements/checklist')) return json(200, { data: checklist(false) });
      if (u.includes('/supplements/grid')) return json(200, { data: GRID });
      if (u.includes('/supplements/assessments')) return json(200, { data: ASSESSMENT });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('supplement-card')).toHaveLength(2));
    // The creatine card is the primary/hero one.
    const cards = screen.getAllByTestId('supplement-card');
    expect(cards[0]).toHaveAttribute('data-primary', 'true');
    // Streak counters render.
    const streaks = screen.getAllByTestId('streak-count');
    expect(streaks[0]).toHaveTextContent('14');
  });

  it('toggles a supplement → POST /intake then reflects the taken state', async () => {
    let postBody = null;
    let checklistCalls = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/supplements/intake') && method === 'POST') {
        postBody = JSON.parse(init.body);
        return json(200, { data: postBody });
      }
      if (u.includes('/supplements/checklist')) {
        checklistCalls += 1;
        return json(200, { data: checklist(checklistCalls > 1) });
      }
      if (u.includes('/supplements/grid')) return json(200, { data: GRID });
      if (u.includes('/supplements/assessments')) return json(200, { data: ASSESSMENT });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('supplement-card')).toHaveLength(2));

    // Toggle the creatine card (initially not taken).
    const creatineCard = screen.getAllByTestId('supplement-card')[0];
    fireEvent.click(within(creatineCard).getByTestId('intake-toggle'));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).toMatchObject({ supplement_id: 1, logged_on: DATE, taken: true });

    // After the refetch the creatine toggle reads taken.
    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('supplement-card')[0]).getByTestId('intake-toggle'),
      ).toHaveAttribute('data-taken', 'true'),
    );
  });

  it('renders the weekly grid cells', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/supplements/checklist')) return json(200, { data: checklist(false) });
      if (u.includes('/supplements/grid')) return json(200, { data: GRID });
      if (u.includes('/supplements/assessments')) return json(200, { data: ASSESSMENT });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId('weekly-grid')).toBeInTheDocument());
    const cells = screen.getAllByTestId('grid-cell');
    expect(cells).toHaveLength(7);
    expect(cells.some((c) => c.getAttribute('data-status') === 'taken')).toBe(true);
    expect(cells.some((c) => c.getAttribute('data-status') === 'missed')).toBe(true);
    expect(cells.some((c) => c.getAttribute('data-status') === 'upcoming')).toBe(true);
  });

  it('renders the empty state when no supplements are configured', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/supplements/checklist'))
        return json(200, { data: { date: DATE, supplements: [] } });
      if (u.includes('/supplements/grid')) return json(200, { data: { ...GRID, rows: [] } });
      if (u.includes('/supplements/assessments')) return json(200, { data: ASSESSMENT });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Aucun complément')).toBeInTheDocument());
    expect(screen.queryByTestId('supplement-card')).toBeNull();
  });
});
