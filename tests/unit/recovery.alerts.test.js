import { describe, it, expect } from 'vitest';
import { evaluateAlerts } from '../../services/engine/recoveryAlerts.js';

// Phase 9 (012-phase9-recovery-wellbeing) T017 — pure smart-alert math (research D-4).
// evaluateAlerts(recentCheckins, { asOf, thresholds }) → ordered Alert[].
// Three deterministic, configurable, non-persisted advisory rules:
//  - high_stress   : stress >= stressHigh on each of the last stressHighDays
//                    CALENDAR-CONSECUTIVE days (a calendar gap breaks the run).
//  - reduce_volume : over the last lowWindowDays days with a check-in,
//                    avg sleep <= sleepLowHours AND avg energy <= energyLow.
//  - full_rest     : on a single recent day, >= restSignals of
//                    {low sleep, low energy, high stress} hold OR that day's
//                    sore_zones.length >= soreZonesRest.
// Each rule is suppressed when its window has too few check-ins (FR-011).
// Pure: asOf + thresholds injected; no clock, no I/O, no globals.

const THRESHOLDS = {
  stressHigh: 7,
  stressHighDays: 3,
  sleepLowHours: 6,
  energyLow: 4,
  lowWindowDays: 3,
  restSignals: 3,
  soreZonesRest: 4,
};

const ASOF = '2026-06-03';

// Convenience builder — every field present unless overridden, so individual rules
// can be isolated by choosing benign values for the others.
function checkin(logged_on, over = {}) {
  return {
    logged_on,
    sleep_hours: 8,
    sleep_quality: 4,
    energy: 8,
    stress: 1,
    mood: 'good',
    sore_zones: [],
    ...over,
  };
}

function kinds(alerts) {
  return alerts.map((a) => a.kind);
}

