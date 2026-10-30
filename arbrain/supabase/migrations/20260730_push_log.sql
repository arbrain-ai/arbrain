-- Sensor de entrega de push (30 jul 2026)
--
-- ORIGEN: del 27 al 30 jul Daniel estuvo leyendo el morning briefing del día 27
-- como si fuera el actual. Los briefings del 28-30 se generaron y se inyectaron
-- al chat correctamente, pero la entrega del PUSH al iPhone era inverificable:
-- el envío solo dejaba console.error en Vercel (que nadie lee) y los caminos
-- mudos (sin suscripciones, sin VAPID) retornaban sin dejar rastro alguno.
-- Cuarta repetición del patrón "órgano sin sensor" (twitter-monitor, state.md,
-- email broadcasts, este). Regla: acción de alcance hacia Daniel SIEMPRE deja
-- acuse medible.
--
-- Escribe: /api/openclaw/event (sendCronPush) — una fila por intento de push,
--          incluidos los caminos mudos.
-- Lee:     agent-server/scripts/analytics/watchdog_push.py (morning briefing 0e).
--
-- 'accepted' = el push service de Apple aceptó el mensaje (202). No garantiza
-- que el iPhone lo MOSTRÓ, pero separa "el server nunca lo mandó" (este bug)
-- de "Apple lo tiene". endpoint_tail identifica el dispositivo sin guardar la
-- URL entera del endpoint (que funciona como capability secreta).

create table if not exists public.push_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  job_id        text not null,
  status        text not null check (status in ('accepted', 'failed', 'no_subs', 'vapid_missing')),
  status_code   int,
  error         text,
  endpoint_tail text,
  title         text
);

create index if not exists idx_push_log_job_created
  on public.push_log (job_id, created_at desc);

-- Solo el service role (webhook + watchdog con secret key) toca esta tabla.
alter table public.push_log enable row level security;
