# El guion: la voz del dueño con estructura que retiene

El video con más vistas no siempre es el que más clientes trae. Un guion se escribe para que el avatar se quede, entienda
y dé el siguiente paso, no para la vanidad.

## Paso 0: lo que necesitas saber

Si el video viene de `ideas.md`, ya tienes casi todo. Si no, pregunta solo lo que falte, en un mensaje:

1. Tema y promesa (qué se lleva el espectador).
2. Formato (abajo). Si no lo dice, propónlo según el tema.
3. Duración objetivo.
4. Puntos que sí o sí quiere decir, y qué demo o prueba tiene.
5. La llamada a la acción: por defecto, el destino de `canal.md`.

Luego carga, en este orden: `project/youtube/voz.md` (su voz), la oferta (`project/mi-negocio/02-oferta.md`: avatar,
dolores, palabras que usa su cliente) y la ficha del canal.

## La voz del dueño

El guion tiene que sonar a él, no a una IA. La voz se arma **una vez** y se guarda en `project/youtube/voz.md`:

- **De dónde sale:** el texto de 2 o 3 de sus videos o audios. La vía más simple: que abra uno de sus videos en
  YouTube, use «Mostrar transcripción» y te pegue el texto. Si te da un archivo de audio o video, transcríbelo en su
  máquina con `python3 .claude/skills/edicion-de-video/scripts/transcribir_local.py <archivo> --salida <carpeta>` (el
  audio no sale de su computadora). Si no tiene nada grabado, pídele que te cuente el tema del video en un audio de 3
  minutos, o que te escriba cómo lo explicaría en sus palabras, y extrae la voz de ahí.
- **Qué se anota:** ritmo (frases cortas o largas, cuántas palabras por minuto habla), cómo abre, cómo transiciona,
  sus analogías favoritas, sus palabras y muletillas propias, cómo cierra, qué palabras nunca usaría. Cada rasgo con
  una cita real de su transcripción.
- **Cómo se usa:** como vara, no como plantilla. Se copian el ritmo y las costumbres, no las frases.

Anti-patrones que delatan a la IA y se reescriben siempre: «en el panorama actual», «es importante señalar», «cabe
destacar», «sumérgete», párrafos largos, tono de gurú motivacional, explicar lo que vas a hacer en vez de hacerlo.

## Los formatos

Se elige uno antes de escribir. Mezclarlos confunde la promesa.

| Formato | Cuándo | Estructura |
|---|---|---|
| **Demostración** | mostrar cómo se hace algo, en vivo | resultado primero → para quién y qué necesitas → la preparación en 60 s → construir en pantalla narrando decisiones (no cada clic) → el resultado funcionando → qué puedes hacer con esto → cierre |
| **Opinión o tesis** | una postura fuerte sobre el mercado | tesis en una frase → 2 o 3 evidencias → el contraargumento honesto → su postura con ejemplo propio → qué pasa si cambias y si no → cierre memorable |
| **Dolor** | un problema específico del avatar | el dolor en primera persona del avatar → las consecuencias → por qué pasa (sin culparlo) → la salida → el antes y después real → cierre |
| **Caso** | la transformación de un cliente (con su permiso) | el resultado → dónde estaba antes → el punto de quiebre → qué hizo paso a paso → números reales → la lección para quien mira |

## El esqueleto de 8 tiempos

Los canales educativos que mejor retienen comparten este esqueleto. Mapéalo con minutos **antes** de escribir una sola
línea y marca dónde caen la llamada escondida y el matiz honesto. Si el guion no los tiene, no está terminado.

| # | Tramo | Qué pasa |
|---|---|---|
| 1 | **Gancho, 0 a 20 s** | resultado o afirmación contraintuitiva + promesa concreta (mejor con número) + quitar la fricción («no necesitas…») |
| 2 | **Autoridad, hasta ~2 min** | se **prueba** (el sistema corriendo, un resultado propio) o se presta (una cita de alguien reconocido). Nunca «créeme» |
| 3 | **Agenda** | los puntos numerados, con el mejor anunciado al final: deja un lazo abierto |
| 4 | **Cuerpo por bloques** | un punto por bloque, con demostración; cada bloque cierra su lazo y abre el siguiente |
| 5 | **Llamada escondida, ~30 a 40 %** | dicha de pasada **justo después de un pico de valor**, en una frase, y se sigue sin pausa |
| 6 | **Matiz honesto, ~50 a 70 %** | el argumento en contra de su propia tesis, o lo que le salió mal. Sube la confianza: demuestra que no está vendiendo |
| 7 | **Números duros, ~70 a 88 %** | mediciones reales: tiempos, dinero, conteos. Solo los que existen |
| 8 | **Cierre** | una lección que sirve fuera del video, **no un resumen**, + una pregunta corta a la audiencia + el puente a otro video |

