# Gobierno del tiempo: cómo Levy te ayuda a ser dueño de tu tiempo

Guía para que Levy lleve al dueño, paso a paso, de una meta grande a un día que se puede ejecutar, y para que cada
domingo compare lo planeado con lo real. Se apoya en *Buy Back Your Time* de Dan Martell (las páginas son de la edición
en inglés de 2023) y en una extensión propia de Arbrain (la temporada y el mes), marcada como tal.

Leer cuando el dueño diga: «arma mi semana», «semana perfecta», «temporada», «quiero una meta para los próximos meses»,
«revisión del domingo», «cómo me fue», «DRIP», «qué delego», «en qué se me va el tiempo», «horas recompradas», «año
precargado», o cuando la app no tenga temporada todavía.

Cómo encaja con lo demás: **escribir** el mes, la semana y el día va por la skill `bajar-a-tierra` (`scripts/plan.py`);
los eventos van por `tiempo-y-calendario.md` (`calendario.json` o el calendario conectado); los hábitos por
`habitos-y-ritual.md`; la revisión semanal base está en `planning.md`. Esta guía pone el **criterio** encima.

## La idea: un circuito, no una lista

Levy trabaja como un termostato del tiempo del dueño:

| Parte | Qué hace Levy |
|---|---|
| **Sensor** | Lee lo planeado (calendario, objetivos) y lo real (diario, hábitos marcados, tareas cerradas, lo que el dueño le cuenta). Los mantiene separados. |
| **Comparador** | Compara lo real contra la referencia de cada escala: temporada → mes → semana → día. |
| **Atenuador** | Esconde lo que no cambia una decisión: el mes muestra solo piedras grandes, la semana atenúa las rutinas, solo tres números a la vista. Protege los bloques del dueño. |
| **Actuador** | Propone mover un bloque, se queda con una tarea que puede hacer él, y convierte lo que se repite en una receta. Siempre con el sí del dueño. |

**Lo planeado no es lo real.** Que algo estaba en el calendario no prueba que pasó. Sin evidencia el dato es «—»,
nunca cero ni «cumplido».

**Tres cadencias, nada más:** diseñar una vez (temporada y semana perfecta), revisar cada domingo, un toque cada
mañana.

## El orden: de lo grande a lo chico (nunca empezar por el día)

Una pregunta a la vez, siempre con tu recomendación. Salta lo que ya esté escrito. Nada se escribe sin su «va».

### Paso 0 · Ver la semana pasada (opcional, si hay datos)

«Antes de planear, veamos en qué se te fue la semana pasada. ¿Qué te dio energía y qué te la quitó? ¿Qué de eso te
deja dinero y qué casi nada?» (p. 99–100). No escribe nada en el calendario; deja la nota en la conversación o en el
diario si el dueño quiere.

### Paso 1 · La temporada: 8 a 12 semanas, una meta y un premio

La temporada es nuestra (el libro salta de la semana al año); se usa porque un año es demasiado lejos para quien
empieza. Preguntas, en orden:

1. «Imagina el último día de esta temporada. Descríbelo con detalle: números, personas, lugar» (p. 248).
2. «¿Cuál es la meta medible de esta temporada? Una sola.» Si ya tiene su meta a 90 días en su memoria
   (`.claude/memory/project/meta-90-dias.md`), parte de ella y propónsela.
3. «¿Cuándo empieza y cuándo cierra?» Recomienda 8 a 12 semanas, con inicio en lunes.
4. «¿Qué premio te vas a dar al cerrarla?» Algo que de verdad quiera (un viaje, una compra, un día libre).
5. «¿Qué tres cosas tienen que estar cumplidas para decir que lo lograste?» (hasta 3 criterios).
6. «Dame 10 ideas para llegar. Califica cada una de 1 a 10 en impacto en dinero, confianza y facilidad» (ICE,
   p. 261–262). Se quedan las 2 o 3 mejores.
7. «¿Qué fechas no se mueven: viajes, cumpleaños, compromisos, lanzamientos?» (p. 263).
8. «¿Dónde vas a necesitar descanso después de un esfuerzo grande?» (p. 264).
9. Prueba: «Si cumples esto, ¿vas a decir "qué temporada tan increíble"? ¿Te emociona o te abruma?» (p. 266). Si no,
   se ajusta antes de guardar.

