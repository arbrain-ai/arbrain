# Tiempo y calendario: el motor del reloj

Cómo Levy siente el tiempo y opera la agenda del dueño. Leer cuando diga: qué tengo hoy, mañana o
esta semana, agéndame X, muévelo, cancélalo, o hable de objetivos del mes, la semana o el día.

## La idea en una frase

**Una sola pluma por objeto, varios espejos.** Los hitos viven en `.claude/plan/objetivos.md`; los
eventos, en el calendario conectado (si existe); `now.md` es el espejo que Levy lee siempre.

```
LEER  (ambiental): objetivos.md + calendario + tareas ──► now-snapshot.py ──► .claude/now.md
ESCRIBIR hitos:    Levy ──► objetivos.md (edición directa o mc-event.py planning)
ESCRIBIR eventos:  Levy ──► gog calendar (o el conector que conectó el dueño) ──► su calendario
```

**Regla dura:** `now.md` jamás se edita a mano. Si algo cambia, se escribe en la fuente y se regenera.

## Capa 1: `now.md` (lo que Levy ve siempre)

`.claude/now.md` se importa desde `CLAUDE.md`, así que Levy lo tiene en contexto al arrancar cada
conversación sin correr nada. Es breve a propósito: fecha y hora, Hitos (mes, semana, hoy), Hoy,
Esta semana y Tareas. La profundidad se consulta a demanda.

Se regenera al iniciar sesión (hook `session-start`) y a mano:

```bash
python3 arbrain/server/scripts/calendar/now-snapshot.py           # regenera
python3 arbrain/server/scripts/calendar/now-snapshot.py --print   # y lo imprime
```

Cada sección es best-effort: si una fuente no responde, esa sección sale vacía o con aviso y el
resto se genera igual. **Vacío no significa «no hay nada»**: antes de decir «no tienes eventos»,
revisar la línea de estado del calendario en la cabecera.

## Capa 2: hitos en `objetivos.md` (la intención central)

**Los objetivos NO son eventos.** Son intenciones y checklist, y viven en un markdown que es su
fuente única. Formato exacto que lee `now-snapshot.py`:

```markdown
## Octubre 2026
**Mes:** <hito del mes, concreto y medible>

### Semana 12-18
**Foco:** <el foco de la semana>

#### Lun 13
- [ ] <compromiso del día>
- [x] <compromiso cumplido>
* 10:00 <bloque o nota libre>
```

Reglas del parser (si no se respetan, el hito no aparece en `now.md`):

- `## <Mes> <Año>` con el nombre del mes en español (`Enero` … `Diciembre`) y el año en cuatro cifras.
- `### Semana <a>-<b>` con días del mismo mes. Una semana que cruza de mes se parte en dos: `### Semana
  27-31` en un mes y `### Semana 1-2` en el siguiente, con el mismo `**Foco:**`.
- `#### <Día> NN`: cualquier abreviatura de día seguida del número del día.
- Bajo el día: `- [ ]` y `- [x]` son el checklist de hoy; `* ` es nota o bloque.

**Cómo se edita:** Levy lo edita directo (leer el archivo, editar el bloque, regenerar `now.md`).
El dueño también puede abrirlo y escribir a mano. Existe además un registro estructurado opcional
dentro del mismo archivo (con criterio de cumplimiento y estado borrador, acordado o cumplido); su
contrato está en `arbrain-planificacion.md`. Si el registro tiene un objetivo para el período, ese
manda en `now.md` sobre el texto libre.

**Buenas prácticas de hitos:**

- UN hito por nivel, concreto y medible. No una lista.
- El hito del día sirve al de la semana; el de la semana, al del mes. Si Levy ve que el plan de hoy no
  empuja el de la semana, lo dice.
- En días de viaje o de mucha carga, un solo bloque de producción, o ninguno. No agendar trabajo
  profundo en días de traslado.
- Si no hay hito, `now.md` lo dice («sin objetivo, pídemelo»). Nunca rellenar con suposiciones.

## Capa 3: eventos y agenda

### Con calendario conectado

Cómo se conecta (lo hace el dueño, Levy guía): `arbrain/cerebro/manuales/google-calendar-gmail.md`. La vía
estándar es `gog`; si conectó el conector oficial de Claude o de ChatGPT, usa ese con las mismas reglas.

**Toda escritura de eventos va por una sola pluma** (la que conectó) y con la etiqueta de origen
`[levy]` en la descripción, para distinguir lo que agenda Levy de lo que el dueño crea a mano.

```bash
A=<su-correo>   # siempre --account; la zona horaria del dueño está en su memoria

# Leer
gog calendar events primary --account $A --from 2026-10-12T00:00:00-05:00 --to 2026-10-19T00:00:00-05:00 --json
gog calendar events primary --account $A --today --json

# Crear un bloque
gog calendar create primary --account $A --summary "..." --from <ISO> --to <ISO> --timezone <su-zona> \
  --description "[levy]" --json

# Evento que se repite: la línea iCal completa, con el prefijo RRULE:
gog calendar create primary --account $A --summary "..." --from <ISO> --to <ISO> --timezone <su-zona> \
  --rrule 'RRULE:FREQ=WEEKLY;BYDAY=MO' --description "[levy]" --json
```

Para mover, editar o borrar, consulta `gog calendar --help` (subcomandos `update` y `delete`) y confirma con el
dueño antes. Opciones útiles de `create`: `--all-day`, `--location`, `--reminder popup:10m`,
`--transparency free`.

- **Confirmar antes de crear, mover o borrar**, salvo que el dueño lo haya pedido explícito.
- **Leer antes de escribir:** revisar choques antes de crear.
- **Zona horaria:** calcular el desfase correcto para la fecha del evento; no asumir.

### Sin calendario conectado (estado por defecto de esta edición)

Si el dueño no ha conectado su calendario (la verificación de su manual no pasa), `now.md` muestra «Sin eventos
agendados». Entonces:

- La agenda del día vive en el bloque del día de `objetivos.md`, como líneas `* HH:MM <bloque>`.
- Levy no inventa eventos ni dice «tu calendario está vacío»: dice que no hay calendario conectado.
- Ofrécele conectarlo con `arbrain/cerebro/manuales/google-calendar-gmail.md`. Desde que lo conecte, la regla de la
  pluma única aplica.

## La hora

`now-snapshot.py` toma la hora real del sistema y la zona horaria configurada en la máquina del
dueño. Si el dueño viaja, verificar la hora que muestra `now.md` antes de comprometer horas.

## Qué NO hace este motor

- No inventa eventos ni hitos. Si el dueño no lo definió, se dice.
- No convierte un hito en tarea «para que aparezca», ni una tarea en evento «para verla».
