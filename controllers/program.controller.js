import { HttpError } from '../middleware/errorHandler.js';
import { generateProgram } from '../services/programGenerator.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';

export function programController({ daos }) {
  /**
   * Regenerate the active program for `athleteId`. Phase 2 (T017) added the
   * optional `reason` tag — when provided, it is forwarded to the audit
   * writer so callers (e.g. PATCH /me with reason='profile_save') can be
   * traced through `calculation_results.reason`. Defaults to null to keep the
   * Phase 1 behaviour unchanged for existing callers.
   */
  async function regenerateForAthlete(athleteId, { reason } = {}) {
    const profile = await daos.athletes.findById(athleteId);
    if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');
    const overrides = await daos.appConfig.getOverridesFor(athleteId);
    const constants = resolveConstants(overrides);
    // FR-021: when body composition data exists, use it for lean body mass so
    // the protein target reflects real progress instead of the morphotype default.
    const latestBodyComp = daos.bodyComposition
      ? await daos.bodyComposition.latestForAthlete(athleteId)
      : null;
    const lean_body_mass_kg = latestBodyComp?.lean_body_mass_kg
      ? Number(latestBodyComp.lean_body_mass_kg)
      : undefined;
    const program = generateProgram(profile, { constants, lean_body_mass_kg });
    const row = await daos.generatedPrograms.archiveAndInsert(athleteId, {
      payload: program,
      engine_version: program.engine_version,
      resolved_constants: program.resolved_constants,
    });
    const auditRow = await writeAudit({
      daos,
      athleteId,
      calculator: 'program_generate',
      reason: reason ?? null,
      inputs: { profile_id: profile.id },
      outputs: { program_id: row.id, daily_kcal: program.nutrition.daily_kcal },
      resolvedConstants: program.resolved_constants,
      engineVersion: program.engine_version,
      producedRecord: { kind: 'generated_programs', id: row.id },
    });
    return { ...row, calculation_audit_id: auditRow?.id ?? null };
  }

  return {
    async getActive(req, res, next) {
      try {
        const row = await daos.generatedPrograms.findActiveForAthlete(req.athleteId);
        if (!row) {
          throw new HttpError(
            404,
            'NOT_FOUND',
            'No active program. Run npm run seed or POST /api/v1/program/regenerate.',
          );
        }
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async regenerate(req, res, next) {
      try {
        const row = await regenerateForAthlete(req.athleteId);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async listHistory(req, res, next) {
      try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const data = await daos.generatedPrograms.listHistoryForAthlete(req.athleteId, { limit });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // Exposed for reuse by other controllers (US4 PATCH /me, US5 body-measurements).
    regenerateForAthlete,
  };
}
