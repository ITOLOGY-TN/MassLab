/**
 * Single helper used by every persisted-write code path to append one row to
 * `calculation_results`. Keeps audit-log writes consistent across calculators.
 *
 * Usage:
 *   await writeAudit({
 *     daos,
 *     athleteId,
 *     calculator: 'one_rep_max',
 *     inputs,
 *     outputs,
 *     resolvedConstants,
 *     engineVersion,
 *     producedRecord: { kind: 'one_rep_max_records', id: row.id },
 *   });
 */
export async function writeAudit({
  daos,
  athleteId,
  calculator,
  reason,
  inputs,
  outputs,
  resolvedConstants,
  engineVersion,
  producedRecord,
}) {
  return daos.calculationResults.insert({
    athlete_id: athleteId,
    calculator,
    reason: reason ?? null,
    inputs,
    outputs,
    resolved_constants: resolvedConstants,
    engine_version: engineVersion,
    produced_record_kind: producedRecord?.kind ?? null,
    produced_record_id: producedRecord?.id != null ? String(producedRecord.id) : null,
  });
}
