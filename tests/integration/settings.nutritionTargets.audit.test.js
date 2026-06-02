// Phase 2 US4 (T053): every PUT and DELETE on /me/nutrition-targets writes
// exactly one calculation_results row carrying reason ∈ {override_set,
// override_cleared} and the engine version (FR-003a).
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
      console.warn('[nutritionTargets.audit] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  supabase = getSupabase(config);
  const probe = await supabase.from('app_config').select('athlete_id').limit(1);
  if (probe.error) {
    console.warn('[nutritionTargets.audit] skipped — Supabase unreachable');
    return;
  }
  app = buildApp({ config });
  live = true;
});

async function countAuditRowsByReason(athleteId, reason) {
  const { count, error } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .eq('reason', reason);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

describe('US4 — nutrition overrides emit audit rows', () => {
  it('PUT { daily_kcal: 3500 } writes one row reason=override_set', async () => {
    if (!live) return;
    const me = await request(app).get('/api/v1/me');
    const athleteId = me.body.data.id;
    const before = await countAuditRowsByReason(athleteId, 'override_set');
    const res = await request(app).put('/api/v1/me/nutrition-targets').send({ daily_kcal: 3500 });
    expect(res.status).toBe(200);
    expect(res.body.data.targets.daily_kcal).toBe(3500);
    expect(res.body.data.reason).toBe('override_set');
    const after = await countAuditRowsByReason(athleteId, 'override_set');
    expect(after - before).toBe(1);
  });

  it('DELETE clears all overrides and writes one row reason=override_cleared', async () => {
    if (!live) return;
    const me = await request(app).get('/api/v1/me');
    const athleteId = me.body.data.id;
    const before = await countAuditRowsByReason(athleteId, 'override_cleared');
    const res = await request(app).delete('/api/v1/me/nutrition-targets');
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('override_cleared');
    const after = await countAuditRowsByReason(athleteId, 'override_cleared');
    expect(after - before).toBe(1);
    // After clear, source must be all-engine.
    const get = await request(app).get('/api/v1/me/nutrition-targets');
    expect(get.body.data.source.daily_kcal).toBe('engine');
  });
});
