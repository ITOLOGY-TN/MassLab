// Phase 11 (US3) — Attendance / Nutrition / Recovery statistics tabs. Renders each tab
// directly with stub props (populated + cold-start/insufficient) and asserts the charts
// and the empty/insufficient states render.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AttendanceTab from '../../frontend/src/pages/statistics/tabs/AttendanceTab.jsx';
import NutritionTab from '../../frontend/src/pages/statistics/tabs/NutritionTab.jsx';
import RecoveryTab from '../../frontend/src/pages/statistics/tabs/RecoveryTab.jsx';

describe('AttendanceTab', () => {
  it('renders a monthly heatmap when days are present', () => {
    const attendance = {
      from: '2026-06-01',
      to: '2026-06-03',
      levels: 4,
      days: [
        { date: '2026-06-01', volume_kg: 0, level: 0 },
        { date: '2026-06-02', volume_kg: 1000, level: 4 },
        { date: '2026-06-03', volume_kg: 500, level: 2 },
      ],
    };
    render(<AttendanceTab attendance={attendance} />);
    expect(screen.getByTestId('attendance-tab')).toBeTruthy();
    expect(screen.getAllByTestId('calendar-heatmap').length).toBeGreaterThan(0);
  });

  it('renders an empty state when there are no days', () => {
    render(<AttendanceTab attendance={{ from: '', to: '', levels: 0, days: [] }} />);
    expect(screen.getByTestId('attendance-tab')).toBeTruthy();
    expect(screen.queryByTestId('calendar-heatmap')).toBeNull();
  });
});

describe('NutritionTab', () => {
  it('renders the weekly calories line chart when data is present', () => {
    const nutrition = {
      weekly: [
        { week_start: '2026-06-01', kcal: 18000 },
        { week_start: '2026-06-08', kcal: 19500 },
      ],
      weekly_target_kcal: 21000,
    };
    render(<NutritionTab nutrition={nutrition} />);
    expect(screen.getByTestId('nutrition-tab')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('renders an empty state when weekly is empty', () => {
    render(<NutritionTab nutrition={{ weekly: [], weekly_target_kcal: null }} />);
    expect(screen.getByTestId('nutrition-tab')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});

describe('RecoveryTab', () => {
  it('renders sleep line chart + stress-weight scatter when sufficient', () => {
    const recovery = {
      sleep: {
        points: [
          { date: '2026-06-01', hours: 7 },
          { date: '2026-06-02', hours: 8 },
        ],
        average_hours: 7.5,
      },
      stress_weight: {
        points: [
          { date: '2026-06-01', stress: 5, weight_kg: 80 },
          { date: '2026-06-02', stress: 6, weight_kg: 81 },
        ],
        sufficient: true,
      },
    };
    render(<RecoveryTab recovery={recovery} />);
    expect(screen.getByTestId('recovery-tab')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(screen.getByTestId('scatter-plot')).toBeTruthy();
  });

  it('shows the insufficient-data state instead of the scatter when not sufficient', () => {
    const recovery = {
      sleep: { points: [{ date: '2026-06-01', hours: 7 }], average_hours: 7 },
      stress_weight: { points: [], sufficient: false },
    };
    render(<RecoveryTab recovery={recovery} />);
    expect(screen.getByTestId('stress-weight-insufficient')).toBeTruthy();
    expect(screen.queryByTestId('scatter-plot')).toBeNull();
  });

  it('renders an empty state when there are no sleep points', () => {
    render(
      <RecoveryTab
        recovery={{ sleep: { points: [], average_hours: null }, stress_weight: { points: [], sufficient: false } }}
      />,
    );
    expect(screen.getByTestId('recovery-tab')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});
