# Mi camino: dónde va en el programa y qué sigue

Para el dueño que está en el programa **Cerebro Artificial** (acompañamiento de 90 días de arbrain.ai). Su Levy sabe en
qué parte exacta del camino va, le dice su siguiente paso concreto y le ofrece hacerlo con él ahí mismo. Si el dueño no
es del programa (no hay `project/mi-camino.md` ni expediente), esta referencia no aplica.

## La fuente viva: `project/mi-camino.md`

Lo trae el puente con arbrain.ai al conectar, cada vez que Arbrain arranca y cada mañana. Ya lo tienes en tu contexto
(el `CLAUDE.md` lo importa). Trae: día N de 90, semana, etapa y paso; sus cinco casillas; su siguiente paso; el
siguiente hito; la lección actual; su meta y su número más reciente.

- `python3 .claude/skills/bajar-a-tierra/scripts/plan.py estado` devuelve `camino`: `dia_hoy` y `semana_hoy`
  (recalculados desde su inicio), `fresco` (si lo traído es de hoy), `siguiente_paso` y `casillas_faltan`.
- Si `fresco` es falso, di «según lo último que traje (fecha)»: el día sí avanzó, pero sus casillas pudieron cambiar en
  arbrain.ai.
- Si dice «pendiente» o no existe: no estás conectado. No adivines su día ni sus casillas. Usa el mapa de abajo,
  pregúntale en qué va y ofrécele conectar su cerebro (Ajustes › Privacidad › «Conectar con arbrain.ai»).
- Lo que dice el dueño hoy manda sobre el archivo. Si te dice «ya marqué la 4», créele y sigue.

## El mapa del programa

**La promesa:** en 90 días, su Cerebro Artificial trabajando para él y sus primeros 3,000 USD al mes vendiéndolo a
negocios, sin contratar a nadie ni vender sus horas. Su vehículo: consultor de negocios con IA en la industria que ya
conoce por dentro.

**El día 1 es el lunes 26 de octubre de 2026.** 90 días y 12 semanas, contadas desde ahí; del miércoles 21 al domingo
25 de octubre es la **Semana 0** (instalación). El día 90 es el sábado 23 de enero de 2027.

### Las 5 etapas

Fechas de la cohorte fundadora (las mismas que muestra Mi camino en arbrain.ai). Si `mi-camino.md` dice otra cosa,
manda el archivo.

| Etapa | Semanas | Fechas | Qué sale | Módulos en Cursos |
|---|---|---|---|---|
| 1 · Tu cerebro | 0 y 1 | 21 oct a 1 nov | Su cerebro instalado, conectado a su meta y trabajando para él todos los días | 1 · Instala tu cerebro artificial y primeros pasos; 2 · Los principios de un cerebro artificial |
| 2 · Supernova | 2 y 3 | 2 a 15 nov | Su oferta (nicho, vehículo, canal y porqué) escrita en una página y cargada en su Levy | 3 · Supernova |
| 3 · Primer cliente | 4 a 7 | 16 nov a 13 dic | Marketing a su red caliente y ventas hasta el primer sí cobrado | 4 · Cierra tu primer cliente |
| 4 · Entrega | 8 y 9 | 14 a 27 dic | Entrega a su cliente con su cerebro y el antes y después documentado | 5 · Entrega con el sistema |
| 5 · Escala | 10 a 12 | 28 dic a 23 ene (día 90) | Clientes recurrentes hacia los 3,000 USD al mes y un canal que se repite | 6 · Repite y escala |

El módulo 7, «Llamadas y Recursos de Valor», está siempre abierto: ahí queda grabada cada grupal. Los demás se abren a
su tiempo en Cursos; si uno sigue con candado, díselo tal cual, no lo rodees.

### Módulo 1: las 7 lecciones y su objetivo

1. **Bienvenida: cómo funciona el programa.** Sabe la promesa, el camino de 12 semanas y cómo pedir ayuda.
2. **Qué es un cerebro artificial.** Lo distingue de un chat: es un bucle hacia su meta (memoria, habilidades, rutinas
   y manos).
3. **Instala tu cerebro.** Arbrain instalado con un solo prompt en Claude Code.
4. **Tu suscripción de Claude es tuya.** Usa su plan Pro o Max sin pagar API («Usar mi Claude Code» en Ajustes › Llaves).
5. **Voz y teléfono.** Le habla a su Levy (llave de Groq en Ajustes › Voz) y tiene arbrain.ai en su teléfono con avisos.
6. **Tu meta en tres niveles.** Meta del mes, de la semana y del día escrita en su plan (su casilla 3).
7. **Tu primer hábito.** Un hábito diario que su cerebro le ayuda a sostener, y el ritual de la mañana (su casilla 4).

### Las 5 casillas de la semana 1

Las marca **él**, en arbrain.ai › Mis cinco casillas (`/programa/semana-1`), con su evidencia. Tú no puedes marcarlas
ni publicar por él: preparas, él publica y marca.

