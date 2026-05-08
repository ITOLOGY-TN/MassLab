import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NutritionHome from '../../frontend/src/pages/NutritionHome.jsx';

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).endsWith('/api/v1/nutrition/targets')) {
      return new Response(
        JSON.stringify({
          data: {
            tdee_kcal: 2358,
            daily_kcal: 2758,
            macros: { protein_g: 109, carbs_g: 407, fat_g: 77 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
});

describe('NutritionHome (frontend smoke)', () => {
  it('fetches /api/v1/nutrition/targets and renders the four numbers', async () => {
    render(<NutritionHome />);
    expect(globalThis.fetch).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/2758 kcal/)).toBeInTheDocument());
    expect(screen.getByText('109 g')).toBeInTheDocument();
    expect(screen.getByText('407 g')).toBeInTheDocument();
    expect(screen.getByText('77 g')).toBeInTheDocument();
  });
});
