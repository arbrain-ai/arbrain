# Arbrain: qué ve el dueño y el registro estructurado de objetivos

## Qué ve el dueño en la app (esta edición)

La operación es **conversacional**: el dueño le habla a Levy en el chat y Levy escribe en las plumas
de esta skill. La app muestra chat, panel, lienzo, Taller y el **Calendario** (botón «Calendario»
arriba a la derecha del chat, o el «+» del panel): Día, Semana y Mes con los objetivos de
`objetivos.md`, los eventos y tareas de `calendario.json` y los hábitos de `habitos.json`, en vivo. El
dueño también puede abrir esos archivos en el Explorador del panel. La vista es espejo de esas
fuentes, no una base nueva: Levy escribe en las fuentes y la vista las pinta.

**Principio de latencia y verdad:** pintar no es confirmar. Levy no dice «guardado» hasta que la
pluma respondió bien, y si una fuente falla dice «no disponible», nunca «vacío».

## El registro estructurado de objetivos (opcional)

Además del texto libre (`**Mes:**`, `**Foco:**`, casillas del día), `objetivos.md` puede guardar un
registro estructurado dentro del mismo archivo, en un comentario `<!-- arbrain-objectives-v1 ... -->`.
Sirve cuando el dueño quiere objetivos con **criterio de cumplimiento** y **estado**. Si el registro
tiene un objetivo para el período, la vista lo pone primero (los borradores aparecen como «En
planificación: …»); en el Día se listan también las casillas y los demás objetivos de ese día, sin repetir títulos.
Un día puede tener varios objetivos en el registro: uno por objetivo, cada uno con su `id`.

En esta edición no viaja `mc-event.py`: el registro lo escribe la vista Objetivos del Calendario (el
dueño, con su clic) o Levy editando el comentario a mano con cuidado (JSON válido, `"version": 1`, un
solo registro por archivo). Forma de cada objetivo dentro de `"goals"`:

```json
{"id":"<UUID estable>","scope":"week","start":"2026-10-12","end":"2026-10-19",
 "title":"Cerrar 3 clientes","success":"3 contratos firmados","notes":"",
 "status":"agreed","parentId":"<id del objetivo del mes>","taskIds":[],"eventIds":[],"completionNote":""}
```

Contrato del objetivo:

- `scope`: `day`, `week` (lunes a lunes) o `month`. `start` y `end` cubren el período completo, con
  `end` exclusivo (día: el siguiente; semana: el lunes siguiente; mes: el día 1 del siguiente).
- `status`: `draft` (en planificación) · `agreed` (acordado) · `completed` (cumplido).
  `agreed` exige `success`; `completed` exige `completionNote` con la evidencia.
- `parentId`: día → semana, semana → mes, con períodos que se cruzan. El mes no tiene padre.
- `taskIds` y `eventIds` con prefijo `local:` (tareas y eventos de `calendario.json`); `todoist:` y
  `google:` solo si esas conexiones existen.
- El período de un objetivo no se cambia: para otro período se crea otro objetivo.

Reglas:

- **No marcar `agreed` sin el acuerdo del dueño sobre ESE objetivo.** Un permiso general no aprueba
  un plan concreto.
- **Leer antes de escribir:** releer el archivo justo antes de editar; no reemplazar a ciegas el
  trabajo de otra conversación ni lo que el dueño escribió en la vista.
- Completar una tarea no completa un objetivo; marcar un hábito tampoco. El cierre es un juicio con
  evidencia.
- Nunca sembrar objetivos reales para probar algo: usar un archivo temporal.

Cuándo usar cada forma: el texto libre basta para la mayoría de los dueños. El registro estructurado
conviene cuando se quiere distinguir borrador de acuerdo y cerrar cada objetivo con evidencia. Para
un mismo período, usar una sola de las dos.
