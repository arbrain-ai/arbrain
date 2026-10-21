-- Una campana que vale la pena (25 sep 2026)
--
-- ORIGEN: censo de 48 h (23→25 sep). La campana de Arbrain leía `notifications`,
-- herencia de OpenClaw (menciones a agentes): 0 filas desde su creación, ningún
-- emisor. Mientras tanto salían push sin rastro por /api/notifications/send
-- (health_sentinel ≥9 en ~27 h, avisos de SFTerm) y solo los de crons dejaban
-- acuse en push_log. Campana y push estaban desacoplados al 100%.
--
-- Regla (telemetria-no-va-a-la-campana, 3 sep 2026): la campana es del dueño; la
-- máquina le reporta al mecánico. Por eso DOS tablas, no un filtro sobre una:
--   avisos   → lo que Daniel ve y lo que le suena: un agente terminó o necesita
--              permiso, agenda, dinero, una persona, el servidor se detuvo.
--   bitacora → telemetría de procesos. Nunca push, nunca campana. La lee Levy
--              (y la vista Rutinas muestra fallos de rutinas desde su historial).
-- La decisión vive en un solo lugar: arbrain/src/features/avisos/policy.ts.
--
-- Escriben: /api/notifications/send y /api/openclaw/event (service role).
-- Leen:     /api/avisos (campana, filtra por user_id del principal).

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid not null,
  kind       text not null check (kind in ('agente', 'agenda', 'dinero', 'persona', 'alerta', 'otro')),
  source     text not null,
  title      text not null,
  body       text,
  url        text,
  pushed     boolean not null default false,
  read_at    timestamptz
);

create index if not exists idx_avisos_user_created on public.avisos (user_id, created_at desc);
create index if not exists idx_avisos_user_unread on public.avisos (user_id) where read_at is null;

create table if not exists public.bitacora (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source     text not null,
  title      text not null,
  body       text,
  url        text
);

create index if not exists idx_bitacora_created on public.bitacora (created_at desc);

-- Solo el service role (rutas del servidor) toca estas tablas. Sin políticas
-- públicas: el navegador nunca lee ni escribe directo.
alter table public.avisos enable row level security;
alter table public.bitacora enable row level security;
