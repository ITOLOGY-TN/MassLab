// Pure today-card presenter (Phase 10, data-model §3a, FR-001/FR-002/FR-003, SC-002).
// Given today's slot, whether it is a configured rest day, the current session state,
// and the day's exercises, it derives the muscle group, the first three exercises (in
// planned order), a session state, and the matching call-to-action. A rest day always
// wins: it shows a rest state with no CTA, no muscle group, and no exercises. No I/O,
// no clock, no globals — the caller injects the session state read at the boundary.

const MAX_EXERCISES = 3;

// session state → call-to-action (FR-002): start when not begun, resume when in
// progress, review when today's session is already finished.
const CTA_BY_STATE = {
  not_started: 'start',
  in_progress: 'resume',
  finished: 'review',
};

/**
 * @param {object} args
 * @param {{day_of_week:number, muscle_group:string}|null} [args.slot]  today's plan slot
 * @param {boolean} [args.isRestDay]  true on a configured rest day (no slot for today)
 * @param {'not_started'|'in_progress'|'finished'} [args.sessionState]  today's session state
 * @param {Array<{id:number, name:string}>} [args.exercises]  the day's exercises, in order
 * @returns {{
 *   is_rest:boolean, muscle_group:(string|null), exercises:Array<{id:number,name:string}>,
 *   state:'not_started'|'in_progress'|'finished'|'rest', cta:('start'|'resume'|'review'|null),
 *   day_of_week:(number|null)
 * }}
 */
export function build({ slot, isRestDay = false, sessionState, exercises } = {}) {
  // Rest day takes precedence over any session state (FR-003).
  if (isRestDay || !slot) {
    return {
      is_rest: true,
      muscle_group: null,
      exercises: [],
      state: 'rest',
      cta: null,
      day_of_week: null,
    };
  }

  const state = CTA_BY_STATE[sessionState] ? sessionState : 'not_started';
  const list = Array.isArray(exercises) ? exercises : [];

  return {
    is_rest: false,
    muscle_group: slot.muscle_group ?? null,
    exercises: list.slice(0, MAX_EXERCISES).map((e) => ({ id: e.id, name: e.name })),
    state,
    cta: CTA_BY_STATE[state],
    day_of_week: slot.day_of_week ?? null,
  };
}
