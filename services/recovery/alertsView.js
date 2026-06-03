// Pure presenter — the recovery alerts banner (Phase 9, FR-016/data-model §5b).
// Bundles the engine-derived alerts with an `all_clear` flag so the UI renders an
// encouraging empty state when nothing needs attention. No I/O; the caller injects
// the already-evaluated alerts.

/**
 * @param {object} args
 * @param {Array<object>} [args.alerts]  the evaluated recovery alerts
 * @returns {{ all_clear: boolean, alerts: Array<object> }}
 */
export function build({ alerts = [] } = {}) {
  return {
    all_clear: alerts.length === 0,
    alerts,
  };
}
