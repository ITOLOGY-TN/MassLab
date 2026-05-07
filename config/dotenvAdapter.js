import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export function loadFromDotenv({ envPath = path.join(repoRoot, '.env') } = {}) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
  const out = {};
  for (const key of [
    'SINGLE_USER_MODE',
    'PORT',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CORS_ORIGIN',
  ]) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}
