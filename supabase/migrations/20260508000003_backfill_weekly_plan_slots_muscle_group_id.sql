-- Phase 2 US2 (T022): pure-SQL backfill — idempotent and a no-op on a fresh DB.
-- 1. Insert one catalogue row per (athlete_id, distinct muscle_group) that does not yet exist.
-- 2. Update each slot to point at its catalogue row.

insert into public.muscle_groups (athlete_id, slug, name, display_color, sort_order)
select s.athlete_id,
       lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g')) as slug,
       s.muscle_group as name,
       coalesce(s.display_color, '#6b7280') as display_color,
       min(s.display_order)
from public.weekly_plan_slots s
where not exists (
  select 1 from public.muscle_groups mg
   where mg.athlete_id = s.athlete_id
     and mg.slug = lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g'))
)
group by s.athlete_id, s.muscle_group, s.display_color;

update public.weekly_plan_slots s
   set muscle_group_id = mg.id
  from public.muscle_groups mg
 where mg.athlete_id = s.athlete_id
   and mg.slug = lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g'))
   and s.muscle_group_id is null;
