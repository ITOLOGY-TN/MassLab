import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProgramWeek from '../../frontend/src/pages/program/ProgramWeek.jsx';

function mockWeek(week) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).endsWith('/api/v1/program/week')) {
      return new Response(JSON.stringify({ data: week }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
}

const fullWeek = {
  training_day_count: 2,
  empty: false,
  days: [
    {
      day_of_week: 1,
      kind: 'training',
      slot_id: 1,
      muscle_group: { name: 'Chest + Triceps', color: '#E54D2E' },
      exercise_count: 3,
    },
    { day_of_week: 2, kind: 'rest', slot_id: null, muscle_group: null, exercise_count: null },
    {
      day_of_week: 3,
      kind: 'training',
      slot_id: 2,
      muscle_group: { name: 'Back + Biceps', color: '#3E63DD' },
      exercise_count: 0,
    },
    { day_of_week: 4, kind: 'rest', slot_id: null, muscle_group: null, exercise_count: null },
    { day_of_week: 5, kind: 'rest', slot_id: null, muscle_group: null, exercise_count: null },
    { day_of_week: 6, kind: 'rest', slot_id: null, muscle_group: null, exercise_count: null },
    { day_of_week: 7, kind: 'rest', slot_id: null, muscle_group: null, exercise_count: null },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ProgramWeek (US1)', () => {
  it('renders training-day cards and rest separators', async () => {
    mockWeek(fullWeek);
    render(
      <MemoryRouter>
        <ProgramWeek />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Chest + Triceps')).toBeTruthy());
    expect(screen.getByText('Back + Biceps')).toBeTruthy();
    expect(screen.getAllByTestId('day-card')).toHaveLength(2);
    expect(screen.getAllByTestId('rest-separator')).toHaveLength(5);
    // Singular/plural exercise count.
    expect(screen.getByText('3 exercices')).toBeTruthy();
    expect(screen.getByText('0 exercices')).toBeTruthy();
  });

  it('links each card to its day detail (FR-005)', async () => {
    mockWeek(fullWeek);
    render(
      <MemoryRouter>
        <ProgramWeek />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Chest + Triceps')).toBeTruthy());
    const links = screen.getAllByTestId('day-card');
    expect(links[0].getAttribute('href')).toBe('/program/day/1');
    expect(links[1].getAttribute('href')).toBe('/program/day/3');
  });

  it('shows the empty-week state with a link to settings (FR-006)', async () => {
    mockWeek({
      training_day_count: 0,
      empty: true,
      days: Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i + 1,
        kind: 'rest',
        slot_id: null,
        muscle_group: null,
        exercise_count: null,
      })),
    });
    render(
      <MemoryRouter>
        <ProgramWeek />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Aucune journée/i)).toBeTruthy());
    expect(screen.getByText('Configurer le planning').getAttribute('href')).toBe(
      '/settings/schedule',
    );
  });
});
