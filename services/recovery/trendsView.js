// Pure presenter — bundle the three recovery trend chart view models (Phase 9, US3,
// FR-013/FR-014/FR-016 / SC-009). Receives the already-computed engine outputs
// (energyHeatmap, sleepPerformanceScatter, overlapSeries from
// services/engine/recoveryTrends.js) and adds a `has_data` flag per chart so each
// renders a clear empty/low-data state without error. No I/O, no clock, no globals
// (Constitution II); never mutates its inputs.

// A value counts as "real data" when it is present (not null/undefined). 0 is real.
function isReal(v) {
  return v !== null && v !== undefined;
}

/**
 * @param {object} args
 * @param {{ year, month, cells: Array<{date, energy:number|null}> }} [args.heatmap]
 *   monthly energy heatmap (one cell per calendar day; energy null on un-logged days)
 * @param {Array<{date, sleep_hours, volume_kg}>} [args.scatter]
 *   sleep-vs-performance points (only days with both a check-in and session volume)
 * @param {{ days:string[], energy:(number|null)[], stress:(number|null)[], sleep:(number|null)[] }} [args.overlap]
 *   30-day aligned overlay (gaps are null, never 0)
 * @returns {{
 *   heatmap: { year, month, cells, has_data },
 *   scatter: { points, has_data },
 *   overlap: { days, energy, stress, sleep, has_data }
 * }}
 */
export function build({ heatmap, scatter, overlap } = {}) {
  const cells = heatmap?.cells ?? [];
  const points = scatter ?? [];
  const days = overlap?.days ?? [];
  const energy = overlap?.energy ?? [];
  const stress = overlap?.stress ?? [];
  const sleep = overlap?.sleep ?? [];

  return {
    heatmap: {
      year: heatmap?.year ?? null,
      month: heatmap?.month ?? null,
      cells,
      has_data: cells.some((c) => isReal(c?.energy)),
    },
    scatter: {
      points,
      has_data: points.length > 0,
    },
    overlap: {
      days,
      energy,
      stress,
      sleep,
      has_data:
        energy.some(isReal) || stress.some(isReal) || sleep.some(isReal),
    },
  };
}
