// Pure top-level dashboard assembler (Phase 10, data-model §3d, FR-018/SC-009).
// Bundles the six pre-built tiles (today, week, metrics, sparkline, alerts, quote) into
// the composed view model and stamps a per-tile `has_data` flag so the frontend can
// render cold-start empty states without error. The whole payload always returns — a
// brand-new athlete with no logged data still gets a fully-shaped, flagged response.
// No I/O, no clock, no globals.

/** Metrics has data when ANY single sub-metric carries a value (a streak of 0 alone
 *  is not enough — it is the cold-start default). */
function metricsHasData(metrics) {
  if (!metrics) return false;
  if (metrics.weight) return true;
  if (metrics.calories) return true;
  if (metrics.phase) return true;
  if (metrics.streak && Number(metrics.streak.count) > 0) return true;
  return false;
}

/**
 * @param {object} args
 * @param {object|null} [args.today]     today-card tile (todayCard.build) or null
 * @param {{days:Array}} [args.week]     week-overview tile (weekOverview.build)
 * @param {object} [args.metrics]        metrics tile (metricsView.build)
 * @param {{has_data:boolean,points:Array}} [args.sparkline]  weight sparkline tile
 * @param {Array} [args.alerts]          prioritized alerts (aggregateAlerts), ≤3
 * @param {object|null} [args.quote]     quote of the day or null
 * @returns {object} DashboardView with a `has_data` map per tile
 */
export function build({ today, week, metrics, sparkline, alerts, quote } = {}) {
  const weekTile = week ?? { days: [] };
  const metricsTile = metrics ?? {};
  const sparklineTile = sparkline ?? { has_data: false, points: [] };
  const alertsTile = Array.isArray(alerts) ? alerts : [];
  const todayTile = today ?? null;
  const quoteTile = quote ?? null;

  return {
    today: todayTile,
    week: weekTile,
    metrics: metricsTile,
    sparkline: sparklineTile,
    alerts: alertsTile,
    quote: quoteTile,
    has_data: {
      today: todayTile != null,
      week: Array.isArray(weekTile.days) && weekTile.days.length > 0,
      metrics: metricsHasData(metricsTile),
      sparkline: sparklineTile.has_data === true,
      alerts: alertsTile.length > 0,
      quote: quoteTile != null,
    },
  };
}
