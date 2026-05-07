create table if not exists public.nutrition_template_meals (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slot text not null,
  display_order int not null,
  target_kcal int not null,
  target_protein_g int not null,
  target_carbs_g int not null,
  target_fat_g int not null,
  unique (athlete_id, slot)
);

alter table public.nutrition_template_meals enable row level security;
drop policy if exists nutrition_template_meals_select_own on public.nutrition_template_meals;
create policy nutrition_template_meals_select_own on public.nutrition_template_meals
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists nutrition_template_meals_modify_own on public.nutrition_template_meals;
create policy nutrition_template_meals_modify_own on public.nutrition_template_meals
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
