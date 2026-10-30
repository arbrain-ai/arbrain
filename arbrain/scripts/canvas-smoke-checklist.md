# Canvas draw3 — Smoke checklist (overhaul feat/canvas-overhaul)

> Se repite al cierre de CADA fase, sobre la **página de pruebas** (🧪 Canvas Test — Levy),
> NUNCA sobre páginas vivas del dueño. App local: `npm run dev` → http://localhost:3000/draw3

## Gates automáticos (siempre primero)
```bash
cd arbrain
npm run typecheck                              # tsc --noEmit
npx tsx scripts/verify-canvas-v3-ops.ts        # contrato de ops (existente)
npx tsx scripts/verify-canvas-v3-perf.ts       # paridad culling/hit-test/caches
```
- `next lint` está roto pre-existente (Next 16 eliminó `next lint`, no hay eslint config). No es gate.
- **Checksums baseline hit-test** (Fase 0, 2026-06-12): `zoom=1: b6510890` · `zoom=0.1: 54dd765b`.
  Si cambian en un paso que NO debía cambiar comportamiento de hit-test → investigar antes de seguir.

## Smoke manual / Playwright
1. **Carga**: abrir página de pruebas, fit-all, sin errores en consola.
2. **Pan/zoom**: wheel pan, Cmd/ctrl+wheel zoom, zoom a bordes del contenido (nada desaparece al entrar/salir del viewport).
3. **Selección**: click simple, shift+click, select-box, Cmd+A, Escape.
4. **Drag**: mover 1 elemento, mover multi-selección, snap guides visibles.
5. **Resize/rotate**: handles de un rect, resize edge, elemento rotado.
6. **Connector**: crear con tool C entre dos shapes, mover un shape bindeado → la ruta orthogonal re-rutea en vivo.
7. **Texto**: doble click en shape → Tiptap → escribir → blur → render canvas idéntico; texto bound sigue al contenedor en resize.
8. **Freedraw**: dibujar trazo con D, borrar con eraser E.
9. **Undo/redo**: Cmd+Z / Cmd+Shift+Z sobre todo lo anterior.
10. **Clipboard**: Cmd+C/V interno, paste de imagen del sistema, paste de texto, Cmd+X.
11. **Export**: PNG y PDF descargan y se ven completos.
12. **Realtime**: 2 pestañas con la misma página → editar en una → merge en la otra sin eco; op de agente vía API → aparece en ambas.
13. **Autosave**: editar, esperar ~2s, recargar → cambios persistidos.
14. **Sidebar**: folders expanden/colapsan, crear página, renombrar.

## Por fase, además
- **Fase 2 (perf)**: kill switch `localStorage.setItem('draw3:no-cull','1')` + reload → render sin culling se ve idéntico. Medición `console.time` documentada antes/después.
- **Fase 3 (refactor)**: ítems 1-13 COMPLETOS después de cada extracción de hook. Pointer machine → además: cada tool del rail (V/R/E/D/T/L/A/C), context menu, double-click en canvas vacío.
- **Fase 4 (UX)**: search filtra, thumbnails aparecen tras guardar, pinch en touch device/simulador, Cmd+G agrupa, Cmd+[/] cambia z-order, alignment panel con 3+ seleccionados.
- **Fase 5 (presence)**: 2 pestañas se ven los cursores; op de agente → flash + badge Levy.
