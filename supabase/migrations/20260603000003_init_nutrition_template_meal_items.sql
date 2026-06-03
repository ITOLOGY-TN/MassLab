create table if not exists public.nutrition_template_meal_items (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slot text not null check (slot in ('breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack')),
  food_id bigint not null references public.foods(id) on delete restrict,
  quantity_g numeric(7, 2) not null,
  display_order int not null
);
create index if not exists nutrition_template_meal_items_athlete_idx on public.nutrition_template_meal_items (athlete_id, slot, display_order);

alter table public.nutrition_template_meal_items enable row level security;
drop policy if exists nutrition_template_meal_items_select_own on public.nutrition_template_meal_items;
create policy nutrition_template_meal_items_select_own on public.nutrition_template_meal_items
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists nutrition_template_meal_items_modify_own on public.nutrition_template_meal_items;
create policy nutrition_template_meal_items_modify_own on public.nutrition_template_meal_items
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
