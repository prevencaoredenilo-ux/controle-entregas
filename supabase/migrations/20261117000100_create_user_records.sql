-- Órbita: registros por usuário com RLS.
-- Este arquivo é deliberadamente apenas uma migração versionada; não foi executado por este PR.

create extension if not exists pgcrypto;

create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  entity text not null check (entity in (
    'deliveries', 'cycles', 'vehicles', 'drivers', 'collaborators',
    'neighborhoods', 'costs', 'audits', 'settings', 'backups', 'training', 'trips'
  )),
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, entity, record_id)
);

create index if not exists app_records_user_entity_idx
  on public.app_records (user_id, entity);

alter table public.app_records enable row level security;
alter table public.app_records force row level security;

drop policy if exists "app_records_select_own" on public.app_records;
drop policy if exists "app_records_insert_own" on public.app_records;
drop policy if exists "app_records_update_own" on public.app_records;
drop policy if exists "app_records_delete_own" on public.app_records;

create policy "app_records_select_own"
  on public.app_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "app_records_insert_own"
  on public.app_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "app_records_update_own"
  on public.app_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "app_records_delete_own"
  on public.app_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);
