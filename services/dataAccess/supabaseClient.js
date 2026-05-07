// CONSTITUTION v1.1.1, Principle II — DATA ACCESS BOUNDARY
// This file is the ONLY place in the backend that imports `@supabase/supabase-js`.
// Routes, controllers, and pure services MUST go through the DAO modules in this
// directory and never reach for `createClient` themselves. The frontend ships its
// own publishable-key client under `frontend/src/lib/`; never import this module
// from frontend code.
import { createClient } from '@supabase/supabase-js';

let cached = null;

export function getSupabase(config) {
  if (cached) return cached;
  cached = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application': 'masslab-api' } },
  });
  return cached;
}

/** Reset the cached client. Tests only. */
export function _resetSupabaseCache() {
  cached = null;
}
