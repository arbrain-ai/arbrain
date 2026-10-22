# Tiempo y calendario: el motor del reloj

Cómo Levy siente el tiempo y opera la agenda del dueño. Leer cuando diga: qué tengo hoy, mañana o
esta semana, agéndame X, muévelo, cancélalo, o hable de objetivos del mes, la semana o el día.

## La idea en una frase

**Una sola pluma por objeto, varios espejos.** Los hitos viven en `.claude/plan/objetivos.md`; los
eventos y bloques, en el **calendario local** `.claude/plan/calendario.json` (el calendario de esta
edición, siempre disponible) o en el calendario que el dueño haya conectado; `now.md` es el espejo que
Levy lee siempre.

```
LEER  (en vivo):  objetivos.md + calendario.json + habitos.json ──► sección Calendario del panel (Día, Semana, Mes)
LEER  (ambiental): .claude/now.md (resumen que llega en cada turno)
ESCRIBIR hitos:    Levy ──► objetivos.md (edición directa)
ESCRIBIR eventos:  Levy ──► calendario.json (por defecto) · o el calendario que conectó el dueño (gog o su conector)
```

**Esta edición no trae `now-snapshot.py` ni `mc-event.py`** (`arbrain/server/scripts/calendar/` no
existe): no los corras ni digas que fallaron. La vista Calendario lee las fuentes en vivo; `now.md` se
regenera solo donde exista ese script.

## Capa 1: `now.md` (lo que Levy ve siempre)

`.claude/now.md` se importa desde `CLAUDE.md`, así que Levy lo tiene en contexto al arrancar cada
conversación sin correr nada. Es breve a propósito: fecha y hora, Hitos (mes, semana, hoy), Hoy,
Esta semana y Tareas. La profundidad se consulta a demanda.

Donde existe `arbrain/server/scripts/calendar/now-snapshot.py`, se regenera con
`python3 arbrain/server/scripts/calendar/now-snapshot.py`. En esta edición no viaja: `now.md` es un
resumen que puede estar viejo, y la verdad está en `objetivos.md` y `calendario.json` (ábrelos antes de
decir qué tiene hoy).

Cada sección es best-effort: si una fuente no responde, esa sección sale vacía o con aviso y el
resto se genera igual. **Vacío no significa «no hay nada»**: antes de decir «no tienes eventos»,
revisar la línea de estado del calendario en la cabecera.

## Capa 2: hitos en `objetivos.md` (la intención central)

**Los objetivos NO son eventos.** Son intenciones y checklist, y viven en un markdown que es su
fuente única. Formato exacto que leen la vista Calendario y `now-snapshot.py`:

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

**Cómo se edita:** Levy lo edita directo (leer el archivo y editar el bloque).
El dueño también puede abrirlo y escribir a mano. Existe además un registro estructurado opcional
dentro del mismo archivo (con criterio de cumplimiento y estado borrador, acordado o cumplido); su
contrato está en `arbrain-planificacion.md`. En el Día, la vista muestra juntos (sin repetir títulos) los
objetivos del registro, las casillas del bloque del día y las tareas con la etiqueta `objetivo`.

**Buenas prácticas de hitos:**

- Pocos por nivel, concretos y medibles: el mes y la semana, uno; el día, los que el dueño definió (hasta 3), **una
  casilla `- [ ]` por objetivo**. Si te da tres, escribe los tres: nunca los fundas en uno ni reemplaces los que ya
  están. La caja «Objetivo del día» del Calendario los muestra todos.
- El hito del día sirve al de la semana; el de la semana, al del mes. Si Levy ve que el plan de hoy no
  empuja el de la semana, lo dice.
- En días de viaje o de mucha carga, un solo bloque de producción, o ninguno. No agendar trabajo
  profundo en días de traslado.
- Si no hay hito, `now.md` lo dice («sin objetivo, pídemelo»). Nunca rellenar con suposiciones.

