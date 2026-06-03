// Phase 6 (009-body-weight-measurements) T016 [US1] — BodyHome weigh-in smoke:
// the form submits a weight, an empty (value-less) submit shows a validation
// message without calling the API, and the photo control posts multipart.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BodyHome from '../../frontend/src/pages/body/BodyHome.jsx';

let calls = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    const path = String(url);
    calls.push({ path, init });
    if (init?.method === 'POST' && path.endsWith('/api/v1/body-measurements')) {
      const body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          data: {
            measurement: { id: 1, measured_on: body.measured_on, weight_kg: body.weight_kg },
            body_composition: { id: 9 },
            program_id: 7,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (path.endsWith('/api/v1/body-tracking/weight-chart')) {
      return new Response(
        JSON.stringify({
          data: { points: [], goalKg: null, zone: null, phaseMarkers: [], hasTrend: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (init?.method === 'POST' && path.endsWith('/api/v1/body-tracking/photos')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'uuid',
            takenOn: '2026-06-03',
            weightKg: 60,
            url: '/static/x.png',
            note: null,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <BodyHome />
    </MemoryRouter>,
  );
}

describe('BodyHome (US1 weigh-in smoke)', () => {
  it('submits a weight via POST /api/v1/body-measurements', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Poids \(kg\)/i), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la pesée/i }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    const post = calls.find(
      (c) => c.init?.method === 'POST' && c.path.endsWith('/api/v1/body-measurements'),
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(post.init.body).weight_kg).toBe(60);
  });

  it('shows a validation message and does not POST when no value is entered (FR-003)', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la pesée/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const post = calls.find(
      (c) => c.init?.method === 'POST' && c.path.endsWith('/api/v1/body-measurements'),
    );
    expect(post).toBeFalsy();
  });

  it('posts the photo through the dedicated upload control', async () => {
    renderPage();
    const file = new File([new Uint8Array([1, 2, 3])], 'p.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Photo de progression/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer la photo/i }));
    await waitFor(() => {
      const post = calls.find(
        (c) => c.init?.method === 'POST' && c.path.endsWith('/api/v1/body-tracking/photos'),
      );
      expect(post).toBeTruthy();
    });
  });
});
