-- ================================================================
-- MJM AI SYSTEM — TRAINING ASSESSMENT RECORDS
-- Run this in the Supabase SQL Editor (once).
--
-- An ASSESSOR (any signed-in training user) records assessments FOR
-- another user (the trainee): activity + photo proof + location +
-- time. Rows are immutable; counts per activity are the trainee's
-- assessment progress toward qualifying for their role.
-- ================================================================

create table if not exists public.training_assessments (
  id               uuid primary key default gen_random_uuid(),
  trainee_user_id  uuid,
  trainee_email    text not null,
  trainee_name     text,
  assessor_user_id uuid not null,
  assessor_email   text,
  assessor_name    text,
  activity         text not null,
  taken_at         timestamptz not null default now(),
  lat              double precision,
  lng              double precision,
  accuracy_m       double precision,
  photo_path       text,
  photo_url        text,
  created_at       timestamptz not null default now()
);

create index if not exists training_assessments_trainee_idx
  on public.training_assessments (trainee_email, activity);
create index if not exists training_assessments_taken_idx
  on public.training_assessments (taken_at desc);

alter table public.training_assessments enable row level security;

-- Any signed-in user may record an assessment, but only as themselves.
drop policy if exists "ta_insert_own" on public.training_assessments;
create policy "ta_insert_own" on public.training_assessments
  for insert to authenticated
  with check (assessor_user_id = auth.uid());

-- Everyone signed in can read (trainees see their own progress,
-- assessors see counts, admins review).
drop policy if exists "ta_read_all" on public.training_assessments;
create policy "ta_read_all" on public.training_assessments
  for select to authenticated
  using (true);

-- Records are immutable: no update policy. Only Manage Users
-- accounts may delete (fix mistakes).
drop policy if exists "ta_admin_delete" on public.training_assessments;
create policy "ta_admin_delete" on public.training_assessments
  for delete to authenticated
  using (
    exists (
      select 1 from public.shared_profiles sp
      where sp.id = auth.uid()
        and coalesce((sp.permissions->>'manage_users')::boolean, false)
    )
  );

-- ----------------------------------------------------------------
-- Trainee picker: lets ANY training user list other training users
-- (name + email + training settings) regardless of shared_profiles
-- read restrictions. SECURITY DEFINER, read-only, minimal columns.
-- ----------------------------------------------------------------
create or replace function public.training_users()
returns table(user_id uuid, email text, full_name text, training jsonb)
language sql
security definer
set search_path = public
as $$
  select id, email, full_name, coalesce(permissions->'training', '{}'::jsonb)
  from public.shared_profiles
  where coalesce(permissions->'modules'->>'training', 'none') <> 'none';
$$;

grant execute on function public.training_users() to authenticated;
