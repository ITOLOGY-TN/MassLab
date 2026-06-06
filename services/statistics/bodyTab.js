// Phase 11 (014-phase11-statistics) — pure Body-tab presenter (data-model §2.2). Reuses
// the Phase 6 weightChartView for the body-weight curve (remapping its `kg`/`goalKg`
// fields to the contract's `weight_kg`/`goal_kg`) and builds one ascending series per
// circumference measurement that actually has data, omitting empty fields. No I/O, no
// clock — the controller injects `asOf` (Constitution II + V).
import { build as buildWeightChart } from '../bodyTracking/weightChartView.js';
import { MEASUREMENT_FIELDS } from '../engine/measurementDeltas.js';

// French labels for the seven tracked circumferences (weight_kg is the weight curve, not
// a measurement series). Keyed by the *_cm field name.
const FIELD_LABELS = Object.freeze({
  arm_cm: 'Bras',
  chest_cm: 'Poitrine',
  thigh_cm: 'Cuisse',
  shoulder_cm: 'Epaules',
  waist_cm: 'Taille',
  neck_cm: 'Cou',
  hip_cm: 'Hanches',
});

/**
 * @param {object} args
 * @param {Array} args.measurements  body_measurements rows ({ measured_on, weight_kg, *_cm })
 * @param {object} [args.profile]    athlete profile (program_start_date, target_weight_kg, …)
 * @param {Array}  [args.phases]     training phases (passed through to weightChartView)
 * @param {string} args.asOf         server UTC day, YYYY-MM-DD
 */
export function build({ measurements = [], profile = {}, phases = [], asOf } = {}) {
  const chart = buildWeightChart({ measurements, profile, phases, asOf });
  const weight = {
    points: chart.points.map((p) => ({ date: p.date, weight_kg: p.kg })),
    goal_kg: chart.goalKg ?? null,
    has_data: chart.points.length > 0,
  };

  const ascending = [...measurements].sort((a, b) =>
    a.measured_on < b.measured_on ? -1 : a.measured_on > b.measured_on ? 1 : 0,
  );

  const seriesList = [];
  for (const field of MEASUREMENT_FIELDS) {
    if (field === 'weight_kg') continue; // weight is the curve above
    const points = ascending
      .filter((row) => row?.[field] != null)
      .map((row) => ({ date: row.measured_on, value: Number(row[field]) }));
    if (points.length === 0) continue; // only include measurements with data
    seriesList.push({
      key: field.replace(/_cm$/, ''),
      label: FIELD_LABELS[field],
      unit: 'cm',
      points,
    });
  }

  return { weight, measurements: seriesList };
}
