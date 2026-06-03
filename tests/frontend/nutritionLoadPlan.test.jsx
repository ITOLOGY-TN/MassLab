import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// US2 (FR-010/FR-011): mock the nutrition API so we can assert the exact
// loadPlan(date, mode) dispatches without a real network. getDay always
// returns an empty day so the page reaches its ready state; loadPlan is the
// behaviour under test.
vi.mock('../../frontend/src/lib/nutritionApi.js', () => ({
  getDay: vi.fn(),
  logEntry: vi.fn(),
  editEntry: vi.fn(),
  deleteEntry: vi.fn(),
  searchFoods: vi.fn(async () => []),
  loadPlan: vi.fn(),
  addHydration: vi.fn(),
}));

import NutritionDay from '../../frontend/src/pages/nutrition/NutritionDay.jsx';
import { getDay, loadPlan } from '../../frontend/src/lib/nutritionApi.js';

// The five meal slots, with the empty subtotal shared by every card.
const EMPTY_SUBTOTAL = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
function slot(key) {
  return { slot: key, entries: [], subtotal: { ...EMPTY_SUBTOTAL } };
}

const EMPTY_DAY = {
  date: '2026-06-03',
  slots: [
    slot('breakfast'),
    slot('lunch'),
    slot('pre_workout'),
    slot('dinner'),
    slot('evening_snack'),
  ],
  totals: { ...EMPTY_SUBTOTAL },
  bars: {
    kcal: { value: 0, target: 3300, pct: 0, state: 'under' },
    protein_g: { value: 0, target: 175, pct: 0, state: 'under' },
    carbs_g: { value: 0, target: 430, pct: 0, state: 'under' },
    fat_g: { value: 0, target: 90, pct: 0, state: 'under' },
  },
  hydration: { total_ml: 0, goal_ml: 3000 },
};

// A 409 from POST /load-plan surfaces through api.js as an Error carrying
// .status and .code (LOAD_PLAN_CONFLICT); the LoadPlan component switches on
// err.code, so the mock must mirror that shape.
function loadPlanConflict() {
  const error = new Error('POST /api/v1/nutrition/load-plan failed: 409 conflict');
  error.status = 409;
  error.code = 'LOAD_PLAN_CONFLICT';
  return error;
}

describe('NutritionDay — load daily plan (US2 frontend smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDay.mockResolvedValue(EMPTY_DAY);
  });

  it('calls loadPlan(date) (no mode) when an empty day loads cleanly', async () => {
    loadPlan.mockResolvedValue(undefined);

    render(<NutritionDay />);
    await waitFor(() => expect(screen.getByTestId('load-plan-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('load-plan-toggle'));

    // The empty-day load fires loadPlan with just the date — no replace/append.
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith('2026-06-03', undefined));
    expect(screen.queryByTestId('load-plan-conflict')).toBeNull();
    // A success refetches the day so bars + slots stay live.
    expect(getDay).toHaveBeenCalledTimes(2);
  });

  it('shows the replace/append prompt on a 409 and dispatches the chosen mode', async () => {
    // First call → conflict; the subsequent mode-bearing call succeeds.
    loadPlan.mockRejectedValueOnce(loadPlanConflict()).mockResolvedValue(undefined);

    render(<NutritionDay />);
    await waitFor(() => expect(screen.getByTestId('load-plan-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('load-plan-toggle'));

    // The 409 reveals the conflict dialog with both choices.
    await waitFor(() => expect(screen.getByTestId('load-plan-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('load-plan-replace')).toBeInTheDocument();
    expect(screen.getByTestId('load-plan-append')).toBeInTheDocument();
    expect(loadPlan).toHaveBeenCalledWith('2026-06-03', undefined);

    // Choosing "Remplacer" re-calls with the explicit mode.
    fireEvent.click(screen.getByTestId('load-plan-replace'));
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith('2026-06-03', 'replace'));

    // The dialog dismisses and the day refetches after the successful replace.
    await waitFor(() => expect(screen.queryByTestId('load-plan-conflict')).toBeNull());
    expect(getDay).toHaveBeenCalledTimes(2);
  });

  it('dispatches append mode when the athlete keeps existing entries', async () => {
    loadPlan.mockRejectedValueOnce(loadPlanConflict()).mockResolvedValue(undefined);

    render(<NutritionDay />);
    await waitFor(() => expect(screen.getByTestId('load-plan-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('load-plan-toggle'));
    await waitFor(() => expect(screen.getByTestId('load-plan-append')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('load-plan-append'));
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith('2026-06-03', 'append'));
    await waitFor(() => expect(screen.queryByTestId('load-plan-conflict')).toBeNull());
  });
});
