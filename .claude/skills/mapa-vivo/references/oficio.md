# El oficio: cómo se anima un negocio

El mapa vivo no es un diagrama con movimiento. Es un negocio explicado por su **mecanismo**: lo que entra, lo que se
atora, lo que se pierde y lo que se decide. Este archivo es el método para que cualquier mapa (y cualquier pieza nueva)
salga con ese nivel. La parte técnica de una pieza: `canvas/references/pieza-viva.md`. El estándar de capítulos:
`canvas/references/capitulos.md`.

## La vara

Quien lo ve por primera vez tiene que poder decir tres cosas **sin que nadie le explique**:

1. De lejos: «esto es mi negocio y tiene cuatro partes».
2. En el sistema: «aquí se me va el dinero».
3. En el vehículo: «esto es lo primero que hay que hacer, y esto me cuesta no hacerlo».

Si necesita tu voz para alguna de las tres, el mapa todavía no está.

## Los cinco mecanismos del mapa

Cada pieza existe porque hay algo que una tarjeta con texto no puede decir:

| Pieza | Lo que hace visible | La geometría que lo dice |
|---|---|---|
| Las ondas (norte) | El porqué alcanza a más gente conforme el negocio mejora | Círculos cada vez mayores que se encienden al pasar la onda; la meta, a escala contra hoy |
| El sistema nervioso | El negocio piensa, siente y se mueve; y en un punto casi todo se escapa | Tres bandas; puntos que fluyen y se fugan en el cuello; la línea adelgaza lo que se pierde; lo que no existe la corta |
| La escalera | Casi todos se quedan en un escalón: ese es el que se empuja | El ancho es el peso; la gente camina y pocos suben; lo que no existe está vacío |
| La hoja | Una oferta es tan fuerte como su pieza más floja | Once tramos: lleno, guiones o hueco; la pieza que falta se encoge |
| Los hilos | El orden en que se arregla no es el orden en que el cliente lo vive | Hilos que se cruzan; el grueso es el primero; el costo, como un largo contra lo que falta |

## Estados: el mapa nunca miente

Los cuatro estados (más «opera») no son decoración: son la diferencia entre un mapa y un folleto. Un dueño que ve su
negocio con huecos honestos confía en lo que sí está lleno.

- Lo `pendiente` ocupa menos y va en gris con guiones. Lo que **no existe hoy** se ve como un corte, en rojo.
- «Por medir» **es** un hallazgo: se dibuja con su sello y con cómo medirlo. Jamás un cero, jamás un estimado sin decirlo.
- El rojo se usa solo para lo que se pierde o no existe. El acento, para lo firmado y lo que se empuja. El segundo
  color, para lo que opera y para la información que sube.
- Si al terminar todo se ve lleno y firme, desconfía: casi ningún negocio lo está. Revisa qué diste por hecho.

## El mundo del cliente

Con tres cosas el mapa deja de ser «una plantilla» y se vuelve suyo:

- **Sus palabras.** Lo que fluye por su negocio se llama como él lo llama (`sistema.unidad`: cotizaciones, pedidos,
  pacientes, alumnos, reservas). Su porqué y su dolor, entre comillas y como los dijo.
- **Su figura** (`marca.motivo`): lo que corre por el nervio y sube la escalera. `punto` (por defecto), `tuerca`
  (ferretería, taller, industria), `gota` (clínica, laboratorio, bebidas), `hoja` (campo, alimentos, bienestar),
  `rombo` (joyería, lujo, finanzas), `cuadro` (construcción, bienes raíces, logística), `estrella` (hospedaje,
  eventos, reseñas). Elige la que el dueño reconocería sin leer.
- **Sus colores** (`marca.acento` y `marca.segundo`, en `#RRGGBB`). El acento toma el lugar del oro (lo firmado, lo que
  se empuja); el segundo, el del morado (lo que opera, la información). Pide que contrasten entre sí y prueba en claro
  y en oscuro. Pintan las piezas vivas; el tinte de fondo de cada capítulo y sus rótulos nativos siguen siendo los de la
  casa. Si no da colores, se queda la estética de la casa: tinta sobre papel, con oro y morado.

Y una regla que vale más que las tres: **sus números**. Un mapa con tus colores y sus números gana siempre a un mapa
con sus colores y números inventados.

## Cómo lo conduces con el dueño delante

- **Primero el silencio.** Diez segundos de lejos, sin hablar. Deja que encuentre su nombre y sus cuatro partes.
- **Una pregunta por capítulo,** no una explicación: «¿este es tu porqué, con estas palabras?», «¿aquí es donde se te
  van?», «¿esto es lo que vendes hoy?», «¿empezarías por aquí?». Lo que corrija, lo anotas y lo cambias después.
- **No leas la pantalla.** Lo que está escrito ya lo está leyendo. Tú dices lo que no está: por qué importa.
- **Cierra en el costo.** La barra roja contra la punteada es tu mejor argumento, y no lo dijiste tú: lo dijo su número.
- Lo que el dueño cambie en la llamada va a `mapa.json` y se vuelve a correr `lienzo`: la segunda vez que lo ve ya
  tiene sus correcciones. Eso también vende.

## Una pieza nueva (cuando su negocio tiene un mecanismo que estas cinco no cubren)

Un restaurante con horas pico, una clínica con lista de espera, una escuela con deserción por semestre: a veces lo que
más le duele al dueño tiene su propia forma. Entonces se hace una pieza para él.

1. **El mecanismo, en una frase con verbo,** y de su mundo: «las mesas se llenan a las dos y a las nueve, y entre las
   cuatro y las siete la cocina está parada». Si no puedes decirlo así, falta diagnóstico, no dibujo.
2. **Tres ideas, descarta la obvia.** ¿Qué forma tiene ese mecanismo: un reloj que se llena, una fila que avanza, un
   depósito que gotea, un mapa que se enciende? La primera que se te ocurre suele ser un gráfico de barras: busca la
   que el dueño señalaría con el dedo.
3. **Póster primero.** Copia una pieza de `assets/piezas/` que se parezca, cambia su mecanismo y mírala quieta. Tapa
   los rótulos: ¿la forma cuenta la historia?
4. **Datos afuera.** Lo que cambia de un negocio a otro va en `mapa.json` (un bloque nuevo, por ejemplo `"horas": […]`)
   y la pieza lo lee de `datos`. Nada del cliente escrito dentro del `.js`.
5. **Ármala y colócala** con `lienzo_vivo.armar_pieza(...)` y `Pagina.pieza(...)` en el capítulo donde va (o en un
   quinto capítulo propio, si es otra idea).
6. **Mírala a las tres distancias,** en claro y en oscuro, quieta y viva, y en el recorrido. Luego enséñasela.

Si la pieza sirve para más de un cliente de la misma industria, guárdala en tu skill de esa industria: es parte de lo
que vendes.

## Errores que ya se pagaron

- **Animar por animar.** Si al quitarle el movimiento la pieza dice lo mismo, el movimiento sobra… o el póster ya era
  bueno. Si quieta no dice nada, el problema es el dibujo.
- **Once tarjetas iguales.** Cuando todo pesa lo mismo, nada se entiende. El peso visual sigue al estado y al tamaño real.
- **Números como rótulos.** «3,600» y «4,000» en letra grande son dos textos; dos barras son una comparación.
- **Llenar los huecos «para que no se vea vacío».** El hueco es el hallazgo.
- **Texto que el dueño va a decir, escrito en pantalla.** La pantalla muestra; él (o tú) dice.
- **Piezas diminutas.** Lo que no llena una parte visible de la pantalla no despierta y su póster no se lee: va nativo.
