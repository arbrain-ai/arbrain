---
name: canvas
description: Use when the owner asks for a diagram, map, blueprint, flow, journey, system map, conectoma-style graph, or anything drawn on the whiteboard ("dibuja", "haz un mapa de", "diagrama esto", "arma el blueprint", "ponlo en el canvas"), or when touching the whiteboard code in arbrain/src/features/canvas. Canvas v4 compiles semantics into geometry — the agent declares WHAT, never WHERE.
---

# Canvas — el pizarrón de Arbrain (v4)

> **La regla de una línea: TÚ NO CALCULAS NI UNA COORDENADA.**
> Declaras qué hay y qué se conecta con qué. El compilador mide el texto de
> verdad, compone cada tarjeta, distribuye el grafo, rutea las flechas y audita
> el resultado. Si te encuentras escribiendo `x: 5470`, estás haciéndolo mal.

## Por qué existe esta skill

El canvas anterior (v3) tenía auto-layout **y nadie lo usaba**: sus generadores
calculaban coordenadas a mano, con una tabla de anchos de letra inventada
(`NARROW=set("iIl.,:;'|!()[]")`), porque nadie conectó el motor que ya estaba
ahí. El resultado fueron coordenadas escritas a pulso en varios scripts que ya
habían divergido entre sí.

El v4 corrige la causa, no los síntomas. Pero un motor que su operador no sabe
que existe es el mismo fallo con otro nombre — **esta skill es el cable**.

## Dónde vive

| Qué | Dónde |
|---|---|
| La sección Lienzo (web + desktop de Arbrain) | ruta `/lienzo` (`/canvas-lab` redirige ahí) |
| El compilador | `arbrain/src/features/canvas/compile.ts` |
| El modelo | `arbrain/src/features/canvas/model/element.ts` |
| Paleta y roles | `arbrain/src/features/canvas/theme/tokens.ts` |
| Las pruebas | `cd arbrain && npx tsx --test 'tests/canvas/**/*.test.ts'` |

Antes de insertar un visual, lee completo el estándar visual:
`.claude/skills/artificial-brain/references/canvas/references/estandar-visual.md`
(la operación del lienzo está en `.claude/skills/artificial-brain/references/canvas/SKILL.md`).

## Las dos puertas

### 1 · Compilar un diagrama suelto — `POST /api/canvas/compile`

Devuelve elementos listos + el veredicto del juez. Úsala para previsualizar o
para generar sin escribir en una página.

```bash
curl -s localhost:3000/api/canvas/compile -H 'content-type: application/json' -d '{
  "theme": "claro",
  "targetAspect": 1.6,
  "spec": {
    "title": "Mi negocio — de dónde viene el dinero",
    "nodes": [
      { "id": "contenido", "role": "trigger", "title": "Contenido",
        "caption": "Canal principal de adquisición. Sin anuncios.",
        "chips": [{ "text": "DUEÑO" }] },
      { "id": "oferta", "role": "module", "title": "Oferta de entrada",
        "items": ["Suscripción mensual", "Plan anual con bono"],
        "caption": "Califica, educa y calienta al cliente." },
      { "id": "premium", "role": "deliverable", "title": "Servicio premium",
        "caption": "Acompañamiento uno a uno. Aquí se hace el dinero.",
        "chips": [{ "text": "EN OBRA" }] }
    ],
    "edges": [
      { "from": "contenido", "to": "oferta" },
      { "from": "oferta", "to": "premium", "kind": "fragil", "label": "aún sin ruta" }
    ]
  }
}'
```

### 2 · Escribir en una página — `POST /api/canvas/pages/<id>/region`

Mismo `spec`, más un `regionId`. **Reconcilia**: los nodos que ya existían se
ACTUALIZAN por su `nodeId`, no se destruyen y recrean, así que el trabajo humano
sobrevive a recompilar. Devuelve `diff`, `bloqueados`, `pinsHuerfanos` y `judge`.

```json
{ "regionId": "modelo", "theme": "claro", "spec": { "...": "..." } }
```

## El vocabulario (lo único que declaras)

**Nodo** — `role` + `title`, y opcionalmente:
- `caption` — va **debajo y FUERA** de la caja. El estándar visual es explícito:
  *"caja con párrafo adentro = anti-patrón"*.
- `items[]` — renglones dentro (el currículum de un módulo).
- `chips[]` — etiquetas cortas, abajo-derecha dentro de la caja.
- `index` — el número del círculo, solo para `callout`.

**Roles de caja** (el rol decide el color; **jamás mandes un color**):

| rol | qué comunica |
|---|---|
| `card` | neutro, una pieza sin más |
| `module` | contenedor con contenido (borde de guiones) |
| `form` | entrada / captura |
| `callout` | llamada numerada |
| `deliverable` | entregable (lleva sombra) |
| `trigger` | disparador (píldora) |
| `risk` | riesgo — no tocar |
| `agent` | agente / automatización (punteado morado) |
| `tray` | bandeja / territorio |
| `sticky` | nota |
| `drawn` | lo dibujó una mano. **No lo uses en un spec**: es autoría, no semántica |

