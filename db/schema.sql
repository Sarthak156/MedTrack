-- MedTrack schema — PL/pgSQL fixed version
-- (reflects fix for "syntax error at or near if" — IF/THEN requires PL/pgSQL)
-- Copy/paste into Supabase SQL Editor and run.

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- Enums
do $$ begin
  create type public.app_role as enum ('patient', 'caregiver', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.med_log_status as enum ('pending', 'taken', 'missed');
exception when duplicate_object then null; end $$;

-- Profiles (one row per Clerk user)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  role public.app_role not null default 'patient',
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

-- Caregiver assignments
create table if not exists public.caregiver_assignments (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (caregiver_id, patient_id)
);

-- Medications
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  dosage text not null,
  frequency text not null default 'Once daily',
  times text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists medications_patient_idx on public.medications(patient_id);

-- Medication logs
create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_time timestamptz not null,
  taken_at timestamptz,
  status public.med_log_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (medication_id, scheduled_time)
);
create index if not exists medication_logs_patient_time_idx on public.medication_logs(patient_id, scheduled_time);


-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS — PL/pgSQL + SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════════════════════

-- is_admin(): PL/pgSQL (required for IF/THEN), SECURITY DEFINER (bypasses RLS)
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_clerk_id text := coalesce(auth.jwt() ->> 'sub', '');
  admin_found   boolean := false;
begin
  -- Strategy 1: direct email admin override (Clerk always sends email in JWT)
  if user_email = 'goyalsarthak156@gmail.com' then
    return true;
  end if;

  -- Strategy 2: profiles table lookup by email OR clerk_user_id for admin role
  -- SECURITY DEFINER bypasses RLS — no recursion possible.
  select exists(
    select 1
    from public.profiles
    where (lower(email) = user_email or clerk_user_id = user_clerk_id)
      and role = 'admin'
  ) into admin_found;

  return admin_found;
end;
$$;

grant execute on function public.is_admin() to postgres;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;

-- is_caregiver_of(p_patient_id): PL/pgSQL + SECURITY DEFINER
create or replace function public.is_caregiver_of(p_patient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  found boolean := false;
begin
  select exists(
    select 1
    from public.caregiver_assignments ca
    join public.profiles p on p.id = ca.caregiver_id
    where ca.patient_id = p_patient_id
      and p.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
  ) into found;
  return found;
end;
$$;

grant execute on function public.is_caregiver_of(uuid) to postgres;
grant execute on public.is_caregiver_of(uuid) to authenticated;
grant execute on function public.is_caregiver_of(uuid) to anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — PROFILES (inline admin check, NOT is_admin())
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select
  using (
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    or exists (
      select 1 from public.profiles p2
      where p2.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
        and p2.role = 'admin'
    )
    or exists (
      select 1 from public.caregiver_assignments ca
      join public.profiles cg on cg.id = ca.caregiver_id
      where cg.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
        and ca.patient_id = profiles.id
    )
  );

create policy profiles_insert on public.profiles
  for insert
  with check (
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    and role <> 'admin'
  );

create policy profiles_update on public.profiles
  for update
  using (clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
  with check (
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    and role <> 'admin'
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — MEDICATIONS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.medications enable row level security;

create policy meds_select on public.medications
  for select
  using (
    exists (select 1 from public.profiles where id = medications.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
    or public.is_caregiver_of(patient_id)
  );

create policy meds_modify on public.medications
  for all
  using (
    exists (select 1 from public.profiles where id = medications.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.profiles where id = medications.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — MEDICATION_LOGS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.medication_logs enable row level security;

create policy logs_select on public.medication_logs
  for select
  using (
    exists (select 1 from public.profiles where id = medication_logs.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
    or public.is_caregiver_of(patient_id)
  );

create policy logs_modify on public.medication_logs
  for all
  using (
    exists (select 1 from public.profiles where id = medication_logs.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.profiles where id = medication_logs.patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or public.is_admin()
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — CAREGIVER_ASSIGNMENTS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.caregiver_assignments enable row level security;

create policy assign_select on public.caregiver_assignments
  for select
  using (
    public.is_admin()
    or exists (select 1 from public.profiles where id = caregiver_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
    or exists (select 1 from public.profiles where id = patient_id and clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
  );

create policy assign_admin on public.caregiver_assignments
  for all
  using (public.is_admin())
  with check (public.is_admin());


-- ══════════════════════════════════════════════════════════════════════════════
-- ADMIN SETUP
-- ══════════════════════════════════════════════════════════════════════════════

-- Ensure admin profile exists (idempotent):
-- insert into public.profiles (clerk_user_id, role, full_name, email)
-- values ('your_clerk_user_id', 'admin', 'Your Name', 'goyalsarthak156@gmail.com')
-- on conflict (clerk_user_id) do update set role = 'admin';

-- Verify:
-- select id, clerk_user_id, email, role from public.profiles where role = 'admin';
-- select public.is_admin();  -- should be TRUE when logged in as admin