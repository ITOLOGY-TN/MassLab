// Boundary: only this directory imports `@supabase/supabase-js`.
import { HttpError } from '../../middleware/errorHandler.js';

export function athletesDao(supabase) {
  return {
    async findById(id) {
      const { data, error } = await supabase.from('athletes').select('*').eq('id', id).maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async findBySeed() {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async findByAuthUserId(authUserId) {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },

    async upsertProfile(profile) {
      const { data, error } = await supabase
        .from('athletes')
        .upsert(profile, { onConflict: 'email' })
        .select('*')
        .single();
      if (error) throw new HttpError(500, 'DB_ERROR', error.message);
      return data;
    },
  };
}
