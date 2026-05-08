// Phase 2 US5 (T070): zod schema for the v1 backup envelope.
// Mirrors specs/003-phase2-settings-data/contracts/openapi.yaml#/components/schemas/BackupEnvelope.
import { z } from 'zod';

const exportMeta = z.object({
  schema_version: z.number().int().min(1),
  engine_version: z.string(),
  exported_at: z.string(),
  athlete_id: z.string().uuid(),
});

export const BACKUP_SCHEMA_V1 = z
  .object({
    _export: exportMeta,
    athletes: z.array(z.record(z.any())),
    app_config: z.array(z.record(z.any())),
    exercises: z.array(z.record(z.any())),
    muscle_groups: z.array(z.record(z.any())),
    weekly_plan_slots: z.array(z.record(z.any())),
    weekly_plan_exercises: z.array(z.record(z.any())),
  })
  .passthrough();

export function validateEnvelope(input) {
  return BACKUP_SCHEMA_V1.safeParse(input);
}
