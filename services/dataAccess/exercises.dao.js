import { HttpError } from '../../middleware/errorHandler.js';

function deriveSlug(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'exercise'
  );
}

export function exercisesDao(supabase) {
  return {
    deriveSlug,

    async listForAthlete({ athleteId, locale = 'fr-FR', includeArchived = false }) {
      let q = supabase
        .from('exercises')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('id', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async findById(athleteId, id) {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async upsertMany(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from('exercises')
        .upsert(rows, { onConflict: 'athlete_id,slug,locale' })
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async create(athleteId, payload) {
      const slug = payload.slug ?? deriveSlug(payload.name);
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          athlete_id: athleteId,
          slug,
          locale: payload.locale ?? 'fr-FR',
          name: payload.name,
          targeted_muscles: payload.targeted_muscles,
          instructions: payload.instructions,
          technique_points: payload.technique_points ?? [],
          media_image_url: payload.media_image_url ?? null,
          media_video_url: payload.media_video_url ?? null,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'CONFLICT', `Exercise slug "${slug}" already exists.`);
        }
        throw new HttpError(500, 'DB_ERROR', error.message);
      }
      return data;
    },

    async patch(athleteId, id, patch) {
      // Slug is stable — only changed when the caller passes one explicitly.
      // Auto-deriving from `name` causes orphan rows on rename.
      const update = { ...patch };
      const { data, error } = await supabase
        .from('exercises')
        .update(update)
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    // ---- Phase 3 media helpers (T008) ------------------------------------
    // Write a single media column and return the updated row. A 0-row update
    // (wrong athlete / missing id) surfaces as 404 so the controller maps it.
    async setMedia(athleteId, id, column, value) {
      if (column !== 'media_image_url' && column !== 'media_video_url') {
        throw new HttpError(500, 'DB_ERROR', `Unsupported media column "${column}".`);
      }
      const { data, error } = await supabase
        .from('exercises')
        .update({ [column]: value })
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      if (!data) throw new HttpError(404, 'NOT_FOUND', `Exercise ${id} not found.`);
      return data;
    },

    async softDelete(athleteId, id) {
      const { error } = await supabase
        .from('exercises')
        .update({ is_active: false })
        .eq('athlete_id', athleteId)
        .eq('id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    async hardDelete(athleteId, id) {
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    /**
     * Returns the number of historical references (weekly_plan_exercises +
     * future session_sets when Phase 4 lands). Used to decide soft vs hard.
     */
    async countReferences(athleteId, id) {
      const { count, error } = await supabase
        .from('weekly_plan_exercises')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId)
        .eq('exercise_id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return count ?? 0;
    },
  };
}
