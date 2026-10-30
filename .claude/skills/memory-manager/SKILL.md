---
name: memory-manager
description: >
  Gestiona la memoria persistente curada de Levy en .claude/memory/. Usar siempre que el dueño pida recordar, guardar o consultar contexto; cuando pregunte si recuerdas algo; al inicio de sesiones donde el contexto historico importa; o cuando aparezca una correccion, decision, patron, bug resuelto o aprendizaje que el dueño podria querer versionar. Triggers: recuerda, remember, guarda esto, no olvides, memoria, contexto anterior, conversacion pasada, que sabes de, ultimo que hicimos.
---

# Memory Manager — Sistema de Memoria Persistente de Levy

> La memoria vive en `.claude/memory/` dentro de tu repo (`${ARBRAIN_HOME}`). Versionada en git. Tú, el dueño, tienes control total.
> La auto-memory nativa de Claude Code queda DESACTIVADA. La via legitima de escritura es
> CONVERSACIONAL, con esta skill: Levy propone y escribe, el dueño lo ve en el diff de git y puede
> revertirlo. Si algun dia activas un proceso nocturno que destile memorias, debe limitarse a CREAR
> archivos nuevos con su linea de indice; editar o consolidar memorias existentes sigue siendo
> territorio de esta skill y lo firma el dueño. NADIE borra memorias: se consolidan.

## Arquitectura

```
.claude/memory/
├── MEMORY.md              ← ESENCIA importada siempre: quién eres y reglas transversales compactas
├── RETRATO.md             ← Retrato del dueño, importado siempre: quién es, meta, cómo decide, lo firmado
├── MEMORY-user.md         ← Índice de identidad a demanda (entradas de user/), consultado por el recall
├── MEMORY-indice.md       ← Indice completo project/feedback/reference (NO importado; lo sirve el
│                            hook .claude/hooks/memory-recall.py por triggers; max 400 chars/entrada)
├── MEMORY-archivo.md      ← Capa rotada (project/ >90 dias; el hook tambien la matchea)
├── user/                  ← Sobre el dueño (rol, preferencias, como trabaja)
│   └── forma-de-trabajar.md
├── feedback/              ← Correcciones del dueño (que hacer/no hacer y POR QUE)
│   └── formato-de-respuestas.md
├── project/               ← Estado de iniciativas en curso (fechas absolutas)
│   └── lanzamiento-oferta.md
└── reference/             ← Donde encontrar cosas en sistemas externos
    └── proveedor-de-pagos.md
```

Los nombres de ejemplo son ilustrativos: tu memoria empieza vacía y crece contigo.
La carpeta ES el tipo. No se usa frontmatter.

## El retrato del dueño (`RETRATO.md`)

Para que respondas como él lo haría aunque no nombre el tema. Nace «Pendiente» con sus secciones (cómo usarlo, quién
es, su meta y su porqué, cómo decide, qué odia que hagas, lo firmado, abierto). Cómo mantenerlo:
- **Llenarlo:** con su expediente (`user/expediente.md`, `project/meta-90-dias.md`) y lo que te cuente, una sección
  a la vez; enséñale lo que escribiste. Al llenar una sección, borra su texto de guía; cuando ya no quede ninguna
  vacía, quita la línea «_Pendiente…_».
- **Al día:** cuando firme algo, te corrija o cambie su meta, actualiza la línea del retrato en el mismo turno en que
  guardas el archivo de detalle. Si una fuente cambia, manda la fuente.
- **Corto:** máximo unas 60 líneas; el detalle va en `user/`, `project/` o `feedback/` y aquí solo la línea con su
  enlace. Textual suyo entre «», tu lectura marcada «(Levy)». Nunca una frase, cifra o fecha inventada.

## Un solo cerebro entre runtimes

Claude Code y Codex leen y escriben estos MISMOS archivos. `AGENTS.md` enlaza a
`CLAUDE.md`; `.agents/skills` enlaza a `.claude/skills`; `.codex/memory` es un alias
de compatibilidad. Crear/editar SIEMPRE en `.claude/`, nunca clonar ni traducir rutas
por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
`memory-recall.py` con cada mensaje. Operación y verificación:
`.claude/references/cerebro-compartido.md`.

## Cuando CONSULTAR Memoria

### Automatico (sin que el dueño lo pida)
- **Inicio de sesion**: Leer MEMORY.md para orientarte. Si un tema del indice es relevante al trabajo actual, leer el archivo de detalle.
- **Tema recurrente**: Si el dueño menciona algo que suena a una correccion o decision pasada, buscar en memoria antes de responder.
- **Antes de proponer algo**: Si vas a sugerir una arquitectura, flujo, o decision, verificar que no contradiga una decision guardada.

### Cuando el dueño lo pide
- "Te acuerdas de...?" / "En que quedamos con...?" / "Que sabes de...?"
- Buscar en MEMORY.md primero, luego en archivos de detalle si hay match.

### Como consultar
1. Las entradas cuyo trigger tocaste llegan INYECTADAS por el hook `memory-recall.py` en el turno.
   Si no llego nada: `rg -i "<tema>" .claude/memory/MEMORY-{indice,user,archivo}.md`
2. Si hay un archivo de detalle relevante, leerlo COMPLETO antes de opinar
3. Si no encuentras nada, decirlo honestamente: "No tengo eso en memoria"

## Cuando GUARDAR Memoria

### Triggers de guardado (proactivo)