1. **Bienvenida vista y acuerdo aceptado.** Se marca sola al aceptar su acuerdo.
2. **Su cerebro instalado y sembrado: te saludó sabiendo quién es.** Evidencia: su reporte de instalación y el video o
   captura del saludo en el hilo de la Semana 1. Si ya está hablando contigo y lo conoces, solo le falta marcarla.
3. **Su meta en un número, con fecha, escrita en su plan.** Mes, semana y día en `objetivos.md` (esta skill) y
   compartida en el hilo.
4. **Su ritual de la mañana y tres encargos reales hechos con su Levy.** El ritual: cada mañana escribe «buenos días»
   y tú le respondes con su foco de la semana y su día (esta skill), más su primer hábito creado contigo. Los tres
   encargos: trabajo real que tú preparas y él usa, sacado de los procesos que más odia o de su red caliente (por
   ejemplo, un correo a un cliente, una propuesta, ordenar una lista de contactos). Evidencia: su check-in en el hilo,
   los tres encargos en una línea cada uno.
5. **Se presentó en la comunidad y tiene arbrain.ai en su teléfono con avisos.** La presentación es un comentario en el
   post fijado «Bienvenidos, fundadores» con la plantilla de la lección 1; tú se la dejas llena con su expediente.

Con las cinco marcadas se abre la agenda de su **primer uno a uno** (en `/programa/diagnostico`).

### Los uno a uno con el mentor

Cuatro, en momentos clave (30 minutos). Son «uno a uno», no «diagnósticos». La fecha viva llega en
«Siguiente hito» de `mi-camino.md`; si ya agendó, manda su día.

1. **Tu cerebro instalado.** Del 29 oct al 1 nov, al cerrar Tu cerebro (semana 1). Se abre con las cinco casillas.
   Sale con su camino de 12 semanas y lo que hará los siguientes 7 a 10 días.
2. **Tu oferta.** Del 12 al 15 nov, al cerrar Supernova (semana 3): oferta, nicho, vehículo y canal ajustados antes de
   vender.
3. **Tu primer cliente.** Del 10 al 13 dic, al cerrar Primer cliente (semana 7): pipeline, cierre y arranque de la
   entrega.
4. **Cierre y siguiente nivel.** Del 7 al 10 ene, en Escala: revisión contra su meta, testimonio y continuidad.

**Grupales:** miércoles y viernes a las 12:00 (CDMX), más una tercera que se decide en la comunidad. **Dudas:** las
técnicas en el post fijado «Sugerencias Arbrain»; lo demás, en el hilo de la Semana 1. Nada por WhatsApp.

## Cómo guías («buenos días», «¿qué sigo?», «¿en qué voy?»)

1. **Dónde va, en una línea, con sus números:** «Día 3 de 90, semana 1: te falta la casilla 4». Si no está fresco,
   «según lo último que traje el 28 oct». Sin números que no estén en el archivo.
2. **Su siguiente paso concreto:** el de `mi-camino.md`, traducido a qué significa con el mapa de arriba. Uno solo.
3. **Ofrécele hacerlo contigo, ahí mismo**, en una pregunta. Según el paso:

| Su siguiente paso | Lo que le ofreces |
|---|---|
| Acuerdo o expediente | Se hace en arbrain.ai (dale el enlace). Si quiere, piensan juntos sus respuestas; él las escribe allá. |
| Casilla 2 (instalar) | Ya te habla: dile qué evidencia subir (su reporte y el saludo) y que la marque. |
| Casilla 3 (meta) | Bajar a tierra ahora: mes, semana y día con esta skill. Luego le dejas el texto para el hilo. |
| Casilla 4 (ritual y encargos) | Hacer el ritual ahora (este «buenos días» ya cuenta) y el primer encargo real: propón tres, de sus procesos odiados o su red caliente, y empieza por el que elija. Al tercero, le dejas su check-in de tres líneas. |
| Casilla 5 (presentarse) | Dejarle su presentación llena con su expediente, lista para que él la pegue. |
| Su uno a uno | Que lo agende en `/programa/diagnostico`; ofrécele un resumen de 5 líneas (meta, dónde va, qué le atora) para llevar. |
| Una lección | Explicársela en corto o hacer con él su tarea. |

4. **Sin presión:** una sola oferta. Si dice que no o que después, respétalo y sigue con lo que pidió. No le recuerdes lo
   mismo en la misma conversación ni le programes recordatorios que no pidió.
5. **Sin inventar:** no supongas casillas, fechas ni avances. No marques nada como hecho por él.

Con «buenos días», esta línea va **antes** del ritual: primero dónde va y su siguiente paso, luego lo que falte de mes,
semana o día (el ritual de `SKILL.md`). Si su siguiente paso es la casilla 3 o la 4, el ritual mismo es la forma de
hacerlo: dilo así y empiecen.
