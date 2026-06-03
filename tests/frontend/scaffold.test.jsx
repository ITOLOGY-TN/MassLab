import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ScaffoldHome from '../../frontend/src/pages/ScaffoldHome.jsx';

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).endsWith('/api/v1/athlete/me')) {
      return new Response(
        JSON.stringify({
          data: {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'ahmed@masslab.local',
            display_name: 'Ahmed',
            goal: 'bulk',
            morphotype: 'ectomorph',
            weekly_session_count: 5,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
});

describe('ScaffoldHome (frontend smoke)', () => {
  it('fetches /api/v1/athlete/me and renders the seeded display_name', async () => {
    render(<ScaffoldHome />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Ahmed/i),
    );
  });
});
