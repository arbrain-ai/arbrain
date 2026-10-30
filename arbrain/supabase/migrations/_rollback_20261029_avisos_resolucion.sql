-- Reversa de 20261029_avisos_resolucion.sql. La campana anterior no lee estas columnas: quitarlas no rompe nada.
drop index if exists public.idx_avisos_clave;
drop index if exists public.idx_avisos_user_abiertos;
alter table public.avisos drop column if exists resuelto_por;
alter table public.avisos drop column if exists resuelto_at;
alter table public.avisos drop column if exists clave;
