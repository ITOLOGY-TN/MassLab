-- Phase 2 US4 (T048): per-key notification acknowledgements (FR-017c).
alter table public.app_config
  add column if not exists notification_acks jsonb not null default '{}'::jsonb;
