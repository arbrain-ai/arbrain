---
name: lienzo
description: "Operar el lienzo de Arbrain: crear páginas, compilar diagramas, mapas, blueprints, flujos y sistemas a partir de semántica (nodos, roles y relaciones), reconciliar sin pisar lo que la mano tocó y mostrarlos al dueño. Triggers: lienzo, canvas, pizarra, diagrama, mapa, flujo, blueprint, 'dibuja esto', 'ponlo en el lienzo'. REGLA DURA: leer completo references/estandar-visual.md antes de crear o modificar un mapa."
metadata:
  author: levy
  version: "7.0-alumno"
---

# Lienzo

El lienzo es el pizarrón infinito de Arbrain: la sección `/lienzo` de la app y la pestaña Lienzo del panel. Levy
dibuja declarando QUÉ hay y CÓMO se relaciona; el compilador de la app decide DÓNDE va cada cosa.

> **La regla de una línea: tú no calculas ni una coordenada.** Si te encuentras escribiendo `x: 5470`, estás
> haciéndolo mal. El compilador mide el texto de verdad, compone cada tarjeta, distribuye el grafo, rutea las
> flechas y audita el resultado.

## Cómo cargar contexto

| Necesidad | Archivo |
|---|---|
| Gramática visual: hoja, paleta de restricción, bordes por tipo, tipografía, patrones, QA | `references/estandar-visual.md` (OBLIGATORIO, completo, antes de crear o modificar un mapa) |
| Páginas y carpetas: listar, crear, mover, archivar, borrar | `../app/references/canvas-diagram/pages.md` |

**REGLA DURA:** el estándar visual se lee completo antes de cualquier mapa o diagrama. Es el default siempre; no
hace falta que el dueño diga «usa nuestro diseño».

## La API

Base: `$MISSION_CONTROL_ORIGIN/api/canvas` (la web local de la app). Autorización: la sesión de la app o el
Bearer del daemon (`$ARBRAIN_PASE_AGENTE`, ya está en tu entorno; nunca lo imprimas).

```bash
B="$MISSION_CONTROL_ORIGIN/api/canvas"
H=(-H "Authorization: Bearer $ARBRAIN_PASE_AGENTE" -H "Content-Type: application/json")
```

### Puerta 1 · Compilar sin guardar: `POST /compile`

Devuelve los elementos listos y el veredicto del juez. Sirve para previsualizar.

```bash
curl -s -X POST "$B/compile" "${H[@]}" -d '{
  "theme": "claro",
  "targetAspect": 1.6,
  "spec": {
    "title": "De dónde viene el dinero",
    "nodes": [
      { "id": "canal", "role": "trigger", "title": "Contenido",
        "caption": "El canal que trae a la gente.", "chips": [{ "text": "DUEÑO" }] },
      { "id": "oferta", "role": "module", "title": "Oferta de entrada",
        "items": ["Precio accesible", "Resultado rápido"],
        "caption": "Califica y calienta." },
      { "id": "premium", "role": "deliverable", "title": "Servicio premium",
        "caption": "Aquí se hace el margen.", "chips": [{ "text": "EN OBRA" }] }
    ],
    "edges": [
      { "from": "canal", "to": "oferta" },
      { "from": "oferta", "to": "premium", "kind": "fragil", "label": "aún sin ruta" }
    ]
  }
}'
```

### Puerta 2 · Escribir en una página: `POST /pages/<id>/region`

Mismo `spec`, más un `regionId` (default `principal`). **Reconcilia:** los nodos que ya existían se actualizan por
su `id`, no se destruyen y recrean, así que el trabajo a mano sobrevive. El spec se guarda con la página: la
segunda pasada es un diff.

```bash
curl -s -X POST "$B/pages/PAGE_ID/region" "${H[@]}" \
  -d '{"regionId":"modelo","theme":"claro","targetAspect":1.6,"spec":{ ... }}'
# -> { ok, version, layout: { direccion, crucesDeTexto }, diff, pinsHuerfanos, bloqueados, judge }
```

Para crear la página primero: `POST $B/pages` con `{"nombre": "..."}` (ver pages.md).

## El vocabulario (lo único que declaras)

**Nodo:** `id` + `role` + `title`, y opcionalmente:

- `caption`: va **debajo y fuera** de la caja. Caja con párrafo adentro es antipatrón.
- `items[]`: renglones dentro (el contenido de un módulo).
- `chips[]`: etiquetas cortas abajo a la derecha, dentro de la caja (`{ "text": "..." }`).
- `index`: el número del círculo, solo para `callout`.

