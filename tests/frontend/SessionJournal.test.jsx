import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionJournal from '../../frontend/src/pages/journal/SessionJournal.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const activeSession = {
  session_id: 5,
  day_of_week: 1,
  started_at: new Date().toISOString(),
  stale: false,
  rest_seconds: 120,
  muscle_group: { name: 'Chest + Triceps', color: '#E54D2E' },
  exercises: [
    {
      exercise_id: 101,
      slug: 'bench-press',
      name: 'Bench Press',
      position: 1,
      is_active: true,
      target_sets: 3,
      target_reps_low: 6,
      target_reps_high: 8,
      previous_weight_kg: 70,
      suggested_target_kg: 72.5,
      sets: [{ set_id: 1, set_number: 1, weight_kg: 72.5, reps: 8, rpe: null, completed: false }],
    },
  ],
};

let putCalled;

beforeEach(() => {
  putCalled = false;
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    if (u.endsWith('/api/v1/sessions/active')) return json(200, { data: activeSession });
    if (/\/api\/v1\/sessions\/5\/sets$/.test(u) && opts?.method === 'PUT') {
      putCalled = true;
      return json(200, { data: { sets: [], total_volume_kg: 580 } });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
});

function renderJournal() {
  return render(
    <MemoryRouter initialEntries={['/journal']}>
      <SessionJournal />
    </MemoryRouter>,
  );
}

describe('SessionJournal (US1)', () => {
  it('renders the active session exercises with quick steppers', async () => {
    renderJournal();
    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
    // ±2.5 weight stepper + ±1 reps stepper render for the set.
    expect(screen.getByTestId('weight-0')).toBeInTheDocument();
    expect(screen.getByTestId('reps-0')).toBeInTheDocument();
    expect(screen.getByText('Chest + Triceps')).toBeInTheDocument();
  });

  it('persists (auto-saves) when a set is completed', async () => {
    renderJournal();
    const completeBtn = await screen.findByTestId('complete-0');
    fireEvent.click(completeBtn);
    await waitFor(() => expect(putCalled).toBe(true));
  });
});
