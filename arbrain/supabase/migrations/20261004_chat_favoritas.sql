-- Favoritas separadas de fijadas (4 oct 2026)
-- Daniel: «las favoritas son las que además de pinneadas yo le di en favorita; suele ser solo 1 o 2».
-- `is_favorite` sigue siendo FIJADA (sección Fijadas; el webhook de crons la usa para el hilo de reportes).
-- `is_starred` = favorita: estrella dorada. Aditiva, default false. Deshacer:
--   alter table public.chat_sessions drop column if exists is_starred;

alter table public.chat_sessions
  add column if not exists is_starred boolean not null default false;
