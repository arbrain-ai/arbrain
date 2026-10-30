-- Archivar carpetas de lienzos (6 oct 2026): marca, no borrado. Se oculta en «¿Qué lienzo?» y en la sección Lienzo;
-- «Archivados» la restaura. Las subcarpetas heredan en la interfaz y en el PATCH (archivar madre = archivar hijas).
alter table public.draw_folders add column if not exists archived_at timestamptz;

-- Daniel archivó a mano 18 lienzos de Contenido, Lab y Personal (settings.archivadoPor = 'daniel-6oct-carpetas'):
-- esas tres carpetas y sus subcarpetas quedan archivadas con la fecha de su propio gesto.
update public.draw_folders f set archived_at = coalesce(f.archived_at, now())
where f.name in ('Contenido', 'Lab', 'Personal') and f.parent_id is null
   or f.parent_id in (select id from public.draw_folders where name in ('Contenido', 'Lab', 'Personal') and parent_id is null);
