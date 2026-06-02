import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionJournal from '../../frontend/src/pages/journal/SessionJournal.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockActive(session) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('/api/v1/sessions/active')) return json(200, { data: session });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
}

function renderJournal() {
  return render(
    <MemoryRouter initialEntries={['/journal']}>
      <SessionJournal />
    </MemoryRouter>,
  );
}

const base = {
  session_id: 9,
  day_of_week: 1,
  started_at: '2026-06-01T07:00:00Z',
  rest_seconds: 120,
  muscle_group: { name: 'Back', color: '#3E63DD' },
  exercises: [
    {
      exercise_id: 201,
      slug: 'row',
      name: 'Barbell Row',
      position: 1,
      is_active: true,
      target_sets: 3,
      target_reps_low: 8,
      target_reps_high: 10,
      previous_weight_kg: 60,
      suggested_target_kg: 60,
      sets: [{ set_id: 7, set_number: 1, weight_kg: 60, reps: 9, rpe: 8, completed: true }],
    },
  ],
};

describe('SessionJournal resume/stale (US3)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('shows the resume-or-discard prompt for a stale prior-day session', async () => {
    mockActive({ ...base, stale: true });
    renderJournal();
    expect(await screen.findByTestId('resume-prompt')).toBeInTheDocument();
  });

  it('resumes a same-day session with its previously logged sets intact', async () => {
    mockActive({ ...base, stale: false });
    renderJournal();
    expect(await screen.findByText('Barbell Row')).toBeInTheDocument();
    // The previously logged set is restored (resumed), not lost.
    await waitFor(() => expect(screen.getByTestId('set-entry-row')).toBeInTheDocument());
  });
});
