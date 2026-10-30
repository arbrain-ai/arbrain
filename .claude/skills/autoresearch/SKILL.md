---
name: autoresearch
description: "Auto-optimizacion autonoma de skills con el patron Karpathy: define evals binarias y corre loop genera→evalua→muta→conserva si mejoro. Triggers: optimiza este skill, mejora el skill, autoresearch, self-improve, corre evals, benchmark skill, sube la reliability de X. NO: crear skills nuevas (skill-creator), correr skills normalmente."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
metadata:
  author: Levy
  version: "1.0"
  based_on: "karpathy/autoresearch + anthropic/skills/skill-creator"
---

# Autoresearch: Self-Improving Skills

> Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`) adaptado al ecosistema Business OS.
> El principio: un loop autonomo que mejora un skill indefinidamente mientras el dueño duerme.

## Filosofia

"Un skill ordinario optimizado durante un tiempo extraordinario produce resultados extraordinarios."
El interes compuesto aplicado a prompts. Cada iteracion es un micro-experimento.
Lo que importa no es la mejora individual (0.5%) sino la acumulacion (50 iteraciones = transformacion).

---

## Fase 1: Setup (con el dueño)

Antes de correr autonomamente, necesitas alinear con el dueño:

### 1.1 Identificar el skill target

```
Cual skill quieres optimizar?
```

Leer el SKILL.md completo del skill target. Entender que hace, que outputs produce, que herramientas usa.

### 1.2 Definir las Evals

Las evals son la UNICA forma de medir si el skill mejoro. Sin buenas evals, autoresearch es ruido.

**Reglas de evals:**

1. **SIEMPRE binarias** (si/no, pass/fail). NUNCA escalas Likert (1-7). La variabilidad compuesta mata la senal.
2. **3-6 criterios** por skill. Menos de 3 = no captura calidad. Mas de 6 = el modelo "gamea" el examen.
3. **Nunca demasiado estrechos.** "Maximo 50 palabras" hace que el modelo optimice para brevedad, no calidad.
4. **Cubrir dimensiones ortogonales.** Cada criterio mide algo DIFERENTE (formato, contenido, tono, precision, etc).

Consultar `references/eval-guide.md` para templates por tipo de skill.

### 1.3 Definir parametros

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| `N` | 5 | Outputs generados por ciclo |
| `max_score` | N * num_criterios | Score maximo posible |
| `interval` | 3 min | Tiempo entre ciclos |
| `target_score` | 90% del max | Score para considerar "excelente" |
| `max_iterations` | 30 | Limite de iteraciones (seguridad de costo) |
| `budget` | $5 USD | Limite de gasto estimado |

### 1.4 Crear branch y baseline

```bash
git checkout -b autoresearch/<skill-name>
```

- Leer el SKILL.md actual del skill target
- Copiar el SKILL.md a `<skill>/SKILL.md.backup` (seguridad)
- Inicializar `<skill>/autoresearch-results.tsv` con header:

```
iteration	score	max_score	pct	status	changes_summary
```

- Correr la primera evaluacion como **baseline** (iteration 0, status: baseline)
- Confirmar con el dueño: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"

**Una vez el dueño confirma, NO PARAR.**

---

## Fase 2: El Loop (autonomo)

> "El humano puede estar dormido. NUNCA pausar para preguntar. NUNCA pedir confirmacion.
> Trabajar indefinidamente hasta ser interrumpido manualmente." — Karpathy

### El ciclo exacto:

```
LOOP (hasta max_iterations o target_score):

  1. ANALIZAR — Leer resultados previos. Que fallo? Que patron emerge?

  2. HIPOTESIS — Formular UNA hipotesis clara:
     "Si cambio X en el prompt, deberia mejorar Y porque Z"

  3. MUTAR — Editar el SKILL.md del skill target
     - UN cambio por iteracion (aislamiento de variables)
     - Cambios en: instrucciones, ejemplos, restricciones, formato, orden
     - NUNCA tocar el frontmatter (name, description, allowed-tools)
     - NUNCA agregar criterios de eval al prompt (eso es gaming)

  4. COMMIT — git add + git commit ANTES de correr
     Mensaje: "autoresearch(<skill>): iter N — <hipotesis corta>"

  5. GENERAR — Correr el skill N veces con inputs variados
     - Usar inputs representativos del uso real del skill
     - Variar los inputs entre iteraciones (no siempre el mismo)
     - Capturar cada output

  6. EVALUAR — Para cada output, aplicar cada criterio (si/no)
     - Score = total de "si" / max_score
     - Si el skill produce outputs VISUALES: usar Claude vision para evaluar
     - Si el skill produce TEXTO: evaluar con criterios directos
     - Si el skill produce DATOS/QUERIES: evaluar precision y completitud

  7. DECIDIR:
     - Si score > best_score → STATUS: keep
       → El commit se queda. Actualizar best_score.
     - Si score <= best_score → STATUS: discard
       → git reset --hard HEAD~1 (revertir al commit anterior)
     - Si el skill crasheo → STATUS: crash
       → Intentar fix trivial. Si no, revertir y continuar.

  8. REGISTRAR — Append a autoresearch-results.tsv:
     iteration	score	max_score	pct	status	changes_summary

  9. REPETIR — Ir al paso 1. No parar. No preguntar.
