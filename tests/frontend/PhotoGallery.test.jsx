// Phase 6 (009-body-weight-measurements) T041 [US4] — PhotoGallery smoke: the
// grid renders date-ordered with the weight overlay (FR-024); a tile opens
// full-screen (FR-025); two tiles selected in compare mode show side-by-side
// (FR-026); delete confirms and calls DELETE (FR-012); empty state renders.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PhotoGallery from '../../frontend/src/pages/body/PhotoGallery.jsx';

let deleteCalls = [];

function listResponse(items) {
  return new Response(JSON.stringify({ data: { items } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ITEMS = [
  { id: 'a', takenOn: '2026-03-01', weightKg: 73, url: '/static/a.jpg', note: null },
  { id: 'b', takenOn: '2026-02-01', weightKg: 71, url: '/static/b.jpg', note: null },
  { id: 'c', takenOn: '2026-01-01', weightKg: null, url: '/static/c.jpg', note: null },
];

function prefsResponse(units) {
  return new Response(JSON.stringify({ data: { units } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stub(items, { units } = {}) {
  globalThis.fetch = vi.fn(async (url, init) => {
    const path = String(url);
    if (init?.method === 'DELETE' && path.includes('/api/v1/body-tracking/photos/')) {
      deleteCalls.push(path);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/api/v1/me/preferences')) {
      return units ? prefsResponse(units) : new Response('not found', { status: 404 });
    }
    if (path.endsWith('/api/v1/body-tracking/photos')) return listResponse(items);
    return new Response('not found', { status: 404 });
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PhotoGallery />
    </MemoryRouter>,
  );
}

describe('PhotoGallery (US4 smoke)', () => {
  beforeEach(() => {
    deleteCalls = [];
    globalThis.fetch = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a date-ordered grid with weight overlays', async () => {
    stub(ITEMS);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('photo-grid')).toBeInTheDocument());
    const overlays = screen.getAllByTestId('photo-weight-overlay');
    expect(overlays.length).toBe(3);
    expect(overlays[0]).toHaveTextContent('73 kg');
    // A photo with no weight shows a placeholder overlay, not a crash.
    expect(overlays[2]).toHaveTextContent('—');
  });

  it('opens a photo full-screen', async () => {
    stub(ITEMS);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('photo-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Photo du 2026-03-01' }));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  });

  it('selects two photos for a before/after comparison', async () => {
    stub(ITEMS);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('photo-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Comparer avant \/ après/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Photo du 2026-03-01' }));
    fireEvent.click(screen.getByRole('button', { name: 'Photo du 2026-01-01' }));
    expect(screen.getByTestId('compare-view')).toBeInTheDocument();
  });

  it('confirms then deletes a photo (FR-012)', async () => {
    stub(ITEMS);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('photo-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Supprimer la photo du 2026-03-01/i }));
    await waitFor(() => expect(deleteCalls.length).toBe(1));
    expect(deleteCalls[0]).toContain('/api/v1/body-tracking/photos/a');
  });

  it('shows a designed empty state when no photos exist (FR-027)', async () => {
    stub([]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('gallery-empty')).toBeInTheDocument());
  });

  it('converts the weight overlay to lbs for display only when the unit preference is lbs (FR-028)', async () => {
    let postedNonMetric = false;
    stub(ITEMS, { units: 'lbs' });
    // Intercept to assert no client request ever sends a non-metric value.
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (init?.body && String(init.body).match(/lbs|160|161/)) postedNonMetric = true;
      return baseFetch(url, init);
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('photo-grid')).toBeInTheDocument());
    const overlays = screen.getAllByTestId('photo-weight-overlay');
    // 73 kg → ~160.94 lbs, displayed in lbs (display-only).
    await waitFor(() => expect(overlays[0]).toHaveTextContent(/lbs/));
    expect(overlays[0]).not.toHaveTextContent('73 kg');
    // The stored/API value is never re-sent in imperial.
    expect(postedNonMetric).toBe(false);
  });
});
