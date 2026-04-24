-- =============================================================================
-- MedTrack DB Fix — PL/pgSQL is_admin() + clean RLS policies
--
-- Fix for: "syntax error at or near if" (IF only works in PL/pgSQL, not SQL)
--
-- Run this entire file in Supabase SQL Editor.
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Clean slate (idempotent — safe to rerun)
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists meds_select on public.medications;
drop policy if exists meds_modify on public.medications;
drop policy if exists logs_select on public.medication_logs;
drop policy if exists logs_modify on public.medication_logs;
drop policy if exists assign_select on public.caregiver_assignments;
drop policy if exists assign_admin on public.caregiver_assignments;

drop function if exists public.is_admin() cascade;
drop function if exists public.is_caregiver_of(uuid) cascade;

alter table public.profiles          disable row level security;
alter table public.medications       disable row level security;
alter table public.medication_logs   disable row level security;
alter table public.caregiver_assignments disable row level security;


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2: is_admin() — PL/pgSQL with email override + profile fallback
--
-- LANGUAGE plpgsql (not SQL) — required for IF/THEN/END IF syntax
-- SECURITY DEFINER — bypasses RLS so inner queries don't recurse
--
-- Detection order:
--  1. Direct email override — if JWT email matches admin email → true
--  2. Profile lookup by email OR clerk_user_id → role='admin' → true
-- ══════════════════════════════════════════════════════════════════════════════

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
  -- Strategy 1: direct email admin override
  -- Clerk always includes 'email' in the JWT via the supabase template.
  -- This bypasses the profiles table entirely for admin detection.
  if user_email = 'goyalsarthak156@gmail.com' then
    return true;
  end if;

  -- Strategy 2: profiles table lookup
  -- Check both email (case-insensitive) and clerk_user_id for role='admin'.
  -- SECURITY DEFINER means this SELECT bypasses RLS — no recursion.
  select exists(
    select 1
    from public.profiles
    where (lower(email) = user_email or clerk_user_id = user_clerk_id)
      and role = 'admin'
  ) into admin_found;

  return admin_found;
end;
$$;

-- Ensure postgres and authenticated users can call this function
grant execute on function public.is_admin() to postgres;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 3: is_caregiver_of() — PL/pgSQL, SECURITY DEFINER
-- Bypasses RLS when checking caregiver assignments.
-- ══════════════════════════════════════════════════════════════════════════════

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
grant execute on function public.is_caregiver_of(uuid) to authenticated;
grant execute on function public.is_caregiver_of(uuid) to anon;


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 4: PROFILES policies
--
-- profiles_select uses INLINE EXISTS (not is_admin()) to break recursion.
-- is_admin() is only called from OTHER tables' policies (meds, logs, assignments).
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;

-- SELECT: own row, inline admin check (NOT is_admin() to prevent recursion),
--         OR assigned caregiver can read patient's profile.
create policy profiles_select on public.profiles
  for select
  using (
    -- Own profile
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    -- Inline admin check via profile lookup (not calling is_admin())
    or exists (
      select 1 from public.profiles p2
      where p2.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
        and p2.role = 'admin'
    )
    -- Caregiver can read assigned patients' profiles
    or exists (
      select 1 from public.caregiver_assignments ca
      join public.profiles cg on cg.id = ca.caregiver_id
      where cg.clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
        and ca.patient_id = profiles.id
    )
  );

-- INSERT: user creates only their own row; cannot self-promote to admin.
create policy profiles_insert on public.profiles
  for insert
  with check (
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    and role <> 'admin'
  );

-- UPDATE: user updates only their own row; cannot change own role to admin.
create policy profiles_update on public.profiles
  for update
  using (clerk_user_id = coalesce(auth.jwt() ->> 'sub', ''))
  with check (
    clerk_user_id = coalesce(auth.jwt() ->> 'sub', '')
    and role <> 'admin'
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 5: MEDICATIONS — calls SECURITY DEFINER helpers (no recursion risk)
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
-- STEP 6: MEDICATION_LOGS
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
-- STEP 7: CAREGIVER_ASSIGNMENTS
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
-- VERIFICATION & SETUP QUERIES
-- Run these in SQL Editor while signed in as your admin user.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Test is_admin() — should return TRUE:
-- select public.is_admin() as is_admin_result;

-- 2. Show JWT claims to see what Clerk is sending:
-- select auth.jwt() ->> 'sub' as jwt_sub, auth.jwt() ->> 'email' as jwt_email;

-- 3. See all profiles:
-- select id, clerk_user_id, email, role from public.profiles;

-- 4. Ensure admin profile exists (idempotent — safe to run):
insert into public.profiles (clerk_user_id, role, full_name, email)
values (
  'replace_with_your_clerk_user_id',  -- update this first!
  'admin',
  'Sarthak',
  'goyalsarthak156@gmail.com'
)
on conflict (clerk_user_id) do update set
  role = 'admin',
  full_name = coalesce(public.profiles.full_name, 'Sarthak'),
  email = 'goyalsarthak156@gmail.com';

-- 5. Update role by email if profile exists but wrong role:
-- update public.profiles set role = 'admin' where lower(email) = 'goyalsarthak156@gmail.com';