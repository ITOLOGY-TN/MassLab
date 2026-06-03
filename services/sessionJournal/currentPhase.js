// Pure — derive the athlete's CURRENT training phase from program_start_date +
// each phase's `weeks` (research D-8). training_phases has no is_current flag or
// date range, so the current phase is fully determined by elapsed whole weeks
// since the program start, walking phases in display_order. Clamps to the first
// phase before start and the last phase past program end. Caller supplies `now`;
// no clock, no I/O, no globals (Constitution II + V).

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The training phase whose cumulative-weeks window contains `date` (Phase 5,
 * research D-7). Generalizes the current-phase logic to an arbitrary date so the
 * load-tracking radar can attribute any session to its phase. Clamps to the
 * first phase before start and the last phase past program end.
 * @param {object} args
 * @param {Array<{ weeks: number, display_order?: number, rest_seconds?: number }>} args.phases
 * @param {Date|string|number} args.programStartDate
 * @param {Date|string|number} args.date
 * @returns {object|null} the phase row, or null when there are no phases.
 */
export function phaseForDate({ phases = [], programStartDate, date } = {}) {
  if (!phases.length) return null;
  const ordered = [...phases].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  if (programStartDate == null || date == null) return ordered[0];

  const elapsedWeeks = Math.floor(
    (new Date(date).getTime() - new Date(programStartDate).getTime()) / MS_PER_WEEK,
  );
  if (elapsedWeeks < 0) return ordered[0];

  let cumulative = 0;
  for (const phase of ordered) {
    cumulative += Number(phase.weeks) || 0;
    if (elapsedWeeks < cumulative) return phase;
  }
  return ordered[ordered.length - 1];
}

/**
 * The athlete's CURRENT training phase — `phaseForDate` evaluated at `now`.
 * @param {object} args
 * @param {Array} args.phases
 * @param {Date|string|number} args.programStartDate
 * @param {Date|string|number} args.now
 * @returns {object|null}
 */
export function currentTrainingPhase({ phases = [], programStartDate, now } = {}) {
  return phaseForDate({ phases, programStartDate, date: now });
}
