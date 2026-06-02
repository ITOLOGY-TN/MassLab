import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ExerciseDetail from '../../frontend/src/pages/program/ExerciseDetail.jsx';

let calls;

const detail = {
  exercise_id: 101,
  slug: 'bench-press',
  name: 'Bench Press',
  targeted_muscles: ['chest'],
  instructions: 'Press.',
  technique_points: [],
  is_active: true,
  media: { image_url: null, video: { kind: null, url: null } },
  alternatives: [{ exercise_id: 145, slug: 'db', name: 'DB Press', is_active: true }],
  history: {
    recent_sessions: [],
    estimated_1rm_kg: null,
    recommended_load_kg: null,
    has_history: false,
  },
};

beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${u}`);
    if (u.includes('/api/v1/program/exercises/')) {
      return new Response(JSON.stringify({ data: detail }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.endsWith('/api/v1/exercises')) {
      return new Response(
        JSON.stringify({
          data: [
            { id: 101, name: 'Bench Press' },
            { id: 145, name: 'DB Press' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // media / alternatives mutations
    return new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/program/exercises/101']}>
      <Routes>
        <Route path="/program/exercises/:id" element={<ExerciseDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExerciseDetail enrichment editors (US4)', () => {
  it('reveals editors on toggle and posts a YouTube link', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());

    fireEvent.click(screen.getByTestId('edit-toggle'));
    expect(screen.getByTestId('media-editor')).toBeTruthy();
    expect(screen.getByTestId('alternatives-editor')).toBeTruthy();

    fireEvent.change(screen.getByTestId('video-url-input'), {
      target: { value: 'https://youtu.be/rT7DgCr-3pg' },
    });
    fireEvent.click(screen.getByText('Définir'));

    await waitFor(() =>
      expect(calls.some((c) => c === 'POST /api/v1/exercises/101/media/video')).toBe(true),
    );
  });

  it('links an alternative via the editor', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    fireEvent.click(screen.getByTestId('edit-toggle'));

    await waitFor(() => expect(screen.getByTestId('alt-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('alt-select'), { target: { value: '145' } });
    fireEvent.click(screen.getByText('Lier'));

    await waitFor(() =>
      expect(calls.some((c) => c === 'POST /api/v1/exercises/101/alternatives')).toBe(true),
    );
  });
});
