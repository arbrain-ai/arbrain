# Guia de Evals para Autoresearch

> Como escribir buenas evaluaciones binarias para cada tipo de skill.
> Las evals son el UNICO mecanismo que determina si un skill mejoro.
> Malas evals = optimizacion hacia basura.

---

## Principios Fundamentales

### 1. Binario o nada

SIEMPRE si/no. NUNCA escalas.

```
BIEN:  "El texto tiene errores gramaticales?" → si/no
MAL:   "Califica la gramatica del 1 al 7" → variabilidad compuesta
```

Por que? Si tienes 4 criterios con escala 1-7, la varianza se multiplica.
Con 10 outputs evaluados, tu score puede oscilar ±30% entre runs identicos.
Con binario, la oscilacion es ±5-10%. Senal limpia.

### 2. Ortogonalidad

Cada criterio mide algo DIFERENTE. Si dos criterios miden lo mismo con diferentes palabras, estas desperdiciando resolucion.

```
BIEN:
  C1: Formato correcto? (estructura)
  C2: Tono apropiado? (estilo)
  C3: Datos precisos? (contenido)
  C4: Actionable? (utilidad)

MAL:
  C1: Bien escrito? (vago, cubre todo)
  C2: Sin errores? (overlap con C1)
  C3: Profesional? (overlap con C1 y C2)
```

### 3. No gameable

Si el modelo puede "pasar el examen" sin realmente mejorar la calidad, el criterio es malo.

```
GAMEABLE:  "Tiene exactamente 3 bullet points?" → el modelo hardcodea 3 bullets sin importar contenido
ROBUSTO:   "Los puntos clave del tema estan cubiertos?" → requiere comprension real
```

### 4. Representatividad

Los inputs de prueba deben cubrir el rango REAL de uso del skill.
No optimizar para un solo caso.

```
BIEN: Probar con 5 inputs diferentes que representan uso real
MAL:  Probar siempre con el mismo input "Haz un diagrama de auth flow"
```

---

## Templates por Tipo de Skill

### Tipo: TEXTO (posts, reportes, copy)

```yaml
criterios:
  - id: contenido
    pregunta: "El output cubre los puntos clave del input?"
    tipo: si/no

  - id: tono
    pregunta: "El tono es consistente con la identidad del skill (casual/formal/tecnico)?"
    tipo: si/no

  - id: estructura
    pregunta: "El output sigue el formato esperado (headers, bullets, secciones)?"
    tipo: si/no

  - id: accionable
    pregunta: "El output es actionable o util para el usuario final?"
    tipo: si/no

  - id: idioma
    pregunta: "Esta en el idioma correcto sin errores de traduccion o anglicismos?"
    tipo: si/no

inputs_ejemplo:
  - "Genera un post del ultimo video sobre agentes IA"
  - "Crea un reporte de metricas de esta semana"
  - "Resume el transcript de este video en 5 bullets"
```

### Tipo: VISUAL (canvas, image-generation, visuales de video)

```yaml
criterios:
  - id: legibilidad
    pregunta: "Todo el texto en la imagen es legible y sin errores?"
    tipo: si/no
    evaluador: claude-vision

  - id: paleta
    pregunta: "Los colores siguen la paleta definida (pastel/suave, no neon)?"
    tipo: si/no
    evaluador: claude-vision

  - id: layout
    pregunta: "El layout es ordenado y lineal (no caos visual)?"
    tipo: si/no
    evaluador: claude-vision

  - id: comunicacion
    pregunta: "El diagrama/imagen comunica la idea sin ambiguedad?"
    tipo: si/no
    evaluador: claude-vision

inputs_ejemplo:
  - "Diagrama de flujo de autenticacion OAuth2"
  - "Arquitectura de microservicios con 4 componentes"
  - "Pipeline de CI/CD con 3 stages"
```

### Tipo: DATA/QUERY (consultas SQL, reportes de métricas)

