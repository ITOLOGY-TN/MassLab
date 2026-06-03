// Pure — dashboard alert aggregation (Phase 10, research D-3 / data-model §2b). Given the
// already-resolved `signals` (booleans + display context built by the controller from the
// readers), return the ACTIVE alerts ordered by a FIXED priority and capped at 3. This
// aggregator only orders/caps what it is given; the "lapsed-from-positive" creatine rule
// lives in the controller, not here. No I/O, no clock, no globals (Constitution II + V).

/** Fixed alert priority order (highest first). Not configurable (clarification 2026-06-03). */
export const ALERT_PRIORITY = [
  'low_sleep_high_stress',
  'no_session',
  'calorie_deficit',
  'ready_to_add_load',
  'creatine_streak_broken',
];

const MAX_ALERTS = 3;

// kind → (signals key, deep-link). message_key is derived as `dashboard.alert.<kind>`.
const ALERT_SPEC = {
  low_sleep_high_stress: { signalKey: 'lowSleepHighStress', link: '/recovery' },
  no_session: { signalKey: 'noSession', link: '/journal' },
  calorie_deficit: { signalKey: 'calorieDeficit', link: '/nutrition' },
  ready_to_add_load: { signalKey: 'readyToAddLoad', link: '/load-tracking' },
  creatine_streak_broken: { signalKey: 'creatineStreakBroken', link: '/supplements' },
};

/**
 * @param {object} signals  `{ lowSleepHighStress:{active,context}, noSession:{...},
 *   calorieDeficit:{...}, readyToAddLoad:{...}, creatineStreakBroken:{...} }`
 * @param {{ thresholds?: object }} [opts]  reserved for future threshold-driven shaping
 * @returns {Array<{kind, message_key, context, link}>}  active alerts, priority-ordered, ≤3
 */
export function aggregateAlerts(signals, { thresholds } = {}) {
  void thresholds; // selection is upstream; this fn only orders + caps what is active
  const src = signals ?? {};
  const alerts = [];
  for (const kind of ALERT_PRIORITY) {
    const { signalKey, link } = ALERT_SPEC[kind];
    const signal = src[signalKey];
    if (!signal || !signal.active) continue;
    alerts.push({
      kind,
      message_key: `dashboard.alert.${kind}`,
      context: signal.context ?? {},
      link,
    });
    if (alerts.length === MAX_ALERTS) break;
  }
  return alerts;
}