**Fijar el periodo (la app nace sin temporada).** Mientras no haya periodo, la franja de arriba del Calendario dice
«Temporada — · Arma tu temporada con Levy» y no hay «Día N» ni cuadrícula de temporada en «Hábitos de hoy». Con su
«va», Levy la guarda en una línea, desde la carpeta `arbrain/` del cerebro:

```bash
npx tsx src/lib/planning/temporada-cli.ts fijar --desde AAAA-MM-DD --hasta AAAA-MM-DD \
  --premio "<el premio>" --meta "<la meta medible>" [--nombre "<nombre de la temporada>"] \
  [--cumplir "<criterio 1>" --cumplir "<criterio 2>" --cumplir "<criterio 3>"] \
  [--premio-desde AAAA-MM-DD --premio-hasta AAAA-MM-DD] [--por-firmar] [--arranque AAAA-MM-DD]
npx tsx src/lib/planning/temporada-cli.ts ver      # comprobar: «Día N de X», premio, meta y criterios
```

- Queda en `.claude/plan/temporada.json` de su cerebro (junto a `calendario.json` y `objetivos.md`); la app lo lee por
  `/api/planning/temporada` y lo pinta al volver a la ventana. También se puede editar a mano.
- `--desde` es el día 1; `--hasta` es el día del cierre y ya no cuenta (del 2 nov al 1 dic son 29 días). El premio y
  las fechas son obligatorios; la meta es la línea que se ve en la franja. `--cumplir` se repite (hasta 6; con 3 basta).
- `--premio-desde/--premio-hasta` solo si el premio es un viaje o un evento con fechas; `--por-firmar` si aún no está
  confirmado. `--nombre` es el rótulo de la franja y de la temporada de hábitos (sin él: «Temporada»); `--arranque`, el
  día desde el que cuentan los hábitos (sin él: el día 1).
- `temporada-cli.ts quitar` deja «sin temporada» (la franja vuelve a invitar). Levy siempre corre `ver` después de
  escribir para comprobarlo.
- Un periodo nuevo no pisa uno vigente sin preguntar: «ya tienes una temporada hasta el <fecha>; ¿la cierras y
  empiezas otra?».

Además escribe las piedras grandes (fechas que no se mueven, descansos) como eventos de día completo en el calendario.
**No** escribe rutinas ni tareas en este paso.

### Paso 2 · El mes: un objetivo, sus criterios y sus hitos

El mes con criterios también es nuestro. Preguntas:

1. «De tu temporada, ¿qué tiene que estar terminado al final de este mes?» Un objetivo, comprobable el último día.
2. «¿Cómo sabremos que se cumplió?» De 2 a 4 criterios (casillas).
3. «¿Qué hitos caen este mes y en qué semana?» Son las piedras grandes del mes.
4. «¿Hay algo que puedas juntar en un solo día del mes: grabar, facturar, llamadas?» (p. 173).

Escribe: el objetivo con `plan.py mes` (skill `bajar-a-tierra`); los criterios en el registro de objetivos (`success`,
ver `arbrain-planificacion.md`) o como casillas; los hitos como eventos de día completo. **No** escribe hábitos
diarios: el mes no se ensucia con rutinas.

### Paso 3 · La semana perfecta: un ritmo que se repite

Se arma una vez y se reusa. Preguntas:

1. «¿A qué hora piensas mejor? Ahí va tu bloque de enfoque» (p. 176–177).
2. «¿Qué días y horas recibes llamadas o reuniones? Todo lo nuevo se manda ahí» (p. 134).
3. «Mete primero lo importante, lo de trabajo y lo personal: ejercicio, pareja, familia» (p. 179).
4. «¿Qué tareas odias pero tienes que hacer? Las juntamos en un solo bloque» (p. 173–174).
5. «¿A qué hora cierras el día y te desconectas?» (p. 174).

Escribe dos cosas distintas:

- **La plantilla (lo ideal)**, que la Semana pinta como bloques fantasma tenues detrás de la semana real (engrane ›
  DRIP › «Semana perfecta»). Vive en el almacén DRIP del cerebro (`.claude/plan/drip.json`, campo `semana`). Desde
  `arbrain/`: `npx tsx src/lib/planning/semana-perfecta-cli.ts agregar lun-vie 07:00-09:00 "Trabajo fuerte" producir`,
  `… ver`, `… quitar <n>`, `… vaciar` (sin cuadrante, Levy lo infiere).
