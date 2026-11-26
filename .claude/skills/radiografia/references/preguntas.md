# Las preguntas, en orden

Cada bloque dice qué preguntar, qué campo de `radiografia.json` llena y qué hacer si el dueño no sabe. Las frases son
punto de partida: **adáptalas a su industria** (una clínica tiene pacientes y citas; un taller, clientes y órdenes;
una ferretería, cotizaciones y pedidos). Usa sus palabras, no las de este archivo.

En la llamada: una pregunta por mensaje, el dueño habla dos tercios del tiempo y tú anotas. Cuando pidas un número,
pide también **de dónde sale** («¿eso lo ves en algún lado o es a ojo?»): la fuente va al lado del número.

Si el dueño no sabe un número, no lo corrijas ni lo adivines: escríbelo `valor: null` con `como_medirlo` («contarlo
una semana en la libreta», «sacarlo del reporte de la terminal») y sigue. Un número que nadie mide es un hallazgo.

## Las letras del diagnóstico de 30 minutos

En la llamada exprés se recorren cuatro letras con números: **R** (alcance: cuánta gente ve el negocio y por dónde)
→ Adquisición · **A** (acción: cuántos piden informes, agendan o cotizan) → Nutrición · **C** (conversión: cuántos
compran) → Conversión · **E** (engagement: cuánto compra un cliente en un año y cuántos vuelven) → Expansión. La
Radiografía completa agrega Bienvenida, Entrega, las tareas a mano y los números del negocio.

## 0 · Arranque (2 a 3 minutos)

| Pregunta | Llena |
|---|---|
| «¿Te parece si te hago unas preguntas de cómo funciona tu negocio hoy y al final te digo dónde veo que se atora?» | (permiso) |
| «¿Qué te gustaría que pasara en tu negocio en los próximos 3 meses?» Si responde en abstracto: «¿cómo sabrías que pasó? ¿qué número cambia?» | `meta.texto` |
| «¿Qué vendes y a quién?» | `contexto.que_vende`, `contexto.a_quien`, `giro` |
| «¿Quiénes trabajan contigo y qué hace cada quien?» (por rol, sin nombres) | `contexto.equipo` |
| «¿Con qué llevas el negocio? Excel, papel, WhatsApp, algún programa…» | `contexto.herramientas` |

## 1 · Cómo llegan sus clientes (marketing)

**Adquisición:** cómo se enteran de que existe.

- «Piensa en tus últimos 10 clientes nuevos: ¿cómo llegó cada uno?» (mejor que «¿de dónde llegan?»: da hechos, no
  opiniones).
- «¿Cuántos clientes nuevos te llegan a la semana o al mes?» → `numero` de Adquisición.
- «¿Qué haces tú para que lleguen? ¿Algo que hacías antes y dejaste de hacer?»

**Nutrición:** qué pasa entre que se enteran y que piden precio.

- «Cuando alguien se interesa, ¿qué hace? ¿Te escribe, llama, viene?»
- «¿Cuántos te piden precio, cotización o cita a la semana?» → `numero` de Nutrición.
- «¿Qué ven de ti antes de comprar? Lista de precios, catálogo, reseñas, casos…»

## 2 · Cómo vende (venta)

**Conversión:**

- «Cuéntame paso a paso qué pasa desde que alguien te pide precio hasta que te paga.» Que lo cuente como una historia;
  anota cada paso y quién lo hace.
- «¿Cuánto tarda en salir una cotización (o en darse una cita)?»
- «De los que piden precio, ¿cuántos compran?» → `numero` de Conversión (puede ir como texto: «12 de 35»).
- «¿Qué pasa con los que no compran? ¿Alguien les da seguimiento?»
- «¿Por qué crees que no compran?» Su respuesta, entre «», va a la evidencia si apunta al cuello.

## 3 · Cómo entrega (entrega)

**Bienvenida:** los primeros días de un cliente nuevo.

- «Cuando alguien te compra por primera vez, ¿qué recibe? ¿Le explicas cómo trabajas, qué sigue, a quién llamar?»
- Si no existe, escríbelo así: `opera_hoy: false` y en `que_pasa` qué pasa en su lugar.

**Entrega:**

- «Cuéntame cómo se entrega un pedido, un servicio o una cita, de principio a fin.»
- «¿Qué sale mal más seguido? ¿Cada cuánto?» → `numero` de Entrega (errores, retrasos, devoluciones, rehacer).
- «¿Qué depende solo de ti? Si te vas una semana, ¿qué se detiene?»

**Expansión:** si vuelven, compran más o recomiendan.

- «¿Cuántos de tus clientes vuelven a comprar? ¿Cada cuánto?» → `numero` de Expansión.
- «¿Cuánto te compra un cliente en un año?»
- «¿Les pides que te recomienden? ¿Les avisas de algo nuevo?»

## 4 · Qué se repite a mano

El inventario que paga la Radiografía. Recorre las etapas de nuevo y pregunta por cada una:

- «¿Qué haces o hace tu equipo todas las semanas, igual, a mano?» Pistas: copiar datos de un lado a otro (WhatsApp a
  libreta, papel a Excel), armar cotizaciones o reportes, cuadrar la caja, confirmar citas, perseguir pagos, contestar
  las mismas preguntas, revisar existencias.
- Por cada tarea: **quién** la hace, **cuántas veces a la semana**, **cuántos minutos** cada vez, **con qué** y **qué
  error** sale cuando sale mal. En la Radiografía completa, cronométrala o pídele al equipo que la anote una semana.
- → `tareas_a_mano` (una por tarea, con su `etapa`). Con 5 a 8 tareas basta; quédate con las que más horas comen.

## 5 · Números básicos

Pide cada uno con su fuente y su fecha. El que no exista, «por medir».

| Número | Pregunta | Para qué |
|---|---|---|
| Ventas del mes | «¿Cuánto vendiste el mes pasado? ¿De dónde lo sacas?» | El tamaño del negocio y la meta |
| Ticket o pedido promedio | «¿Cuánto te deja una venta típica?» | Las ventas que se pierden en el cuello |
| Margen | «De cada 100 que vendes, ¿cuánto te queda después de pagar la mercancía o el material?» | Si crecer ventas sirve o hay que cuidar costos |
| Clientes activos o que vuelven | «¿Cuántos clientes te compraron este mes? ¿Cuántos ya te habían comprado?» | Expansión |
| Costo por hora del equipo | «¿Cuánto pagas al mes de sueldos y cuántas horas trabaja el equipo?» (sueldos ÷ horas) | Convertir las horas a mano en dinero. Va con `"clave": "costo_hora"` |

## 6 · El cuello, en voz alta (2 a 5 minutos)

Compara las etapas con sus números: «Te piden 35 precios a la semana y compran 12; de lo demás que me contaste, nada
pierde tanto. La etapa donde más se pierde es esta.» Pregúntale si le hace sentido. Su respuesta, entre «», va a la
evidencia del cuello. Si los números no alcanzan para saberlo, díselo: «el primer hallazgo es que no sabemos dónde
se pierde; lo primero es medir esto».

Cierra con el siguiente paso de la oferta del consultor (`02-oferta.md`), en una línea: «Mañana te mando una página
con esto. Si quieres, lo resolvemos juntos.» El precio, la garantía y los bonos los dice el consultor, de su hoja.
