// Unit test (T027, US3) — pure presenter `services/recovery/trendsView.js`.
// Per data-model.md §5c: build({ heatmap, scatter, overlap }) bundles the three
// engine outputs and adds a `has_data` flag per chart so each renders a clear
// empty/low-data state without error (FR-016 / SC-009). No I/O, no clock.
import { describe, it, expect } from 'vitest';
import { build } from '../../services/recovery/trendsView.js';

// Engine output fixtures (shapes per data-model.md §4b / §6).
const heatmapWithData = {
  year: 2026,
  month: 6,
  cells: [
    { date: '2026-06-01', energy: 6 },
    { date: '2026-06-02', energy: null },
    { date: '2026-06-03', energy: 7 },
  ],
};
const heatmapEmpty = {
  year: 2026,
  month: 6,
  cells: [
    { date: '2026-06-01', energy: null },
    { date: '2026-06-02', energy: null },
  ],
};

const scatterPoints = [
  { date: '2026-06-02', sleep_hours: 7, volume_kg: 4200 },
  { date: '2026-06-03', sleep_hours: 6.5, volume_kg: 3800 },
];

const overlapWithData = {
  days: ['2026-06-01', '2026-06-02', '2026-06-03'],
  energy: [6, null, 7],
  stress: [5, 4, 6],
  sleep: [7, 6.5, null],
};
const overlapEmpty = {
  days: ['2026-06-01', '2026-06-02'],
  energy: [null, null],
  stress: [null, null],
  sleep: [null, null],
};

describe('recovery/trendsView.build', () => {
  it('bundles the three engine outputs under named keys', () => {
    const view = build({
      heatmap: heatmapWithData,
      scatter: scatterPoints,
      overlap: overlapWithData,
    });

    expect(view).toHaveProperty('heatmap');
    expect(view).toHaveProperty('scatter');
    expect(view).toHaveProperty('overlap');

    // Heatmap passes through year/month/cells unchanged.
    expect(view.heatmap.year).toBe(2026);
    expect(view.heatmap.month).toBe(6);
    expect(view.heatmap.cells).toEqual(heatmapWithData.cells);

    // Overlap passes through its aligned arrays unchanged.
    expect(view.overlap.days).toEqual(overlapWithData.days);
    expect(view.overlap.energy).toEqual(overlapWithData.energy);
    expect(view.overlap.stress).toEqual(overlapWithData.stress);
    expect(view.overlap.sleep).toEqual(overlapWithData.sleep);
  });

  it('wraps the scatter array in a points field with a has_data flag', () => {
    const view = build({
      heatmap: heatmapWithData,
      scatter: scatterPoints,
      overlap: overlapWithData,
    });
    expect(view.scatter.points).toEqual(scatterPoints);
    expect(view.scatter.has_data).toBe(true);
  });

  it('sets has_data per chart when each has at least one real datum', () => {
    const view = build({
      heatmap: heatmapWithData,
      scatter: scatterPoints,
      overlap: overlapWithData,
    });
    expect(view.heatmap.has_data).toBe(true);
    expect(view.scatter.has_data).toBe(true);
    expect(view.overlap.has_data).toBe(true);
  });

  it('flags heatmap has_data=false when every cell energy is null', () => {
    const view = build({
      heatmap: heatmapEmpty,
      scatter: scatterPoints,
      overlap: overlapWithData,
    });
    expect(view.heatmap.has_data).toBe(false);
  });

  it('flags scatter has_data=false when there are no points', () => {
    const view = build({
      heatmap: heatmapWithData,
      scatter: [],
      overlap: overlapWithData,
    });
    expect(view.scatter.has_data).toBe(false);
    expect(view.scatter.points).toEqual([]);
  });

  it('flags overlap has_data=false when every series value is null', () => {
    const view = build({
      heatmap: heatmapWithData,
      scatter: scatterPoints,
      overlap: overlapEmpty,
    });
    expect(view.overlap.has_data).toBe(false);
  });

  it('treats a zero datum as real data (not an empty state)', () => {
    const zeroHeatmap = {
      year: 2026,
      month: 6,
      cells: [{ date: '2026-06-01', energy: 0 }],
    };
    const zeroOverlap = {
      days: ['2026-06-01'],
      energy: [0],
      stress: [null],
      sleep: [null],
    };
    const view = build({
      heatmap: zeroHeatmap,
      scatter: scatterPoints,
      overlap: zeroOverlap,
    });
    expect(view.heatmap.has_data).toBe(true);
    expect(view.overlap.has_data).toBe(true);
  });

  it('handles all-empty inputs without throwing (full empty state)', () => {
    const view = build({
      heatmap: heatmapEmpty,
      scatter: [],
      overlap: overlapEmpty,
    });
    expect(view.heatmap.has_data).toBe(false);
    expect(view.scatter.has_data).toBe(false);
    expect(view.overlap.has_data).toBe(false);
  });

  it('is defensive against missing/undefined inputs (defaults)', () => {
    const view = build({});
    expect(view.heatmap.has_data).toBe(false);
    expect(view.scatter.has_data).toBe(false);
    expect(view.scatter.points).toEqual([]);
    expect(view.overlap.has_data).toBe(false);
  });

  it('does not mutate the inputs it receives', () => {
    const heatmap = { year: 2026, month: 6, cells: [{ date: '2026-06-01', energy: 6 }] };
    const scatter = [{ date: '2026-06-02', sleep_hours: 7, volume_kg: 4200 }];
    const overlap = { days: ['2026-06-01'], energy: [6], stress: [5], sleep: [7] };
    const snapshot = JSON.stringify({ heatmap, scatter, overlap });
    build({ heatmap, scatter, overlap });
    expect(JSON.stringify({ heatmap, scatter, overlap })).toBe(snapshot);
  });
});