**Roles** (el rol decide el color; **jamás mandes un color**):

| rol | qué comunica |
|---|---|
| `card` | pieza neutra, solo título |
| `module` | contenedor con contenido (borde de guiones) |
| `form` | entrada o captura |
| `callout` | llamada humana numerada |
| `deliverable` | entregable o artefacto |
| `trigger` | disparador |
| `risk` | riesgo o guardarraíl |
| `agent` | agente o automatización |

**Clases de arista** (`kind`): `flujo` (default) · `agente` · `fragil` · `hueco`. Codifican el ESTADO de la
relación, no solo su dirección: un hueco declarado y un flujo probado no pueden verse igual.

**Opciones:** `theme` (`claro` u `oscuro`), `targetAspect` (pantalla ≈ `1.6`, lámina ≈ `1.3`), y en el spec
`layout.direction` (`TB`, `LR`, `BT`, `RL`) solo si sabes algo que el compilador no.

## Reglas duras

1. **Cero coordenadas, cero tamaños, cero colores en el spec.** Si el layout no te gusta, el arreglo es
   `targetAspect` o `layout.direction`, nunca mover cajas.
2. **`targetAspect` casi siempre.** Sin él, seis nodos salen muy alargados. El compilador prueba las dos
   direcciones y elige midiendo cuál deja menos flechas encima de texto; la respuesta dice cuál eligió en
   `layout.direccion`.
3. **Lee `judge`.** Trae `ok`, `stats` y `findings` (cada uno con `metric` y `severity`). Un `fail` es un
   diagrama roto aunque el HTTP diga 200: `solapamiento`, `desborde` (el texto no cupo), `cruce`, `contraste`,
   `legibilidad`, `huerfano`.
4. **Los `warn` también se leen.** `cruce-texto` (una flecha pasa sobre texto) o `densidad` piden ajustar el spec
   antes de entregar.
5. **Lo que la mano tocó queda fijado** (`pinned`). El compilador ya no lo mueve pero lo respeta como obstáculo.
   No lo despines sin que el dueño lo pida.
6. **El candado gana sobre todo, incluido tú.** Si lo que te piden toca un elemento bloqueado (`bloqueados` en la
   respuesta), pregunta antes: «esto tiene candado, ¿seguro que quieres cambiarlo?». No lo desbloquees ni lo
   pises en silencio.
7. **Misma idea, misma página.** Antes de crear una página, revisa si el tema ya tiene una; agrega ahí con otra
   `regionId`.
8. **Nunca escribas el documento de una página a mano** ni edites la base local. Todo pasa por la API.

## Workflow

1. Lee completo `references/estandar-visual.md`.
2. Decide página: existente del mismo tema o nueva (`POST /pages`).
3. Arma el spec: nodos con rol, títulos cortos, captions afuera, aristas con su clase.
4. Previsualiza con `/compile` si dudas; escribe con `/pages/<id>/region`.
5. Revisa `judge`, `issues`, `bloqueados` y `pinsHuerfanos`. Corrige el spec y recompila hasta que pase.
6. Muéstralo: `mostrar {vista: 'lienzo', paginaId}` del MCP `cabina`.
7. Si no lo verificaste visualmente, dilo.

## Operación AI-first

El dueño no arma diagramas con botones: habla, y tú llamas a la API. Lo que sí hace con el dedo, y para eso
existe:

- **Tirar de un puerto** (los puntos en los 4 lados de una figura) hacia el vacío: nace la figura siguiente, ya
  conectada.
- **La barra contextual** bajo lo seleccionado: forma, rol, tipografía, color, contorno, relleno, enlace, candado.
- **Acomodar** (con 2 o más figuras): las distribuye siguiendo sus flechas.

Si pregunta «¿para qué sirve este botón?», la mejor respuesta suele ser: «dime qué quieres y te lo hago».

## Si algo falla

| Respuesta | Qué significa | Qué hacer |
|---|---|---|
| 401 «Abre Arbrain desde la app» | Esta edición no aceptó el Bearer del daemon para el lienzo | Decirlo al dueño tal cual; no intentar leer la cookie de la app |
| 400 `falta spec.nodes` | Spec vacío o mal formado | Revisar el JSON |
| 404 `no existe la pagina` | `PAGE_ID` equivocado o borrado | Listar páginas |
| 409 esquema distinto | Página de un formato anterior | No convertirla sin pedido del dueño |
| `judge` con `fail` | Diagrama roto | Ajustar spec y recompilar |
