# Taxonomía: qué es cada cosa y dónde vive

El árbitro cuando haya que decidir si algo es tarea, evento, hito o hábito, cuando alguien proponga
una etiqueta, un proyecto o una superficie nueva, o cuando el dueño pregunte «¿dónde apunto esto?».

## Las 4 piezas: cuatro objetos, cuatro plumas, una vista

| Pieza | Qué es | Pluma (fuente única) | Espejos | Se cumple… |
|---|---|---|---|---|
| **Evento** | Tiempo comprometido. Ocupa un bloque del día. | Calendario conectado, vía `gog` (sin calendario: `* HH:MM` en el día de `objetivos.md`) | `now.md` | **estando ahí** |
| **Tarea** | Trabajo con ESTADO (abierta o cerrada). | Casilla en `objetivos.md`, o Todoist si está conectado | `now.md` | **completándola** |
| **Hito** | La REFERENCIA del nivel (mes, semana, día). No se hace: se juzga contra él. | `.claude/plan/objetivos.md` | `now.md` (Hitos) | **juzgándolo al cierre** |
| **Hábito** | Lo que se repite y se mide por RACHA, no por terminación. | `.claude/plan/habitos.json` vía `habit_record.py` | resumen de `range` | **marcándolo a diario** |

## EL TEST: «¿qué pasa si no lo hago?»

| Si no lo hago… | Es un… | Ejemplo |
|---|---|---|
| El tiempo se gastó igual y **no queda deuda** | **EVENTO** | Una clase a las 10. No fuiste: esa hora ya no existe. |
| **Sigue vivo** y se acumula | **TAREA** | «Mandar la propuesta». Mañana sigue ahí, más pesada. |
| No aplica: no se hace, se mide contra él | **HITO** | «Cerrar 3 clientes esta semana». |
| No se «termina»: se rompe una racha | **HÁBITO** | Leer 20 minutos. No existe «acabar» de leer a diario. |

Test de repuesto, más rápido: **¿ocupa tiempo o produce resultado?** El evento OCUPA. La tarea PRODUCE.

### El caso frontera: la tarea con hora

Una tarea con hora parece un evento. **No lo es: es una tarea con hora.** Sigue viviendo en su casa
de tareas (tiene estado, se completa). **Jamás crear además un evento a mano «para verla en el
calendario»:** eso la parte en dos fuentes que se desincronizan.

### Corolario operativo

- «agéndame X a las 5» → **evento**.
- «apúntame X», «recuérdame X», «tengo que hacer X» → **tarea**. Si la quiere a una hora, se le pone
  hora a la tarea.
- «mi objetivo de la semana es X» → **hito** (`objetivos.md`).
- «quiero hacer X todos los días» → **hábito** (catálogo de `habit_record.py`), no una tarea recurrente.

## Proyecto vs etiqueta: DÓNDE vive vs QUÉ TIPO es

Aplica si el dueño usa Todoist (o cualquier gestor con proyectos y etiquetas).

| | **Proyecto** | **Etiqueta** |
|---|---|---|
| Pregunta que contesta | ¿De qué **frente** es esto? | ¿Qué **clase de cosa** es esto? |
| Cardinalidad | **Exclusivo**: exactamente 1 por tarea | **Ortogonal**: 0 a N por tarea |
| Cruza frentes | Nunca | **Sí: esa es su razón de existir** |

**Las dos preguntas que deciden:**

1. **¿Una tarea puede ser dos de estos a la vez?** Sí → etiqueta. No → proyecto.
2. **¿La etiqueta CRUZA proyectos en la práctica?** Si nunca cruza, es el proyecto escrito dos veces
   y sobra. Esto se mide, no se opina.

**Cuidado con las etiquetas de ESTADO** (`@idea`, `@en-curso`): una etiqueta no se actualiza sola,
alguien tiene que acordarse de quitarla, y nadie se acuerda. El estado lo dice mejor la columna o
sección (Backlog → Por hacer → Haciendo → Hecho), porque moverla ES el trabajo.

**Tres ejes que no se pisan:**

| Eje | Lo dice… | Se mueve… |
|---|---|---|
| **Dónde** (frente) | el **proyecto** | casi nunca |
| **En qué estado** | la **sección** o columna | a diario |
| **Cuándo / si es compromiso** | la **fecha** (sin fecha = backlog: ideas y deuda juntas) | en la revisión semanal |

### La regla de una línea

> **Los frentes son exclusivos → proyecto. Los tipos que cruzan → etiqueta.
> Una etiqueta que nunca cruza se borra el día que se mide.**

Antes de crear una etiqueta, nombrar los DOS proyectos donde va a vivir y demostrar que no es un
estado disfrazado. Si no puedes nombrar el segundo, no es etiqueta.

## No confundir

- **Hito ≠ tarea.** Son niveles distintos con una pluma cada uno. Nunca citar un hito como si fuera
  una tarea, ni convertir un hito en tarea «para que aparezca».
- **Hábito ≠ tarea recurrente.** El hábito se mide por racha; la tarea recurrente se acumula como deuda.

## Por qué importa

Cada pieza de más es variedad que alguien tiene que absorber, y el que la absorbe es el dueño. **No
agregar superficies, colapsar redundancia.** Ante la duda entre crear algo nuevo y usar lo que ya
existe, el default es lo que ya existe, y la carga de la prueba la tiene lo nuevo.
