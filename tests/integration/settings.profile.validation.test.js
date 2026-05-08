// Phase 2 US1 (T013): invalid PATCH /me bodies return 400 VALIDATION_FAILED
// and persist nothing.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

let app;
let supabase;
let live = false;

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[settings.profile.validation] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[settings.profile.validation] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

describe('US1 — PATCH /me validation', () => {
  const cases = [
    ['age out of range', { age: 200 }],
    ['negative weight', { current_weight_kg: -1 }],
    ['target diverges by > 50 kg', { current_weight_kg: 70, target_weight_kg: 200 }],
    ['program_start_date > 12 months out', { program_start_date: '2031-01-01' }],
  ];

  it.each(cases)('rejects %s with 400 VALIDATION_FAILED', async (_label, body) => {
    if (!live) return;

    const res = await request(app).patch('/api/v1/me').send(body);
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION_FAILED');

    // Persistence check: the rejected fields must NOT match the bad body.
    // (We don't snapshot before/after because other test files run in parallel
    // against the same cloud athlete and mutate state independently — but a
    // rejected PATCH must never persist its own bad value.)
    const after = await request(app).get('/api/v1/me');
    for (const [k, v] of Object.entries(body)) {
      const dbCol = k === 'current_weight_kg' ? 'starting_weight_kg' : k;
      expect(after.body.data[dbCol]).not.toBe(v);
    }
  });
});
