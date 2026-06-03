import { describe, it, expect } from 'vitest';
import {
  energyHeatmap,
  sleepPerformanceScatter,
  overlapSeries,
} from '../../services/engine/recoveryTrends.js';

describe('energyHeatmap', () => {
  it('returns one cell per calendar day of the month, ascending', () => {
    // February 2026 has 28 days.
    const out = energyHeatmap([], { year: 2026, month: 2 });
    expect(out.year).toBe(2026);
    expect(out.month).toBe(2);
    expect(out.cells).toHaveLength(28);
    expect(out.cells[0].date).toBe('2026-02-01');
    expect(out.cells[27].date).toBe('2026-02-28');
  });

  it('handles a 31-day month and a 30-day month', () => {
    expect(energyHeatmap([], { year: 2026, month: 1 }).cells).toHaveLength(31);
    expect(energyHeatmap([], { year: 2026, month: 6 }).cells).toHaveLength(30);
  });

  it('handles a leap-year February (29 days)', () => {
    const out = energyHeatmap([], { year: 2024, month: 2 });
    expect(out.cells).toHaveLength(29);
    expect(out.cells[28].date).toBe('2024-02-29');
  });

  it('maps each check-in energy to its day cell', () => {
    const checkins = [
      { logged_on: '2026-06-01', energy: 6 },
      { logged_on: '2026-06-03', energy: 8 },
    ];
    const out = energyHeatmap(checkins, { year: 2026, month: 6 });
    expect(out.cells[0]).toEqual({ date: '2026-06-01', energy: 6 });
    expect(out.cells[2]).toEqual({ date: '2026-06-03', energy: 8 });
  });

  it('leaves un-logged days as null (not 0)', () => {
    const checkins = [{ logged_on: '2026-06-02', energy: 5 }];
    const out = energyHeatmap(checkins, { year: 2026, month: 6 });
    expect(out.cells[0]).toEqual({ date: '2026-06-01', energy: null });
    expect(out.cells[1]).toEqual({ date: '2026-06-02', energy: 5 });
    expect(out.cells[2]).toEqual({ date: '2026-06-03', energy: null });
  });

  it('renders energy 0 distinctly from a missing check-in (null)', () => {
    const checkins = [{ logged_on: '2026-06-01', energy: 0 }];
    const out = energyHeatmap(checkins, { year: 2026, month: 6 });
    expect(out.cells[0]).toEqual({ date: '2026-06-01', energy: 0 });
    expect(out.cells[1].energy).toBeNull();
  });

  it('ignores check-ins outside the requested month', () => {
    const checkins = [
      { logged_on: '2026-05-31', energy: 9 },
      { logged_on: '2026-07-01', energy: 9 },
      { logged_on: '2026-06-15', energy: 4 },
    ];
    const out = energyHeatmap(checkins, { year: 2026, month: 6 });
    expect(out.cells.every((c) => c.date.startsWith('2026-06'))).toBe(true);
    expect(out.cells[14]).toEqual({ date: '2026-06-15', energy: 4 });
    // No spillover from adjacent months.
    expect(out.cells.find((c) => c.energy === 9)).toBeUndefined();
  });

  it('treats a missing energy value on a logged day as null', () => {
    const checkins = [{ logged_on: '2026-06-01', energy: null }];
    const out = energyHeatmap(checkins, { year: 2026, month: 6 });
    expect(out.cells[0].energy).toBeNull();
  });

  it('defaults to an empty check-in list', () => {
    const out = energyHeatmap(undefined, { year: 2026, month: 6 });
    expect(out.cells).toHaveLength(30);
    expect(out.cells.every((c) => c.energy === null)).toBe(true);
  });
});