**Clases de arista** — `flujo` (default) · `agente` · `fragil` · `hueco`.
Codifican el ESTADO de la relación, no solo su dirección. Un hueco declarado y
un flujo probado no pueden verse igual.

## Reglas duras

1. **Cero coordenadas, cero tamaños, cero colores en el spec.** Si el layout no
   te gusta, el arreglo es `layout.direction` / `targetAspect`, nunca mover cajas.
2. **`targetAspect` casi siempre.** Sin él, seis nodos salen 4:1 y encuadrarlos
   deja media pantalla vacía por geometría. Pantalla ≈ `1.6`, lámina ≈ `1.3`.
   El compilador **compila las dos direcciones y elige midiendo** cuál produce
   menos flechas encima de texto; la proporción solo desempata. La respuesta te
   dice cuál eligió en `layout.direccion`. Fija `layout.direction` en el spec
   solo si sabes algo que el compilador no: entonces manda el spec.

   > **Lo medido (tres diagramas de sistemas de negocio):** horizontal daba
   > 5, 4 y 6 flechas atravesando texto; vertical daba **cero** en los tres. La
   > causa es estructural, no mala suerte: el `caption` **cuelga por debajo** de
   > su caja, y en horizontal las flechas corren justo por esa banda.
3. **Lee `judge` de la respuesta.** Trae `stats` y `findings`. Un `fail` es un
   diagrama roto aunque el HTTP diga 200 — el pecado exacto del v3.
4. **`issues` no se ignora.** `overflow` = el texto no cupo. `coverage` = la
   fuente no tiene esos glifos (CJK) y la medición no aplica.
5. **Lo que la mano tocó está FIJADO** (`origin.pinned`). El compilador deja de
   mandarlo pero lo sigue viendo como obstáculo. No lo despines sin que el dueño
   lo pida.
6. **EL CANDADO GANA SOBRE TODO, incluido tú.** `reconcile` devuelve
   `bloqueados` y `acomodar` también. Regla de trato:

   > *"cuando quieras eliminar o modificar algo me dices: oye, mira, esto tiene
   > un candado, ¿seguro que quieres hacerlo?"*

   Es decir: si lo que te pide toca un elemento bloqueado, **preguntas antes**,
   nombrando qué es y por qué está bloqueado si lo sabes. No lo desbloqueas por
   tu cuenta ni lo pisas en silencio. Un candado que el agente ignora no es un
   candado — es una sugerencia.
7. **Los lienzos son datos VIVOS.** El formato crece de forma aditiva; nunca se
   borra una página ni se reescribe entera a mano.

## Enseñar una página al dueño

Para mostrarle un lienzo: la herramienta `mostrar` del MCP `cabina` con
`{vista:'lienzo', paginaId, zona}` (pestaña del panel) o la sección
`/lienzo?p=<pageId>` de la app.

## Operación AI-first

El dueño **no arma diagramas con botones**. Habla, y tú llamas a la API. La barra
contextual, los puertos y el botón de acomodar existen para que **retoque y
mire**, no para que construya. Si te pregunta "¿para qué sirve este botón?", la
respuesta no es un manual: es *"dime qué quieres y te lo hago"*.

Lo que **sí** hace con el dedo, y por eso está construido:

- **Tirar de un puerto** (los puntos en los 4 lados) hacia el vacío → nace la
  figura siguiente, ya conectada y lista para escribir. Un clic sin arrastrar la
  pone a un salto exacto en esa dirección.
- **La barra contextual** aparece debajo de lo seleccionado: forma, rol,
  tipografía, tamaño, negrita/cursiva/subrayado, alineación, color de texto,
  resaltador, contorno (estilo · grosor · esquinas · opacidad · paleta),
  relleno, enlace, candado.
- **Acomodar** (el destello morado, con 2+ figuras): les aplica dagre siguiendo
  sus flechas. Es la capa semántica hecha gesto.

## Diagramas que se regeneran

Si un diagrama describe un sistema que cambia (tu embudo, tu operación, tu
oferta), guarda su `spec` junto a la fuente que lo alimenta y recompílalo por la
puerta 2. Es **idempotente**: reconcilia por `nodeId`, así que actualizar el spec
cambia lo que cambió y respeta lo que el dueño haya tocado a mano (queda `pinned`).

## Antes de tocar el código

```bash
cd arbrain && npx tsc --noEmit && npx tsx --test 'tests/canvas/**/*.test.ts'
```

Verde o no se entrega. Y la regla que rige todo este canvas:
**una capacidad sin prueba que la demuestre es una promesa, y las promesas
fueron exactamente lo que hundió al v3.**