```

### Reglas del loop

- **UN cambio por iteracion.** Si cambias 3 cosas y mejora, no sabes cual ayudo.
- **Inputs variados.** No optimizar para UN input. Usar al menos 3 inputs diferentes por ciclo.
- **Simplicidad > complejidad.** Si el prompt crece 50 lineas y mejora 2%, no vale. Si ELIMINAR lineas mantiene el score, MEJOR (prompt mas corto = mas robusto).
- **No gaming.** NUNCA copiar los criterios de eval textualmente al prompt. Eso es un estudiante que memoriza el examen.
- **Crash tolerance.** Un crash no es el fin. Log it, revert, try different approach.
- **Context management.** NUNCA dejar que outputs largos inunden el contexto. Si el skill genera archivos, leer solo lo necesario para evaluar.

### Criterio de simplicidad (de Karpathy)

> "Mejora pequena (0.001) con 20 lineas de codigo feo = NO vale la pena.
> Mejora pequena (0.001) por ELIMINAR complejidad = SIEMPRE vale la pena."

Traducido a skills:
- Agregar 10 instrucciones al prompt para subir 5% = cuestionable
- Reescribir 1 instruccion confusa y subir 5% = excelente
- Eliminar instrucciones redundantes manteniendo el score = excelente

---

## Fase 3: Reporte

Cuando se alcanza `target_score` o `max_iterations`:

### 3.1 Generar resumen

```
## Autoresearch Report: <skill-name>

**Baseline:** X/Y (Z%)
**Final:** X/Y (Z%)
**Mejora:** +N% en M iteraciones
**Costo estimado:** ~$X USD
**Iteraciones:** N total (K kept, D discarded, C crashed)

### Cambios que mejoraron:
1. Iter 3: <cambio> → +5%
2. Iter 7: <cambio> → +3%
...

### Cambios que NO mejoraron:
1. Iter 2: <cambio> → -2% (descartado)
...

### Prompt final vs original:
<diff resumido>
```

### 3.2 Merge o esperar

- Mostrar el reporte al dueño
- Si el dueño aprueba: `git checkout main && git merge autoresearch/<skill>`
- Si el dueño quiere mas: continuar el loop
- El `autoresearch-results.tsv` queda como historial permanente

---

## Tipos de Evaluacion por Output

### Texto (posts, reportes, copy)

Evaluar directamente con criterios textuales. No necesita vision.

```
Criterio 1: El output contiene los bullet points clave del video? (si/no)
Criterio 2: El tono es casual y energetico, no corporativo? (si/no)
Criterio 3: Tiene CTA al final? (si/no)
Criterio 4: Esta en espanol sin anglicismos innecesarios? (si/no)
```

### Visual (canvas, image-generation)

Usar Claude vision para evaluar imagenes generadas.

```
Criterio 1: Todo el texto es legible y sin errores? (si/no)
Criterio 2: Los colores son pastel/suaves, no neon? (si/no)
Criterio 3: El layout es lineal (izq→der o arriba→abajo)? (si/no)
Criterio 4: El diagrama comunica la idea sin ambiguedad? (si/no)
```

### Data/Queries (consultas SQL, reportes de métricas)

Evaluar precision de datos y queries.

```
Criterio 1: El query retorna datos sin error? (si/no)
Criterio 2: Los numeros coinciden con verificacion manual? (si/no)
Criterio 3: El formato es legible (tabla/lista, no raw JSON)? (si/no)
Criterio 4: Incluye contexto temporal correcto? (si/no)
```

### Operacional (habit-system, memory-manager)

Evaluar que la operacion se ejecuto correctamente.

```
Criterio 1: La accion se completo sin error? (si/no)
Criterio 2: El resultado refleja lo que se pidio? (si/no)
Criterio 3: No hubo efectos secundarios no deseados? (si/no)
```

---

## Integracion con Skill Creator

Si el skill target NO tiene evals definidas, usar `skill-creator` para:
1. Generar eval set inicial (queries de prueba)
2. Definir expectations por query
3. Correr `run_eval.py` como herramienta de medicion

Autoresearch NO reemplaza a skill-creator. Skill-creator CREA skills.
Autoresearch los OPTIMIZA despues de creados.

---

## Limites de Seguridad

| Limite | Valor | Razon |
|--------|-------|-------|
| Max iteraciones | 30 | Prevenir loops infinitos costosos |
| Budget estimado | $5 USD | Control de costos |
| Max prompt growth | 2x original | Prevenir prompt bloat |
| Backup obligatorio | Siempre | Poder restaurar el original |
| Branch dedicado | Siempre | No contaminar main |
| Solo body del SKILL.md | Siempre | Frontmatter es sacrosanto |

---

## Quick Start

El dueño dice: "Optimiza el skill de canvas"

1. Leo `.claude/skills/canvas/SKILL.md` completo
2. Propongo 4 criterios binarios (basado en el tipo: visual)
3. El dueño confirma o ajusta
4. Creo branch `autoresearch/canvas`
5. Corro baseline (5 diagramas, evaluo, score X/20)
6. Muestro baseline, el dueño dice "dale"
7. Loop autonomo hasta target o max_iterations
8. Reporte final → el dueño decide merge