Las tres cosas que más se copian mal:

1. **La llamada escondida no es tímida.** Va en el momento exacto en que el espectador acaba de recibir algo útil. Al
   minuto 1 quema; solo al final no existe.
2. **El matiz honesto sube la retención.** Parece que el dueño se quita la razón; en realidad demuestra que no vende.
3. **El cierre no resume.** Un resumen le dice al espectador que ya se puede ir. El cierre sube un escalón y deja una
   regla.

## Retención

- **La promesa del título se paga en los primeros 2 o 3 minutos.** La retención media de muchos canales se cae antes
  de la mitad: lo que se dice después de ese punto lo oye poca gente. Si el título promete utilidad, la utilidad va
  antes que la reflexión.
- Resultado o promesa en los primeros 10 segundos; el primer dato útil antes de los 30.
- Un cambio cada 2 o 3 minutos: de cámara a pantalla, a una lámina, a una pregunta.
- Cada bloque termina con un gancho al siguiente.
- Lo que mata la retención: introducción larga sin valor, pedir la suscripción al inicio, bloques de más de 5 minutos
  sin cambio de formato, repetir lo ya dicho.

## Llamadas a la acción

- **Distribuidas, nunca una sola al final.** Orientación de partida: 1.5 a 2.5 menciones por cada 1,000 palabras, con
  la primera antes del 20 % del video y la mayoría en los primeros dos tercios. Es un punto de partida: el dueño la
  ajusta con lo que mida en su canal.
- De menor a mayor intensidad: mención natural («en mi comunidad tenemos…»), valor en contexto, prueba social (solo
  con un caso real y con permiso), directa con beneficio y, al final, directa con la razón real para actuar ahora.
- **Urgencia solo si es verdad.** Si el precio no sube ni hay cupo, no se inventa escasez.
- El destino es el de `canal.md`. No prometas un recurso que todavía no existe.

## Notas para la edición

Marca cada sección con lo que necesita quien edita, en líneas que empiezan con `> EDICIÓN:`. Tipos: texto en pantalla,
material de apoyo (qué se ve), lámina (concepto para `presentaciones` o `code-animation`), pantalla (qué se muestra),
acercamiento, acelerar un tramo repetitivo, pausa dramática, música o ambiente. Estas notas son las que luego usa
`edicion-de-video`.

## Densidad

Entre 130 y 180 palabras por minuto hablado (calibra con el ritmo real de `voz.md`). Un video de 10 minutos son
1,300 a 1,800 palabras; las demostraciones llevan menos texto porque la pantalla habla.

## La entrega

`guion/guion.md` con: título de trabajo, formato, duración estimada, número de llamadas, el mapa de los 8 tiempos con
minutos, y el guion por secciones (minuto, qué se ve, el texto, las notas de edición). Al final: palabras totales,
minutos estimados y los `[DATO: …]` que el dueño tiene que llenar.

## Revisión antes de entregar

- [ ] ¿Gancho con resultado o promesa en los primeros 10 s?
- [ ] ¿La promesa del título se paga antes del minuto 3?
- [ ] ¿Los 8 tiempos están, con la llamada escondida y el matiz honesto marcados?
- [ ] ¿Llamadas distribuidas, la primera antes del 20 %?
- [ ] ¿Un cambio de formato cada 2 o 3 minutos?
- [ ] ¿El cierre deja una lección en lugar de resumir?
- [ ] ¿Cero cifras inventadas y cero casos sin permiso?
- [ ] ¿Suena a él? Léelo en voz alta contra `voz.md`; si suena a IA, reescríbelo.

Entrégalo y pregunta qué ajustar antes de preparar láminas o grabar. El copy que dicte el dueño se peina, no se
reescribe ni se reordena.
