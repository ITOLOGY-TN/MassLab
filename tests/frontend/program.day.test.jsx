import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProgramDay from '../../frontend/src/pages/program/ProgramDay.jsx';

function mockDay(status, body) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/api/v1/program/day/')) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/program/day/:dayOfWeek" element={<ProgramDay />} />
      </Routes>
    </MemoryRouter>,
  );
}

const dayBody = {
  data: {
    day_of_week: 1,
    muscle_group: { name: 'Chest + Triceps', color: '#E54D2E' },
    empty_exercises: false,
    exercises: [
      {
        exercise_id: 101,
        slug: 'bench-press',
        name: 'Bench Press',
        position: 1,
        target_sets: 4,
        target_reps_low: 6,
        target_reps_high: 8,
        is_active: true,
        last_weight_kg: 75,
        progression: 'ready_to_increase',
      },
      {
        exercise_id: 102,
        slug: 'incline',
        name: 'Incline DB',
        position: 2,
        target_sets: 3,
        target_reps_low: 8,
        target_reps_high: 12,
        is_active: true,
        last_weight_kg: null,
        progression: 'stable',
      },
    ],
  },
};

beforeEach(() => vi.restoreAllMocks());

describe('ProgramDay (US2)', () => {
  it('renders ordered exercise rows with weight + progression', async () => {
    mockDay(200, dayBody);
    renderAt('/program/day/1');
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getByText('Chest + Triceps')).toBeTruthy();
    expect(screen.getAllByTestId('exercise-row')).toHaveLength(2);
    expect(screen.getByText('4 × 6–8 reps')).toBeTruthy();
    expect(screen.getByText('75 kg')).toBeTruthy();
    // neutral empty weight for the no-history exercise
    expect(screen.getByText('—')).toBeTruthy();
    const badges = screen.getAllByTestId('progression-badge');
    expect(badges[0].getAttribute('data-state')).toBe('ready_to_increase');
  });

  it('links each row to the exercise detail (FR-011)', async () => {
    mockDay(200, dayBody);
    renderAt('/program/day/1');
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getAllByTestId('exercise-row')[0].getAttribute('href')).toBe(
      '/program/exercises/101',
    );
  });

  it('shows a rest-day message on 404 (FR: rest day)', async () => {
    mockDay(404, { error: { code: 'NOT_FOUND', message: 'rest' } });
    renderAt('/program/day/2');
    await waitFor(() => expect(screen.getByText(/jour de repos/i)).toBeTruthy());
  });

  it('shows the empty-exercises state (FR-012)', async () => {
    mockDay(200, {
      data: {
        day_of_week: 4,
        muscle_group: { name: 'Legs', color: '#000' },
        empty_exercises: true,
        exercises: [],
      },
    });
    renderAt('/program/day/4');
    await waitFor(() => expect(screen.getByText('Aucun exercice')).toBeTruthy());
  });
});