| Trigger | Tipo | Ejemplo |
|---------|------|---------|
| El dueño te corrige | `feedback` | "No hagas eso, mejor asi..." |
| El dueño dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
| Se resuelve un bug no obvio | `reference` | "El error era por X, la solucion es Y" |
| Decision de negocio importante | `project` | "Vamos a subir el precio a $49" |
| Descubres un patron util | `reference` | "Este endpoint necesita el header X" |
| Informacion del dueño como persona | `user` | "Prefiero que me hables directo" |
| Algo se rompio y se arreglo | `feedback` | "Nunca uses --force en ese repo" |

### Triggers de guardado (cuando el dueño lo pide)
- "Guarda esto" / "No olvides" / "Recuerda que" / "Anotalo"

### Que NO guardar (NUNCA)
- Cosas derivables del codigo actual (leer el repo es mejor)
- Git history (git log/blame es la fuente de verdad)
- Lo que ya esta en CLAUDE.md (no duplicar)
- Estado temporal de la conversacion actual (efimero)
- Soluciones de debugging (el fix esta en el codigo, el commit tiene el contexto)
- Secretos: llaves, contraseñas o tokens nunca entran a la memoria

## Como GUARDAR

### Paso 1: Verificar que no existe
Leer MEMORY.md y buscar en los índices. Si ya hay un archivo sobre ese tema, ACTUALIZAR en vez de crear uno nuevo.

### Paso 2: Escribir/actualizar el archivo de detalle

Crear el archivo en la carpeta correcta segun el tipo:

| Carpeta | Contenido |
|---------|-----------|
| `user/` | Sobre el dueño (rol, preferencias, como trabaja) |
| `feedback/` | Correcciones del dueño (que hacer/no hacer y POR QUE) |
| `project/` | Estado de iniciativas en curso (con fechas absolutas, no relativas) |
| `reference/` | Donde encontrar cosas en sistemas externos |

Formato del archivo: Markdown plano. Sin frontmatter. Empieza con `# Titulo`. Nombre en
minúsculas con guiones y, si el tema es fechable, la fecha al final: `feedback/no-enviar-sin-revision-2026-03-12.md`.

**Enlace a la conversación.** Toda memoria que nace de una conversación lleva, debajo del título, la línea `**Conversación completa:**` con el id de la conversación en la app Arbrain (si existe) y la ruta del transcript en `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`. La memoria resume; la conversación es la fuente íntegra. Si alguna de las dos no existe, decirlo en esa línea.

### Paso 3: Actualizar el indice (MEMORY-indice.md o MEMORY-user.md, NO MEMORY.md)

Las entradas de `project/`, `feedback/` y `reference/` van en `MEMORY-indice.md`.
Las entradas de `user/` van a `MEMORY-user.md`, con el mismo formato y triggers.
En `MEMORY.md` (importado siempre) solo quedan la esencia y las reglas transversales compactas.
El recall consulta ambos índices y la capa rotada. El sensor `memory-budget.sh` limita la
esencia a 6.000 caracteres y cada entrada a 400. No importar los índices al arranque: el
contenido grande se recorta y cuesta tokens en cada conversación.

**CONTRATO DURO (leer antes de escribir una sola linea):**

El indice es un MAPA, no la memoria. No se importa al contexto: lo sirve el hook
`memory-recall.py` matcheando los triggers de cada prompt, asi que los TRIGGERS son el mecanismo
de recall y la descripcion es solo orientacion.

- **Formato exacto, una sola linea por entrada:**
  `` - `carpeta/archivo.md` — Una frase de que es. **T:** trigger1, trigger2, trigger3. ``
- **Maximo 400 CARACTERES por entrada.** No lineas: **caracteres**. Un limite medido en lineas
  deja que una sola entrada engorde sin violar nunca la regla. **La unidad correcta son caracteres.**
- **PROHIBIDO en el indice:** mediciones, porcentajes, citas textuales del dueño, narrativa del
  hallazgo, listas de defectos, adornos. Todo eso va en el ARCHIVO. Si sientes que el indice
  "necesita" ese detalle, es senal de que el archivo esta mal escrito.
- **Los TRIGGERS son lo unico que se conserva integro** (son el mecanismo de recall), pero
  deduplicados: 8-12 distintivos, no 30 sinonimos de lo mismo.
- **Reglas Vivas:** si la memoria trae una directiva que gobierna el comportamiento de Levy sin
  abrir el archivo (un "NO re-litigar", "no reconstruir sin firma", "no sermonear X"), agregarla
  ADEMAS a la seccion de reglas vivas de `MEMORY.md` (la esencia importada), a una linea con su puntero.
- Organizar por tema, no cronologicamente.

**Verificar siempre despues de escribir:** `bash .claude/hooks/memory-budget.sh`
Si sale ⚠ o ✗, arreglarlo en el mismo turno. El techo NO se sube: se ROTA (mover entradas de
`project/` con mas de 90 dias a `MEMORY-archivo.md`, que no se importa).

### Paso 4: Informar al dueño

Decir que guardaste y en que archivo. No pedir permiso (lo vera en el diff de git).
Si el dueño revierte el cambio, respetar sin discutir.

## Reglas de Oro

1. **Consultar es gratis, guardar es caro.** Lee memoria seguido. Escribe solo cuando el conocimiento sobrevive a la sesion actual.
2. **Fechas absolutas siempre.** "Jueves" → "2026-03-12". Las memorias se leen semanas despues.
3. **Un archivo por tema.** No mezclar. Si crece mucho, dividir.
4. **El dueño manda.** Puede borrar, editar o revertir cualquier memoria. Tu no borras memorias sin que lo pida.
5. **Sin duplicados con CLAUDE.md.** Si algo ya esta en el CLAUDE.md principal, no repetirlo en memoria.
6. **Honestidad sobre limites.** Si no tienes algo en memoria, dilo. No inventes.
