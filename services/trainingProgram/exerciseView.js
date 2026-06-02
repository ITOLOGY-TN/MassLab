// Pure presenter — assemble the exercise detail view model: static content +
// media + alternatives + recent history + engine 1RM + recommended load. No I/O
// (Constitution II). Phase 3: FR-013..FR-019; research D-1, D-3, D-7, D-8.
import { DEFAULTS } from '../engine/constants.js';
import { oneRepMax } from '../engine/oneRepMax.js';
import { feedSet, recentSessions } from '../engine/exerciseHistory.js';
import { recommendWorkingLoad } from '../engine/loadRecommendation.js';
import { classifyVideo } from './mediaClassifier.js';

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {object} input
 * @param {object} input.exercise  Row from exercises (id, slug, name, targeted_muscles,
 *   instructions, technique_points, media_image_url, media_video_url, is_active).
 * @param {Array} [input.alternatives]  Rows from exerciseAlternatives.dao.listForSource.
 * @param {Array} [input.sessions]  From sessions.dao.recentSessionsForExercise.
 * @param {{ flag_type, suggested_adjustment }|null} [input.activeFlag]
 * @param {'upper'|'lower'} [input.bodySegment]
 * @param {object} [input.constants]
 * @param {string} [input.embedHost]  YOUTUBE_EMBED_HOST from config.
 */
export function buildExerciseView({
  exercise,
  alternatives = [],
  sessions = [],
  activeFlag = null,
  bodySegment = 'upper',
  constants = DEFAULTS,
  embedHost,
}) {
  const feed = feedSet(sessions); // heaviest completed set of the most recent session
  const lastWeightKg = feed ? Number(feed.weight_kg) : null;
  const hasHistory = feed != null;

  const estimated_1rm_kg = hasHistory
    ? round1(
        oneRepMax({ weight_kg: feed.weight_kg, reps: feed.reps, constants }).primary_estimate_kg,
      )
    : null;

  const recommended_load_kg = recommendWorkingLoad({
    lastWeightKg,
    activeFlag,
    bodySegment,
    constants,
  });

  return {
    exercise_id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    targeted_muscles: exercise.targeted_muscles ?? [],
    instructions: exercise.instructions ?? '',
    technique_points: exercise.technique_points ?? [],
    is_active: exercise.is_active ?? true,
    media: {
      image_url: exercise.media_image_url ?? null,
      video: classifyVideo(exercise.media_video_url, embedHost),
    },
    alternatives: alternatives.map((a) => {
      const target = a.exercises ?? {};
      return {
        exercise_id: a.alternative_exercise_id ?? target.id,
        slug: target.slug ?? null,
        name: target.name ?? 'Exercice',
        is_active: target.is_active ?? true,
      };
    }),
    history: {
      recent_sessions: recentSessions(sessions, 5),
      estimated_1rm_kg,
      recommended_load_kg,
      has_history: hasHistory,
    },
  };
}
