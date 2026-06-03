import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import NutritionDay from '../../frontend/src/pages/nutrition/NutritionDay.jsx';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// The five meal slots, with the empty subtotal shared by all-but-breakfast.
const EMPTY_SUBTOTAL = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
function slot(key, entries = []) {
  const subtotal = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein_g: acc.protein_g + e.protein_g,
      carbs_g: acc.carbs_g + e.carbs_g,
      fat_g: acc.fat_g + e.fat_g,
    }),
    { ...EMPTY_SUBTOTAL },
  );
  return { slot: key, entries, subtotal };
}

// Day view with one breakfast entry and four bars.
function dayWith(entries) {
  const totals = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein_g: acc.protein_g + e.protein_g,
      carbs_g: acc.carbs_g + e.carbs_g,
      fat_g: acc.fat_g + e.fat_g,
    }),
    { ...EMPTY_SUBTOTAL },
  );
  return {
    date: '2026-06-03',
    slots: [
      slot('breakfast', entries),
      slot('lunch'),
      slot('pre_workout'),
      slot('dinner'),
      slot('evening_snack'),
    ],
    totals,
    bars: {
      kcal: { value: totals.kcal, target: 3300, pct: totals.kcal / 3300, state: 'under' },
      protein_g: {
        value: totals.protein_g,
        target: 175,
        pct: totals.protein_g / 175,
        state: 'under',
      },
      carbs_g: { value: totals.carbs_g, target: 430, pct: totals.carbs_g / 430, state: 'under' },
      fat_g: { value: totals.fat_g, target: 90, pct: totals.fat_g / 90, state: 'under' },
    },
    hydration: { total_ml: 750, goal_ml: 3000 },
  };
}

const OATS = {
  id: 12,
  food_id: 3,
  food_name: "Flocons d'avoine",
  quantity_g: 80,
  kcal: 300,
  protein_g: 10,
  carbs_g: 54,
  fat_g: 6,
};

const EMPTY_DAY = dayWith([]);
const DAY_WITH_OATS = dayWith([OATS]);

describe('NutritionDay (frontend smoke)', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('renders the four progress bars from the day view', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/api/v1/nutrition/day')
        ? json(200, { data: DAY_WITH_OATS })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    render(<NutritionDay />);

    // All four macro bars render with their stubbed value/state.
    await waitFor(() => expect(screen.getByTestId('bar-kcal')).toBeInTheDocument());
    for (const key of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) {
      const bar = screen.getByTestId(`bar-${key}`);
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveAttribute('data-state', 'under');
    }
    // The breakfast entry from the stubbed view is visible.
    expect(screen.getByText("Flocons d'avoine")).toBeInTheDocument();
  });

  it('refetches and updates the bars after logging a searched food', async () => {
    // First /day → empty; after logging, /day → contains the oats entry.
    let dayCalls = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/api/v1/nutrition/log') && method === 'POST') {
        return json(201, { data: OATS });
      }
      if (u.includes('/api/v1/foods')) {
        return json(200, {
          data: [{ id: 3, name: "Flocons d'avoine", kcal_per_100g: 375 }],
        });
      }
      if (u.includes('/api/v1/nutrition/day')) {
        dayCalls += 1;
        return json(200, { data: dayCalls === 1 ? EMPTY_DAY : DAY_WITH_OATS });
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    render(<NutritionDay />);
    await waitFor(() => expect(screen.getByTestId('bar-kcal')).toBeInTheDocument());

    // Initially the kcal bar reads 0; the breakfast card shows the empty copy.
    expect(within(screen.getByTestId('bar-kcal')).getByText(/^0/)).toBeInTheDocument();

    // Open the breakfast "add food" control and search.
    const breakfastCard = screen.getAllByTestId('meal-card')[0];
    fireEvent.click(within(breakfastCard).getByTestId('add-food-toggle'));
    const search = within(breakfastCard).getByLabelText('Rechercher un aliment');
    fireEvent.change(search, { target: { value: 'flocons' } });

    // Debounced search result appears; click it to log.
    const result = await within(breakfastCard).findByTestId('food-result');
    fireEvent.click(result);

    // POST /log fired, then a refetch re-rendered the bars with the new total.
    await waitFor(() =>
      expect(
        globalThis.fetch.mock.calls.some(
          ([u, init]) =>
            String(u).includes('/api/v1/nutrition/log') && (init?.method ?? 'GET') === 'POST',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(within(screen.getByTestId('bar-kcal')).getByText(/^300/)).toBeInTheDocument(),
    );
  });

  it('exercises the custom-food path when search returns no results', async () => {
    let logBody = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/api/v1/nutrition/log') && method === 'POST') {
        logBody = JSON.parse(init.body);
        return json(201, { data: OATS });
      }
      if (u.includes('/api/v1/foods')) {
        // No catalogue match → drives the inline custom-food form.
        return json(200, { data: [] });
      }
      if (u.includes('/api/v1/nutrition/day')) {
        return json(200, { data: EMPTY_DAY });
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });

    render(<NutritionDay />);
    await waitFor(() => expect(screen.getByTestId('bar-kcal')).toBeInTheDocument());

    const breakfastCard = screen.getAllByTestId('meal-card')[0];
    fireEvent.click(within(breakfastCard).getByTestId('add-food-toggle'));
    fireEvent.change(within(breakfastCard).getByLabelText('Rechercher un aliment'), {
      target: { value: 'protéine maison' },
    });

    // Empty results reveal the custom-food form (prefilled with the query name).
    const form = await within(breakfastCard).findByTestId('custom-food-form');
    fireEvent.change(within(form).getByLabelText('kcal / 100 g'), { target: { value: '400' } });
    fireEvent.change(within(form).getByLabelText('Protéines / 100 g'), {
      target: { value: '80' },
    });
    fireEvent.change(within(form).getByLabelText('Glucides / 100 g'), { target: { value: '10' } });
    fireEvent.change(within(form).getByLabelText('Lipides / 100 g'), { target: { value: '5' } });
    fireEvent.submit(form);

    // The log POST carries the custom_food payload (FR-002a path).
    await waitFor(() => expect(logBody).not.toBeNull());
    expect(logBody.slot).toBe('breakfast');
    expect(logBody.custom_food).toMatchObject({
      name: 'protéine maison',
      kcal_per_100g: 400,
      protein_per_100g: 80,
      carbs_per_100g: 10,
      fat_per_100g: 5,
    });
    expect(logBody.food_id).toBeUndefined();
  });

  it('renders the empty state for a day with no entries without error', async () => {
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/api/v1/nutrition/day')
        ? json(200, { data: EMPTY_DAY })
        : json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
    );

    render(<NutritionDay />);

    await waitFor(() => expect(screen.getByTestId('bar-kcal')).toBeInTheDocument());
    // Five meal cards, each with the empty-meal copy.
    expect(screen.getAllByTestId('meal-card')).toHaveLength(5);
    expect(screen.getAllByText('Aucun aliment pour ce repas.')).toHaveLength(5);
    // No entry rows rendered.
    expect(screen.queryByTestId('entry-row')).toBeNull();
  });
});