## Capa 3: eventos y agenda

### El calendario local (por defecto en esta edición)

`.claude/plan/calendario.json` es el calendario de Arbrain: lo pinta la sección **Calendario** del
panel (su primera pestaña; si la cerró, el «+» del panel › Calendario) en Día,
Semana y Mes, junto con los objetivos de `objetivos.md` y los hábitos. No necesita cuenta ni red.
**Cuando el dueño pide agendar, bloquear o «pon X en el calendario» y no conectó otro calendario, se
escribe aquí.** El archivo trae su propio instructivo en `_como_se_usa`; el contrato:

```json
{ "id": "obj-2026-10-22-oferta", "titulo": "Escribir la oferta", "inicio": "2026-10-22T09:00:00-06:00",
  "fin": "2026-10-22T10:00:00-06:00", "todoElDia": false, "descripcion": "Objetivo del día · [levy]" }
{ "id": "obj-2026-10-22-gym", "titulo": "Gym", "inicio": "2026-10-22", "fin": "2026-10-23", "todoElDia": true }
```

- `id` único y estable (sirve para editarlo luego). Hora con su zona (`-06:00`); el desfase sale de la
  zona del dueño PARA ESA FECHA. Día completo: solo fecha y `fin` = el día siguiente.
- Repetición opcional en `repetir` (`FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE,FR`, `FREQ=MONTHLY`).
- Una tarea con fecha (sin hora comprometida) va en `tareas[]`: `{ id, titulo, fecha: "2026-10-22", prioridad: 1-4, hecha: false }`.
- Edita el JSON con cuidado (léelo, agrega al arreglo, no borres lo que no es tuyo ni toques
  `recibos`) y vuelve a leerlo para comprobar que sigue siendo JSON válido. Si la vista no entiende un
  evento, lo avisa con su título en el calendario: corrígelo.
- Al terminar, enséñaselo: herramienta `mostrar` con `vista: "calendario"`, `alcance: "dia"` y la fecha
  (con `fijar: true` si quiere tenerlo a la vista). No digas «listo» sin haber releído el archivo.

**«Pon mis objetivos de hoy en el calendario»** (o «despliega el día»): lee el bloque `#### <Día> NN` de
hoy en `objetivos.md`; cada casilla `- [ ]` es un objetivo (si aún no están, escríbelos primero ahí, uno por
casilla). Las que traen hora van a esa hora; para las
demás propón un horario realista (respeta lo que ya está en `calendario.json` y lo personal) y espera su
«va»; con el «va» crea UN evento por objetivo (todos, no solo los que traían hora) con
`descripcion: "Objetivo del día · [levy]"`. Un objetivo sin hora que el dueño no quiere bloquear va como
tarea con `fecha` de hoy. Después `mostrar` el día y confirma en una línea cuántos quedaron.

**«¿Dónde está el calendario?» / «¿cómo agrego aquí el calendario?»:** ábreselo tú con `mostrar`
(`vista: "calendario"`, `fijar: true`) y dile que también está en el botón **Calendario** arriba a la
derecha del chat y en el «+» del panel (⌘B abre y cierra el panel).

### Con calendario conectado (opcional)

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

### Si un conector no responde

Si el dueño conectó Google (gog o su conector) y no responde o pide un permiso, no te detengas ahí: dile
qué falló y ofrécele dejarlo en su calendario local (`calendario.json`), que siempre está. Nunca escribas
el mismo evento en los dos.

## La hora

La hora real es la del sistema (`date`) y la zona, la configurada en la máquina del dueño (o `zona` en
`calendario.json`). `now.md` puede estar viejo: si el dueño viaja o la fecha no cuadra, verifica la hora
antes de comprometer horas.

## Qué NO hace este motor

- No inventa eventos ni hitos. Si el dueño no lo definió, se dice.
- No convierte un hito en tarea «para que aparezca», ni una tarea en evento «para verla».
