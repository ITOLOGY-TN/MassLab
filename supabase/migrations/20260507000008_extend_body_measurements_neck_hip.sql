-- Phase 1 follow-up: body composition (US5) needs neck and hip circumferences
-- for the U.S. Navy multi-measurement body-fat formula. Phase 0 shipped only
-- waist + arm + chest + thigh + shoulder. Both columns are nullable so existing
-- rows remain valid.

alter table public.body_measurements
  add column if not exists neck_cm numeric(5,2),
  add column if not exists hip_cm numeric(5,2);
