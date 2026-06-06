// Phase 11 (US2) — Body / Strength statistics tabs. Renders each tab directly with stub
// props (populated + cold-start) and asserts the charts and the empty states render.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BodyTab from '../../frontend/src/pages/statistics/tabs/BodyTab.jsx';
import StrengthTab from '../../frontend/src/pages/statistics/tabs/StrengthTab.jsx';

describe('BodyTab', () => {
  it('renders the weight curve and one chart per measurement series', () => {
    const body = {
      weight: {
        points: [
          { date: '2026-01-10', weight_kg: 70 },
          { date: '2026-01-20', weight_kg: 72 },
        ],
        goal_kg: 75,
        has_data: true,
      },
      measurements: [
        {
          key: 'chest',
          label: 'Poitrine',
          unit: 'cm',
          points: [
            { date: '2026-01-10', value: 100 },
            { date: '2026-01-20', value: 102 },
          ],
        },
        {
          key: 'arm',
          label: 'Bras',
          unit: 'cm',
          points: [{ date: '2026-01-20', value: 35 }],
        },
      ],
    };
    render(<BodyTab body={body} />);
    expect(screen.getByTestId('body-tab')).toBeTruthy();
    // weight curve + 2 measurement series = 3 line charts.
    expect(screen.getAllByTestId('line-chart').length).toBe(3);
    expect(screen.getByText('Poitrine (cm)')).toBeTruthy();
  });

  it('renders empty states cold-start (no weight, no measurements)', () => {
    render(<BodyTab body={{ weight: { points: [], goal_kg: null, has_data: false }, measurements: [] }} />);
    expect(screen.getByTestId('body-tab')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.getByText('Aucun poids enregistré pour l’instant.')).toBeTruthy();
    expect(screen.getByText('Aucune mensuration enregistrée pour l’instant.')).toBeTruthy();
  });
});

describe('StrengthTab', () => {
  it('renders top progressions, weekly volume bars, and the muscle radar', () => {
    const strength = {
      top_progressions: [
        {
          exercise_id: 1,
          name: 'Squat',
          gain_kg: 30,
          series: [
            { date: '2026-01-06', working_weight_kg: 80 },
            { date: '2026-02-06', working_weight_kg: 110 },
          ],
        },
      ],
      weekly_volume: [
        { week_start: '2026-01-05', volume_kg: 1500 },
        { week_start: '2026-01-12', volume_kg: 2000 },
      ],
      muscle_radar: {
        axes: [
          { muscle_group: 'Jambes', color: '#0f0' },
          { muscle_group: 'Pectoraux', color: '#f00' },
        ],
        values: [50, 0],
      },
    };
    render(<StrengthTab strength={strength} />);
    expect(screen.getByTestId('strength-tab')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
    expect(screen.getByTestId('radar-chart')).toBeTruthy();
  });

  it('renders empty states cold-start (no progressions, no volume, no radar axes)', () => {
    render(
      <StrengthTab
        strength={{ top_progressions: [], weekly_volume: [], muscle_radar: { axes: [], values: [] } }}
      />,
    );
    expect(screen.getByTestId('strength-tab')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
    expect(screen.queryByTestId('radar-chart')).toBeNull();
    expect(screen.getByText('Pas encore assez de données de charge.')).toBeTruthy();
  });
});
