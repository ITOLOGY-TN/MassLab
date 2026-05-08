// Phase 2 US1 (T012): PATCH /api/v1/me with a calculator-input change must
// produce exactly one new row in calculation_results carrying the active
// engine version + reason='profile_save' + a resolved_constants snapshot.
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
      console.warn('[settings.profile.audit] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const { error } = await supabase.from('athletes').select('id').limit(1);
  if (error) {
    console.warn('[settings.profile.audit] skipped — Supabase unreachable:', error.message);
    return;
  }
  app = buildApp({ config });
  live = true;
});

async function countAuditRows(athleteId) {
  const { count, error } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

describe('US1 — profile save → engine recompute → exactly one audit row', () => {
  it('PATCH /me { current_weight_kg } writes one calculation_results row with reason=profile_save', async () => {
    if (!live) return;
    const before = await request(app).get('/api/v1/me');
    expect(before.status).toBe(200);
    const athleteId = before.body.data.id;
    const startWeight = before.body.data.starting_weight_kg ?? 75;

    const beforeCount = await countAuditRows(athleteId);

    const next = Number(startWeight) + 0.5;
    const res = await request(app).patch('/api/v1/me').send({ current_weight_kg: next });
    expect(res.status).toBe(200);

    const afterCount = await countAuditRows(athleteId);
    expect(afterCount - beforeCount).toBe(1);

    // Inspect the newest row.
    const { data: rows, error } = await supabase
      .from('calculation_results')
      .select('reason, engine_version, resolved_constants')
      .eq('athlete_id', athleteId)
      .order('id', { ascending: false })
      .limit(1);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('profile_save');
    expect(typeof rows[0].engine_version).toBe('string');
    expect(rows[0].resolved_constants).toBeTypeOf('object');
  });

  it('PATCH /me with no calculator-input change does NOT regenerate', async () => {
    if (!live) return;
    const before = await request(app).get('/api/v1/me');
    const athleteId = before.body.data.id;
    const beforeCount = await countAuditRows(athleteId);
    const res = await request(app).patch('/api/v1/me').send({ display_name: 'Phase 2 audit test' });
    expect(res.status).toBe(200);
    const afterCount = await countAuditRows(athleteId);
    expect(afterCount).toBe(beforeCount);
  });
});
