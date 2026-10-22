-- Single-user persistence for the application: one JSON snapshot per owner.
-- The normalised tables remain available for a future, finer-grained migration.

-- Users created before the profile trigger existed need their profile rows.
insert into public.profiles (id)
select u.id from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);
insert into public.app_settings (owner_id)
select p.id from public.profiles p
 where not exists (select 1 from public.app_settings s where s.owner_id = p.id);

create table public.app_state (
  owner_id uuid primary key references public.profiles (id) on delete restrict,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint app_state_data_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.app_state enable row level security;

create policy "Owners can read app state"
  on public.app_state for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can insert app state"
  on public.app_state for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners can update app state"
  on public.app_state for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.app_state from anon, authenticated;
grant select on public.app_state to authenticated;
grant insert (owner_id, data) on public.app_state to authenticated;
grant update (data) on public.app_state to authenticated;

create trigger set_updated_at
  before update on public.app_state
  for each row execute function public.set_updated_at();
