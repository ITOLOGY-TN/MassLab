import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../../config/index.js';
import { getSupabase, _resetSupabaseCache } from '../../services/dataAccess/supabaseClient.js';
import { buildApp } from '../../app.js';

// Phase 9 (012-phase9-recovery-wellbeing) T019 — contract for GET /recovery/alerts,
// driven against specs/012-phase9-recovery-wellbeing/contracts/openapi.yaml via
// Supertest. Envelope shape only (no seeding/mutation; the triggering windows live in
// the integration suite with snapshot/restore). Live-gated: skips when .env is missing,
// Supabase is unreachable, or the Phase 9 recovery_log columns are unapplied.
let app;
let live = false;

const ALERT_KINDS = ['high_stress', 'reduce_volume', 'full_rest'];
const ALERT_SEVERITIES = ['warning', 'advice'];

beforeAll(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.warn('[recovery.alerts.contract] skipped — .env not configured');
      return;
    }
    throw err;
  }
  _resetSupabaseCache();
  const supabase = getSupabase(config);
  const probe = await supabase.from('athletes').select('id').limit(1);
  if (probe.error) {
    console.warn('[recovery.alerts.contract] skipped — Supabase unreachable');
    return;
  }
  // Probe the Phase 9 migration: the new sleep_quality column on recovery_log.
  const mig = await supabase.from('recovery_log').select('sleep_quality').limit(1);
  if (mig.error) {
    console.warn('[recovery.alerts.contract] skipped — Phase 9 migration not applied');
    return;
  }
  app = buildApp({ config, supabase });
  live = true;
});

describe('contract: GET /recovery/alerts', () => {
  it('returns the AlertsView envelope', async () => {
    if (!live) return;
    const res = await request(app).get('/api/v1/recovery/alerts');
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data).toBeTruthy();
    expect(typeof data.all_clear).toBe('boolean');
    expect(Array.isArray(data.alerts)).toBe(true);
    // all_clear must agree with the alert list being empty.
    expect(data.all_clear).toBe(data.alerts.length === 0);
    for (const alert of data.alerts) {
      expect(ALERT_KINDS).toContain(alert.kind);
      expect(ALERT_SEVERITIES).toContain(alert.severity);
      expect(typeof alert.message_key).toBe('string');
      expect(typeof alert.context).toBe('object');
      expect(alert.context).not.toBeNull();
    }
  });
});
