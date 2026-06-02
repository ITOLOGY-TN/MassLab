import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ExerciseDetail from '../../frontend/src/pages/program/ExerciseDetail.jsx';

function mockExercise(body) {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/api/v1/program/exercises/')) {
      return new Response(JSON.stringify(body), {
        status: 200,
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
        <Route path="/program/exercises/:id" element={<ExerciseDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const base = {
  exercise_id: 101,
  slug: 'bench-press',
  name: 'Bench Press',
  targeted_muscles: ['chest', 'triceps'],
  instructions: 'Lie on the bench and press.',
  technique_points: ['retract scapula'],
  is_active: true,
  media: { image_url: null, video: { kind: null, url: null } },
  alternatives: [],
  history: {
    recent_sessions: [],
    estimated_1rm_kg: null,
    recommended_load_kg: null,
    has_history: false,
  },
};

beforeEach(() => vi.restoreAllMocks());

describe('ExerciseDetail (US3)', () => {
  it('renders static content + empty history states with no history (FR-019)', async () => {
    mockExercise({ data: base });
    renderAt('/program/exercises/101');
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getByText('chest · triceps')).toBeTruthy();
    expect(screen.getByText('Lie on the bench and press.')).toBeTruthy();
    expect(screen.getByText('retract scapula')).toBeTruthy();
    expect(screen.getByText(/Aucun historique/i)).toBeTruthy();
    expect(screen.getByText('Aucune séance enregistrée.')).toBeTruthy();
  });

  it('renders a YouTube embed, history figures, and alternative links', async () => {
    mockExercise({
      data: {
        ...base,
        media: {
          image_url: '/media/bench.jpg',
          video: { kind: 'youtube', url: 'https://www.youtube-nocookie.com/embed/rT7DgCr-3pg' },
        },
        alternatives: [{ exercise_id: 145, slug: 'db', name: 'DB Press', is_active: true }],
        history: {
          recent_sessions: [
            {
              session_id: 9,
              date: '2026-05-28',
              sets: [{ weight_kg: 80, reps: 5, rpe: 8, completed: true }],
            },
          ],
          estimated_1rm_kg: 90.6,
          recommended_load_kg: 82.5,
          has_history: true,
        },
      },
    });
    renderAt('/program/exercises/101');
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getByTestId('exercise-image')).toBeTruthy();
    expect(screen.getByTestId('video-youtube').getAttribute('src')).toContain(
      'youtube-nocookie.com/embed/',
    );
    expect(screen.getByText('90.6 kg')).toBeTruthy();
    expect(screen.getByText('82.5 kg')).toBeTruthy();
    expect(screen.getByText('2026-05-28')).toBeTruthy();
    const alt = screen.getByTestId('alternative-link');
    expect(alt.getAttribute('href')).toBe('/program/exercises/145');
  });
});
