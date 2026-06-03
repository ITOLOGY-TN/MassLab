// Phase 6 (009-body-weight-measurements) T034 [US3] — MeasurementsTable smoke:
// deltas render with their direction; a missing prior-month value renders no
// delta (graceful gap, FR-023); the no-data empty state renders.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MeasurementsTable from '../../frontend/src/pages/body/MeasurementsTable.jsx';

function tableResponse(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stub(data) {
  globalThis.fetch = vi.fn(async (url) => {
    const path = String(url);
    if (path.endsWith('/api/v1/body-tracking/measurements-table')) return tableResponse(data);
    return new Response('not found', { status: 404 });
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MeasurementsTable />
    </MemoryRouter>,
  );
}

describe('MeasurementsTable (US3 smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders color-coded deltas with direction and a graceful gap for a missing prior', async () => {
    stub({
      months: [
        {
          month: '2026-01',
          // First month: arm has a value but no prior → delta null (gap).
          fields: { arm_cm: { value: 36, delta: null, direction: 'flat' } },
        },
        {
          month: '2026-02',
          fields: {
            arm_cm: { value: 37.5, delta: 1.5, direction: 'up' },
            waist_cm: { value: 80, delta: -2, direction: 'down' },
          },
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('measurements-table')).toBeInTheDocument());

    // The Feb arm delta is an "up" cell with a +1.5 change.
    const upCells = screen.getAllByText((_, node) => node?.dataset?.direction === 'up');
    expect(upCells.length).toBeGreaterThan(0);
    expect(within(upCells[0]).queryByText(/\+1\.5/) ?? upCells[0]).toHaveTextContent('+1.5');

    // A down delta is present (waist −2).
    const downCells = screen.getAllByText((_, node) => node?.dataset?.direction === 'down');
    expect(downCells.length).toBeGreaterThan(0);
    expect(downCells[0]).toHaveTextContent('-2');

    // The January arm cell has a value but no delta (no prior month) — no direction tag.
    expect(screen.getByText('36')).toBeInTheDocument();
  });

  it('renders a single month without any delta and without error', async () => {
    stub({
      months: [
        { month: '2026-03', fields: { chest_cm: { value: 100, delta: null, direction: 'flat' } } },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('measurements-table')).toBeInTheDocument());
    expect(screen.getByText('100')).toBeInTheDocument();
    // No up/down direction cells with a single month.
    expect(
      screen.queryAllByText((_, node) => ['up', 'down'].includes(node?.dataset?.direction)).length,
    ).toBe(0);
  });

  it('shows a designed empty state when no measurements are logged (FR-027)', async () => {
    stub({ months: [] });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('measurements-empty')).toBeInTheDocument());
  });
});
