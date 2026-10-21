# Loop Protocol: Autoresearch

> Protocolo detallado del loop autonomo. Adaptado de `karpathy/autoresearch/program.md`.
> Este archivo es la referencia tecnica. El SKILL.md es la guia de alto nivel.

---

## Pre-Loop Checklist

Antes de iniciar el loop, verificar:

- [ ] Skill target identificado y SKILL.md leido completamente
- [ ] Evals definidas (3-6 criterios binarios)
- [ ] Inputs de prueba definidos (minimo 3 variados)
- [ ] Branch creado: `autoresearch/<skill-name>`
- [ ] Backup del SKILL.md original: `<skill>/SKILL.md.backup`
- [ ] TSV inicializado con header
- [ ] Baseline corrido (iteration 0)
- [ ] El dueño confirmo "dale"

---

## El Loop Paso a Paso

### Paso 1: ANALIZAR

Leer el estado actual:
- `autoresearch-results.tsv` — historial de iteraciones
- Ultimo SKILL.md — el prompt actual
- Patrones de fallo — que criterios fallan mas?

Preguntas clave:
- Cual criterio tiene el pass rate mas bajo?
- Hay un patron comun en los fallos? (ej: siempre falla legibilidad en outputs largos)
- Que cambios previos fueron descartados y por que?

### Paso 2: HIPOTESIS

Formular UNA hipotesis clara ANTES de hacer cambios.

Formato:
```
HIPOTESIS: Si [cambio X] en el prompt, entonces [criterio Y] deberia mejorar
porque [razon Z].
```

Ejemplos:
```
HIPOTESIS: Si agrego "usa layout horizontal" al prompt, entonces el criterio
de layout lineal deberia mejorar porque el modelo defaultea a layouts verticales
que se ven desordenados.

HIPOTESIS: Si elimino la seccion de "estilos avanzados", entonces la legibilidad
deberia mejorar porque el modelo intenta cosas complicadas que resultan en texto
ilegible.
```

### Paso 3: MUTAR

Editar el SKILL.md del skill target. Reglas:

**LO QUE SI PUEDES CAMBIAR:**
- Instrucciones del body (texto del prompt)
- Ejemplos y templates
- Restricciones y constraints
- Orden de las secciones
- Nivel de detalle de instrucciones

**LO QUE NUNCA DEBES CAMBIAR:**
- Frontmatter YAML (name, description, allowed-tools, metadata)
- Scripts en `scripts/` (son herramientas, no el prompt)
- Referencias en `references/` que son datos fijos (paletas, schemas, etc)

**Principio de aislamiento:** UN cambio por iteracion. Si cambias 3 cosas y mejora,
no sabes cual ayudo. Si cambias 1 cosa y mejora, SABES exactamente que funciono.

**Principio de simplicidad (Karpathy):**
- Mejora pequena + complejidad agregada = cuestionable
- Mejora pequena + simplificacion = excelente
- Sin mejora + simplificacion = KEEP (prompt mas robusto)
- Sin mejora + complejidad = DISCARD (peor en todo sentido)

### Paso 4: COMMIT

```bash
git add <skill>/SKILL.md
git commit -m "autoresearch(<skill>): iter N — <hipotesis corta>"
```

El commit DEBE existir ANTES de correr el skill. Es tu checkpoint.
Si la evaluacion falla, haces `git reset --hard HEAD~1` y vuelves al estado anterior.

### Paso 5: GENERAR

Correr el skill N veces (default 5) con inputs variados.

**Estrategia de inputs:**
- Mantener un pool de 8-10 inputs representativos
- Cada ciclo, seleccionar N del pool (rotando)
- Incluir al menos 1 input "edge case" (largo, complejo, ambiguo)

**Para skills de TEXTO:**
- Ejecutar el skill mentalmente o con subagente
- Capturar el output completo de cada run

**Para skills VISUALES:**
- Generar la imagen/diagrama
- Guardar en temp para evaluacion con vision

**Para skills de DATA:**
- Ejecutar el query
- Capturar resultado y verificar

**Redireccion de output:**
NUNCA dejar que outputs largos inunden el contexto.
Si el output es >100 lineas, guardar en archivo y leer solo lo necesario para evaluar.

### Paso 6: EVALUAR

Aplicar cada criterio a cada output. Resultado: si (1) o no (0).

**Matriz de evaluacion:**

```
           Criterio1  Criterio2  Criterio3  Criterio4  Total
Output 1:     1          1          0          1         3/4
Output 2:     1          1          1          1         4/4
Output 3:     1          0          1          1         3/4
Output 4:     1          1          1          0         3/4
Output 5:     0          1          1          1         3/4
                                                       -----
Score:                                                 16/20 = 80%
```

**Para evaluacion VISUAL (Claude vision):**

