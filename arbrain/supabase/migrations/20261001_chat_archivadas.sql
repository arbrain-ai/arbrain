-- Archivar conversaciones (1 oct 2026)
-- Menú «⋯» de cada conversación (Recientes y «Ver todas»): archivar la saca de las listas sin borrarla.
-- Reversible: la columna es nullable, null = no archivada. Deshacer:
--   drop index if exists public.chat_sessions_archived_idx;
--   alter table public.chat_sessions drop column if exists archived_at;

alter table public.chat_sessions
  add column if not exists archived_at timestamptz;

-- Parcial: solo indexa las archivadas (pocas), para el «Ver archivadas» sin costo en el camino normal.
create index if not exists chat_sessions_archived_idx
  on public.chat_sessions (archived_at desc)
  where archived_at is not null;
