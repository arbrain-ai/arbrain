# Planning: mes, semana, día y revisión

Cuatro rituales con el mismo patrón: **reunir evidencia → proponer → esperar el «va» → escribir →
verificar releyendo la fuente (y `mostrar` la vista calendario).** Ninguno escribe antes de la
aprobación del dueño.

## Fuentes que se leen (en paralelo, las que existan)

| Fuente | Cómo | Si falta |
|---|---|---|
| Objetivos vigentes | leer `.claude/plan/objetivos.md` | archivo vacío = sin objetivos, decirlo |
| Agenda | `.claude/plan/calendario.json` del período; si hay calendario conectado, también `gog calendar events` | «no pude leer X», no «agenda vacía» |
| Tareas | casillas de `objetivos.md` y sección `## Pendientes`; Todoist si está conectado | decir cuál faltó |
| Hábitos | `habit_record.py` con `action:"range"` del período | sin registros = sin medición, no cero |
| Diario | `ls .claude/diario/` y las entradas del período | huecos se nombran |
| Memoria | `.claude/memory/MEMORY.md` y lo que el índice marque para metas y prioridades | sin memoria = preguntar |

**Métricas del negocio:** solo de una fuente viva que el dueño haya conectado o que él mismo dé en
la conversación. Si no hay, se pregunta. Nunca se inventan ni se copian de un archivo viejo.

## 1. Planear el mes

**Triggers:** «planea mi mes», «objetivos del mes», «plan del mes».

1. Reunir: objetivos del mes anterior (qué se cumplió, con evidencia), agenda del mes, pendientes,
   adherencia de hábitos, y la meta mayor del dueño si está en su memoria.
2. Proponer **hasta 3 objetivos del mes** (lo ideal es 1 principal):
   - **Específicos y medibles** («cerrar 5 clientes», no «crecer el negocio»).
   - **Conectados a tareas reales** (2 o 3 que lo empujan).
   - **Realistas con la agenda** (viajes, compromisos, días de carga).
3. Proponer el reparto por semana (foco de cada una).

```
PLAN DEL MES: <Mes Año>

Punto de partida: <lo que se sabe con fuente; lo que no, «sin dato»>

OBJETIVO 1: <objetivo>
  Indicador: <métrica → meta>
  Tareas clave: <2-3>
OBJETIVO 2 (opcional): ...

SEMANAS:
  Semana 1-5:  <foco>
  Semana 6-12: <foco>
  ...
```

4. **Tras el «va»:** escribir el bloque `## <Mes Año>` con `**Mes:**` y cada `### Semana a-b` con su
   `**Foco:**` en `objetivos.md` (formato en `tiempo-y-calendario.md`). Regenerar `now.md` y verificar.

## 2. Planear la semana

**Triggers:** «planea mi semana», «objetivo de la semana», «plan de la semana».

1. Reunir: objetivo del mes, agenda de la semana, tareas abiertas, vencidas y lo que dejó la semana
   anterior.
2. Proponer:
   - **Un foco de la semana**: lo que, si se logra, hace que la semana sea un éxito.
   - **Top 3 tareas** que más mueven ese foco.
   - **Desglose diario**: qué recibe el foco cada día según los compromisos. Días con ejercicio o
     familia tienen ventanas más cortas; días con reuniones intensas, trabajo ligero después;
     días de creación necesitan bloques sin interrupción.

```
PLAN SEMANAL: <rango>

Objetivo del mes: <...>
Foco de la semana: <...>

TOP 3:
1. <tarea>: <por qué esta semana>
2. ...

DÍAS:
  Lun <n>: <foco> | Compromisos: <...>
  ...
  Dom <n>: descanso / revisión
```

3. **Tras el «va»:** escribir `### Semana a-b` + `**Foco:**` y un `#### <Día> NN` por día con su
   checklist. Si hay calendario conectado y el dueño quiere bloques, crearlos por `gog calendar create` con
   `[levy]`. Regenerar `now.md`.

## 3. Planear el día

**Triggers:** «planea mi día», «qué hago hoy», «planea mañana».

- Leer `now.md`: hito de hoy, agenda, vencidas.
- Dar **la siguiente acción** (una) y como máximo 3 compromisos del día, cada uno conectado al foco
  de la semana. Si hay vencidas, proponer qué hacer con cada una (hoy, otra fecha o matarla).
- Tras el «va», escribir el bloque `#### <Día> NN` con su checklist y las horas como `* HH:MM`.
- Consultar la siguiente acción («qué sigue») NUNCA crea nada: solo lee y recomienda.

## 4. Revisión semanal

**Triggers:** «revisión semanal», «cómo me fue», «qué logré esta semana».

Reunir: foco y checklists de la semana en `objetivos.md`, tareas cerradas y abiertas, registros de
hábitos del período y entradas del diario. La revisión NUNCA crea eventos ni tareas por su cuenta.

```
REVISIÓN SEMANAL: <rango>

Foco: <lo planeado>
Resultado: <lo que pasó, con evidencia>

LOGROS:
- ...

HÁBITOS: <clave>: N de M días registrados (sin registro ≠ fallo)
DIARIO: N de 7 noches

PENDIENTE (pasa a la próxima semana):
- ...

AJUSTE: <UN cambio concreto para la próxima semana>
```

Después, si el dueño quiere, se encadena con «planear la semana».
