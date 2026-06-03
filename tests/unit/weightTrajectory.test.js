import { describe, it, expect } from 'vitest';
import { idealZone, phaseBoundaries } from '../../services/engine/weightTrajectory.js';

describe('idealZone (FR-018 — steady lean-gain band)', () => {
  const args = {
    startKg: 60,
    targetKg: 68, // +8 kg gain over the program
    startDate: '2026-04-27',
    totalWeeks: 4,
    asOf: '2026-05-01',
  };

  it('spans start→target with a point at the start and at every whole week up to the end', () => {
    const zone = idealZone(args);
    expect(zone).not.toBeNull();
    expect(zone.lower).toHaveLength(5); // weeks 0..4 inclusive
    expect(zone.upper).toHaveLength(5);
    expect(zone.lower.map((p) => p.date)).toEqual([
      '2026-04-27',
      '2026-05-04',
      '2026-05-11',
      '2026-05-18',
      '2026-05-25',
    ]);
  });

  it('centres the band on the linear start→target line at the endpoints', () => {
    const zone = idealZone(args);
    const halfBand = Math.abs(68 - 60) * 0.15; // 1.2 kg

    // start (week 0): centre = 60
    expect(zone.lower[0].kg).toBeCloseTo(60 - halfBand, 5);
    expect(zone.upper[0].kg).toBeCloseTo(60 + halfBand, 5);

    // end (week 4): centre = 68
    expect(zone.lower[4].kg).toBeCloseTo(68 - halfBand, 5);
    expect(zone.upper[4].kg).toBeCloseTo(68 + halfBand, 5);

    // midpoint (week 2): centre = 64
    expect(zone.lower[2].kg).toBeCloseTo(64 - halfBand, 5);
    expect(zone.upper[2].kg).toBeCloseTo(64 + halfBand, 5);

    // upper is always above lower
    zone.upper.forEach((p, i) => expect(p.kg).toBeGreaterThan(zone.lower[i].kg));
  });

  it('returns null when any required input is missing (graceful omission)', () => {
    expect(idealZone({ ...args, startKg: null })).toBeNull();
    expect(idealZone({ ...args, targetKg: undefined })).toBeNull();
    expect(idealZone({ ...args, startDate: null })).toBeNull();
    expect(idealZone({ ...args, totalWeeks: null })).toBeNull();
    expect(idealZone({ ...args, totalWeeks: 0 })).toBeNull();
    expect(idealZone({})).toBeNull();
    expect(idealZone()).toBeNull();
  });
});

describe('phaseBoundaries (FR-019 — cumulative phase marker dates)', () => {
  const phases = [
    { name: 'Volume', weeks: 4, display_order: 1 },
    { name: 'Intensité', weeks: 8, display_order: 2 },
    { name: 'Force', weeks: 8, display_order: 3 },
  ];

  it('marks each phase start at its cumulative-weeks offset from the program start', () => {
    const markers = phaseBoundaries({ startDate: '2026-04-27', phases });
    expect(markers).toEqual([
      { name: 'Volume', date: '2026-04-27' }, // week 0
      { name: 'Intensité', date: '2026-05-25' }, // week 4
      { name: 'Force', date: '2026-07-20' }, // week 12
    ]);
  });

  it('orders by display_order regardless of input order', () => {
    const shuffled = [phases[2], phases[0], phases[1]];
    const markers = phaseBoundaries({ startDate: '2026-04-27', phases: shuffled });
    expect(markers.map((m) => m.name)).toEqual(['Volume', 'Intensité', 'Force']);
  });

  it('returns [] when startDate or phases are missing', () => {
    expect(phaseBoundaries({ startDate: null, phases })).toEqual([]);
    expect(phaseBoundaries({ startDate: '2026-04-27', phases: [] })).toEqual([]);
    expect(phaseBoundaries({})).toEqual([]);
  });
});