```yaml
criterios:
  - id: ejecucion
    pregunta: "El query se ejecuto sin error?"
    tipo: si/no

  - id: precision
    pregunta: "Los datos retornados son correctos (verificable con query manual)?"
    tipo: si/no

  - id: formato
    pregunta: "Los resultados estan en formato legible (tabla/lista, no raw JSON)?"
    tipo: si/no

  - id: contexto
    pregunta: "Incluye contexto temporal y filtros apropiados?"
    tipo: si/no

inputs_ejemplo:
  - "Cuantos miembros nuevos esta semana?"
  - "Revenue por plan en el ultimo mes"
  - "Top 5 videos por conversion"
```

### Tipo: OPERACIONAL (habit-system, memory-manager, calendario)

```yaml
criterios:
  - id: completitud
    pregunta: "La operacion se completo exitosamente?"
    tipo: si/no

  - id: precision
    pregunta: "El resultado refleja exactamente lo que se pidio?"
    tipo: si/no

  - id: idempotencia
    pregunta: "Correr la operacion dos veces no causa duplicados o errores?"
    tipo: si/no

inputs_ejemplo:
  - "Crea una tarea: revisar la landing page"
  - "Guarda en memoria que prefiero formato bullet"
  - "Agenda llamada de mentoria manana a las 3pm"
```

### Tipo: ESTRATEGIA (análisis de negocio, sistema-viable)

```yaml
criterios:
  - id: fundamentado
    pregunta: "Las recomendaciones estan basadas en datos reales, no suposiciones?"
    tipo: si/no

  - id: accionable
    pregunta: "Cada punto tiene un siguiente paso concreto?"
    tipo: si/no

  - id: alineado
    pregunta: "Las sugerencias son consistentes con la estrategia actual del negocio?"
    tipo: si/no

  - id: priorizado
    pregunta: "Los items estan ordenados por impacto/urgencia?"
    tipo: si/no

inputs_ejemplo:
  - "Analiza el engagement de mis clientes esta semana"
  - "Que contenido deberia publicar este mes?"
  - "Como estan respondiendo los agentes a preguntas sobre pricing?"
```

---

## Anti-patrones (NUNCA hacer)

### 1. Criterios demasiado estrechos
```
MAL: "El output tiene entre 100 y 150 palabras?"
```
El modelo aprende a contar palabras, no a escribir mejor.

### 2. Criterios subjetivos sin ancla
```
MAL: "El output es bueno?"
```
"Bueno" no tiene definicion. Descomponer en dimensiones medibles.

### 3. Demasiados criterios
```
MAL: 12 criterios para un skill simple
```
Con 12 criterios y 5 outputs = 60 evaluaciones por ciclo.
El ruido ahoga la senal. 3-6 es el sweet spot.

### 4. Copiar criterios al prompt
```
MAL: (en el SKILL.md) "Asegurate de que el texto sea legible, los colores pastel..."
     (en las evals) "El texto es legible?" "Los colores son pastel?"
```
Esto es gaming. El modelo repite lo que le dijiste, no mejora realmente.
Los criterios de eval deben ser SECRETOS para el prompt.

### 5. Inputs estaticos
```
MAL: Siempre probar con "Haz un diagrama de login flow"
```
Optimizas para UN caso. El skill se vuelve fragil para todo lo demas.

---

## Formula de Score

```
score = sum(criterio_pass for each output for each criterio)
max_score = N_outputs * N_criterios
pct = score / max_score * 100

Ejemplo:
  5 outputs, 4 criterios = max 20
  Output 1: 4/4
  Output 2: 3/4
  Output 3: 4/4
  Output 4: 3/4
  Output 5: 4/4
  Score: 18/20 = 90%
```

## Targets Recomendados

| Tipo de skill | Baseline tipico | Target razonable | Excelente |
|---------------|----------------|-------------------|-----------|
| Texto | 60-70% | 85% | 95%+ |
| Visual | 50-65% | 80% | 90%+ |
| Data/Query | 70-80% | 90% | 95%+ |
| Operacional | 75-85% | 95% | 99%+ |
| Estrategia | 55-65% | 80% | 90%+ |
