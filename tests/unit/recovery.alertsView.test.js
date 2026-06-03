import { describe, it, expect } from 'vitest';
import { build } from '../../services/recovery/alertsView.js';

describe('recovery alertsView.build', () => {
  it('reports all_clear when there are no alerts', () => {
    const view = build({ alerts: [] });
    expect(view).toEqual({ all_clear: true, alerts: [] });
  });

  it('passes alerts through and is not all_clear when non-empty', () => {
    const alerts = [
      { code: 'LOW_SLEEP', message: 'Sommeil bas 3 nuits de suite' },
      { code: 'HIGH_STRESS', message: 'Stress élevé' },
    ];
    const view = build({ alerts });
    expect(view.all_clear).toBe(false);
    expect(view.alerts).toEqual(alerts);
    // same reference passed through, no copying/mutation
    expect(view.alerts).toBe(alerts);
  });

  it('defaults to all_clear with an empty list when alerts is omitted', () => {
    const view = build({});
    expect(view).toEqual({ all_clear: true, alerts: [] });
  });

  it('defaults to all_clear with an empty list when called with no args', () => {
    const view = build();
    expect(view).toEqual({ all_clear: true, alerts: [] });
  });
});
