import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NutritionTrends from '../../frontend/src/pages/nutrition/NutritionTrends.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A trends view model with calories points (one logged), a macro breakdown for
// the day, and two weeks of average protein.
const TRENDS = {
  calories: {
    points: [
      { date: '2026-06-01', kcal: 0 },
      { date: '2026-06-02', kcal: 2400 },
      { date: '2026-06-03', kcal: 3100 },
    ],
    goalKcal: 3300,
  },
  macroBreakdown: {
    protein_g: 175,
    carbs_g: 430,
    fat_g: 90,
    fractions: { protein: 0.25, carbs: 0.62, fat: 0.13 },
  },
  weeklyProtein: [
    { weekStart: '2026-05-25', avgProteinG: 160 },
    { weekStart: '2026-06-01', avgProteinG: 180 },
  ],
};

// Everything zero / empty: low/no-data states everywhere, but no error.
const EMPTY_TRENDS = {
  calories: {
    points: [
      { date: '2026-06-02', kcal: 0 },
      { date: '2026-06-03', kcal: 0 },
    ],
    goalKcal: null,
  },
  macroBreakdown: {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fractions: { protein: 0, carbs: 0, fat: 0 },
  },
  weeklyProtein: [],
};

describe('NutritionTrends (frontend smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the three charts from the trends view', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/api/v1/nutrition/trends')
        ? json(200, { data: TRENDS })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    render(<NutritionTrends />);

    await waitFor(() => expect(screen.getByTestId('line-chart')).toBeInTheDocument());
    expect(screen.getByTestId('donut-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    // The goal kcal surfaces in the calories panel.
    expect(screen.getByText(/3300 kcal\/j/)).toBeInTheDocument();
  });

  it('renders low/no-data states without error', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/api/v1/nutrition/trends')
        ? json(200, { data: EMPTY_TRENDS })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    render(<NutritionTrends />);

    await waitFor(() => expect(screen.getByText('Tendances')).toBeInTheDocument());
    // No charts render; the empty copy shows for each panel.
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.queryByTestId('donut-chart')).toBeNull();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
    expect(screen.getByText(/Aucune calorie enregistrée/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun macronutriment enregistré/)).toBeInTheDocument();
    expect(screen.getByText(/Pas encore assez de données/)).toBeInTheDocument();
  });

  it('shows an error state when the trends request fails', async () => {
    globalThis.fetch = vi.fn(async () => json(500, { error: { code: 'DB_ERROR', message: 'x' } }));

    render(<NutritionTrends />);

    await waitFor(() => expect(screen.getByText('Erreur')).toBeInTheDocument());
  });
});