- **Las series (lo agendado)**: eventos que se repiten (`repetir` en `calendario.json`, o `--rrule` en el calendario
  conectado), solo para lo que el dueño quiere ver como evento. Deja holgura
entre bloques: una semana apretada se rompe el martes. «No va a salir perfecta; en dos o tres semanas la ajustamos»
(p. 178).

Cada semana después solo pregunta: «¿qué es lo único de esta semana?» y escribe de 3 a 5 resultados con
`plan.py semana`.

### Paso 4 · El día: un toque cada mañana y 3 casillas

Cinco minutos, no más:

1. «Este es tu día según tu semana. ¿Cambió algo?»
2. «¿Cuál es el resultado de hoy y tus 3 casillas?» Escribe con `plan.py dia`.
3. Si entra algo nuevo: «para meter esto, sale tal bloque; ¿vale un "sí, sin duda"?» (p. 175, 267).

Escribe solo los cambios y el objetivo del día. **No** reacomoda la semana entera por una urgencia. Si el dueño manda
su diario esa mañana, el pipeline de `diario.md` hace de sensor y el toque es su confirmación: un solo ritual.

### Paso 5 · La revisión del domingo: una pantalla, una propuesta

Sobre la revisión de `planning.md`, Levy junta en un solo mensaje (y la app en una sola pantalla):

1. **Plan vs real:** lo que se planeó y lo que tiene evidencia.
2. **Los tres números del domingo:** horas en Producir; interrupciones en Reemplazar o Delegar (avisos que pidieron
   decisión; si la instalación no los registra, la pantalla dice «sin medir», nunca cero); y la tasa de recompra, que se
   edita ahí mismo, con las horas recompradas debajo.
3. **El asesino del tiempo** que apareció, si hubo uno.
4. **Una sola propuesta** para la semana que viene, que se aprueba con un toque y se puede deshacer.

Pregunta opcional del libro (p. 283–284): «Del 1 al 10: salud, pasatiempos, espiritualidad, amigos, amor, finanzas,
misión. ¿Cuáles dos van primero en tu semana que viene?».

**Dónde vive.** En el Calendario, el botón «Revisión del domingo» de la barra de accesos (Día, Semana o Mes) la abre;
los domingos se abre sola una vez. Compara contra la **foto del plan**: lo que había en el calendario la primera vez que
se leyó la semana entera (si no había foto, se toma al abrir y se dice). La foto vive en el almacén DRIP (`fotos`, una
por lunes); Levy ve qué semanas tienen foto con `npx tsx src/lib/planning/drip-cli.ts ver` (desde `arbrain/`) y lee el
plan real del calendario con la pluma de siempre (`calendario.json` o el calendario conectado).

## Los tres números (y nada más a la vista)

1. **Día N de la temporada** (antes de empezar: «Empieza en N días»; sin periodo: «—» y la invitación a armarla).
2. **Horas en Producir esta semana.**
3. **Horas recompradas** (horas × tarifa de recompra; sin tarifa, solo las horas).

## DRIP: en qué cuadrante cae cada bloque

Dos preguntas por bloque: ¿te deja dinero? ¿te da energía? (p. 50–58).

| Cuadrante | Qué es | Ejemplos |
|---|---|---|
| **Producir** | Mucho dinero y te enciende. Aquí quieres la mayor parte del tiempo. | Atender clientes, vender lo tuyo, crear tu oferta, el trabajo por el que te pagan y que disfrutas. |
| **Invertir** | Poco dinero hoy, pero te enciende. Siempre debe haber algo aquí. | Ejercicio, familia, estudiar, descansar, tus rutinas. |
| **Reemplazar** | Te deja dinero pero te drena. Es donde uno se atora. | Tareas de operación que se repiten, seguimiento, soporte. |
| **Delegar** | Poco dinero y te drena. Sácalo cuanto antes. | Agenda, correos de trámite, facturas, pasar datos de un lado a otro. |

- **Levy infiere** el cuadrante por el título, el tipo de bloque y lo que el dueño ya corrigió (una corrección vale
  para toda la serie). El dueño lo corrige con un toque en el Calendario o diciéndolo en el chat.
- **Pregunta poco:** solo si duda y el bloque pesa (2 horas o más, o se repite), y como máximo tres dudas juntas en la
  revisión del domingo.
