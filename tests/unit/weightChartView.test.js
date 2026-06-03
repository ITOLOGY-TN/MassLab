import { describe, it, expect } from 'vitest';
import { build } from '../../services/bodyTracking/weightChartView.js';

const profile = {
  starting_weight_kg: 60,
  target_weight_kg: 68,
  program_start_date: '2026-04-27',
};
const phases = [
  { name: 'Volume', weeks: 4, display_order: 1 },
  { name: 'Intensité', weeks: 8, display_order: 2 },
  { name: 'Force', weeks: 8, display_order: 3 },
];
const asOf = '2026-05-15';

describe('weightChartView.build', () => {
  it('assembles the full view model from measurements + profile + phases', () => {
    const measurements = [
      { measured_on: '2026-05-04', weight_kg: 61.5 },
      { measured_on: '2026-04-27', weight_kg: 60.0 },
      { measured_on: '2026-05-11', weight_kg: 62.2 },
    ];
    const view = build({ measurements, profile, phases, asOf });

    // points: weight_kg non-null, date-ascending, from program_start_date
    expect(view.points).toEqual([
      { date: '2026-04-27', kg: 60.0 },
      { date: '2026-05-04', kg: 61.5 },
      { date: '2026-05-11', kg: 62.2 },
    ]);

    // goal line at target weight (FR-017)
    expect(view.goalKg).toBe(68);

    // ideal zone spans the whole program window (20 weeks → 21 endpoints) (FR-018)
    expect(view.zone).not.toBeNull();
    expect(view.zone.lower).toHaveLength(21);
    expect(view.zone.upper).toHaveLength(21);
    expect(view.zone.lower[0].date).toBe('2026-04-27');

    // phase markers at cumulative dates (FR-019)
    expect(view.phaseMarkers).toEqual([
      { name: 'Volume', date: '2026-04-27' },
      { name: 'Intensité', date: '2026-05-25' },
      { name: 'Force', date: '2026-07-20' },
    ]);

    // ≥2 points → hasTrend true (FR-020)
    expect(view.hasTrend).toBe(true);
  });

  it('drops null-weight rows and rows before the program start date', () => {
    const measurements = [
      { measured_on: '2026-04-01', weight_kg: 59.0 }, // before program start → dropped
      { measured_on: '2026-04-27', weight_kg: 60.0 },
      { measured_on: '2026-05-04', weight_kg: null }, // note/circumference-only → dropped
      { measured_on: '2026-05-11', weight_kg: 62.2 },
    ];
    const view = build({ measurements, profile, phases, asOf });
    expect(view.points.map((p) => p.date)).toEqual(['2026-04-27', '2026-05-11']);
  });

  it('hasTrend is false at 0 and 1 points (FR-020)', () => {
    expect(build({ measurements: [], profile, phases, asOf }).hasTrend).toBe(false);
    expect(
      build({
        measurements: [{ measured_on: '2026-05-04', weight_kg: 61.5 }],
        profile,
        phases,
        asOf,
      }).hasTrend,
    ).toBe(false);
  });

  it('omits the goal line gracefully when target weight is unset (FR-017)', () => {
    const view = build({
      measurements: [{ measured_on: '2026-05-04', weight_kg: 61.5 }],
      profile: { starting_weight_kg: 60, program_start_date: '2026-04-27' },
      phases,
      asOf,
    });
    expect(view.goalKg).toBeNull();
  });

  it('omits the ideal zone gracefully when inputs are missing (FR-018)', () => {
    // no starting weight
    const noStart = build({
      measurements: [{ measured_on: '2026-05-04', weight_kg: 61.5 }],
      profile: { target_weight_kg: 68, program_start_date: '2026-04-27' },
      phases,
      asOf,
    });
    expect(noStart.zone).toBeNull();

    // no program start date
    const noDate = build({
      measurements: [{ measured_on: '2026-05-04', weight_kg: 61.5 }],
      profile: { starting_weight_kg: 60, target_weight_kg: 68 },
      phases,
      asOf,
    });
    expect(noDate.zone).toBeNull();

    // no phases → totalWeeks null → zone omitted, markers empty
    const noPhases = build({
      measurements: [{ measured_on: '2026-05-04', weight_kg: 61.5 }],
      profile,
      phases: [],
      asOf,
    });
    expect(noPhases.zone).toBeNull();
    expect(noPhases.phaseMarkers).toEqual([]);
  });

  it('renders an empty but well-formed view with no data (FR-027)', () => {
    const view = build({ measurements: [], profile: {}, phases: [], asOf });
    expect(view).toEqual({
      points: [],
      goalKg: null,
      zone: null,
      phaseMarkers: [],
      hasTrend: false,
    });
  });
});
