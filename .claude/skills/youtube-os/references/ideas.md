# Ideas que sí se graban: el método de veta

**La tesis en una línea:** una buena idea de video está en la intersección de una veta que **ya** está pagando en el
mercado y un activo que **solo el dueño** puede filmar. Sin lo primero es apuesta; sin lo segundo es una copia que
pierde contra el original.

Se corre completo cada vez que el dueño pide ideas. No se sacan ideas «porque el tema está interesante»: interesante
es el sesgo de quien lee mucho.

## Paso 0: abrir el avatar (bloqueante)

Lee completa la oferta del dueño (`project/mi-negocio/02-oferta.md`) y su ficha del canal (`project/youtube/canal.md`).
Bloqueante significa que no se idea sin saber a quién le habla: si no hay oferta, basta la pregunta 2 de la ficha
(a quién le habla y a quién no); si no hay ficha, se arma primero con sus preguntas 1 a 3 y la 6. De ahí salen tres
cosas que gobiernan todo lo demás:

- **A quién le hablamos y a quién no.** El anti-avatar mata más ideas que cualquier métrica.
- **El eje de la promesa:** el tema puede ser avanzado, pero la promesa tiene que ser algo que el espectador se lleve
  hoy. Tema avanzado con promesa vacía es un video para colegas, no para clientes.
- **El destino:** a dónde lleva el video. Una idea que no conecta con el destino puede ser buena, pero no es para
  este canal.

## Las fuentes de demanda

Usa las que el dueño tenga; ninguna es obligatoria y ninguna se inventa.

| Fuente | Qué dice | Su sesgo |
|---|---|---|
| Comentarios de sus videos | lo que pide su audiencia, en sus palabras | comenta una minoría; pueden pedir cosas del anti-avatar |
| Preguntas de sus clientes y prospectos | lo que necesita quien paga | muestra chica, pero la más calificada |
| Videos de sus referentes y competidores | lo que el mercado ya está pagando | un video viral no siempre le sirve a su avatar |
| Búsquedas (la caja de YouTube, tendencias) | lo que la gente escribe | dice el qué, no el ángulo |

Un tema que aparece en dos fuentes ya es demanda validada; en tres, se graba primero. Un tema en una sola fuente pasa
por el filtro del avatar antes de seguir.

**Cómo se consiguen los datos, en este orden:**

1. **Que el dueño te los dé.** Lo normal: que abra la pestaña «Videos» del canal del referente (ordenada por
   recientes) y te pegue títulos, vistas y fechas, o una captura; y lo mismo con los comentarios de sus videos. Pídeselo
   en un solo mensaje, por canal, con exactamente qué copiar.
2. **Computer use**, si está encendido (`arbrain/cerebro/manuales/computer-use.md`): abres tú esa página y lees
   títulos y vistas. Solo leer; nunca comentar, dar me gusta ni suscribirte.
3. **La YouTube Data API**, solo si el dueño ya tiene una llave disponible para tus scripts como variable de entorno
   (`YOUTUBE_DATA_API_KEY`). Nunca la busques en archivos ni en el llavero, y nunca se la pidas en el chat.

Si no hay datos, dilo: «sin datos de comentarios». Nunca rellenes una fuente con lo que «seguramente» pide la gente.

## Los 6 pasos

### 1. Medir, jamás recordar
Reúne los últimos 10 a 20 videos largos de cada referente **con sus vistas** (por cualquiera de las tres vías de
arriba) y quita los cortos (duración menor a 3 minutos): un corto ensucia el promedio. Con la API: `channels.list`
(lista de subidas) → `playlistItems.list` → `videos.list` (`statistics` y `contentDetails`). Guarda la tabla con su fecha en
`project/youtube/referentes.md`. **Toda medición nace con fecha y caduca a los 90 días.**

### 2. Separar pico de renta (en su propio canal)
Las vistas del día de salida mienten sobre el valor. Si el dueño puede ver sus estadísticas, compara qué videos
**siguen** trayendo clics al destino y clientes 2 a 4 semanas después. Patrón frecuente: la noticia hace pico y el
tutorial hace renta. Un canal necesita los dos, pero se eligen a propósito, no por antojo.

### 3. Buscar tres cosas en la competencia (no «temas»)

