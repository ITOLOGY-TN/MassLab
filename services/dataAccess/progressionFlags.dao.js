import { HttpError } from '../../middleware/errorHandler.js';

function adjustmentEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function progressionFlagsDao(supabase) {
  return {
    async findActiveForAthlete(athleteId) {
      const { data, error } = await supabase
        .from('progression_flags')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async listHistoryForAthlete(athleteId, { limit = 100 } = {}) {
      const { data, error } = await supabase
        .from('progression_flags')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    /**
     * For a single (athlete, scope), reconcile the candidate flag against the
     * currently-active row:
     *   1. same flag_type + adjustment → no-op (idempotent)
     *   2. different candidate → archive active + insert new
     *   3. candidate is null (rule did not fire) → archive active with no replacement
     * Returns the resulting active row (or null when superseded with no replacement).
     */
    async supersedeAndInsert({ athleteId, scopeKind, scopeRef }, candidateOrNull) {
      const { data: existingActive, error: findErr } = await supabase
        .from('progression_flags')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('scope_kind', scopeKind)
        .eq('scope_ref', scopeRef)
        .eq('is_active', true)
        .maybeSingle();
      if (findErr) throw new HttpError(500, 'DB_ERROR', findErr.message);

      const isMatch =
        existingActive &&
        candidateOrNull &&
        existingActive.flag_type === candidateOrNull.flag_type &&
        adjustmentEqual(existingActive.suggested_adjustment, candidateOrNull.suggested_adjustment);

      if (isMatch) return existingActive;

      if (existingActive) {
        const { error: updateErr } = await supabase
          .from('progression_flags')
          .update({ is_active: false, superseded_at: new Date().toISOString() })
          .eq('id', existingActive.id);
        if (updateErr) throw new HttpError(500, 'DB_ERROR', updateErr.message);
      }

      if (!candidateOrNull) return null;

      const { data, error } = await supabase
        .from('progression_flags')
        .insert({
          athlete_id: athleteId,
          scope_kind: scopeKind,
          scope_ref: scopeRef,
          flag_type: candidateOrNull.flag_type,
          rule: candidateOrNull.rule,
          suggested_adjustment: candidateOrNull.suggested_adjustment ?? null,
          engine_version: candidateOrNull.engine_version,
          resolved_constants: candidateOrNull.resolved_constants,
          is_active: true,
        })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },
  };
}
