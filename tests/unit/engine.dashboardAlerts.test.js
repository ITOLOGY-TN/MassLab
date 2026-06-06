import { describe, it, expect } from 'vitest';
import { aggregateAlerts, ALERT_PRIORITY } from '../../services/engine/dashboardAlerts.js';

// Pure alert aggregation (Phase 10, research D-3 / data-model §2b): orders the active
// signals by the FIXED priority and caps at 3. The "lapsed-from-positive" creatine rule
// lives in the controller; this aggregator only orders/caps what it is given.

const KINDS = [
  'low_sleep_high_stress',
  'no_session',
  'calorie_deficit',
  'ready_to_add_load',
  'creatine_streak_broken',
];

function makeSignals(activeKinds, contexts = {}) {
  const signals = {
    lowSleepHighStress: { active: false, context: {} },
    noSession: { active: false, context: {} },
    calorieDeficit: { active: false, context: {} },
    readyToAddLoad: { active: false, context: {} },
    creatineStreakBroken: { active: false, context: {} },
  };
  const keyByKind = {
    low_sleep_high_stress: 'lowSleepHighStress',
    no_session: 'noSession',
    calorie_deficit: 'calorieDeficit',
    ready_to_add_load: 'readyToAddLoad',
    creatine_streak_broken: 'creatineStreakBroken',
  };
  for (const kind of activeKinds) {
    signals[keyByKind[kind]] = { active: true, context: contexts[kind] ?? {} };
  }
  return signals;
}

describe('ALERT_PRIORITY', () => {
  it('is the fixed five-kind order', () => {
    expect(ALERT_PRIORITY).toEqual(KINDS);
  });
});

describe('aggregateAlerts', () => {
  it('returns an empty array when no signal is active', () => {
    expect(aggregateAlerts(makeSignals([]), { thresholds: {} })).toEqual([]);
  });

  it('returns the top 3 in fixed priority order when all 5 are active (caps at 3)', () => {
    const result = aggregateAlerts(makeSignals(KINDS), { thresholds: {} });
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.kind)).toEqual([
      'low_sleep_high_stress',
      'no_session',
      'calorie_deficit',
    ]);
  });

  it('orders active signals by priority regardless of signal object key order', () => {
    // Activate creatine + low_sleep + no_session — expect priority order, not insertion order.
    const result = aggregateAlerts(
      makeSignals(['creatine_streak_broken', 'low_sleep_high_stress', 'no_session']),
      { thresholds: {} },
    );
    expect(result.map((a) => a.kind)).toEqual([
      'low_sleep_high_stress',
      'no_session',
      'creatine_streak_broken',
    ]);
  });

  it('returns fewer than 3 when fewer than 3 are active', () => {
    const result = aggregateAlerts(makeSignals(['calorie_deficit']), { thresholds: {} });
    expect(result.map((a) => a.kind)).toEqual(['calorie_deficit']);
  });

  it('builds each Alert with kind, message_key, context, and link', () => {
    const result = aggregateAlerts(makeSignals(['no_session'], { no_session: { days: 2 } }), {
      thresholds: {},
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: 'no_session',
      message_key: 'dashboard.alert.no_session',
      context: { days: 2 },
      link: '/journal',
    });
  });

  it('maps each kind to its message_key and link', () => {
    const result = aggregateAlerts(makeSignals(KINDS), { thresholds: {} });
    // Only top 3 returned; assert their links/keys, then assert the lower-priority two
    // win when the higher-priority ones are inactive.
    const top = aggregateAlerts(makeSignals(['ready_to_add_load', 'creatine_streak_broken']), {
      thresholds: {},
    });
    const byKind = Object.fromEntries([...result, ...top].map((a) => [a.kind, a]));
    expect(byKind.low_sleep_high_stress.link).toBe('/recovery');
    expect(byKind.low_sleep_high_stress.message_key).toBe('dashboard.alert.low_sleep_high_stress');
    expect(byKind.calorie_deficit.link).toBe('/nutrition');
    expect(byKind.ready_to_add_load.link).toBe('/load-tracking');
    expect(byKind.creatine_streak_broken.link).toBe('/supplements');
    expect(byKind.creatine_streak_broken.message_key).toBe(
      'dashboard.alert.creatine_streak_broken',
    );
  });

  it('carries each active signal context through to its Alert', () => {
    const result = aggregateAlerts(
      makeSignals(['calorie_deficit', 'ready_to_add_load'], {
        calorie_deficit: { delta_kcal: -400 },
        ready_to_add_load: { exercise: 'Développé couché' },
      }),
      { thresholds: {} },
    );
    const byKind = Object.fromEntries(result.map((a) => [a.kind, a]));
    expect(byKind.calorie_deficit.context).toEqual({ delta_kcal: -400 });
    expect(byKind.ready_to_add_load.context).toEqual({ exercise: 'Développé couché' });
  });
});