Prompt de evaluacion:
```
Evalua esta imagen contra los siguientes criterios. Para cada uno,
responde UNICAMENTE "si" o "no". Sin explicaciones.

1. [Criterio 1]?
2. [Criterio 2]?
3. [Criterio 3]?
4. [Criterio 4]?

Formato de respuesta:
1: si/no
2: si/no
3: si/no
4: si/no
```

### Paso 7: DECIDIR

```
Si score > best_score:
    STATUS = "keep"
    best_score = score
    # El commit se queda, la branch avanza

Si score == best_score:
    STATUS = "discard"
    # Mismo score = no mejora. Prefiero el prompt mas simple.
    git reset --hard HEAD~1

Si score < best_score:
    STATUS = "discard"
    git reset --hard HEAD~1

Si crash/error:
    STATUS = "crash"
    # Intentar fix trivial (typo, import). Si no, revertir.
    git reset --hard HEAD~1
```

**Nota sobre empates:** Un empate en score NO es una mejora.
Si el nuevo prompt es mas corto/simple con mismo score, es un KEEP (simplicidad gana).
Si el nuevo prompt es mas largo/complejo con mismo score, es un DISCARD.

### Paso 8: REGISTRAR

Append al TSV (TAB-separated, NO comma):

```
iteration	score	max_score	pct	status	changes_summary
0	14	20	70.0	baseline	prompt original sin cambios
1	16	20	80.0	keep	agregado instruccion de layout horizontal
2	15	20	75.0	discard	cambiado orden de secciones
3	16	20	80.0	crash	error en template reference
4	18	20	90.0	keep	eliminado seccion de estilos avanzados
```

### Paso 9: REPETIR

Volver al Paso 1. NO PARAR. NO PREGUNTAR.

El humano puede estar dormiendo, en una reunion, o haciendo otra cosa.
La unica razon para parar:
- Se alcanzo `target_score`
- Se alcanzo `max_iterations`
- Error irrecuperable que requiere decision humana

---

## Estrategias de Mutacion

Cuando te quedes sin ideas obvias, intenta estas estrategias:

### Nivel 1: Ajustes finos
- Reordenar secciones del prompt
- Hacer instrucciones mas especificas
- Agregar un ejemplo concreto
- Cambiar verbos vagos por acciones concretas

### Nivel 2: Cambios estructurales
- Dividir una instruccion larga en pasos
- Combinar instrucciones redundantes
- Agregar/remover secciones enteras
- Cambiar el formato de instrucciones (prosa vs bullets vs tabla)

### Nivel 3: Cambios filosoficos
- Redefinir el "tono" o "estilo" del output
- Cambiar el frame (de "genera X" a "eres un experto que...")
- Agregar constraints negativos ("NUNCA hagas Y")
- Simplificar radicalmente (eliminar >30% del prompt)

### Nivel 4: Combinaciones
- Revisar iteraciones pasadas que casi mejoraron
- Combinar dos cambios que individualmente no mejoraron
- Intentar el opuesto de un cambio que empeoro

---

## Condiciones de Parada

| Condicion | Accion |
|-----------|--------|
| `score >= target_score` | STOP. Reporte final. |
| `iterations >= max_iterations` | STOP. Reporte final. |
| 5 discards consecutivos | PAUSA. Revisar si las evals son correctas. |
| 3 crashes consecutivos | STOP. Algo esta roto fundamentalmente. |
| Prompt crece >2x original | ALERTA. Considerar simplificacion radical. |

---

## Git Workflow Completo

```
main ──────────────────────────────────────────────────
  \
   └── autoresearch/canvas
       ├── iter 0 (baseline)
       ├── iter 1 (keep ✓)
       ├── iter 2 (discard, reset) ← este commit desaparece
       ├── iter 3 (keep ✓)
       ├── iter 4 (discard, reset) ← este commit desaparece
       ├── iter 5 (keep ✓)
       └── iter 6 (target alcanzado!)

# La branch solo contiene commits exitosos.
# El TSV contiene TODAS las iteraciones (exitosas y fallidas).
# Al final: git checkout main && git merge autoresearch/canvas
```

---

## Estimacion de Costos

| Componente | Costo estimado |
|------------|----------------|
| Generacion de output (por run) | $0.01-0.05 |
| Evaluacion con vision (por imagen) | $0.01-0.03 |
| Evaluacion textual (por output) | $0.005-0.01 |
| Mutacion de prompt (por iteracion) | $0.01-0.02 |

**Costo tipico por ciclo (5 outputs, 4 criterios):**
- Texto: ~$0.10-0.15
- Visual: ~$0.15-0.25
- Data: ~$0.05-0.10

**Costo de optimizacion completa (30 iteraciones):**
- Texto: ~$3-5
- Visual: ~$5-8
- Data: ~$2-3

Bien dentro del budget default de $5.
