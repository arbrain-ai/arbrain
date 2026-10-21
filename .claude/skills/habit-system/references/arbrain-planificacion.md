# Arbrain: qué ve el dueño y el registro estructurado de objetivos

## Qué ve el dueño en la app (esta edición)

La operación es **conversacional**: el dueño le habla a Levy en el chat y Levy escribe en las plumas
de esta skill. En esta edición la app muestra chat, panel, lienzo y Taller; las vistas de
Calendario, Tareas y Hábitos son una conexión futura y no aparecen. Por eso:

- El dueño ve su plan en lo que Levy le dice (que sale de `now.md`) y, si quiere, abriendo
  `.claude/plan/objetivos.md` en el Explorador del panel.
- Nada de esta skill depende de una pantalla: si una vista aparece más adelante, será espejo de las
  mismas fuentes (`objetivos.md`, `habitos.json`, calendario y tareas conectados), no una base nueva.

**Principio de latencia y verdad:** pintar no es confirmar. Levy no dice «guardado» hasta que la
pluma respondió bien, y si una fuente falla dice «no disponible», nunca «vacío».

## El registro estructurado de objetivos (opcional)

Además del texto libre (`**Mes:**`, `**Foco:**`, casillas del día), `objetivos.md` puede guardar un
registro estructurado dentro del mismo archivo, en un comentario `<!-- arbrain-objectives-v1 ... -->`.
Sirve cuando el dueño quiere objetivos con **criterio de cumplimiento** y **estado**. Si el registro
tiene un objetivo para el período, `now-snapshot.py` lo muestra en lugar del texto libre (los
borradores aparecen como «En planificación: …»).

La pluma es `mc-event.py planning`, con JSON por stdin. No necesita calendario ni red.

```bash
P="python3 arbrain/server/scripts/calendar/mc-event.py planning"

echo '{"action":"objectives-read"}' | $P
# -> {"goals":[...], "revision":"<sha256>", "context":[texto libre por período], ...}

echo '{"action":"objectives-write","requestId":"<UUID>","revision":"<sha256 leído>",
       "goal":{"id":"<UUID estable>","scope":"week","start":"2026-10-12","end":"2026-10-19",
               "title":"Cerrar 3 clientes","success":"3 contratos firmados","notes":"",
               "status":"agreed","parentId":"<id del objetivo del mes>",
               "taskIds":[],"eventIds":[],"completionNote":""}}' | $P
```

Contrato del objetivo:

- `scope`: `day`, `week` (lunes a lunes) o `month`. `start` y `end` cubren el período completo, con
  `end` exclusivo (día: el siguiente; semana: el lunes siguiente; mes: el día 1 del siguiente).
- `status`: `draft` (en planificación) · `agreed` (acordado) · `completed` (cumplido).
  `agreed` exige `success`; `completed` exige `completionNote` con la evidencia.
- `parentId`: día → semana, semana → mes, con períodos que se cruzan. El mes no tiene padre.
- `taskIds` con prefijo `todoist:` y `eventIds` con prefijo `google:` solo si esas conexiones existen.
- El período de un objetivo no se cambia: para otro período se crea otro objetivo.

Reglas:

- **No marcar `agreed` sin el acuerdo del dueño sobre ESE objetivo.** Un permiso general no aprueba
  un plan concreto.
- **Leer antes de escribir** y mandar la `revision` leída. Ante 409, releer y conservar el borrador;
  no reemplazar a ciegas el trabajo de otra conversación.
- **Reintento:** mismo `requestId` y mismo contenido. Otro contenido con el mismo `requestId` = 409.
- Completar una tarea no completa un objetivo; marcar un hábito tampoco. El cierre es un juicio con
  evidencia.
- Nunca sembrar objetivos reales para probar algo: usar un archivo temporal.

Cuándo usar cada forma: el texto libre basta para la mayoría de los dueños. El registro estructurado
conviene cuando se quiere distinguir borrador de acuerdo y cerrar cada objetivo con evidencia. Para
un mismo período, usar una sola de las dos.
