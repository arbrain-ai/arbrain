-- Avisos que se leen: de reportes a decisiones (29 oct 2026)
--
-- ORIGEN: Daniel (29 oct): «el sistema de notificaciones las siento algo cutre… nunca las checo». Avisos de hace 16 h
-- ya resueltos seguían sin leer y el número de la campana contaba todo. Desde hoy la campana cuenta SOLO decisiones
-- pendientes y un aviso se cierra solo cuando su causa se resolvió (borrador publicado o descartado, grabación
-- encontrada). Reglas puras: arbrain/src/features/avisos/bandeja.ts.
--
--   clave        → la etiqueta del emisor (el `tag` del push: «decision-…», «grupal-recap-…»). Con ella el emisor
--                  que conoce la causa cierra su aviso por POST /api/avisos/resolver.
--   resuelto_at  → cuándo dejó de pedir algo. Un aviso resuelto no aparece en la campana ni cuenta.
--   resuelto_por → por qué: publicado, descartado, decidido, causa-resuelta, repetido, visto.
--
-- Aditiva: la app anterior no lee estas columnas. Reversa: _rollback_20261029_avisos_resolucion.sql.

alter table public.avisos add column if not exists clave text;
alter table public.avisos add column if not exists resuelto_at timestamptz;
alter table public.avisos add column if not exists resuelto_por text;

create index if not exists idx_avisos_user_abiertos on public.avisos (user_id, created_at desc) where resuelto_at is null;
create index if not exists idx_avisos_clave on public.avisos (clave) where clave is not null;
