import { describe, it, expect } from 'vitest';
import {
  buildWorkingWeightSeries,
  rankByWorkingWeightGain,
} from '../../services/engine/exerciseImprovements.js';

// Phase 11 (014-phase11-statistics) — pure working-weight series + top-N ranking by
// absolute working-weight gain since program start (D-4). No clock/IO/globals: the
// controller injects { programStart, asOf } as YYYY-MM-DD strings. WORKING WEIGHT =
// source_weight_kg; date = UTC day of created_at; only records within [programStart, asOf].

describe('buildWorkingWeightSeries', () => {
  it('groups records per exercise, ascending, mapping created_at→UTC day and source_weight_kg', () => {
    const records = [
      { exercise_id: 1, created_at: '2026-01-10T08:30:00.000Z', source_weight_kg: 40 },
      { exercise_id: 1, created_at: '2026-01-17T19:00:00.000Z', source_weight_kg: 45 },
      { exercise_id: 2, created_at: '2026-01-12T06:00:00.000Z', source_weight_kg: 60 },
    ];
    const map = buildWorkingWeightSeries(records, { programStart: '2026-01-01', asOf: '2026-02-01' });
    expect(map.get(1)).toEqual([
      { date: '2026-01-10', working_weight_kg: 40 },
      { date: '2026-01-17', working_weight_kg: 45 },
    ]);
    expect(map.get(2)).toEqual([{ date: '2026-01-12', working_weight_kg: 60 }]);
  });

  it('keeps only records whose created_at day is within [programStart, asOf]', () => {
    const records = [
      { exercise_id: 1, created_at: '2025-12-31T23:59:59.000Z', source_weight_kg: 30 }, // before start
      { exercise_id: 1, created_at: '2026-01-05T10:00:00.000Z', source_weight_kg: 40 }, // in
      { exercise_id: 1, created_at: '2026-02-02T00:00:00.000Z', source_weight_kg: 55 }, // after asOf
    ];
    const map = buildWorkingWeightSeries(records, { programStart: '2026-01-01', asOf: '2026-02-01' });
    expect(map.get(1)).toEqual([{ date: '2026-01-05', working_weight_kg: 40 }]);
  });
});

describe('rankByWorkingWeightGain', () => {
  function seriesOf(...weights) {
    return weights.map((w, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      working_weight_kg: w,
    }));
  }

  it('ranks by gain DESC and rounds gain to 2 decimals', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(40, 47.5)], // +7.5
      [2, seriesOf(60, 80)], // +20
      [3, seriesOf(20, 22.333)], // +2.333 -> 2.33
    ]);
    const names = new Map([
      [1, 'Curl'],
      [2, 'Squat'],
      [3, 'Raise'],
    ]);
    const out = rankByWorkingWeightGain({ seriesByExercise, names, topN: 5 });
    expect(out.map((e) => e.exercise_id)).toEqual([2, 1, 3]);
    expect(out[0]).toEqual({
      exercise_id: 2,
      name: 'Squat',
      gain_kg: 20,
      series: seriesOf(60, 80),
    });
    expect(out[2].gain_kg).toBe(2.33);
  });

  it('excludes exercises with fewer than 2 points', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(40, 45)],
      [2, seriesOf(60)], // single point -> excluded
    ]);
    const names = new Map([
      [1, 'Curl'],
      [2, 'Squat'],
    ]);
    const out = rankByWorkingWeightGain({ seriesByExercise, names, topN: 5 });
    expect(out.map((e) => e.exercise_id)).toEqual([1]);
  });

  it('caps the list at topN', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(0, 10)],
      [2, seriesOf(0, 20)],
      [3, seriesOf(0, 30)],
    ]);
    const names = new Map([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ]);
    const out = rankByWorkingWeightGain({ seriesByExercise, names, topN: 2 });
    expect(out.map((e) => e.exercise_id)).toEqual([3, 2]);
  });

  it('breaks ties by exercise_id ascending', () => {
    const seriesByExercise = new Map([
      [5, seriesOf(10, 20)], // +10
      [2, seriesOf(0, 10)], // +10
    ]);
    const names = new Map([
      [5, 'E'],
      [2, 'B'],
    ]);
    const out = rankByWorkingWeightGain({ seriesByExercise, names, topN: 5 });
    expect(out.map((e) => e.exercise_id)).toEqual([2, 5]);
  });

  it('returns [] when nothing qualifies', () => {
    expect(
      rankByWorkingWeightGain({ seriesByExercise: new Map(), names: new Map(), topN: 5 }),
    ).toEqual([]);
  });
});
