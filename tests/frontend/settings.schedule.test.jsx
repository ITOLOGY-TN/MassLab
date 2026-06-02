// Phase 2 US2 (T039): smoke test for the schedule settings screen.
// Verifies the all-7-days layout, rest-day toggle, and the PUT shape on save.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ScheduleSettings from '../../frontend/src/pages/settings/ScheduleSettings.jsx';

const SCHEDULE = {
  active_days: 3,
  slots: [
    {
      id: 1,
      day_of_week: 1,
      muscle_group_id: 6,
      display_order: 1,
      display_color: '#ff6b6b',
      exercises: [],
    },
    {
      id: 2,
      day_of_week: 2,
      muscle_group_id: 7,
      display_order: 2,
      display_color: '#4ecdc4',
      exercises: [],
    },
    {
      id: 3,
      day_of_week: 3,
      muscle_group_id: 4,
      display_order: 3,
      display_color: '#ffd166',
      exercises: [],
    },
  ],
};

const GROUPS = [
  {
    id: 6,
    slug: 'chest_triceps',
    name: 'Pectoraux + Triceps',
    is_active: true,
    display_color: '#ff6b6b',
  },
  { id: 7, slug: 'back_biceps', name: 'Dos + Biceps', is_active: true, display_color: '#4ecdc4' },
  { id: 4, slug: 'legs', name: 'Jambes', is_active: true, display_color: '#ffd166' },
  { id: 9, slug: 'shoulders_traps', name: 'Épaules', is_active: true, display_color: '#9b8cff' },
  { id: 10, slug: 'arms_core', name: 'Bras + Tronc', is_active: true, display_color: '#06d6a0' },
];

let lastPutBody = null;

beforeEach(() => {
  lastPutBody = null;
  globalThis.fetch = vi.fn(async (url, init) => {
    const path = String(url);
    if (init?.method === 'PUT' && path.endsWith('/api/v1/me/schedule')) {
      lastPutBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          data: { active_days: lastPutBody.slots.length, slots: lastPutBody.slots },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (path.endsWith('/api/v1/me/schedule')) {
      return new Response(JSON.stringify({ data: SCHEDULE }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.endsWith('/api/v1/muscle-groups')) {
      return new Response(JSON.stringify({ data: GROUPS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
});

describe('ScheduleSettings (US2 smoke)', () => {
  it('renders all 7 weekdays as fixed rows with select boxes', async () => {
    render(<ScheduleSettings />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Planning hebdomadaire/i })).toBeInTheDocument(),
    );
    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(7);
    expect(screen.getByText('Lundi')).toBeInTheDocument();
    expect(screen.getByText('Dimanche')).toBeInTheDocument();
  });

  it('Save is disabled until a day is changed', async () => {
    render(<ScheduleSettings />);
    await waitFor(() => screen.getByRole('button', { name: /Enregistrer/i }));
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeDisabled();
  });

  it('switching a training day to "Repos" enables Save and PUTs only the remaining days', async () => {
    render(<ScheduleSettings />);
    await waitFor(() => screen.getAllByRole('combobox'));
    const selects = screen.getAllByRole('combobox');
    // Day 1 (Mon) is currently muscle_group 6 — switch it to rest.
    fireEvent.change(selects[0], { target: { value: '__rest__' } });
    const save = screen.getByRole('button', { name: /Enregistrer/i });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(lastPutBody).not.toBeNull());
    // Mon is gone; Tue + Wed remain.
    expect(lastPutBody.slots.map((s) => s.day_of_week)).toEqual([2, 3]);
    expect(lastPutBody.active_days).toBe(2);
  });
});
