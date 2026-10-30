# Canvas v3 — Architecture Decision Record

> **Branch:** `codex-canvas-v3-miro-controls-toolbar` · **Autor:** Codex + Levy benchmark · **Fecha:** 2026-05-20
> Spec maestra: `.claude/plans/canvas-v3-final-miro-polish-goal.md`

## Estado actual de esta rama

Esta rama convierte `draw3` en el canvas oficial:

- `/draw3/[id]` monta `DrawEditor3` nativo. Ya no importa `DrawEditor2`.
- El sidebar principal muestra solo `Canvas` apuntando a `/draw3`.
- `draw2` fue retirado del app tree; `/draw3` es el unico entrypoint de canvas.
- El editor v3 usa `features/draw3` para store, renderer, camera, hit testing,
  Tiptap overlay, toolbar, settings, widgets y connectors.
- Carga paginas antiguas mediante normalizacion `SFElement -> CanvasElement`.
- `/api/draw3/[id]/state` devuelve elementos normalizados v3, bounding box,
  theme, camera y version.
- `/api/draw3/[id]/ops` aplica el contrato nativo v3, rechaza
  `expectedAgentVersion` obsoleto con 409, y devuelve affected ops, bounding
  box y camera hint.
- Nuevos endpoints: `/api/draw3/[id]/assets` y `/api/draw3/[id]/auto-layout`.
- UI humana implementada: themes dark/light/mono, grid blank/lines/dots,
  settings overlay, style memory, image paste/drop, magnets de connectors,
  Tiptap text editing minimal, toolbar agrupada tipo Miro, menu contextual,
  widget flyout e inspector de Mermaid/code/table/embed/comment.
- Polish 2026-05-19: crash de Delete por Immer MapSet corregido,
  Delete/Backspace y Cmd/Ctrl+Z/Y cableados, undo/redo aplica ops locales,
  texto ya no muestra boton `Done`, y el menu contextual cubre canvas vacio y
  objetos seleccionados.
- Polish final 2026-05-19: rail izquierdo queda solo para creacion/insercion,
  `+` abre biblioteca tipo Miro con busqueda/secciones, utility bar queda solo
  para zoom/fit/theme/export/settings, UI de Levy/AI se retira del whiteboard,
  pen/freedraw crea strokes reales, text defaults suben a escala legible,
  conectores se seleccionan por distancia real a la ruta y exponen
  color/grosor/estilo/routing/arrowheads/label, frames capturan solo borde/titulo,
  y floating UI se clampa al canvas visible.
- Polish final 2026-05-20: Delete expande a texto ligado y conectores
  dependientes para evitar elementos huerfanos; la herramienta Image conserva el
  punto de click y sube la imagen ahi en vez de centrarla implicitamente. Se
  retiraron botones visibles sin accion del flyout de formas y el inspector de
  widgets/conectores usa tokens light/dark/mono. El panel `+` cierra con Escape
  y Cronograma/Kanban/Documento crean estructuras iniciales diferenciadas. El
  menu contextual usa hit-test estricto para que shapes/frames no sean robados
  por conectores cercanos, y su accion principal cambia segun tipo de elemento
  para editar texto, etiqueta de connector, titulo de frame o inspector.
  `locked` ya protege contra drag, resize, edit, inspector, style y delete
  accidental.
- Pen polish 2026-05-20: `highlighter` deja de ser solo tipo/render interno.
  El menu Pen ofrece Marcador real, con factory, drag preview, creacion y bbox
  con padding para seleccion/hit testing. El drag conserva `highlighter` en
  pointermove para no degradar accidentalmente a `freedraw`.
- Context polish 2026-05-20: duplicar un componente conserva texto ligado con
  nuevo `containerId`, evitando labels perdidos o referencias compartidas.
- Connector polish 2026-05-20: las etiquetas de conectores se posicionan sobre
  la ruta renderizada. Rutas ortogonales calculan el midpoint por longitud de
  polyline y rutas curvas usan el punto Bezier real en `t=0.5`.
