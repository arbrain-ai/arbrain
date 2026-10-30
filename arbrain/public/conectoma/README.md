# Conectoma — renderer estándar de grafos del Business OS

> UN renderer, N grafos. Cada sistema del Business OS se mapea como `grafos/<slug>.json`
> y se ve en `/conectoma/index.html?g=<slug>` (web, desktop :3218, móvil). Sin `?g` = índice.
> Los conectomas aparecen en la **Biblioteca** de Arbrain como colección propia.
> AI-first: el grafo NO se edita con botones — se edita hablándole a Levy (él escribe el JSON,
> esta superficie es el espejo). Layout automático: dagre (bundled, `dagre.min.js`).

## Semántica (sellada con el dueño, 21 jul 2026)

- **Nodo = ARTEFACTO** (lo que existe: archivos, specs, másters). No agentes.
- **Arista = TRANSFORMACIÓN** con contrato, tipada: `script` (determinista, línea sólida) ·
  `agente` (juicio, discontinua) · `manual` (el dueño, punteada) · `mixta`.
- **Lazo = COMPARADOR** montado SOBRE un nodo o arista (`sobre: "nodo:<id>" | "arista:<id>"`),
  con sensor/comparador/referencia. Badge dorado ↻.
- **Colores = cobertura de la dinámica** (la idea original del dueño):
  **morado** `cubierta/activo` (la dinámica existe) · **ámbar** `fragil` (existe pero se rompe) ·
  **gris** `hueco/faltante` (topología mapeada SIN dinámica = el trabajo pendiente visible).
  El oro es para lazos y selección, nunca para estados.

## Schema `grafos/<slug>.json` (schema: 1)

```jsonc
{
  "schema": 1,
  "slug": "…", "titulo": "…", "subtitulo": "…", "actualizado": "YYYY-MM-DD",
  "narrativa": "el mapa contado en palabras HUMANAS (2-4 frases) — se muestra al cargar y al deseleccionar",
  "fuentes": ["de dónde salió este mapa"],
  "nodos":   [{ "id", "label", "cat": "media|texto|edicion|diseno|entrega", "resumen", "desc", "ruta" }],
  "aristas": [{ "id", "from", "to", "tipo": "script|agente|manual|mixta", "label",
                "estado": "cubierta|fragil|hueco", "resumen", "detalle", "frente": "opcional (fase 2)" }],
  "lazos":   [{ "id", "sobre": "nodo:x|arista:y", "label",
                "estado": "activo|fragil|faltante", "resumen", "sensor", "comparador", "referencia",
                "detalle", "frente": "opcional" }],
  "notas":   [{ "id", "sobre": "nodo:x|arista:y (opcional; sin él = nota libre en el margen)",
                "titulo": "opcional", "texto", "autor": "opcional", "detalle": "opcional" }],
  "grupos":  [{ "id", "label", "nodos": ["ids miembros"], "resumen": "opcional", "detalle": "opcional" }]
}
```

**Grupos / actos (11 ago 2026)** — territorios suaves alrededor de un conjunto de nodos (la
"sección" del canvas, pero data-driven: dagre compound mantiene contiguos a los miembros y el
territorio se regenera con cada layout). Úsalos para hacer VISIBLE la estructura que la
narrativa cuenta (actos, fases, dominios). El label es clickeable → su ficha.
**Hover de vecindad**: pasar el mouse por un nodo o chip ilumina sus aristas y vecinos.
**Frescura**: el campo `actualizado` se muestra bajo el subtítulo (1 línea, tooltip completo) —
escríbelo como changelog con fecha, el mapa confiesa su edad.

