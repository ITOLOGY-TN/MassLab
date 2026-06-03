// Pure presenter — average working load per muscle group per training phase
// (Phase 5, research D-7/D-8). Each one_rep_max_records row is one exercise's
// session feed set; group by (phase, muscle group, day-as-session-proxy), take
// the per-day top working load, and average those across the phase. No I/O.
import { phaseForDate } from '../sessionJournal/currentPhase.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} args
 * @param {Array<{ exercise_id, created_at, source_weight_kg }>} args.records
 * @param {Map<number, string>} args.exerciseMuscleGroup  exercise_id → muscle-group name
 * @param {Array<{ name, color }>} args.muscleGroups  radar axes (stable order)
 * @param {Array<{ slug, name, weeks, display_order }>} args.phases
 * @param {Date|string|number} args.programStartDate
 */
export function buildPhaseRadar({
  records = [],
  exerciseMuscleGroup = new Map(),
  muscleGroups = [],
  phases = [],
  programStartDate,
} = {}) {
  const axes = muscleGroups.map((g) => ({ name: g.name, color: g.color }));
  const axisNames = axes.map((a) => a.name);

  // phaseSlug → muscleGroupName → date → max working load that day
  const buckets = new Map();
  const phaseMeta = new Map();

  for (const r of records) {
    const mg = exerciseMuscleGroup.get(r.exercise_id);
    if (!mg || !axisNames.includes(mg)) continue;
    const phase = phaseForDate({ phases, programStartDate, date: r.created_at });
    if (!phase) continue;
    phaseMeta.set(phase.slug, { name: phase.name, order: phase.display_order ?? 0 });
    const date = String(r.created_at).slice(0, 10);
    if (!buckets.has(phase.slug)) buckets.set(phase.slug, new Map());
    const byMg = buckets.get(phase.slug);
    if (!byMg.has(mg)) byMg.set(mg, new Map());
    const byDate = byMg.get(mg);
    byDate.set(date, Math.max(byDate.get(date) ?? 0, Number(r.source_weight_kg)));
  }

  const phaseSeries = [...buckets.entries()]
    .map(([slug, byMg]) => {
      const meta = phaseMeta.get(slug);
      const values = axisNames.map((name) => {
        const byDate = byMg.get(name);
        if (!byDate || byDate.size === 0) return { muscle_group: name, avg_working_load_kg: 0 };
        const avg = [...byDate.values()].reduce((a, b) => a + b, 0) / byDate.size;
        return { muscle_group: name, avg_working_load_kg: round2(avg) };
      });
      return { slug, name: meta.name, order: meta.order, values };
    })
    .sort((a, b) => a.order - b.order)
    // eslint-disable-next-line no-unused-vars
    .map(({ order, ...rest }) => rest);

  return { muscle_groups: axes, phases: phaseSeries, empty: phaseSeries.length < 2 };
}
