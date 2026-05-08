// Phase 2 US2 (T031): muscle-groups CRUD + merge + soft-archive.
// Constitution Principle II: only this directory imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

function deriveSlug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'group';
}

export function muscleGroupsDao(supabase) {
  return {
    deriveSlug,

    /**
     * Used by the seed: insert one row per (athlete_id, slug) combination.
     * Idempotent — re-running keeps row counts stable.
     */
    async upsertMany(athleteId, rows) {
      const payload = rows.map((r) => ({
        athlete_id: athleteId,
        slug: r.slug ?? deriveSlug(r.name),
        name: r.name,
        display_color: r.display_color ?? '#6b7280',
        sort_order: r.sort_order ?? 0,
      }));
      const { data, error } = await supabase
        .from('muscle_groups')
        .upsert(payload, { onConflict: 'athlete_id,slug' })
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async listForAthlete(athleteId, { includeArchived = false } = {}) {
      let q = supabase
        .from('muscle_groups')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      if (!includeArchived) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async findById(athleteId, id) {
      const { data, error } = await supabase
        .from('muscle_groups')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /**
     * Insert a row, deduplicating on (athlete_id, slug) by deriving a unique
     * slug from the name. The DB unique constraint is the source of truth.
     */
    async create(athleteId, { name, display_color, sort_order, slug }) {
      const finalSlug = slug ?? deriveSlug(name);
      const { data, error } = await supabase
        .from('muscle_groups')
        .insert({
          athlete_id: athleteId,
          slug: finalSlug,
          name,
          display_color: display_color ?? '#6b7280',
          sort_order: sort_order ?? 0,
        })
        .select('*')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'CONFLICT', `A muscle group with slug "${finalSlug}" already exists.`);
        }
        throw new HttpError(500, 'DB_ERROR', error.message);
      }
      return data;
    },

    async patch(athleteId, id, patch) {
      const update = { ...patch, updated_at: new Date().toISOString() };
      // If the caller renames the row, refresh the slug too unless they passed
      // an explicit slug.
      if (patch.name && patch.slug == null) update.slug = deriveSlug(patch.name);
      const { data, error } = await supabase
        .from('muscle_groups')
        .update(update)
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async softArchive(athleteId, id) {
      const { data, error } = await supabase
        .from('muscle_groups')
        .update({ is_active: false, archived_at: new Date().toISOString() })
        .eq('athlete_id', athleteId)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async hardDelete(athleteId, id) {
      const { error } = await supabase
        .from('muscle_groups')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
    },

    /**
     * Count slots referencing this muscle group. Used by the controller to
     * decide between hard-delete (zero refs) and soft-archive (≥1 ref).
     */
    async countReferences(athleteId, id) {
      const { count, error } = await supabase
        .from('weekly_plan_slots')
        .select('id', { head: true, count: 'exact' })
        .eq('athlete_id', athleteId)
        .eq('muscle_group_id', id);
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return count ?? 0;
    },

    /**
     * Repoint every slot reference from `sourceId` to `targetId`, then
     * soft-archive the source. Both rows must belong to the same athlete.
     * The repoint and the archive are issued back-to-back; if the second
     * fails, the source rows are already pointing at the target — the merge
     * is logically idempotent on retry.
     */
    async merge(athleteId, sourceId, targetId) {
      if (sourceId === targetId) {
        throw new HttpError(400, 'VALIDATION_FAILED', 'merge source and target must differ.');
      }
      const target = await this.findById(athleteId, targetId);
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'Target muscle group not found.');
      const source = await this.findById(athleteId, sourceId);
      if (!source) throw new HttpError(404, 'NOT_FOUND', 'Source muscle group not found.');

      // Repoint slot references.
      const { error: repointErr } = await supabase
        .from('weekly_plan_slots')
        .update({ muscle_group_id: targetId })
        .eq('athlete_id', athleteId)
        .eq('muscle_group_id', sourceId);
      if (repointErr) {
        // 23505 is the partial-unique violation we'd hit if both source and
        // target are scheduled in the same week — surface a clean 409.
        if (repointErr.code === '23505') {
          throw new HttpError(
            409,
            'CONFLICT',
            'Cannot merge: source and target are both scheduled this week.',
          );
        }
        throw new HttpError(500, 'DB_ERROR', repointErr.message);
      }

      return this.softArchive(athleteId, sourceId).then(() => target);
    },
  };
}
