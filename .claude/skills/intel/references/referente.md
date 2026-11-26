# El referente de tu nicho: benchmark, no molde

Cómo estudiar al competidor o referente que le habla al mismo mercado que el dueño: qué contenido le funciona, cómo
opera su comunidad o su venta, y qué se puede adaptar sin volverse su copia.

## Regla de framing (léela primero)

**Benchmark, no molde.** Se extrae el **método** (qué temas explotan, cómo estructura, cómo opera su comunidad o su
venta), nunca la identidad. Antes de estudiarlo, escribe en una línea en qué se distingue el dueño: su avatar, su
oficio, su manera de entregar. Sale de `.claude/memory/project/mi-negocio/` (oferta, mercado) y de su retrato; si no
está, pregúntaselo una vez. Copiar al referente mata justo lo que hace distinto al dueño.

## Elegir a quién

- Lee primero `.claude/memory/project/mi-negocio/mercado.json` (bloque `competidores` o `contra_quien`): quizá ya
  hay una lista con fuentes. Si no, propón de tres a cinco: dos directos (mismo mercado, misma oferta), uno de alcance
  (más grande, otro idioma) y una alternativa (lo que el cliente haría en lugar de comprarle). El dueño elige.
- Un referente por pregunta. «Estudia a todos» sin una decisión que informar es inventario.

## Los cuerpos de inteligencia de un referente

Cada uno en su carpeta `contenido/intel/<slug>/`:

| Cuerpo | Qué guardas | Cuándo abrirlo |
|---|---|---|
| **Canal** (`youtube/`) | Transcripts y descripciones con `corpus.py bajar`; `INDICE.md` por mes con título, duración y vistas | Qué temas hace, qué explota, ritmo de publicación |
| **Comunidad o producto** (`comunidad/`) | Lo público: about, precio, garantía, estructura de cursos, cadencia de eventos, anuncios con fecha | Decisiones de comunidad, engagement, lanzamiento |
| **Embudo** | Lo lleva `ideal-funnels` (recorridos, recursos, correo, cobro) | Cómo convierte la atención en venta |

**Cómo leer el canal:** abre `INDICE.md`, ordena por vistas o por fecha, elige los videos que responden la pregunta y
solo entonces abre su transcript. No leas cincuenta de golpe. Patrones típicos que buscar, cada uno con su evidencia:
cursos largos que funcionan como pilar, noticias rápidas tras cada lanzamiento, explicadores de un concepto,
comparativas («X contra Y», «deja de usar X»), casos de «automaticé un negocio». Registra vistas **con la fecha en
que las viste**: una cifra sin fecha caduca en silencio.

**Cómo leer la comunidad:** frecuencia de eventos en vivo, cuántos administradores o equipo responde, mecánicas de
gamificación (retos, premios, niveles), precio y sus cambios, garantía, cómo da la bienvenida. Todo con fecha y
captura o enlace. El tamaño que muestra es una declaración del referente, no un dato auditado.

## Qué entregas

1. **Lo que le funciona**, con evidencia fechada: tema o mecánica → ejemplo concreto → cifra observada y su fecha.
2. **El método debajo**: por qué podría funcionar (marcado como inferencia).
3. **La adaptación al dueño**: el mismo método traducido a su avatar y su diferencia. Nunca el título copiado.
4. **Dónde aterriza**: una idea de contenido, un cambio a su comunidad o una pieza de su oferta (con la skill que
   corresponda: `oferta` para la oferta, `ideal-funnels` para el embudo).

## Mantenerlo vivo

- Al volver a un referente, corre `corpus.py bajar` sobre su canal (solo baja lo nuevo) e `indice`.
- Si resume a un competidor en `mercado.json` (la pestaña Estrategia del panel lo pinta), cada cifra con `fuente` y
  `fecha`, sin datos privados de nadie. La ficha completa del competidor y su esquema viven en la guía de `mercado.json`
  que conoce `ideal-funnels`.
- Nunca cites números de un referente de memoria: abre la fuente con fecha o di que hay que volver a medir.
