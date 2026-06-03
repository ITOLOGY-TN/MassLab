import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoadOverview from '../../frontend/src/pages/loadTracking/LoadOverview.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function mock(data) {
  globalThis.fetch = vi.fn(async (url) =>
    String(url).endsWith('/api/v1/load-tracking/overview')
      ? json(200, { data })
      : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/load-tracking']}>
      <LoadOverview />
    </MemoryRouter>,
  );
}

describe('LoadOverview (US1)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders rows with status badges + a deload notice', async () => {
    mock({
      exercises: [
        {
          exercise_id: 101,
          name: 'Bench',
          is_active: true,
          current_load_kg: 85,
          all_time_record_kg: 85,
          last_session_volume_kg: 1280,
          trend: { direction: 'up', change_pct: 3.2 },
          status: 'ready_to_increase',
          status_increment_kg: 2.5,
        },
        {
          exercise_id: 102,
          name: 'Squat',
          is_active: true,
          current_load_kg: null,
          all_time_record_kg: null,
          last_session_volume_kg: null,
          trend: null,
          status: 'maintain',
          status_increment_kg: null,
        },
      ],
      deload_notices: [{ name: 'Legs', color: '#3E63DD' }],
      empty: false,
    });
    renderPage();
    expect(await screen.findByText('Bench')).toBeInTheDocument();
    const badges = screen.getAllByTestId('status-badge');
    expect(badges[0]).toHaveAttribute('data-status', 'ready_to_increase');
    expect(badges[0].textContent).toContain('+2.5 kg');
    expect(badges[1]).toHaveAttribute('data-status', 'maintain');
    expect(screen.getByTestId('deload-notices').textContent).toContain('Legs');
  });

  it('shows the empty state when there is no history', async () => {
    mock({ exercises: [], deload_notices: [], empty: true });
    renderPage();
    expect(await screen.findByText('Pas encore de données')).toBeInTheDocument();
  });
});
