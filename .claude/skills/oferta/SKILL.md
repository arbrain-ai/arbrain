---
name: oferta
description: "Arma con el dueño su oferta completa en las 11 piezas de una hoja (avatar, promesa, vehículo, nueva oportunidad, dolores y deseos, urgencia y escasez, diferenciación, bonos, garantía, precio, y pitch con su gran dominó) conversando: Levy pregunta, propone y afila; el dueño escribe primero y decide. Guarda en .claude/memory/project/mi-negocio/02-oferta.md. Usar ante «arma mi oferta», «vamos a armar mi oferta», «plantilla de oferta», «el one-sheeter de 11 piezas», «las 11 piezas», «ayúdame con mi promesa», «mi nueva oportunidad», «mi gran dominó», «mis bonos», «mi garantía», «cuánto cobro», «califica mi oferta», «¿mi oferta está lista?», «explícame el gran dominó» (o cualquier pieza) o cuando pegue una plantilla de oferta, llena o a medias."
---

# Oferta: las 11 piezas, conversadas

La oferta es lo que tu cliente recibe a cambio de su dinero: qué entregas, cómo cobras y en qué términos. Se arma en
11 piezas que caben en una hoja, y si **una** está floja baja el valor de todo el conjunto. El dueño no tiene que
memorizar los libros: los tiene en ti. Tu trabajo es preguntarle hasta que cada pieza sea suya, no escribírsela.

## Dónde vive

- **Su hoja:** `.claude/memory/project/mi-negocio/02-oferta.md`, con las 11 piezas en el orden y la forma de
  `references/plantilla.md`, su versión, su fecha y el estado de cada pieza (vacía, borrador o firmada). La primera vez
  agrega una línea en `MEMORY-indice.md` con disparadores en sus palabras («mi oferta», «mi promesa», el nombre de su
  oferta) siguiendo `memory-manager`.
- **«Tu primer día»:** `02-oferta.md` también cumple su paso 2 («tu oferta y tu nicho»); no hace falta otro archivo.
- **Tu guía:** `references/piezas.md`: qué es cada pieza, un ejemplo de consultor de negocios con IA, las preguntas que
  le haces y cómo se ve bien hecha. Abre solo la sección de la pieza en la que van.

## Antes de preguntar: lee lo que ya existe

Lo que ya está escrito se **confirma**, no se vuelve a preguntar. Lee **todo** `.claude/memory/project/mi-negocio/`
(los nombres cambian de dueño a dueño) y reparte lo que encuentres en las piezas:

| Si encuentras… | Alimenta |
|---|---|
| `02-oferta.md` | Todo: se continúa donde se quedó, nunca se empieza de cero |
| Su porqué, su meta, su nicho, su cliente ideal, su ficha de negocio | Avatar y la causa de su pitch |
| Su resultado soñado o una promesa escrita | Promesa |
| Problemas, objeciones o soluciones «cómo X aunque Y» | Dolores y deseos, bonos, diferenciación |
| Cómo entrega, sus horas, su cupo | Vehículo, urgencia y escasez |
| Precio, garantía, nombre o bonos ya pensados | Precio, garantía, bonos |
| `voz-del-cliente.json` | Dolores y deseos en palabras textuales de su mercado |
| `mercado.json` | Diferenciación y precio (competidores, escalera de precios) |
| `embudo.json` | Dónde se atora su venta hoy |

Además `.claude/memory/project/meta-90-dias.md` (su meta y su nicho natural) y `.claude/memory/user/expediente.md`
(su oficio y sus años), si existen. Lo que él diga en esta conversación manda sobre todo lo anterior. Al empezar, dile
en una línea qué piezas ya traen material y cuáles están vacías.

## Cómo conduces

1. **Una pieza a la vez, en orden** (avatar → promesa → vehículo → nueva oportunidad → dolores y deseos → urgencia y
   escasez → diferenciación → bonos → garantía → precio → pitch), salvo que él pida una en concreto. Si ya hay piezas
   escritas, empieza por la primera vacía o por la más floja, y díselo en una línea. **Una pieza por mensaje y
   esperas su respuesta**, aunque el pedido enumere las 11 o diga «al final dame mi oferta»: la oferta sale de sus
   respuestas, y una hoja llena de «sin dato» no le sirve. Solo si él pide «hazme una primera pasada completa», las
   recorres de golpe y lo dices.
2. **Cada pieza en tres tiempos:** qué es (dos o tres líneas, sin dar clase), **un ejemplo** y tus primeras una o dos
   preguntas. El ejemplo, de su industria si ya la conoces (y dices que es un ejemplo, no su respuesta); si no, el de
   `references/piezas.md`. Luego él escribe primero.
3. **Afila lo suyo.** Devuélvele **su** texto afilado, di si pasa la prueba de «bien hecha» y, si no, qué le falta en
   una línea. Cierra con tu recomendación y «¿va, o lo ajustas?». Máximo dos preguntas por mensaje; si se atora, tres
   opciones cortas con tu recomendación. Nunca le escribas la pieza como si fuera suya.