describe('evaluateAlerts', () => {
  it('returns no alerts on an empty window', () => {
    expect(evaluateAlerts([], { asOf: ASOF, thresholds: THRESHOLDS })).toEqual([]);
  });

  describe('high_stress', () => {
    it('fires when stress >= stressHigh on each of the last 3 consecutive check-in days', () => {
      const rows = [
        checkin('2026-06-01', { stress: 7 }),
        checkin('2026-06-02', { stress: 8 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      const alerts = evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS });
      const hs = alerts.find((a) => a.kind === 'high_stress');
      expect(hs).toBeTruthy();
      expect(hs.severity).toBe('warning');
      expect(hs.message_key).toBe('recovery.alert.high_stress');
      expect(hs.context).toMatchObject({ days: 3, threshold: 7 });
    });

    it('does NOT fire with only 2 consecutive high-stress days', () => {
      const rows = [
        checkin('2026-06-01', { stress: 2 }),
        checkin('2026-06-02', { stress: 8 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'high_stress',
      );
    });

    it('does NOT fire when a calendar gap breaks the run (a skipped day is not continued high stress)', () => {
      // 2026-06-02 is missing, so 06-01 -> 06-03 is not calendar-consecutive. Three
      // high-stress check-ins with a one-day hole are NOT "3 consecutive days".
      const rows = [
        checkin('2026-05-31', { stress: 7 }),
        checkin('2026-06-01', { stress: 8 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'high_stress',
      );
    });

    it('does NOT fire for three isolated high-stress days spread across weeks (no consecutive run)', () => {
      // Three high-stress days within the look-back window but far apart on the
      // calendar — absence of intervening check-ins is not sustained high stress.
      const rows = [
        checkin('2026-05-10', { stress: 9 }),
        checkin('2026-05-25', { stress: 9 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'high_stress',
      );
    });

    it('uses the LAST check-in days — an old high-stress run with a calm recent day does not fire', () => {
      const rows = [
        checkin('2026-05-28', { stress: 9 }),
        checkin('2026-05-29', { stress: 9 }),
        checkin('2026-05-30', { stress: 9 }),
        checkin('2026-06-03', { stress: 1 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'high_stress',
      );
    });

    it('is exactly at threshold (stress === stressHigh fires; below does not)', () => {
      const atRows = [
        checkin('2026-06-01', { stress: 7 }),
        checkin('2026-06-02', { stress: 7 }),
        checkin('2026-06-03', { stress: 7 }),
      ];
      expect(kinds(evaluateAlerts(atRows, { asOf: ASOF, thresholds: THRESHOLDS }))).toContain(
        'high_stress',
      );

      const belowRows = [
        checkin('2026-06-01', { stress: 6 }),
        checkin('2026-06-02', { stress: 7 }),
        checkin('2026-06-03', { stress: 7 }),
      ];
      expect(
        kinds(evaluateAlerts(belowRows, { asOf: ASOF, thresholds: THRESHOLDS })),
      ).not.toContain('high_stress');
    });

    it('is suppressed on a thin window (fewer check-ins than stressHighDays)', () => {
      const rows = [checkin('2026-06-02', { stress: 9 }), checkin('2026-06-03', { stress: 9 })];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'high_stress',
      );
    });
  });

  describe('reduce_volume', () => {
    it('fires when avg sleep <= sleepLowHours AND avg energy <= energyLow over the window', () => {
      const rows = [
        checkin('2026-06-01', { sleep_hours: 5, energy: 3 }),
        checkin('2026-06-02', { sleep_hours: 6, energy: 4 }),
        checkin('2026-06-03', { sleep_hours: 5, energy: 3 }),
      ];
      const alerts = evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS });
      const rv = alerts.find((a) => a.kind === 'reduce_volume');
      expect(rv).toBeTruthy();
      expect(rv.severity).toBe('advice');
      expect(rv.message_key).toBe('recovery.alert.reduce_volume');
      expect(rv.context.avg_sleep).toBeCloseTo(16 / 3, 5);
      expect(rv.context.avg_energy).toBeCloseTo(10 / 3, 5);
    });

    it('does NOT fire when only sleep is low (energy fine)', () => {
      const rows = [
        checkin('2026-06-01', { sleep_hours: 5, energy: 8 }),
        checkin('2026-06-02', { sleep_hours: 5, energy: 8 }),
        checkin('2026-06-03', { sleep_hours: 5, energy: 8 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'reduce_volume',
      );
    });

    it('does NOT fire when only energy is low (sleep fine)', () => {
      const rows = [
        checkin('2026-06-01', { sleep_hours: 9, energy: 3 }),
        checkin('2026-06-02', { sleep_hours: 9, energy: 3 }),
        checkin('2026-06-03', { sleep_hours: 9, energy: 3 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'reduce_volume',
      );
    });

    it('averages only the last lowWindowDays check-in days (an older bad day is excluded)', () => {
      const rows = [
        checkin('2026-05-20', { sleep_hours: 2, energy: 1 }), // old, excluded from the 3-day window
        checkin('2026-06-01', { sleep_hours: 9, energy: 9 }),
        checkin('2026-06-02', { sleep_hours: 9, energy: 9 }),
        checkin('2026-06-03', { sleep_hours: 9, energy: 9 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'reduce_volume',
      );
    });

    it('fires exactly at the threshold averages (avg sleep === 6 and avg energy === 4)', () => {
      const rows = [
        checkin('2026-06-01', { sleep_hours: 6, energy: 4 }),
        checkin('2026-06-02', { sleep_hours: 6, energy: 4 }),
        checkin('2026-06-03', { sleep_hours: 6, energy: 4 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).toContain(
        'reduce_volume',
      );
    });

    it('is suppressed on a thin window (fewer check-ins than lowWindowDays)', () => {
      const rows = [
        checkin('2026-06-02', { sleep_hours: 4, energy: 2 }),
        checkin('2026-06-03', { sleep_hours: 4, energy: 2 }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'reduce_volume',
      );
    });
  });

  describe('full_rest', () => {
    it('fires when >= restSignals of {low sleep, low energy, high stress} hold on one day', () => {
      const rows = [checkin('2026-06-03', { sleep_hours: 5, energy: 3, stress: 8 })];
      const alerts = evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS });
      const fr = alerts.find((a) => a.kind === 'full_rest');
      expect(fr).toBeTruthy();
      expect(fr.severity).toBe('warning');
      expect(fr.message_key).toBe('recovery.alert.full_rest');
      expect(fr.context.date).toBe('2026-06-03');
    });

    it('does NOT fire with only 2 poor signals and few sore zones', () => {
      const rows = [
        // low sleep + high stress = 2 signals; energy fine; 3 sore zones < 4.
        checkin('2026-06-03', {
          sleep_hours: 5,
          energy: 8,
          stress: 8,
          sore_zones: ['quads', 'calves', 'abs'],
        }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'full_rest',
      );
    });

    it('fires on the sore-zone path when sore_zones.length >= soreZonesRest (even with good signals)', () => {
      const rows = [
        checkin('2026-06-03', {
          sleep_hours: 9,
          energy: 9,
          stress: 1,
          sore_zones: ['quads', 'calves', 'hamstrings', 'glutes'],
        }),
      ];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).toContain(
        'full_rest',
      );
    });

    it('does not require a full window — fires off a single recent day', () => {
      // Only one check-in present at all; full_rest still evaluates that day.
      const rows = [checkin('2026-06-03', { sleep_hours: 4, energy: 2, stress: 9 })];
      expect(kinds(evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS }))).toContain(
        'full_rest',
      );
    });

    it('is suppressed when the window has no check-ins at all', () => {
      expect(kinds(evaluateAlerts([], { asOf: ASOF, thresholds: THRESHOLDS }))).not.toContain(
        'full_rest',
      );
    });
  });

  describe('ordering and purity', () => {
    it('returns alerts in a deterministic order (high_stress, reduce_volume, full_rest)', () => {
      const rows = [
        checkin('2026-06-01', { sleep_hours: 5, energy: 3, stress: 8 }),
        checkin('2026-06-02', { sleep_hours: 5, energy: 3, stress: 8 }),
        checkin('2026-06-03', {
          sleep_hours: 5,
          energy: 3,
          stress: 8,
          sore_zones: ['quads', 'calves', 'hamstrings', 'glutes'],
        }),
      ];
      const alerts = evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS });
      expect(kinds(alerts)).toEqual(['high_stress', 'reduce_volume', 'full_rest']);
    });

    it('does not mutate the input rows', () => {
      const rows = [
        checkin('2026-06-01', { stress: 9 }),
        checkin('2026-06-02', { stress: 9 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      const snapshot = JSON.parse(JSON.stringify(rows));
      evaluateAlerts(rows, { asOf: ASOF, thresholds: THRESHOLDS });
      expect(rows).toEqual(snapshot);
    });

    it('is deterministic regardless of input row order (sorts by logged_on internally)', () => {
      const ascending = [
        checkin('2026-06-01', { stress: 9 }),
        checkin('2026-06-02', { stress: 9 }),
        checkin('2026-06-03', { stress: 9 }),
      ];
      const shuffled = [ascending[2], ascending[0], ascending[1]];
      expect(evaluateAlerts(shuffled, { asOf: ASOF, thresholds: THRESHOLDS })).toEqual(
        evaluateAlerts(ascending, { asOf: ASOF, thresholds: THRESHOLDS }),
      );
    });
  });
});
