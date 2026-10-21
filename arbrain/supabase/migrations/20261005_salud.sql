-- Salud multiusuario (5 oct 2026). Daniel: «un lienzo de salud para el estándar, no solo para mí sino para todos».
-- Cada usuario de Arbrain conecta su reloj con SU token de ingesta (Health Auto Export → POST /api/salud/ingest) y sus
-- datos quedan aislados por user_id. Aditiva: no toca nada existente. La ruta de Daniel (receptor del Studio → CSV)
-- sigue igual; la propuesta para pasarlo aquí está en docs/builds/vista-salud-2026-10-05.md.
-- Deshacer:
--   drop function if exists public.salud_dias_v1(uuid, date);
--   drop table if exists public.salud_muestras; drop table if exists public.salud_conexiones;

-- Un token por usuario. Se guarda su sha256, nunca el token: se muestra completo una sola vez al generarlo.
create table if not exists public.salud_conexiones (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_pista text not null,
  creado_en timestamptz not null default now(),
  ultimo_envio timestamptz,
  ultimo_envio_muestras integer,
  ultimo_error text
);

-- Una fila por muestra cruda. La llave (user_id, metrica, ts) es el dedup por timestamp exacto del adaptador de Python
-- (24 jul 2026): HAE reenvía las mismas muestras en cada envío y lo repetido no debe contar dos veces.
create table if not exists public.salud_muestras (
  user_id uuid not null references auth.users(id) on delete cascade,
  metrica text not null,
  ts text not null,
  fecha date not null,
  valor double precision not null,
  extra jsonb,
  recibido_en timestamptz not null default now(),
  primary key (user_id, metrica, ts)
);
create index if not exists salud_muestras_usuario_fecha on public.salud_muestras (user_id, fecha);

alter table public.salud_conexiones enable row level security;
alter table public.salud_muestras enable row level security;
drop policy if exists salud_conexiones_propia on public.salud_conexiones;
create policy salud_conexiones_propia on public.salud_conexiones for select to authenticated using (auth.uid() = user_id);
drop policy if exists salud_muestras_propias on public.salud_muestras;
create policy salud_muestras_propias on public.salud_muestras for select to authenticated using (auth.uid() = user_id);
-- Escribe solo el servidor (rol de servicio): ni anon ni authenticated insertan, cambian ni borran.
revoke insert, update, delete on public.salud_conexiones from anon, authenticated;
revoke insert, update, delete on public.salud_muestras from anon, authenticated;
revoke all on public.salud_conexiones from anon;
revoke all on public.salud_muestras from anon;

-- El día de cada métrica con las reglas de hae_adapter.py: pasos y fases de sueño suman; el sueño total toma el máximo;
-- lo demás promedia. Solo la ejecuta el servidor, siempre con el user_id de la sesión.
create or replace function public.salud_dias_v1(p_user uuid, p_desde date)
returns table (fecha date, metrica text, valor double precision, muestras integer)
language sql stable
set search_path = public
as $$
  select m.fecha, m.metrica,
    case
      when m.metrica in ('pasos', 'sueno_deep_h', 'sueno_rem_h', 'sueno_core_h', 'sueno_awake_h') then sum(m.valor)
      when m.metrica = 'sueno_horas' then max(m.valor)
      else avg(m.valor)
    end,
    count(*)::integer
  from public.salud_muestras m
  where m.user_id = p_user and m.fecha >= p_desde
  group by m.fecha, m.metrica
  order by m.fecha
$$;
revoke execute on function public.salud_dias_v1(uuid, date) from public, anon, authenticated;
grant execute on function public.salud_dias_v1(uuid, date) to service_role;