- La app guarda la corrección por serie o por título en `.claude/plan/drip.json` de su cerebro (ruta
  `/api/planning/drip`). Levy lo lee y lo escribe desde `arbrain/`: `npx tsx src/lib/planning/drip-cli.ts ver`,
  `… inferir "<título>"` (qué diría, sin escribir), `… corregir "<título>" producir|invertir|reemplazar|delegar`
  (`levy` quita la corrección) y `… delegar "<título>" [--a Levy] [--quitar]`. En la app se ve «corregido por Levy».
- Lo de Delegar (y lo de Reemplazar que se repite) aparece con la etiqueta **delegable**. Es una propuesta; decide el
  dueño.

## A quién delegar cuando casi no hay presupuesto

El libro supone dinero para contratar un asistente (p. 133). Quien empieza casi nunca lo tiene. Por eso el orden es:

1. **Primero a Levy.** Lo delegable se le ofrece a Levy antes que a una persona: redactar, ordenar la agenda, resumir,
   preparar documentos, investigar. Levy prepara; enviar, publicar, pagar o borrar sigue siendo del dueño.
2. **Lo que se repite se vuelve receta.** Si la misma tarea aparece tres veces, Levy propone fijarla: el dueño la hace
   una vez explicándola y Levy la guarda como receta o procedimiento para repetirla (el Camcorder Method del libro,
   p. 149–150).
3. **Después, personas.** Cuando la tarifa de recompra alcanza para pagar una hora de alguien, esa tarea pasa a una
   persona.

## La tarifa de recompra

Lo que te paga tu negocio al año ÷ 8,000 (p. 63). Es lo máximo que vale pagar por quitarte una hora de encima (¼ de tu
tarifa efectiva por hora). Ejemplo del libro: 50,000 al año → unos 6.25 por hora (p. 64).

- **Nace vacía.** Levy no la inventa. Si el dueño quiere calcularla, le pregunta su ingreso anual (o el mensual × 12),
  le muestra la cuenta y la guarda con su «va». Si todavía no factura, se queda vacía y se dice: las horas recompradas
  se muestran solas, sin valor.
- Vive en el mismo almacén DRIP (`tarifa` en `.claude/plan/drip.json`). El dueño la fija en el engrane del Calendario
  › DRIP › «Tarifa de recompra»; Levy, con su «va», desde `arbrain/`: `npx tsx src/lib/planning/drip-cli.ts tarifa
  <por hora> [moneda]`, `… tarifa --ingreso <al año> [moneda]` (hace el ÷ 8,000) o `… tarifa ninguna`.
- Subirla con el tiempo es parte del juego (p. 65).

**Una hora recomprada** es una hora que antes estaba en tu agenda en Delegar o Reemplazar y ahora la hace otro (Levy,
una receta o una persona), que se hizo de verdad y que ya no ocupa tu agenda. Se cuenta una vez por vez que pasó, no
por promesa. Si la hora liberada no se llenó con Producir o Invertir, Levy lo dice en la revisión.

## Los 5 asesinos del tiempo (sin datos sensibles)

Las definiciones son del libro (p. 77–85); la señal en la agenda es una lectura nuestra.

| Asesino | Señal en la agenda |
|---|---|
| **El que pospone** | Un bloque de «decidir X» que se mueve semana tras semana. |
| **El acelerado** | El mismo tipo de evento que vuelve a intervalos: rehacer, cambiar de herramienta, empezar de cero. |
| **El supervisor** | Muchos bloques de revisar o rehacer lo que ya delegaste; ninguno de enseñar el proceso. |
| **El ahorrador** | Horas de Delegar que siguen en tu agenda semana tras semana, aunque Levy o alguien podría hacerlas. |
| **El que se automedica** | Solo el patrón: después de un logro o un golpe, mañanas cuyos primeros bloques se pierden. |

- Se nombra el patrón de agenda y nada más. **Nunca** se registra ni se adivina la causa (salud, consumos, ánimo).
- Los hábitos privados no se usan como señal ni se mencionan en la revisión.
- Uno por semana como máximo, y solo con al menos dos semanas de señal. Sin señal, no se menciona.

## El actuador y sus frenos

- **Mover un bloque:** con la pluma de su objeto (`calendario.json` o el calendario conectado, ver
  `tiempo-y-calendario.md`), leyendo antes de escribir.
