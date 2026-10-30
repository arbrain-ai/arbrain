# Lienzo: páginas y carpetas

Gestión de las páginas del lienzo. Para DIBUJAR en una página, ver [../../../canvas/SKILL.md](../../../canvas/SKILL.md).

## Dónde se guarda

En la base local de la app (carpeta de datos de la instalación), tablas `draw` (una fila por página) y
`draw_folders` (carpetas, un solo nivel de subcarpetas). No hay nube: cada página vive solo en esta máquina.

Campos útiles de `draw`: `page_id` (la llave, no `id`), `name`, `folder_id`, `page_elements` (el documento:
`schemaVersion: 4`, `elements`, `camera`, `regions`), `agent_version` (sube con CADA escritura), `is_deleted`
(borrado blando), `settings` (fijado y archivado).

**Nunca escribas `page_elements` a mano ni edites los JSON de la base.** Toda escritura pasa por la API, que
valida, versiona y reconcilia.

## La API

Base: `$MISSION_CONTROL_ORIGIN/api/canvas` (la web local de la app). Autorización: la sesión de la app o el
Bearer del daemon (`$ARBRAIN_PASE_AGENTE`, ya está en tu entorno; no lo imprimas).

```bash
B="$MISSION_CONTROL_ORIGIN/api/canvas"
H=(-H "Authorization: Bearer $ARBRAIN_PASE_AGENTE" -H "Content-Type: application/json")

# Listar páginas (no borradas, más recientes primero)
curl -s "$B/pages" "${H[@]}"
# -> { ok, paginas: [{ id, nombre, folderId, actualizado, version, elementos, esV4, fijado, archivado, ... }] }

# Crear página (opcional en carpeta)
curl -s -X POST "$B/pages" "${H[@]}" -d '{"nombre":"Mapa del negocio","folderId":null}'

# Duplicar una página
curl -s -X POST "$B/pages" "${H[@]}" -d '{"duplicarDe":"PAGE_ID"}'

# Leer una página
curl -s "$B/pages/PAGE_ID" "${H[@]}"
# -> { ok, pagina: { id, nombre, folderId, version, esV4, elements, camera } }

# Versión actual (barato, para saber si cambió)
curl -s "$B/pages/PAGE_ID/version" "${H[@]}"

# Fijar o archivar (no toca el documento ni la versión)
curl -s -X PATCH "$B/pages/PAGE_ID" "${H[@]}" -d '{"archivar":true}'

# Borrado blando (va a la papelera; se puede recuperar)
curl -s -X DELETE "$B/pages/PAGE_ID" "${H[@]}"

# Carpetas
curl -s "$B/folders" "${H[@]}"
curl -s -X POST  "$B/folders" "${H[@]}" -d '{"nombre":"Clientes"}'
curl -s -X PATCH "$B/folders" "${H[@]}" -d '{"accion":"renombrar","id":"FOLDER_ID","nombre":"Clientes 2026"}'
curl -s -X PATCH "$B/folders" "${H[@]}" -d '{"accion":"mover","paginaId":"PAGE_ID","folderId":"FOLDER_ID"}'
```

Otras acciones de `PATCH /folders`: `renombrarPagina`, `anidar`, `archivar`, `borrar`.

Si una llamada responde 401 «Abre Arbrain desde la app», esta edición no está aceptando el Bearer del daemon para
el lienzo: dilo al dueño tal cual y pídele que haga el paso desde la sección Lienzo. No intentes leer ni copiar la
cookie de la app.

## Mostrar una página al dueño

`mostrar {vista: 'lienzo', paginaId, zona?}` del MCP `cabina` la abre dentro de la conversación. También puede
abrirla él en la sección Lienzo.

## Triggers

- «¿qué lienzos tengo?», «¿qué diagramas guardé?» → listar.
- «borra el lienzo X» → confirmar con el dueño y borrar blando. Nunca borrado físico.
- «archívalo», «fíjalo arriba» → `PATCH` de la página.
- «ponlo en la carpeta Clientes» → `PATCH /folders` con `accion: mover`.

## Reglas

1. **Misma idea, misma página.** Antes de crear una página nueva, revisa si el tema ya tiene una y agrega ahí.
2. **Borrar = borrado blando** y solo con pedido explícito del dueño.
3. **`page_id`, no `id`.** Las respuestas de la API lo traen como `id`, la tabla como `page_id`.
4. **Una página de otro esquema** (sin `schemaVersion: 4`) se abre convertida en memoria y no se escribe. No la
   conviertas sin que el dueño lo pida.
