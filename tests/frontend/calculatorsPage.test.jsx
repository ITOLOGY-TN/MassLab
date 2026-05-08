import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BmrCalculator from '../../frontend/src/pages/calculators/BmrCalculator.jsx';
import OneRepMaxCalculator from '../../frontend/src/pages/calculators/OneRepMaxCalculator.jsx';

let lastUrl = null;

beforeEach(() => {
  lastUrl = null;
  globalThis.fetch = vi.fn(async (url, init) => {
    lastUrl = String(url);
    if (lastUrl.endsWith('/api/v1/calculators/bmr')) {
      return new Response(JSON.stringify({ data: { bmr_kcal: 1521 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (lastUrl.endsWith('/api/v1/calculators/one-rep-max')) {
      return new Response(
        JSON.stringify({
          data: {
            primary_estimate_kg: 92.1,
            epley_kg: 93.3,
            brzycki_kg: 90,
            lander_kg: 91,
            lombardi_kg: 94,
            reduced_confidence: false,
            percentage_table: [
              { pct: 60, load_kg: 55.3, reps_low: 12, reps_high: 15 },
              { pct: 70, load_kg: 64.5, reps_low: 10, reps_high: 12 },
              { pct: 75, load_kg: 69.1, reps_low: 8, reps_high: 10 },
              { pct: 80, load_kg: 73.7, reps_low: 6, reps_high: 8 },
              { pct: 85, load_kg: 78.3, reps_low: 4, reps_high: 6 },
              { pct: 90, load_kg: 82.9, reps_low: 2, reps_high: 4 },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
});

describe('Calculators page (frontend smoke)', () => {
  it('BMR form posts and renders the result', async () => {
    render(
      <MemoryRouter>
        <BmrCalculator />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculer/i }));
    await waitFor(() => expect(lastUrl).toContain('/api/v1/calculators/bmr'));
    await waitFor(() => expect(screen.getByText(/1521 kcal\/j/)).toBeInTheDocument());
  });

  it('1RM form posts and renders the percentage table', async () => {
    render(
      <MemoryRouter>
        <OneRepMaxCalculator />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /calculer/i }));
    await waitFor(() => expect(lastUrl).toContain('/api/v1/calculators/one-rep-max'));
    await waitFor(() => expect(screen.getByText(/92\.1 kg/)).toBeInTheDocument());
    expect(screen.getByText(/Table des pourcentages/)).toBeInTheDocument();
  });
});
