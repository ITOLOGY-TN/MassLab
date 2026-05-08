// Phase 2 US1 (T019): smoke test for the profile settings screen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfileSettings from '../../frontend/src/pages/settings/ProfileSettings.jsx';

const SEED_ATHLETE = {
  id: '00000000-0000-0000-0000-000000000001',
  display_name: 'Ahmed',
  age: 27,
  biological_sex: 'male',
  height_cm: 178,
  starting_weight_kg: 58,
  target_weight_kg: 70,
  morphotype: 'ectomorph',
  activity_level: 'moderately_active',
  weekly_session_count: 5,
  program_start_date: '2026-05-01',
};

let lastPatchBody = null;

beforeEach(() => {
  lastPatchBody = null;
  globalThis.fetch = vi.fn(async (url, init) => {
    const path = String(url);
    if (init?.method === 'PATCH' && path.endsWith('/api/v1/me')) {
      lastPatchBody = JSON.parse(init.body);
      const next = { ...SEED_ATHLETE, starting_weight_kg: lastPatchBody.current_weight_kg ?? 58 };
      return new Response(
        JSON.stringify({
          data: {
            athlete: next,
            profile: next,
            recompute: { calculation_audit_id: 42, engine_version: '1.0.0', program_id: 7 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (path.endsWith('/api/v1/me')) {
      return new Response(JSON.stringify({ data: SEED_ATHLETE }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
});

function renderUnderRouter() {
  return render(
    <MemoryRouter>
      <ProfileSettings />
    </MemoryRouter>,
  );
}

describe('ProfileSettings (US1 smoke)', () => {
  it('renders the form with the loaded values', async () => {
    renderUnderRouter();
    await waitFor(() => expect(screen.getByLabelText(/Poids actuel/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Poids actuel/i)).toHaveValue(58);
    expect(screen.getByLabelText(/Âge/i)).toHaveValue(27);
  });

  it('save button stays disabled until a field is edited (dirty guard)', async () => {
    renderUnderRouter();
    await waitFor(() => expect(screen.getByLabelText(/Poids actuel/i)).toBeInTheDocument());
    const save = screen.getByRole('button', { name: /Enregistrer/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Poids actuel/i), { target: { value: '59' } });
    expect(save).toBeEnabled();
  });

  it('submits PATCH /api/v1/me with current_weight_kg and surfaces the recompute summary', async () => {
    renderUnderRouter();
    await waitFor(() => expect(screen.getByLabelText(/Poids actuel/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Poids actuel/i), { target: { value: '59' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/audit #42/i),
    );
    expect(lastPatchBody).toEqual({ current_weight_kg: 59 });
  });
});
