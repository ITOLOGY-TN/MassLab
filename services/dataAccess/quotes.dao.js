import { HttpError } from '../../middleware/errorHandler.js';

function dayIndex(now = new Date()) {
  // Days since 1970-01-01 (UTC). Pure-ish: caller passes the date.
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(ms / 86_400_000);
}

export function quotesDao(supabase) {
  return {
    async list({ athleteId, locale = 'fr-FR' }) {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('id', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },

    async pickToday({ athleteId, locale = 'fr-FR', now = new Date() }) {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('locale', locale)
        .order('id', { ascending: true });
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      if (!data?.length) return null;
      return data[dayIndex(now) % data.length];
    },

    async upsertMany(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from('quotes')
        .upsert(rows, { onConflict: 'athlete_id,slug,locale' })
        .select('*');
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data ?? [];
    },
  };
}
