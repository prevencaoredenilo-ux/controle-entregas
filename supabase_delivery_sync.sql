-- Controle de Entregas V14.8.0
-- Sincronização por entidade, com fila offline no cliente e Realtime no retorno da internet.

create table if not exists public.delivery_workspaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_workspaces_code_format check (code ~ '^[a-z0-9-]{3,60}$'),
  constraint delivery_workspaces_name_present check (length(btrim(name)) > 0)
);

create table if not exists public.delivery_workspace_members (
  workspace_id uuid not null references public.delivery_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint delivery_workspace_members_role check (role in ('admin', 'operator', 'viewer'))
);

create index if not exists delivery_workspace_members_user_active_idx
  on public.delivery_workspace_members (user_id, workspace_id)
  where active;

create table if not exists public.delivery_sync_entities (
  workspace_id uuid not null references public.delivery_workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  data jsonb,
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source_client_id text,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (workspace_id, entity_type, entity_id),
  constraint delivery_sync_entities_type check (
    entity_type in (
      'meta', 'settings', 'vehicles', 'neighborhoods', 'employees',
      'costCategories', 'reasons', 'deliveries', 'cycles', 'routeTracks', 'odometerLogs',
      'costs', 'audit', 'dayClosures', 'trash'
    )
  ),
  constraint delivery_sync_entities_id_present check (length(btrim(entity_id)) between 1 and 160),
  constraint delivery_sync_entities_payload check (deleted_at is not null or data is not null)
);

-- Atualização segura de instalações anteriores: libera somente o novo tipo de
-- entidade usado pelo histórico de trajetos GPS.
alter table public.delivery_sync_entities
  drop constraint if exists delivery_sync_entities_type;

alter table public.delivery_sync_entities
  add constraint delivery_sync_entities_type check (
    entity_type in (
      'meta', 'settings', 'vehicles', 'neighborhoods', 'employees',
      'costCategories', 'reasons', 'deliveries', 'cycles', 'routeTracks', 'odometerLogs',
      'costs', 'audit', 'dayClosures', 'trash'
    )
  );

alter table public.delivery_sync_entities
  add column if not exists source_client_id text;

create index if not exists delivery_sync_entities_workspace_updated_idx
  on public.delivery_sync_entities (workspace_id, updated_at desc);

create index if not exists delivery_sync_entities_updated_by_idx
  on public.delivery_sync_entities (updated_by)
  where updated_by is not null;

create or replace function public.delivery_sync_set_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.client_updated_at > now() + interval '5 minutes' then
    new.client_updated_at := now();
  end if;

  if tg_op = 'UPDATE' then
    if new.client_updated_at < old.client_updated_at then
      return old;
    end if;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;

  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists delivery_sync_entities_metadata on public.delivery_sync_entities;
create trigger delivery_sync_entities_metadata
before insert or update on public.delivery_sync_entities
for each row execute function public.delivery_sync_set_metadata();

alter table public.delivery_workspaces enable row level security;
alter table public.delivery_workspace_members enable row level security;
alter table public.delivery_sync_entities enable row level security;

drop policy if exists delivery_workspaces_select_member on public.delivery_workspaces;
create policy delivery_workspaces_select_member
on public.delivery_workspaces
for select
to authenticated
using (
  active
  and exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_workspaces.id
      and member.user_id = (select auth.uid())
      and member.active
  )
);

drop policy if exists delivery_workspace_members_select_self on public.delivery_workspace_members;
create policy delivery_workspace_members_select_self
on public.delivery_workspace_members
for select
to authenticated
using (user_id = (select auth.uid()) and active);

drop policy if exists delivery_sync_entities_select_member on public.delivery_sync_entities;
create policy delivery_sync_entities_select_member
on public.delivery_sync_entities
for select
to authenticated
using (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
  )
);

drop policy if exists delivery_sync_entities_insert_operator on public.delivery_sync_entities;
create policy delivery_sync_entities_insert_operator
on public.delivery_sync_entities
for insert
to authenticated
with check (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'operator')
  )
);

drop policy if exists delivery_sync_entities_update_operator on public.delivery_sync_entities;
create policy delivery_sync_entities_update_operator
on public.delivery_sync_entities
for update
to authenticated
using (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'operator')
  )
)
with check (
  exists (
    select 1
    from public.delivery_workspace_members member
    where member.workspace_id = delivery_sync_entities.workspace_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role in ('admin', 'operator')
  )
);

revoke all on public.delivery_workspaces from anon;
revoke all on public.delivery_workspace_members from anon;
revoke all on public.delivery_sync_entities from anon;

grant select on public.delivery_workspaces to authenticated;
grant select on public.delivery_workspace_members to authenticated;
grant select, insert, update on public.delivery_sync_entities to authenticated;

insert into public.delivery_workspaces (code, name)
values ('nilo-entregas', 'Nilo Supermercado • Controle de Entregas')
on conflict (code) do update
set name = excluded.name,
    active = true,
    updated_at = now();

insert into public.delivery_workspace_members (workspace_id, user_id, role, active)
select workspace.id, profile.id, 'admin', true
from public.delivery_workspaces workspace
join public.profiles profile
  on profile.active
 and profile.role = 'admin'
 and profile.access_scope = 'global'
where workspace.code = 'nilo-entregas'
on conflict (workspace_id, user_id) do update
set role = 'admin',
    active = true,
    updated_at = now();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_sync_entities'
  ) then
    alter publication supabase_realtime add table public.delivery_sync_entities;
  end if;
end
$$;
