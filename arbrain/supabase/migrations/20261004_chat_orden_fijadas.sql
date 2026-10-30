-- Orden manual de las fijadas (4 oct 2026)
-- Daniel: «arrastrar las conversaciones y reposicionarlas». La sección Fijadas de «Recientes» guarda el
-- orden en que Daniel las acomoda arrastrando. Aditiva: nullable, null = sin posición (va arriba, por
-- su último mensaje). Al desfijar o fijar desde el menú se limpia. Deshacer:
--   alter table public.chat_sessions drop column if exists pinned_position;

alter table public.chat_sessions
  add column if not exists pinned_position integer;
