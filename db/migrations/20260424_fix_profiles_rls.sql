-- MedTrack migration: fix recursive profiles RLS and add safe admin allowlist
-- Clerk user ids are stored as text in public.profiles.clerk_user_id.
-- Policies compare against auth.jwt() ->> 'sub' rather than auth.uid().

begin;

create table if not exists public.admin_users (
  clerk_user_id text primary key,
  email text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

insert into public.admin_users (clerk_user_id, email)
select clerk_user_id, email
from public.profiles
where role = 'admin'
on conflict (clerk_user_id) do update
set email = excluded.email;

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_clerk_user_id text := coalesce(auth.jwt() ->> 'sub', '');
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  return exists (
    select 1
    from public.admin_users
    where clerk_user_id = current_clerk_user_id
       or lower(coalesce(email, '')) = current_email
  );
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_admin() to postgres;

create or replace function public.sync_admin_users_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.admin_users
    where clerk_user_id = old.clerk_user_id;
    return old;
  end if;

  if new.role = 'admin' then
    insert into public.admin_users (clerk_user_id, email)
    values (new.clerk_user_id, new.email)
    on conflict (clerk_user_id) do update
      set email = excluded.email;
  else
    delete from public.admin_users
    where clerk_user_id = new.clerk_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_admin_users_from_profiles on public.profiles;
create trigger sync_admin_users_from_profiles
after insert or update of role, clerk_user_id, email or delete on public.profiles
for each row
execute function public.sync_admin_users_from_profiles();

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_select_own
on public.profiles
for select
using (
  clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  or public.is_admin()
);

create policy profiles_insert_own
on public.profiles
for insert
with check (
  clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  and role <> 'admin'
);

create policy profiles_update_own
on public.profiles
for update
using (
  clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  or public.is_admin()
)
with check (
  (clerk_user_id = coalesce(auth.jwt() ->> 'sub', '') and role <> 'admin')
  or public.is_admin()
);

commit;