- Connector routing polish 2026-05-20: routing ortogonal evalua rutas candidatas
  contra bboxes expandidos de elementos solidos y escoge la de menor
  colision/longitud; el verifier cubre un obstaculo central.
- Controls polish 2026-05-20: los controles inferiores se unifican en una sola
  utility bar bottom-right con undo/redo, zoom presets 1%-2000%, fit, view menu,
  theme/export/settings y save status. El menu view controla grid none/lines/dots,
  grid size, dimensiones de objeto y un minimapa real minimo con bboxes,
  viewport rectangle y click-to-recenter.
- Selection toolbar polish 2026-05-20: la toolbar contextual pasa a botones
  compactos con popovers Miro-like para fuentes con preview, tamaños preset,
  alineacion horizontal/vertical, color de texto, fill/no-fill y borde
  (color/grosor/solid-dashed-dotted/opacidad/esquinas). El menu `...` contiene
  acciones reales de duplicar/bloquear/eliminar; z-order sigue viviendo en
  clic derecho. Los popovers miden el ancho real del toolbar y ajustan offset
  y apertura arriba/abajo para mantenerse dentro del viewport visible.
- Verifier polish 2026-05-20: `scripts/verify-canvas-v3-ops.ts` ya no valida
  solo ops agent-first; tambien cubre bbox de pen/highlighter, frame hit-test,
  bound text, context hit-test de conectores, font family arbitraria y style
  patches usados por la selection toolbar.
- `arbrain/scripts/verify-canvas-v3-ops.ts` valida el contrato nativo
  sin Supabase: frame, connector bindings, Mermaid, code, table, embed, comment,
  arrange y theme.

Trade-offs conocidos:

- `draw3/api/asset-resolver.ts` permite rutas locales de agente mediante imports
  dinamicos server-side. Si Turbopack vuelve a advertir por tracing, mantenerlo
  documentado porque es el precio de soportar `Assets/dueño/dueño.png`.
- Comments existen como elementos canvas generables/editables desde rail/widgets
  y contexto. Hilos persistidos en `draw_comments` quedan como fase
  colaborativa posterior; por eso no hay boton de comments duplicado en utility.
- Export PNG usa el canvas visible; export full-artboard/PDF debe separarse en
  una fase dedicada.
- Undo/redo cubre ops locales principales: add/delete/style, image/text paste,
  connector labels, drag y resize. Falta endurecerlo con tests interactivos
  automatizados cuando exista runner browser instalado.
- Mono mode mantiene colores explicitos de elementos existentes; los defaults
  nuevos son theme-aware. Un `renderMode` semantico sin mutar colores sigue como
  mejora futura.
- Minimap actual es deliberadamente minimo: bboxes + viewport + click-to-recenter.
  Un render thumbnail pixel-perfect queda como mejora futura si hace falta.

## Decision tecnica

**Custom v3 desde cero. NO migrar a tldraw.**

### Por que custom y no tldraw / excalidraw

| Factor | Veredicto |
|--------|-----------|
| **Agent-native ops contract** | Custom — control granular total sobre los 25 verbs del contrato (add/update/delete/move/connect/frame/arrange/insertImage/etc). tldraw lo tiene cerrado tras su shape registry y migrar nuestras semantics seria un wrapper inutil. |
| **Realtime existente** | Custom — ya tenemos `agent_version` + postgres_changes funcionando. tldraw quiere su propio `@tldraw/sync` (otro backend). |
| **Bucket de imagenes** | Custom — `generated-images` bucket + cwebp pipeline ya validado. tldraw inserta imagenes en su asset store distinto. |
| **Apple Pencil con presion** | Custom — el `freedraw.ts` del v2 con APPLE_PENCIL_PARAMS es nicho premium. tldraw no expone presión granular. |
| **Tamaño de bundle** | Custom — meta <200KB gzipped. tldraw + sync = ~600KB. |
| **Licencia** | Custom — MIT-friendly stack. tldraw es BSL (gratis bajo un umbral de ingresos, pero bandera roja a futuro). |
| **Costo de migracion** | Custom — escribir v3 de cero es paritario a mapear schema/auth/realtime a tldraw. |