| Qué buscas | Cómo se ve |
|---|---|
| **La mina** | una fuente que rinde cada vez que se excava (entrevistas de una figura del nicho, documentación de una herramienta, un tipo de caso) |
| **El formato** | una forma que gana sin importar el tema (el versus, el «lo probé 30 días», el curso completo) |
| **La veta** | un tema exprimido en serie: el mismo creador saca 5 o 7 videos seguidos de lo mismo y siguen funcionando |

La veta es el hallazgo más valioso y el más ignorado. Un video que funciona no es un video: es la primera entrega. Un
canal que salta de tema cada semana obliga a YouTube a reaprender a quién mandárselo.

### 4. Cruzar con el inventario de activos injustos
Lee la lista de `canal.md` y su memoria (proyectos, clientes con permiso, sistemas que opera). La pregunta de este
paso: **para la veta que encontré, ¿cuál es el escalón de arriba que solo el dueño puede subir?** Si el referente
explica una herramienta, el dueño la muestra corriendo en su negocio real. Si el referente probó algo una semana, el
dueño lo lleva meses. Eso no es copiar: es el mismo tema con una carta que el otro no tiene.

### 5. El filtro de 3 preguntas (su trabajo es matar ideas)
1. **¿Hay demanda medida?** Un número de vistas de alguien, un comentario con tracción, una pregunta repetida de
   clientes. Sin número es corazonada: va al backlog, no al calendario.
2. **¿Tiene una ventaja que el otro no copia en un fin de semana?** «Yo lo explico mejor» no es ventaja.
3. **¿Cuánto cuesta grabarla hoy?** Investigación, preparación y producción. Una idea excelente que cuesta dos días
   no compite con una buena que cuesta dos horas cuando el ritmo comprometido va atrasado.

Y el filtro del avatar: descarta lo que atrae al anti-avatar. A veces el tema es bueno y el ángulo es malo; el ajuste
casi siempre es «tú ya sabes X; ahora, ¿cómo lo conviertes en resultado?».

### 6. Entregar cada idea con sus 6 casillas
`TÍTULO` · `ÁNGULO en una frase` · `EVIDENCIA (el número y de quién)` · `VENTAJA (el activo injusto)` ·
`MINIATURA (2 a 4 palabras + el objeto)` · `COSTO de grabarla hoy`.

Si no hubo forma de medir, entrega igual 3 a 5 ideas, pero con la casilla `EVIDENCIA: sin datos medidos` y una línea
de qué dato las validaría (y cómo conseguirlo). Son candidatas para el backlog, no para el calendario, y se dice así.

Ordenadas por lo que se grabaría primero. De 3 a 5, no 10: con 10 ideas sin costo se eligen las caras y no se graba
ninguna. Al final, una recomendación cerrada («grabaría la #2 porque…») y la oferta de escribir su guion.

## El backlog de ideas

Las ideas que el dueño no elige hoy se guardan en **un solo lugar**: `project/youtube/ideas.md`, una línea por idea con
su fecha y sus 6 casillas resumidas (memoria, no tareas). Pregúntale en una línea si quiere guardarlas. Solo si él lo
pide, van a su sistema de tareas (`habit-system`) en lugar del archivo; nunca en los dos. Antes de
guardar una, busca si ya existe una parecida y complétala. Una idea que escribiste tú no está elegida: no le pongas
fecha ni la conviertas en obligación sin su sí.

## Reglas duras

- Nunca esconder que una idea sale de un video ajeno: se dice de quién es la veta, con su número, y se nombra el
  escalón que la diferencia.
- No repetir el ángulo de un video propio reciente: revisa sus últimos publicados antes de proponer (`publicado.md`
  de sus proyectos o, si no hay, pídele la lista de sus últimos títulos).
- Un cero con muestra chica es ruido: un video con pocas impresiones no invalida un tema.
- Proponer continuidad (siguientes entregas) cuando la idea lo justifique; la serie la decide el dueño.

## Anti-patrones

| Anti-patrón | Qué produce |
|---|---|
| Idear desde el recuerdo de la competencia | ideas de hace meses; los nichos rotan rápido |
| Medir solo las vistas del día de salida | empuja a la noticia y vacía el catálogo |
| Un tema distinto por video | el canal nunca compone |
| Copiar el tema sin el escalón | pierde contra el original, que salió antes |
| Diez ideas sin costo | se eligen las caras y no se graba ninguna |
