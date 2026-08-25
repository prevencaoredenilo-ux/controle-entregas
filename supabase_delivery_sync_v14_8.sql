-- Controle de Entregas V14.8.0
-- Migração mínima: permite sincronizar os trajetos GPS na tabela genérica já existente.

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