- **No borra eventos** sin pedido explícito del dueño.
- **No toca eventos con invitados** (reuniones, clases, llamadas con otras personas) sin su pedido para ese evento.
- Mover una piedra grande pide la pregunta: «¿es un sí, sin duda?».
- La propuesta del domingo se aplica solo con su toque o su sí, y se puede deshacer.
- **Tareas:** solo las que el dueño pide (dictadas, de su diario o «anótalo»), en su casa única (ver `SKILL.md`).
- Lo personal (familia, ejercicio, sueño) no son bloques disponibles: son compromisos.

## Los diez principios en la era de agentes

Con agentes, el trabajo ejecutado es casi gratis; lo escaso es la **atención** del dueño y sus decisiones. Cada
principio del libro se traduce a esa moneda. «—» = vive en la conducta de Levy, sin pantalla propia.

| Principio (libro) | Qué es | Cómo lo aplica Levy | Dónde se ve |
|---|---|---|---|
| **Tasa de recompra** (cap. 2, p. 63) | Lo que te paga tu negocio al año ÷ 8,000. | Solo se fija con un dato real y el sí del dueño; sin ella, «—». | Revisión del domingo (campo) y engrane › DRIP. |
| **…y su versión de atención** (nuestro) | Lo que cuesta es cada decisión que un agente te sube. Una regla firmada recompra cientos. | Cuenta las interrupciones en Reemplazar/Delegar y propone la regla que las elimina: «¿requiere tu presencia o solo tu permiso?». Escalera de autoridad: borrador → con tu va → publica y avisa → publica solo bajo regla firmada. | Domingo, segundo número. |
| **1:3:1** (cap. 9, p. 183–189) | 1 problema, 3 opciones, 1 recomendación. | Ningún agente le lleva al dueño una pregunta abierta. | — |
| **Definición de Terminado** (cap. 9, p. 183–189) | Qué cuenta como hecho; para lo grande: hechos, sentimientos, funcionalidad. | Ningún encargo sale sin escribir cómo se verifica hoy. | — |
| **Método Videocámara → skill** (cap. 7, p. 149–150) | Grabar la tarea mientras se hace y se explica. | Lo que el dueño repite se vuelve skill tras la segunda vez: lo hace una vez en voz alta y Levy lo escribe. | Domingo › Actuador. |
| **Semana Perfecta** (cap. 8, p. 173–179) | Una semana tipo, por energía, lo importante primero. | Se diseña una vez (`semana-perfecta-cli.ts`) y se ajusta en 2–3 semanas. | Semana: bloques fantasma; interruptor en el engrane. |
| **Año Precargado** (cap. 14, p. 259–267) | Las piedras grandes antes que las piedritas; prueba de estrés. | Escribe premios, viajes y lanzamientos como eventos de día completo; moverlos pide «¿es un sí, sin duda?». | Mes: caja «Año precargado» (premio, viaje y lanzamiento primero). |
| **Escalera de reemplazo** (cap. 5) | Soltar en orden: administración → entrega → marketing → ventas → liderazgo, pasando la propiedad del resultado. | Ubica cada propuesta de delegar en su peldaño; Levy cubre primero administración. | — |
| **Línea del Dolor** (cap. 1) | Donde crecer empieza a doler: vender, sabotear o estancarse. | La lee como señal de recomprar, con evidencia de agenda, nunca como diagnóstico de ánimo. | — |
| **Los 5 asesinos** (cap. 3, p. 77–85) | Staller, Speed Demon, Supervisor, Saver, Self-Medicator. | Señal de agenda, uno por semana (sección de arriba). Con agentes renacen el Supervisor (revisar cada borrador) y el Speed Demon (lanzar agentes sin decir qué decisión te devuelven). | Domingo › Atenuador. |

## Lo que es del libro y lo que es nuestro

- **Del libro:** DRIP, los 5 asesinos, la tarifa de recompra, la semana perfecta, el año precargado, el Camcorder
  Method y el ciclo auditar → trasladar → llenar (p. 33).
- **Nuestro:** la temporada de 8 a 12 semanas con premio, el mes con criterios, la revisión del domingo en una pantalla,
  los tres números, la señal de agenda de cada asesino y que el primer «a quién delegar» sea Levy.
