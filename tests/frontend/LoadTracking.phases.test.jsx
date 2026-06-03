import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PhaseComparison from '../../frontend/src/pages/loadTracking/PhaseComparison.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function mock(data) {
  globalThis.fetch = vi.fn(async (url) =>
    String(url).endsWith('/api/v1/load-tracking/phase-comparison')
      ? json(200, { data })
      : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/load-tracking/phases']}>
      <PhaseComparison />
    </MemoryRouter>,
  );
}

describe('PhaseComparison (US3)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the radar + legend for ≥2 phases', async () => {
    mock({
      muscle_groups: [
        { name: 'Chest', color: '#E54D2E' },
        { name: 'Legs', color: '#3E63DD' },
      ],
      phases: [
        {
          slug: 'foundation',
          name: 'Foundation',
          values: [
            { muscle_group: 'Chest', avg_working_load_kg: 80 },
            { muscle_group: 'Legs', avg_working_load_kg: 100 },
          ],
        },
        {
          slug: 'hypertrophy',
          name: 'Hypertrophy',
          values: [
            { muscle_group: 'Chest', avg_working_load_kg: 85 },
            { muscle_group: 'Legs', avg_working_load_kg: 120 },
          ],
        },
      ],
      empty: false,
    });
    renderPage();
    expect(await screen.findByTestId('radar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('phase-legend').textContent).toContain('Foundation');
    expect(screen.getByTestId('phase-legend').textContent).toContain('Hypertrophy');
  });

  it('shows the "<2 phases" empty state', async () => {
    mock({ muscle_groups: [], phases: [], empty: true });
    renderPage();
    expect(await screen.findByText('Pas assez de phases')).toBeInTheDocument();
  });
});
