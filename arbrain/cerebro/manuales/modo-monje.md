# Modo monje (opcional)

Una rutina simple que Levy te ayuda a sostener: a qué hora duermes y despiertas, dos o tres hábitos y tres cosas de
las que te quieres alejar. Levy la convierte en eventos que se repiten en tu calendario, una revisión diaria en
Todoist y hábitos que puedes marcar hablando. Es opcional y se ofrece una sola vez.

> **Privacidad:** tu rutina se guarda en los archivos de tu cerebro, en tu computadora, y en tu propio calendario
> y tu propio Todoist si los conectaste.

## Para Levy: cuándo y cómo

**Cuándo:** al final del primer encuentro (después de conocer al dueño, ver «Primer encuentro» en `CLAUDE.md`), o
cuando él lo pida («modo monje», «ayúdame con mi rutina», «quiero dormir mejor», «quiero dejar X»). Ofrécelo una vez,
en una frase: «¿Quieres que armemos tu rutina en modo monje? Son cinco preguntas y la dejo en tu calendario.» Si dice
que no o que después, no insistas; anótalo en su memoria para no volver a ofrecerlo sin que lo pida.

**Cómo:** una pregunta a la vez. No sermonees ni diagnostiques; esto lo diseña él. Si algo de lo que propone choca con
su meta, díselo una vez, con razones, y respeta lo que decida.

### Paso 1. Las preguntas (de una en una)

1. ¿A qué hora quieres **dormirte** y a qué hora **despertarte**? (Entre semana y fin de semana, si cambia.)
2. ¿Qué **dos o tres hábitos** quieres sostener? Para cada uno: qué es exactamente, qué días y a qué hora (por
   ejemplo «ejercicio, lunes a viernes, 7:00, 45 min»; «leer 20 min antes de dormir»).
3. ¿De qué **tres cosas** te quieres alejar? (Por ejemplo: el celular la primera hora del día, redes antes de
   mediodía, trabajar después de las 21:00.) Para cada una: ¿qué haces en su lugar?
4. ¿En qué **zona horaria** vives? (Si ya está en su memoria, no la preguntes.)
5. ¿Quieres un **aviso** antes de cada bloque? ¿Cuántos minutos antes?

### Paso 2. Muéstrale el plan y espera su «sí»

Resume en una tabla lo que vas a crear (nombre, días, hora, dónde). Ejemplo:

| Qué | Cuándo | Dónde |
|---|---|---|
| Apagar pantallas | diario 22:30 (30 min antes de dormir) | calendario |
| Dormir | diario 23:00 a 6:30 | calendario |
| Ejercicio | lun a vie 7:00 a 7:45 | calendario + hábito |
| Leer | diario 22:35 a 22:55 | calendario + hábito |
| Revisión del día: ¿me alejé del celular al despertar, de redes antes de mediodía, del trabajo después de las 21:00? | diario 21:30 | Todoist (una sola tarea) |

Pregunta: «¿Lo creo así?». **Solo con su sí explícito** creas algo. Si cambia algo, ajusta la tabla y vuelve a
preguntar.

### Paso 3. Guarda la rutina en su cerebro (siempre, esté conectado o no)

- **Memoria:** `.claude/memory/user/rutina-modo-monje.md` con la tabla, la fecha y sus palabras sobre por qué lo
  hace. Agrega su línea a `MEMORY-indice.md` con disparadores (`**T:** modo monje, rutina, dormir, hábitos`).
- **Hábitos:** da de alta cada hábito con la pluma de la skill `habit-system`:

  ```bash
  H=.claude/skills/habit-system/scripts/habit_record.py
  echo '{"action":"habit-add","clave":"ejercicio","nombre":"Ejercicio","seccion":"cuerpo"}' | python3 $H
  ```

  (En Windows, `python` en vez de `python3`.)

### Paso 4. Crea lo que se pueda según lo que tenga conectado

**Con Google Calendar conectado por `gog`** ([google-calendar-gmail.md](google-calendar-gmail.md)): un evento
recurrente por fila de «calendario». Primero lee su agenda de la semana para no encimar; si choca, pregúntale.

```bash
gog calendar create primary --account <su-correo> --summary "Dormir" \
  --from 2026-10-20T23:00:00 --to 2026-10-21T06:30:00 --timezone <su-zona> \
  --rrule 'RRULE:FREQ=DAILY' --transparency free --description "[levy] modo monje" --json

gog calendar create primary --account <su-correo> --summary "Ejercicio" \
  --from 2026-10-20T07:00:00 --to 2026-10-20T07:45:00 --timezone <su-zona> \
  --rrule 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' --reminder popup:10m --description "[levy] modo monje" --json
```

Empieza en el próximo día que toque, nunca en el pasado. Usa la fecha real de hoy para calcularlo.

**Con el conector oficial de Google:** si sus herramientas aceptan recurrencia, úsalas igual; si no, díselo y crea
solo los eventos que se puedan, o propón conectar `gog`.

**Con Todoist conectado** ([todoist.md](todoist.md)): **una** tarea recurrente para la revisión de las tres cosas
(no tres tareas). Con el servidor oficial, pídeselo a su herramienta de crear tareas con fecha «every day at 21:30».
Con la API: `"due_string": "every day at 21:30"`. Comprueba después que la hora quedó en su zona (Todoist usa la zona
de la cuenta).

**Sin calendario ni Todoist:** no inventes que quedó agendado. Escribe la rutina en el bloque del día de
`.claude/plan/objetivos.md` como líneas `* HH:MM <bloque>` y dile: «Quedó en tu plan y en tu memoria. Cuando
conectes tu calendario, la paso a eventos que se repiten.» Anota en su memoria que está pendiente de agendar.

### Paso 5. Verificación

- `gog calendar events primary --account <su-correo> --week --json`: los eventos aparecen en los días correctos y a
  la hora correcta en su zona.
- Todoist: la tarea de revisión existe con su recurrencia.
- `echo '{"action":"catalog"}' | python3 .claude/skills/habit-system/scripts/habit_record.py`: los hábitos están.
- Dile qué quedó dónde, en tres líneas, y cómo marcar un hábito («Levy, marca ejercicio»).

### Si falla o quiere cambiarlo

- **Un evento quedó a otra hora:** casi siempre es la zona horaria. Revisa `--timezone` y corrige ese evento
  (pregúntale antes de mover).
- **Quiere quitar la rutina:** borrar eventos recurrentes es irreversible. Muéstrale cuáles son (los que dicen
  «[levy] modo monje») y bórralos solo con su pedido explícito.
- **No la está cumpliendo:** un día sin marca es falta de medición, no un fracaso. En la revisión semanal pregúntale
  qué cambiar; no le reclames.
