// Phase 2 US7 (T093): orchestrator for /data/reset.
// Pure-ish — delegates writes to daos.reset and (optionally) the exporter.
import { buildEnvelope } from './exporter.js';

export async function resetModule({
  athleteId,
  module,
  exportFirst = false,
  daos,
  engineVersion,
  schemaVersion = 1,
}) {
  // Optional pre-reset export. We embed the JSON as a data: URL so the caller
  // can offer a download link; the API surface in OpenAPI calls this
  // `export_url`.
  let exportUrl;
  if (exportFirst) {
    const records = await daos.exporters.readAllForAthlete(athleteId);
    const envelope = buildEnvelope(records, { engineVersion, athleteId, schemaVersion });
    const json = JSON.stringify(envelope);
    const base64 = Buffer.from(json, 'utf8').toString('base64');
    exportUrl = `data:application/json;base64,${base64}`;
  }

  let deletedCounts;
  if (module === 'all') {
    deletedCounts = await daos.reset.deleteAllExceptProfile(athleteId);
  } else if (module === 'preferences') {
    deletedCounts = await daos.reset.resetPreferencesAndOverrides(athleteId);
  } else {
    deletedCounts = await daos.reset.resetModule(athleteId, module);
  }

  return {
    reset_at: new Date().toISOString(),
    module,
    deleted_counts: deletedCounts,
    ...(exportUrl ? { export_url: exportUrl } : {}),
  };
}
