-- Phase 1, T011: extend app_config with engine overrides JSONB.
-- Phase 1 ships every athlete with '{}' (i.e. defaults); Phase 2 Settings UI is the first writer.

alter table public.app_config
  add column if not exists engine_overrides jsonb not null default '{}'::jsonb;
