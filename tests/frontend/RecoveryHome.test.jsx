import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Phase 9 (012-phase9-recovery-wellbeing) T010/T015 — frontend smoke for the recovery
// home: the 30-second check-in (stars, ±steppers, mood, body diagram, note) saves a
// partial payload, a reload renders the saved values, a body-diagram tap toggles a sore
// zone, the mood picker selects one, the empty state renders, and a prior-week
// (non-editable) day disables saving. recoveryApi is mocked (no network).

vi.mock('../../frontend/src/lib/recoveryApi.js', () => ({
  getCheckin: vi.fn(),
  putCheckin: vi.fn(),
  getAlerts: vi.fn(),
  getTrends: vi.fn(),
}));

import {
  getCheckin,
  putCheckin,
  getAlerts,
} from '../../frontend/src/lib/recoveryApi.js';
import RecoveryHome from '../../frontend/src/pages/recovery/RecoveryHome.jsx';

const DATE = '2026-06-03';

const OPTIONS = {
  moods: ['great', 'good', 'ok', 'low', 'bad'],
  sore_zones: ['neck', 'shoulders', 'chest', 'quads', 'lower_back', 'calves'],
};

function checkinView({ editable = true, checkin = null } = {}) {
  return { date: DATE, editable, checkin, options: OPTIONS };
}

const ALL_CLEAR = { all_clear: true, alerts: [] };

function renderPage() {
  return render(
    <MemoryRouter>
      <RecoveryHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAlerts.mockResolvedValue(ALL_CLEAR);
});

describe('RecoveryHome (frontend smoke)', () => {
  it('fills the form and saves a partial check-in payload', async () => {
    getCheckin.mockResolvedValue(checkinView());
    putCheckin.mockResolvedValue({
      sleep_quality: 4,
      sleep_hours: null,
      energy: null,
      stress: null,
      mood: 'good',
      sore_zones: ['quads'],
      note: null,
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId('checkin-form')).toBeInTheDocument());

    // 4 stars for sleep quality.
    fireEvent.click(screen.getByTestId('sleep-quality').querySelector('[data-value="4"]'));
    expect(
      screen.getByTestId('sleep-quality').querySelector('[data-value="4"]'),
    ).toHaveAttribute('data-active', 'true');

    // Pick the "good" mood.
    fireEvent.click(within(screen.getByTestId('mood-picker')).getByLabelText('Bien'));
    expect(
      within(screen.getByTestId('mood-picker')).getByLabelText('Bien'),
    ).toHaveAttribute('data-selected', 'true');

    // Tap a sore zone.
    fireEvent.click(screen.getByTestId('body-diagram').querySelector('[data-zone="quads"]'));

    fireEvent.click(screen.getByTestId('checkin-save'));

    await waitFor(() => expect(putCheckin).toHaveBeenCalledTimes(1));
    const body = putCheckin.mock.calls[0][0];
    expect(body).toMatchObject({
      logged_on: DATE,
      sleep_quality: 4,
      mood: 'good',
      sore_zones: ['quads'],
    });
    // Partial save: untouched signals are omitted, never substituted.
    expect(body).not.toHaveProperty('energy');
    expect(body).not.toHaveProperty('stress');
    expect(body).not.toHaveProperty('sleep_hours');

    await waitFor(() => expect(screen.getByTestId('save-status')).toHaveTextContent('Enregistré'));
  });

  it('renders saved values on (re)load', async () => {
    getCheckin.mockResolvedValue(
      checkinView({
        checkin: {
          sleep_quality: 3,
          sleep_hours: 7.5,
          energy: 6,
          stress: 5,
          mood: 'ok',
          sore_zones: ['calves'],
          note: 'Jambes lourdes',
        },
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByTestId('checkin-form')).toBeInTheDocument());

    // Stars reflect the saved 3/5.
    expect(
      screen.getByTestId('sleep-quality').querySelector('[data-value="3"]'),
    ).toHaveAttribute('data-active', 'true');
    expect(
      screen.getByTestId('sleep-quality').querySelector('[data-value="4"]'),
    ).toHaveAttribute('data-active', 'false');

    // Numeric steppers hold the saved values.
    expect(screen.getByTestId('sleep-hours')).toHaveValue(7.5);
    expect(screen.getByTestId('energy')).toHaveValue(6);
    expect(screen.getByTestId('stress')).toHaveValue(5);

    // Mood + sore zone + note restored.
    expect(within(screen.getByTestId('mood-picker')).getByLabelText('Correct')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(
      screen.getByTestId('body-diagram').querySelector('[data-zone="calves"]'),
    ).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('note')).toHaveValue('Jambes lourdes');
  });

  it('toggles a sore zone on body-diagram tap (in then out)', async () => {
    getCheckin.mockResolvedValue(checkinView());
    renderPage();
    await waitFor(() => expect(screen.getByTestId('body-diagram')).toBeInTheDocument());

    const zone = () =>
      screen.getByTestId('body-diagram').querySelector('[data-zone="quads"]');
    expect(zone()).toHaveAttribute('data-selected', 'false');

    fireEvent.click(zone());
    expect(zone()).toHaveAttribute('data-selected', 'true');

    fireEvent.click(zone());
    expect(zone()).toHaveAttribute('data-selected', 'false');
  });

  it('selects a mood', async () => {
    getCheckin.mockResolvedValue(checkinView());
    renderPage();
    await waitFor(() => expect(screen.getByTestId('mood-picker')).toBeInTheDocument());

    const great = within(screen.getByTestId('mood-picker')).getByLabelText('Excellent');
    expect(great).toHaveAttribute('data-selected', 'false');
    fireEvent.click(great);
    expect(great).toHaveAttribute('data-selected', 'true');
  });

  it('renders an empty/blank form when nothing is logged', async () => {
    getCheckin.mockResolvedValue(checkinView({ checkin: null }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('checkin-form')).toBeInTheDocument());

    // No star active, no mood selected, no sore zone, empty note.
    const activeStars = screen
      .getByTestId('sleep-quality')
      .querySelectorAll('[data-active="true"]');
    expect(activeStars).toHaveLength(0);
    expect(
      within(screen.getByTestId('mood-picker')).queryByText((_, el) =>
        el?.getAttribute('data-selected') === 'true',
      ),
    ).toBeNull();
    expect(screen.getByTestId('note')).toHaveValue('');
    // Save is enabled on an editable, empty day.
    expect(screen.getByTestId('checkin-save')).not.toBeDisabled();
  });

  it('disables saving on a non-editable (prior-week) day', async () => {
    getCheckin.mockResolvedValue(
      checkinView({ editable: false, checkin: { sleep_quality: 2, sore_zones: [] } }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('checkin-form')).toBeInTheDocument());

    expect(screen.getByTestId('readonly-banner')).toBeInTheDocument();
    expect(screen.getByTestId('checkin-save')).toBeDisabled();

    // The save handler is a no-op even if invoked.
    fireEvent.click(screen.getByTestId('checkin-save'));
    expect(putCheckin).not.toHaveBeenCalled();
  });
});