**Notas (11 ago 2026)** — anotaciones HUMANAS sobre el mapa (sticky ámbar). Se anclan a un
nodo/arista vía `sobre` y por eso **sobreviven cualquier re-layout de dagre** (viajan con su
elemento; jamás guardan coordenadas). El dueño las pide HABLÁNDOLE a Levy ("ponle una nota a X
que diga…") y Levy las escribe al JSON — una pluma, el espejo solo las muestra. Click en la
nota = su ficha. La anotación ESPACIAL libre (rayones, flechas de mano) NO va aquí: eso es
una página normal del canvas sobre un snapshot.

## Regla de las DOS AUDIENCIAS (22 jul 2026 — estándar)

### Proyección de ejecución y feedback · 18 septiembre 2026

Una arista puede declarar `plan_role: "feedback"` y una `condition` no vacía.
Permanece visible en el mapa, pero `grafo2plan.py` la trata como retorno condicional
para otra iteración, no como dependencia previa de la misma ejecución. El valor por
defecto es `dependency`. No se detectan ni eliminan retornos automáticamente: los
ciclos no clasificados siguen siendo errores. Un lazo anclado a una arista de
feedback se comprueba en la fase de su fuente. Los gates de raíces se conservan en
fase 0. El plan orienta, no ejecuta; grupos disjuntos solo son candidatos a
paralelismo y requieren comprobar recursos compartidos.

El JSON lo escriben AGENTES, pero el frontend lo miran HUMANOS (incluida la audiencia de YouTube). Por eso
cada elemento lleva DOS capas y el renderer las separa:

- **`resumen`** = en **palabras humanas**: *qué es esto y por qué importa*, en 1-2 frases claras, mitad y
  mitad (sin jerga innecesaria). Es lo que el frontend muestra ARRIBA y prominente. Escríbelo pensando
  *"¿lo entendería alguien que ve mi video sin conocer el sistema?"*. **Obligatorio en TODO nodo/arista/lazo.**
- **`desc`** (nodos) / **`detalle`** (aristas/lazos) = la **capa técnica** para los agentes: rutas, scripts,
  gotchas, lecciones pagadas. El frontend la muestra debajo, bajo la etiqueta "detalle técnico".
- **`narrativa`** (nivel grafo) = el mapa entero contado en palabras, para que quien mira entienda de qué va
  sin clickear nada. Se muestra al cargar y al deseleccionar.

Al crear o editar un grafo: **nunca dejes un `resumen` vacío**. Si solo tienes el tecnicismo, tradúcelo a
humano — esa traducción ES parte del trabajo.

## Comportamiento del panel (narrativa/ficha) — sellado 3 ago 2026

- La **narrativa** se muestra al CARGAR y al DESELECCIONAR (click al fondo) — es para la audiencia.
- La **×** (y Escape sin selección) **CIERRA DE VERDAD**: la narrativa queda descartada y NO
  resucita con clicks al fondo; vuelve al recargar o al cambiar de grafo. Con un elemento
  seleccionado, Escape deselecciona (vuelve a la narrativa si no fue descartada) y la × cierra todo.
- ⚠️ **Bug histórico (cazado por el dueño el 3 ago con el grafo vsm):** la × llamaba a `deselect()`
  → `renderOverview()`, que re-pintaba la narrativa EN EL MISMO FRAME — estando en la narrativa,
  la × era incerrable por construcción. Fix: flag `overviewDismissed` que `renderOverview()` respeta.
  **Lección de validación:** un click verificado con "clicked: true" NO valida la interacción — se
  valida el RESULTADO (`$('ficha').hidden === true`). Levy cliqueó esa × por eval el mismo día del
  estreno, recibió éxito, y no verificó que el panel muriera: el bug lo cazó el humano.

## Agregar un grafo nuevo

1. Escribir `grafos/<slug>.json` (Levy, conversacionalmente).
2. Añadirlo a `grafos/index.json`.
3. (Opcional) Card en la Biblioteca: `CONECTOMAS` en `src/shared/components/LibraryOverlay.tsx`
   + cover webp en `public/library-covers/`.
4. Página en el folder **Conectomas** del canvas (ver abajo): `POST /api/draw3`
   con `folderId` + `settings.htmlUrl` en la fila de `draw` (el POST no acepta settings;
   se escribe via Supabase REST). Sin este paso el folder del canvas driftea.
5. Deploy: push (web) + `npm run desktop:install` (desktop) — SIEMPRE ambos.

## Conectoma ANOTABLE dentro del canvas (embed vivo, 11 ago 2026)

Además de las páginas hoja-HTML (abajo), un conectoma puede vivir DENTRO de una página
normal del canvas como **elemento `embed` con url relativa** (`/conectoma/index.html?g=<slug>`):
el iframe es real e interactivo (doble-click = interactuar; click fuera = salir) y **el lápiz,
texto, stickies y secciones del canvas pintan ENCIMA del grafo vivo**. Ahí es donde van los
rayones de mano que el conectoma no acepta (su layout se regenera). Página de referencia:
"🖊️ Edición de Video (anotable)" en el folder Conectomas. Detalle técnico: skill
`artificial-brain` → references/canvas/ § Embed VIVO.

## Espejo en el canvas (11 ago 2026)

Los grafos también viven como **hojas HTML** en el folder `Conectomas` del canvas
(una carpeta de `draw_folders` de la instalación): una página por grafo con
`settings.htmlUrl = "/conectoma/index.html?g=<slug>"` (patrón hoja-HTML del 2 jul 2026,
mismo que La Máquina viva). Es un ESPEJO del mismo renderer — misma pluma (el JSON),
otra puerta. Anotación espacial sobre el grafo NO va aquí (el layout es dagre y se
re-acomoda solo): notas semánticas van al JSON hablándole a Levy; rayones de mano van
en una página normal del canvas sobre un snapshot.

## Deuda conocida

- El layout es 100% dagre: sin posiciones manuales (a propósito — el mapa se regenera del dato).
- `schema` está versionado por si el modelo crece (sub-grafos, capas, datos vivos de cobertura).

## Presentación · decisión final 18 septiembre 2026

el dueño conserva el grafo original, su layout y navegación. Un solo botón «Vista limpia»
oculta encabezado, fichas y notas sin borrarlos. «Mostrar información» los recupera.
No añadir barras de etapas o múltiples controles al conectoma. La introducción visual
breve del pipeline vive en SFStudio journey.html; un clic abre el detalle de cada etapa.
Ambas superficies leen el mismo método; ninguna simula una ejecución real.

Las notas se muestran como un pequeño botón de lápiz, sin extracto permanente. Al pulsarlo se abre el texto completo en la ficha existente, cerrable con su X.