describe('sleepPerformanceScatter', () => {
  it('emits a point only for days present in BOTH checkins and volumeByDay', () => {
    const checkins = [
      { logged_on: '2026-06-01', sleep_hours: 7 },
      { logged_on: '2026-06-02', sleep_hours: 6.5 },
      { logged_on: '2026-06-03', sleep_hours: 8 }, // no volume → dropped
    ];
    const volumeByDay = {
      '2026-06-01': 4200,
      '2026-06-02': 3800,
      '2026-06-04': 5000, // no check-in → dropped
    };
    const out = sleepPerformanceScatter(checkins, volumeByDay);
    expect(out).toEqual([
      { date: '2026-06-01', sleep_hours: 7, volume_kg: 4200 },
      { date: '2026-06-02', sleep_hours: 6.5, volume_kg: 3800 },
    ]);
  });

  it('drops a check-in with no sleep value even when volume exists (missing pair)', () => {
    const checkins = [
      { logged_on: '2026-06-01', sleep_hours: null },
      { logged_on: '2026-06-02' }, // sleep_hours absent
      { logged_on: '2026-06-03', sleep_hours: 7 },
    ];
    const volumeByDay = {
      '2026-06-01': 4200,
      '2026-06-02': 4200,
      '2026-06-03': 4200,
    };
    const out = sleepPerformanceScatter(checkins, volumeByDay);
    expect(out).toEqual([{ date: '2026-06-03', sleep_hours: 7, volume_kg: 4200 }]);
  });

  it('returns an empty array when no day has both a sleep value and a volume', () => {
    const checkins = [{ logged_on: '2026-06-01', sleep_hours: 7 }];
    const volumeByDay = { '2026-06-02': 4200 };
    expect(sleepPerformanceScatter(checkins, volumeByDay)).toEqual([]);
  });

  it('keeps a zero-volume training day as a valid pair', () => {
    const checkins = [{ logged_on: '2026-06-01', sleep_hours: 7 }];
    const volumeByDay = { '2026-06-01': 0 };
    expect(sleepPerformanceScatter(checkins, volumeByDay)).toEqual([
      { date: '2026-06-01', sleep_hours: 7, volume_kg: 0 },
    ]);
  });

  it('keeps a zero-sleep check-in as a valid pair (0 is a value, not missing)', () => {
    const checkins = [{ logged_on: '2026-06-01', sleep_hours: 0 }];
    const volumeByDay = { '2026-06-01': 4200 };
    expect(sleepPerformanceScatter(checkins, volumeByDay)).toEqual([
      { date: '2026-06-01', sleep_hours: 0, volume_kg: 4200 },
    ]);
  });

  it('returns points ascending by date regardless of input order', () => {
    const checkins = [
      { logged_on: '2026-06-03', sleep_hours: 8 },
      { logged_on: '2026-06-01', sleep_hours: 7 },
    ];
    const volumeByDay = { '2026-06-03': 5000, '2026-06-01': 4200 };
    const out = sleepPerformanceScatter(checkins, volumeByDay);
    expect(out.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-03']);
  });

  it('defaults both arguments', () => {
    expect(sleepPerformanceScatter()).toEqual([]);
    expect(sleepPerformanceScatter([{ logged_on: '2026-06-01', sleep_hours: 7 }])).toEqual([]);
  });
});

describe('overlapSeries', () => {
  it('aligns energy/stress/sleep arrays over the inclusive day axis', () => {
    const checkins = [
      { logged_on: '2026-06-01', energy: 6, stress: 5, sleep_hours: 7 },
      { logged_on: '2026-06-03', energy: 7, stress: 6, sleep_hours: 6.5 },
    ];
    const out = overlapSeries(checkins, { from: '2026-06-01', to: '2026-06-03' });
    expect(out.days).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(out.energy).toEqual([6, null, 7]);
    expect(out.stress).toEqual([5, null, 6]);
    expect(out.sleep).toEqual([7, null, 6.5]);
  });

  it('leaves gaps as null, never 0', () => {
    const out = overlapSeries([], { from: '2026-06-01', to: '2026-06-02' });
    expect(out.days).toEqual(['2026-06-01', '2026-06-02']);
    expect(out.energy).toEqual([null, null]);
    expect(out.stress).toEqual([null, null]);
    expect(out.sleep).toEqual([null, null]);
  });

  it('preserves a genuine 0 rating as 0 (distinct from a gap)', () => {
    const checkins = [{ logged_on: '2026-06-01', energy: 0, stress: 0, sleep_hours: 0 }];
    const out = overlapSeries(checkins, { from: '2026-06-01', to: '2026-06-02' });
    expect(out.energy).toEqual([0, null]);
    expect(out.stress).toEqual([0, null]);
    expect(out.sleep).toEqual([0, null]);
  });

  it('keeps each signal independent on a partially-filled day', () => {
    const checkins = [{ logged_on: '2026-06-01', energy: 6 }]; // stress/sleep absent
    const out = overlapSeries(checkins, { from: '2026-06-01', to: '2026-06-01' });
    expect(out.energy).toEqual([6]);
    expect(out.stress).toEqual([null]);
    expect(out.sleep).toEqual([null]);
  });

  it('ignores check-ins outside the [from, to] window', () => {
    const checkins = [
      { logged_on: '2026-05-31', energy: 9, stress: 9, sleep_hours: 9 },
      { logged_on: '2026-06-02', energy: 5, stress: 4, sleep_hours: 7 },
      { logged_on: '2026-06-04', energy: 9, stress: 9, sleep_hours: 9 },
    ];
    const out = overlapSeries(checkins, { from: '2026-06-01', to: '2026-06-03' });
    expect(out.days).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(out.energy).toEqual([null, 5, null]);
  });

  it('defaults a missing check-in list to all-null aligned arrays', () => {
    const out = overlapSeries(undefined, { from: '2026-06-01', to: '2026-06-01' });
    expect(out).toEqual({
      days: ['2026-06-01'],
      energy: [null],
      stress: [null],
      sleep: [null],
    });
  });
});