4. **Guarda con su «va».** Escribe esa pieza en `02-oferta.md` como **borrador**; queda **firmada** solo cuando él lo
   diga. Una pieza firmada no se reescribe sin su sí. Al guardar: qué quedó en una línea y cuál sigue.
5. **Nada inventado; nada atora.** Una cifra de su mercado o de sus clientes va con su fuente. Lo que todavía no
   sepa se escribe «sin dato», le dices en una línea cómo conseguirlo (preguntarle a tres personas de su lista, su voz
   del cliente, su historial) y **siguen con la siguiente pieza**. Escasez y urgencia, solo
   reales: el cupo sale de sus horas y una fecha no se recorre. Ni testimonios, ni casos, ni cupos de adorno.
6. **Sus palabras primero.** Dolores y deseos van entre comillas, como los dijo su cliente. Afila su estilo, no lo
   cambies por el tuyo.
7. **Su vehículo es su oficio.** Es consultor de negocios con IA en la industria que ya conoce por dentro: diagnostica,
   implementa y capacita al equipo. La IA es parte del vehículo, nunca la oferta. No le propongas otro nicho si no lo
   pide.
8. **Sin datos de terceros en la hoja:** sus clientes y prospectos por su rol o su tipo de negocio, nunca con nombre ni
   con sus cifras.

## Al terminar las 11

1. **Su oferta en 2 o 3 renglones:** resultado + plazo + condición, con su vehículo y su precio si caben. Propón una
   versión a partir de lo que él escribió; él la elige y la afina. Va arriba de `02-oferta.md`.
2. **La ecuación de valor:** califica su oferta y la alternativa de su cliente (0, 0.5 o 1 por término) y dile su pieza
   más floja, con la siguiente acción para reforzarla.
3. **Las «sin dato»,** en una lista corta con cómo conseguir cada una.
4. Guarda todo en `02-oferta.md` con fecha y versión, y dile qué quedó en tres líneas.

## La lente de todas las piezas: la ecuación de valor

**Valor = (resultado soñado × probabilidad percibida) ÷ (tiempo de espera × esfuerzo y sacrificio)** (Alex Hormozi,
*$100M Offers*, cap. 6). Arriba se sube, abajo se baja. Cada pieza mueve al menos un término:

| Término | Piezas que lo mueven |
|---|---|
| Resultado soñado (subir) | Promesa, nueva oportunidad, dolores y deseos |
| Probabilidad percibida (subir) | Vehículo, diferenciación, garantía, pitch (prueba y gran dominó) |
| Tiempo de espera (bajar) | Promesa (la primera victoria), vehículo, urgencia |
| Esfuerzo y sacrificio (bajar) | Vehículo (hecho por ti o contigo), bonos |

Avatar, precio y escasez deciden **a quién** y **en qué términos**: sin el avatar correcto, la mejor oferta no vende.

## Cuando pide otra cosa

| El dueño dice | Hacer |
|---|---|
| «Explícame la nueva oportunidad», «¿qué es el gran dominó?» (cualquier pieza) | Explícala en texto corrido, sin tablas, con su sección de `references/piezas.md` y el ejemplo; luego ofrécele armar la suya |
| «Califica mi oferta», «¿está lista?» | Lee `02-oferta.md`, pasa cada pieza por su prueba, califica su oferta y la alternativa de su cliente en la ecuación (0, 0.5 o 1 por término) y dile su pieza más floja con la siguiente acción. Una pantalla |
| Pega una plantilla de oferta llena (texto o foto) | Pasa cada campo a `02-oferta.md` como borrador, enséñale qué quedó y empieza por la pieza más floja |
| «Dímela en voz alta», «mi pitch» | Pieza 11: menos de dos minutos, con su gran dominó |
| «Ya hablé con clientes, ajústala» | Compara lo que dijeron con su hoja y propone cambios en promesa, dolores y precio. Guarda como versión nueva, con qué cambió y por qué en «Cambios» |
| «Imprímela», «pásamela en limpio» | Enséñale la hoja sin estados ni notas, lista para copiar. Un PDF o un deck, con `presentaciones` |

## Qué NO hace

- No envía, no publica y no contacta a nadie, ni para «validar» la oferta: prepara el mensaje y él lo manda.
- No decide su precio ni su garantía: recomienda con la cuenta a la vista y él elige.
- Fichas de sus clientes → `clientes`. Plan del mes, la semana y el día → `bajar-a-tierra`. Deck de su oferta →
  `presentaciones`.

## Fuentes

Ideas contadas en palabras de Levy, sin pegar texto de los libros. Alex Hormozi, *$100M Offers* (caps. 3 a 6 y 9 a 16:
mercado, precio, ecuación de valor, los 5 pasos y las 5 mejoras). Russell Brunson, *Secretos de experto* (secretos 3 y
4: nueva oportunidad; 5: gran dominó; 6 a 8: puente de epifanía; 9 y 10: los tres secretos; el stack). Eugene Schwartz,
*Breakthrough Advertising* (caps. 1, 2 y 6: el deseo de masas, los cinco niveles de conciencia y lo que el prospecto
desea, quiere ser y ya cree). El formato de 11 piezas en una hoja es el que usan los programas de alto ticket para
empaquetar una oferta.
