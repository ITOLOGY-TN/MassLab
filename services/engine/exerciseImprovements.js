// Phase 11 (014-phase11-statistics) — pure working-weight series + top-N ranking by
// ABSOLUTE working-weight gain since program start (research D-4). WORKING WEIGHT =
// one_rep_max_records.source_weight_kg (the heaviest completed set of the finishing
// session, Phase 5 D-1). The point date is the UTC calendar day of created_at; only
// records whose day falls within [programStart, asOf] are kept (the since-start anchor,
// FR-024). No clock, no I/O, no globals (Constitution II + V) — the controller injects
// the resolved window strings.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Group e1RM records into one ascending working-weight series per exercise.
 * @param {Array<{ exercise_id:number, created_at:string, source_weight_kg:number }>} records
 *   rows ASC by created_at (seriesForAthlete order); any order is tolerated and re-sorted.
 * @param {object} window
 * @param {string} window.programStart  YYYY-MM-DD inclusive lower bound
 * @param {string} window.asOf          YYYY-MM-DD inclusive upper bound (server today)
 * @returns {Map<number, Array<{ date:string, working_weight_kg:number }>>}
 */
export function buildWorkingWeightSeries(records = [], { programStart, asOf } = {}) {
  const byExercise = new Map();

  for (const r of records) {
    if (!r || r.created_at == null || r.exercise_id == null) continue;
    const date = String(r.created_at).slice(0, 10); // UTC day of the timestamptz
    if (programStart != null && date < programStart) continue;
    if (asOf != null && date > asOf) continue;

    const point = { date, working_weight_kg: Number(r.source_weight_kg) };
    const list = byExercise.get(r.exercise_id);
    if (list) list.push(point);
    else byExercise.set(r.exercise_id, [point]);
  }

  for (const list of byExercise.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return byExercise;
}

/**
 * Rank exercises by absolute working-weight gain (last − first) across their series.
 * Only exercises with ≥ 2 points qualify; gain DESC, ties broken by exercise_id ASC;
 * capped at topN. Fewer qualifiers → shorter list.
 * @param {object} args
 * @param {Map<number, Array<{ date:string, working_weight_kg:number }>>} args.seriesByExercise
 * @param {Map<number, string>} args.names  exercise_id → display name
 * @param {number} args.topN
 * @returns {Array<{ exercise_id:number, name:string, gain_kg:number, series:Array }>}
 */
export function rankByWorkingWeightGain({
  seriesByExercise = new Map(),
  names = new Map(),
  topN,
} = {}) {
  const ranked = [];

  for (const [exerciseId, series] of seriesByExercise) {
    if (!series || series.length < 2) continue;
    const gain = series[series.length - 1].working_weight_kg - series[0].working_weight_kg;
    ranked.push({
      exercise_id: exerciseId,
      name: names.get(exerciseId) ?? null,
      gain_kg: round2(gain),
      series,
    });
  }

  ranked.sort((a, b) => b.gain_kg - a.gain_kg || a.exercise_id - b.exercise_id);

  return typeof topN === 'number' ? ranked.slice(0, topN) : ranked;
}
