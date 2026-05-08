import { HttpError } from '../../middleware/errorHandler.js';

const NUTRITION_KEYS = ['daily_kcal', 'daily_protein_g', 'daily_carbs_g', 'daily_fat_g'];

function ensureNutritionShape(overrides) {
  return overrides && typeof overrides === 'object' ? overrides : {};
}

export function appConfigDao(supabase) {
  return {
    async getOverridesFor(athleteId) {
      const { data, error } = await supabase
        .from('app_config')
        .select('engine_overrides')
        .eq('athlete_id', athleteId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data?.engine_overrides ?? {};
    },

    async setOverridesFor(athleteId, overrides) {
      const { data, error } = await supabase
        .from('app_config')
        .upsert(
          { athlete_id: athleteId, engine_overrides: overrides ?? {} },
          { onConflict: 'athlete_id' },
        )
        .select('engine_overrides')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data.engine_overrides;
    },

    /**
     * Phase 2 US4 (T057): full app_config row read for the preferences UI.
     */
    async getPreferences(athleteId) {
      const { data, error } = await supabase
        .from('app_config')
        .select('theme, units, rest_timer_sound, notification_acks')
        .eq('athlete_id', athleteId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      // Defaults match the column DEFAULT clauses.
      return (
        data ?? {
          theme: 'dark',
          units: 'kg',
          rest_timer_sound: true,
          notification_acks: {},
        }
      );
    },

    /**
     * Phase 2 US4 (T057): partial preferences update. notification_acks is
     * deep-merged so callers can update one key without clobbering others;
     * passing `null` for a key clears that ack.
     */
    async setPreferences(athleteId, patch) {
      // Merge notification_acks at the application layer.
      let merged = patch;
      if (patch.notification_acks) {
        const cur = await this.getPreferences(athleteId);
        const acks = { ...(cur.notification_acks ?? {}) };
        for (const [k, v] of Object.entries(patch.notification_acks)) {
          if (v === null) delete acks[k];
          else acks[k] = v;
        }
        merged = { ...patch, notification_acks: acks };
      }
      const { data, error } = await supabase
        .from('app_config')
        .upsert({ athlete_id: athleteId, ...merged }, { onConflict: 'athlete_id' })
        .select('theme, units, rest_timer_sound, notification_acks')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    /**
     * Phase 2 US4 (T057): set or clear a subset of nutrition overrides.
     * - A numeric value is written.
     * - `null` clears the key.
     * Returns the post-write `engine_overrides` JSONB so the controller can
     * pass the resolved snapshot to the audit writer.
     */
    async setNutritionOverride(athleteId, partial) {
      const cur = ensureNutritionShape(await this.getOverridesFor(athleteId));
      const nutrition = { ...(cur.nutrition ?? {}) };
      for (const k of NUTRITION_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(partial, k)) continue;
        if (partial[k] === null) delete nutrition[k];
        else nutrition[k] = partial[k];
      }
      const next = { ...cur };
      if (Object.keys(nutrition).length === 0) delete next.nutrition;
      else next.nutrition = nutrition;
      return this.setOverridesFor(athleteId, next);
    },

    async clearAllNutritionOverrides(athleteId) {
      const cur = ensureNutritionShape(await this.getOverridesFor(athleteId));
      const next = { ...cur };
      delete next.nutrition;
      return this.setOverridesFor(athleteId, next);
    },
  };
}