### Aprendizajes del v2 que se conservan conceptualmente

- Canvas 2D + DPR-aware rendering (renderer.ts)
- 8-anchor binding para arrows
- snap to grid + snap to objects con alignment guides
- Undo/redo via history stack
- Apple Pencil con presion (`APPLE_PENCIL_PARAMS`)
- agent_version + postgres_changes para realtime

### Lo que se TIRA del v2

- Editor de texto duplicado (overlay + bound text coexisten → bug del screenshot)
- Z-order roto (bound text queda atras del container)
- Sync agente append-only (`!localIds.has(el.id)` ignora updates)
- Frames stub sin clipping ni childIds
- Sin theme toggle
- Sin frames containment real
- Sin widgets (mermaid, code, embed, table, comments)
- Sin presence multiplayer
- Sin auto-layout
- Sin smart connectors curvados

## Stack final

| Capa | Lib | Razon |
|------|-----|-------|
| **Estado** | Zustand 5 (ya instalado) + Immer | Auditable, simple, ya tipa bien |
| **Render** | HTML5 Canvas 2D + OffscreenCanvas | Control total + perf via layer cache |
| **Gestures** | listeners nativos (pointer events) | `@use-gesture/react` se planeo pero nunca se uso; removido en la poda 11 jul 2026 |
| **Auto-layout** | `dagre` (MIT, 30KB) + `elkjs` (EPL, lazy) | dagre default 90% casos, elk para radial/force |
| **Smart connectors** | `perfect-arrows` (MIT, 1KB) | Curvas elegantes, reroute O(1) |
| **Text editor** | Tiptap v3 minimal | Bold/italic/list/link, JSON nativo |
| **Code widget** | Shiki (lazy) | Theme-aware, sin runtime grande |
| **Mermaid** | mermaid v11 (ya instalado) | Para widget live + import |
| **Realtime** | Supabase Realtime + Presence | Cero costo extra, ya cableado |
| **Local cache** | idb-keyval | Recover crash + offline edits |

### Packages a instalar

```
zustand          (ya)
mermaid          (ya)
@supabase/ssr    (ya)
+ immer
+ dagre + @types/dagre
+ elkjs (lazy)
+ perfect-arrows
+ @tiptap/react + @tiptap/starter-kit + @tiptap/extension-link
+ shiki (lazy)
+ idb-keyval
+ ulid
```

## Estado v2

- `/draw2/[id]` fue retirado del app tree y ya no aparece en build routes.
- `/draw3/[id]` es el canvas oficial y el unico entrypoint mostrado en sidebar.
- `DrawEditor3` ya no es wrapper de `DrawEditor2`.
- Las paginas viejas se normalizan en runtime desde elementos estilo v2/SF hacia
  `CanvasElement` v3.
- Las APIs legacy `/api/draw` y `/api/draw/[id]` fueron ELIMINADAS (poda 11 jul 2026).
  La tabla `draw` SIGUE VIVA: es el storage que v3 comparte (todas las rutas
  /api/draw3 leen/escriben `draw`). Como red de seguridad,
  `next.config.ts` redirige permanente `/draw2/:id` → `/draw3/:id` para sobrevivir
  URLs ya guardadas en historial de chats, notificaciones y bookmarks.

## Estado de implementacion

1. ✅ Folder skeleton + ARCHITECTURE.md
2. ✅ Types + stores + camera
3. ✅ Renderer + hit detection base
4. ✅ Interaction humana: pointer, pan, drag, resize, shape tools
5. ✅ Editor texto Tiptap overlay
6. ✅ Toolbar + property panel + theme/grid/settings
7. ✅ Smart connector magnets + connector bindings
8. ✅ Auto-layout via ops/API
9. ✅ Sticky, frames y widgets visuales base
10. ✅ Asset management + paste/drop/image injection
11. ✅ Ops contract API nativo + conflict guard
12. ✅ Sidebar oficial solo Canvas v3
13. ✅ Verificador manual de ops agent-first
14. ✅ Presence: cursores remotos (broadcast) + agent activity flash (overhaul jun 2026)
15. ✅ Export full-artboard PNG/PDF/JSON (useCanvasExport)
16. ✅ Borrado definitivo del app tree `/draw2`
17. ✅ APIs legacy `/api/draw*` emiten `/draw3` + redirect 308 `/draw2/:id` → `/draw3/:id`

