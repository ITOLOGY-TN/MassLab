import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ExerciseProgress from '../../frontend/src/pages/loadTracking/ExerciseProgress.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function renderAt(data, status = 200) {
  globalThis.fetch = vi.fn(async (url) =>
    String(url).includes('/api/v1/load-tracking/exercises/')
      ? json(status, status === 200 ? { data } : { error: { code: 'NOT_FOUND', message: 'x' } })
      : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
  return render(
    <MemoryRouter initialEntries={['/load-tracking/exercises/101']}>
      <Routes>
        <Route path="/load-tracking/exercises/:id" element={<ExerciseProgress />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExerciseProgress (US2)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the line + bar charts and the "<3 sessions → no projection" note', async () => {
    renderAt({
      exercise_id: 101,
      name: 'Bench',
      is_active: true,
      current_estimate_1rm_kg: 96,
      all_time_record_kg: 85,
      load_series: [
        { date: '2026-05-01', working_load_kg: 80, estimate_1rm_kg: 90 },
        { date: '2026-05-08', working_load_kg: 82.5, estimate_1rm_kg: 92 },
      ],
      volume_series: [{ date: '2026-05-08', session_id: 2, total_volume_kg: 1200 }],
      recent_sessions: [
        {
          session_id: 2,
          date: '2026-05-08',
          top_weight_kg: 82.5,
          top_reps: 5,
          total_volume_kg: 1200,
        },
      ],
      projection: null,
    });
    expect(await screen.findByText('Bench')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByText(/Projection disponible à partir de 3 séances/)).toBeInTheDocument();
  });

  it('shows a not-found state on 404', async () => {
    renderAt(null, 404);
    await waitFor(() => expect(screen.getByText('Introuvable')).toBeInTheDocument());
  });
});
