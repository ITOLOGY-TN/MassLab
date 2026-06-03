// Pure — smart recovery alerts (Phase 9, research D-4). Given the recent recovery
// check-ins over the alert look-back window, returns an ordered list of advisory
// alerts. Three deterministic, configurable rules (thresholds injected from config):
//
//   high_stress   — stress >= stressHigh on each of the last stressHighDays
//                   CALENDAR-CONSECUTIVE days (each logged_on exactly one day after
//                   the prior; a calendar gap breaks the run — the spec's "stress
//                   stays elevated for several consecutive days", research D-4).
//                   Suppressed if there is no unbroken high-stress run of that length
//                   ending at the most recent check-in.
//   reduce_volume — over the last lowWindowDays days WITH a check-in, average sleep
//                   <= sleepLowHours AND average energy <= energyLow. Suppressed if
//                   fewer than lowWindowDays check-ins.
//   full_rest     — on the single most recent check-in day, >= restSignals of
//                   {low sleep, low energy, high stress} hold, OR that day's
//                   sore_zones.length >= soreZonesRest. Suppressed if no check-ins.
//
// Alerts are recomputed on read and never persisted (D-5). The caller supplies asOf
// + thresholds; this module reads no clock, does no I/O, mutates nothing, and uses no
// globals (Constitution II + V). Output order is fixed: high_stress, reduce_volume,
// full_rest — so the view can cap how many it shows by severity-stable position.

/** Mean of a numeric array (caller guarantees non-empty + numeric). */
function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Shift a YYYY-MM-DD date by n calendar days (UTC), returning YYYY-MM-DD. */
function shiftDay(isoDate, n) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {Array<{logged_on:string, sleep_hours?:number, energy?:number, stress?:number, sore_zones?:string[]}>} recentCheckins
 *   recovery_log rows over the look-back window (any order; sorted internally).
 * @param {{ asOf:string, thresholds:{
 *   stressHigh:number, stressHighDays:number, sleepLowHours:number, energyLow:number,
 *   lowWindowDays:number, restSignals:number, soreZonesRest:number } }} opts
 * @returns {Array<{kind:string, severity:string, message_key:string, context:object}>}
 */
// `asOf` is part of the injected contract (the controller pre-filters the look-back
// window by it); the rules then operate on whatever recent rows they are handed, so it
// is intentionally not read here — keep it named so the signature mirrors the siblings.
export function evaluateAlerts(
  recentCheckins,
  // eslint-disable-next-line no-unused-vars
  { asOf, thresholds } = {},
) {
  const rows = Array.isArray(recentCheckins) ? recentCheckins : [];
  if (rows.length === 0) return [];

  const {
    stressHigh,
    stressHighDays,
    sleepLowHours,
    energyLow,
    lowWindowDays,
    restSignals,
    soreZonesRest,
  } = thresholds ?? {};

  // Ascending by day, without mutating the caller's array. Only days with a check-in
  // appear here, so "consecutive check-in days" = adjacent entries in this list.
  const sorted = [...rows].sort((a, b) =>
    a.logged_on < b.logged_on ? -1 : a.logged_on > b.logged_on ? 1 : 0,
  );

  const alerts = [];

  // --- high_stress: stress >= stressHigh on each of the last stressHighDays
  //     CALENDAR-CONSECUTIVE days. Index the high-stress days by date, then walk back
  //     one calendar day at a time from the most recent check-in; a missing day or a
  //     non-high day breaks the run (a calendar gap is NOT continued high stress).
  if (sorted.length >= stressHighDays) {
    const highDays = new Set(
      sorted
        .filter((r) => typeof r.stress === 'number' && r.stress >= stressHigh)
        .map((r) => String(r.logged_on).slice(0, 10)),
    );
    let cursor = String(sorted[sorted.length - 1].logged_on).slice(0, 10);
    let run = 0;
    while (run < stressHighDays && highDays.has(cursor)) {
      run += 1;
      cursor = shiftDay(cursor, -1);
    }
    if (run >= stressHighDays) {
      alerts.push({
        kind: 'high_stress',
        severity: 'warning',
        message_key: 'recovery.alert.high_stress',
        context: { days: stressHighDays, threshold: stressHigh },
      });
    }
  }

  // --- reduce_volume: avg sleep <= sleepLowHours AND avg energy <= energyLow over the
  //     last lowWindowDays check-in days.
  if (sorted.length >= lowWindowDays) {
    const window = sorted.slice(-lowWindowDays);
    const sleeps = window.map((r) => r.sleep_hours).filter((v) => typeof v === 'number');
    const energies = window.map((r) => r.energy).filter((v) => typeof v === 'number');
    if (sleeps.length === lowWindowDays && energies.length === lowWindowDays) {
      const avgSleep = mean(sleeps);
      const avgEnergy = mean(energies);
      if (avgSleep <= sleepLowHours && avgEnergy <= energyLow) {
        alerts.push({
          kind: 'reduce_volume',
          severity: 'advice',
          message_key: 'recovery.alert.reduce_volume',
          context: { avg_sleep: avgSleep, avg_energy: avgEnergy },
        });
      }
    }
  }

  // --- full_rest: evaluate the single most recent check-in day.
  const day = sorted[sorted.length - 1];
  const signals =
    (typeof day.sleep_hours === 'number' && day.sleep_hours <= sleepLowHours ? 1 : 0) +
    (typeof day.energy === 'number' && day.energy <= energyLow ? 1 : 0) +
    (typeof day.stress === 'number' && day.stress >= stressHigh ? 1 : 0);
  const soreCount = Array.isArray(day.sore_zones) ? day.sore_zones.length : 0;
  if (signals >= restSignals || soreCount >= soreZonesRest) {
    alerts.push({
      kind: 'full_rest',
      severity: 'warning',
      message_key: 'recovery.alert.full_rest',
      context: { date: day.logged_on, signals, sore_zones: soreCount },
    });
  }

  return alerts;
}