## Anti-objetivos

- NO voting/timer/icebreaker/breakout rooms
- NO Yjs/Liveblocks (overkill — Supabase Presence basta)
- NO smart drawing recognition (ROI bajo)
- NO templates marketplace publico
- NO AR/3D

## Overhaul jun 2026 (branch feat/canvas-overhaul)

### Estructura post-refactor (DrawEditor3: 6,894 → ~1,600 lineas)

```
components/
├── DrawEditor3.tsx            # orquestador: estado, callbacks de dominio, JSX
├── CanvasChrome.tsx           # SelectionToolbar, menus, popovers, overlays UI
├── PresenceOverlay.tsx        # cursores remotos + agent flash (DOM, no canvas)
├── canvas-clipboard.ts        # payload draw3-selection (puro)
├── canvas-ui-constants.ts     # opciones de estilo/fuentes + value helpers
├── canvas-editor-helpers.ts   # creacion desde drag, geometria, normalize legacy
├── dom-utils.ts
└── hooks/
    ├── useCanvasExport.ts         # PNG/PDF/JSON + thumbnails del sidebar
    ├── useCanvasRealtime.ts       # canal draw3-native-* + merge + onRemoteChanges
    ├── useCanvasClipboard.ts      # copy/cut/paste + window listeners
    ├── useCanvasShortcuts.ts      # keyboard (incl. z-order Cmd+[/])
    ├── useCanvasPointerMachine.ts # maquina pointer (LA PIEZA FRAGIL) + pinch
    └── useCanvasPresence.ts       # broadcast cursores + agent flash state
canvas/
├── perf-cache.ts              # WeakMaps: bbox, z-sort, index, color-resolve
└── visual-bbox.ts             # bbox visual (rutas de connector)
```

### Performance (decision: culling lineal, NO quad-tree)

- Render culea por footprint real (ruta para connectors bindeados, inflacion
  por rotacion). Margen world + componente de pantalla. Kill switch:
  `localStorage 'draw3:no-cull'`.
- Caches por identidad (immer invalida solo): z-sort, bbox, indice id→el,
  rutas orthogonal (key: array de obstaculos + connector.id), layout de texto,
  resolve de colores. Medido: rutas 60 frames 1540ms → 0.5ms; draw calls
  600 → ~40 en viewport tipico.
- El QuadTree se descarto: solo paga a >10K elementos. El seam queda en
  `viewport.ts` si algun dia hace falta.

### API agentica (hardening)

- `DELETE /api/draw3/[id]` (soft-delete) — muerto el workaround de Supabase.
- Validacion runtime de ops (`ops/validate.ts`): 400 con `invalid_ops`.
- `setCamera` valida finitos + clamp [MIN_ZOOM, MAX_ZOOM] (server y store).
- Ingest de `add` normaliza: connector fromId/toId → bindings; freedraw con
  puntos absolutos → origen normalizado.
- `camera` responde `zoom` canonico (+`scale` compat). `site-url.ts` sanea
  NEXT_PUBLIC_SITE_URL (tenia newline en Vercel).
- `POST /api/draw3/[id]/thumbnail` → bucket `draw-thumbnails` +
  `draw.thumbnail_url` (sidebar muestra previews).

### Verificacion

- `scripts/verify-canvas-v3-ops.ts` (contrato) + `scripts/verify-canvas-v3-perf.ts`
  (paridad culling/hit-test/caches + hardening). Checksums de hit-test en
  `scripts/canvas-smoke-checklist.md` — si cambian sin querer, investigar.
