// Phase 3 (006-training-program-library) — one-directional alternative links.
// research D-6 / D-7; data-model.md §1. Constitution II: only this directory
// imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

export function exerciseAlternativesDao(supabase) {
  return {
    /**
     * Alternatives for a source exercise, ordered, joined to the target
     * exercise for name/slug/is_active (archived targets are still returned —
     * the presenter marks them, research D-7).
     */
    async listForSource(athleteId, exerciseId) {
      const { data, error } = await supabase
        .from('exercise_alternatives')
        .select(
          'id, display_order, alternative_exercise_id, exercises:alternative_exercise_id (id, slug, name, is_active)',
        )
        .eq('athlete_id', athleteId)
        .eq('exercise_id', exerciseId)
        .order('display_order', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    /**
     * Link `altId` as an alternative of `exerciseId`. Self-links are rejected
     * before hitting the DB (FR-023); duplicates surface as 409 via the unique
     * index. Returns the inserted row joined to the target exercise.
     */
    async add(athleteId, exerciseId, altId, displayOrder = 0) {
      if (Number(exerciseId) === Number(altId)) {
        throw new HttpError(
          409,
          'SELF_LINK_FORBIDDEN',
          'An exercise cannot be its own alternative.',
        );
      }
      const { data, error } = await supabase
        .from('exercise_alternatives')
        .insert({
          athlete_id: athleteId,
          exercise_id: exerciseId,
          alternative_exercise_id: altId,
          display_order: displayOrder,
        })
        .select(
          'id, display_order, alternative_exercise_id, exercises:alternative_exercise_id (id, slug, name, is_active)',
        )
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'CONFLICT', 'That alternative is already linked.');
        }
        if (error.code === '23514') {
          throw new HttpError(
            409,
            'SELF_LINK_FORBIDDEN',
            'An exercise cannot be its own alternative.',
          );
        }
        if (error.code === '23503') {
          throw new HttpError(404, 'NOT_FOUND', 'Exercise or alternative not found.');
        }
        throw new HttpError(500, 'DB_ERROR', error.message);
      }
      return data;
    },

    /** Unlink an alternative. Idempotent — removing a missing link is a no-op. */
    async remove(athleteId, exerciseId, altId) {
      const { error } = await supabase
        .from('exercise_alternatives')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('exercise_id', exerciseId)
        .eq('alternative_exercise_id', altId);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },
  };
}
