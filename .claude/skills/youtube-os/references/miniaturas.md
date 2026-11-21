# Título y miniatura: el hecho y el veredicto

El diseño (colores, tipografía, cara) se aprende rápido. Lo que separa una miniatura que recibe clics de una bonita es
**qué dice y por qué**. Primero la lógica, después la imagen. Las imágenes se generan con `image-generation`; esta
página decide qué se le pide.

## 1. El título

Patrones que aparecen en los títulos que mejor funcionan en canales educativos. Mídelos en los referentes del dueño
(`aprender.md`) antes de tratarlos como regla de su canal.

- **Nombre propio siempre** (la herramienta, el método, la cifra). Un título abstracto casi siempre rinde menos.
- **Número de versión legible** si el video habla de un producto con versiones: es búsqueda.
- **Entre 45 y 75 caracteres**; más largo se corta en el feed.
- **Cuatro moldes que se repiten:** noticia («X lanza Y: lo que cambia»), primera persona en pasado («Probé…»,
  «Construí…»), revelación con paréntesis («… (ahora hace Z)»), imperativo negativo («Deja de X sin Y»).
- **El paréntesis revela el mecanismo, no adorna:** contesta «¿y entonces qué hace?».
- **Cero clickbait emocional.** El anzuelo es un hecho específico y verificable que el video cumple.

## 2. La regla madre: el título es el hecho, la miniatura el veredicto

> Escribe el título. Pregúntale **«¿y entonces qué?»**. La respuesta, en 2 a 4 palabras, es la miniatura.

Ejemplo: título «Pusimos a dos herramientas a construir la misma app. Una ganó claramente»; miniatura «NI DE CERCA».
El texto de la miniatura **nunca repite el título**: lo argumenta. Antes de aprobar, lee los dos en voz alta; si son la
misma oración, se rehace.

## 3. El test del par

Lee título y miniatura juntos, como los ve el feed. **Si ya sabes la respuesta, no hay clic.** «Una ganó» + «NI DE
CERCA» deja la pregunta «¿cuál?». «Cómo crear apps» + «CREA APPS» se cierra solo. La miniatura no aclara el título:
sube la apuesta.

## 4. El objeto es la prueba, nunca una metáfora

El objeto de la miniatura es **el artefacto que el video demuestra**: la app terminada, el panel, la carpeta, el
cronómetro con la duración real. Si no se te ocurre cuál es el objeto, el problema no es la miniatura: el video no
tiene una demostración clara. Vuelve al guion antes de generar nada.

Casi siempre el dueño tiene un objeto que nadie más tiene (su sistema corriendo, su resultado real): eso convierte la
miniatura en un recibo y no en un cartel.

## 5. Cuántas palabras

Inversamente proporcional a qué tan conocido es el objeto: logo reconocible al instante, 2 palabras; concepto conocido
pero no visual, 3 o 4; objeto que nadie identifica solo, 4 y un rótulo en el objeto. **Nunca 5 o más**: a tamaño de
feed móvil la quinta ya no se lee y le roba tamaño a las otras.

## 6. Cara sí o cara no: juicio o evento

- **Con cara** cuando el video es un **juicio del dueño**: lo probó, lo decidió, lo recomienda. La cara responde por el
  veredicto.
- **Sin cara** cuando el protagonista es un **evento externo**: salió algo nuevo, cambió una regla. Ahí la cara es
  decorado.

De esto salen dos familias que conviene mantener separadas en el canal:

| Familia marca (método, opinión, demostración) | Familia noticia (evento con búsqueda propia) |
|---|---|
| con la cara del dueño, reaccionando a algo del cuadro | sin personas |
| el color de su marca, sutil, como firma | sin colores de marca: negro, blanco y el color del logo del que se habla |
| el objeto propio como prueba | el logo del protagonista como héroe, grande, con nombre y versión |

Cuando la tesis no es del dueño sino de una autoridad reconocida y el peso está en quién lo dijo, la captura de esa
cita puede ser el objeto. Si la prueba es del dueño, prestar autoridad es tirar su ventaja.

## 7. Composición

- **Dos colores y dos neutros.** El color de la herramienta pinta solo su objeto; el color de la marca del dueño es su
  firma (una barra, un brillo, un halo detrás de él); texto blanco; fondo oscuro. Si el color de la herramienta aparece
  también en el texto o en él, tiene dos dueños y el feed no lee el canal. Evita el dorado y los degradados metálicos
  en letras: en grande se ven caros y a tamaño de feed se vuelven barro.
- **Simetría de masas.** Dos masas del mismo peso tocando los bordes: el dueño de un lado (el pelo toca el borde
  superior, el pecho el inferior), el objeto del otro como un solo grupo conectado. Nada flotando suelto en negro.
- **Respiro entre el texto y el objeto.**
- **Esquina inferior derecha vacía:** ahí la plataforma estampa la duración.
- **Logos reales, nunca dibujados.** Se bajan los oficiales y se pasan como referencia. El logo protagonista va grande
  (unas tres veces los demás); los secundarios sin palabras.
- **Juzgar siempre a tamaño de feed móvil** (unos 320 px de ancho), no solo en grande.

## 8. La identidad del dueño

- **Su cara sale de su máquina solo con su sí.** Mandar sus fotos al generador de imágenes es un envío de datos
  personales: revisa el permiso en `canal.md` (pregunta 9). Si no está, pregúntalo una vez nombrando al proveedor y
  anótalo; sin su sí, la miniatura va sin cara.
- **Solo fotos reales y aprobadas por él** (la carpeta de `canal.md`) como referencia de su cara. Una miniatura
  generada no se vuelve referencia facial: copiaría sus errores.
- Si se pega su foto tal cual, el prompt la bloquea: misma cara, mismo tono de piel, misma luz sobre su cara, sin
  reiluminarlo ni teñirlo. Pedir luz de escena sobre una foto que debe quedar intacta es permiso para repintarlo.
- Si el dueño quiere poses nuevas, se pasan 2 a 6 fotos reales como referencia de identidad (rostro, pelo, piel,
  edad), se pide ignorar su ropa y fondos, y se describe la pose. **El parecido lo valida él.**
- Expresión por defecto: calma o seriedad mirando a cámara. Las caras de asombro exagerado solo si él las pide.
- Ropa, fondo y estilo: los de su marca visual. Lo que él firme se guarda en `canal.md` › Decisiones.

## 9. Generar y entregar

1. Escribe el título (2 o 3 opciones) y deriva el veredicto de cada uno (sección 2).
2. Elige el objeto (sección 4) y la familia (sección 6).
3. Arma el prompt con la composición y la identidad. Deja fijas las partes que el dueño ya aprobó en rondas anteriores
   (guárdalas en `project/youtube/miniaturas.md` como su plantilla); por video solo cambian el objeto, el logo, las
   palabras y la carpeta de salida.
4. Genera con `image-generation` (calidad alta para miniaturas; si dice que falta la llave de OpenRouter, pídele al
   dueño que la agregue él en Ajustes › Llaves de la app: nunca la busques en archivos ni se la pidas en el chat), 2 a 4 variantes de verdad distintas (no tres cambios
   de color), en `miniaturas/vN/` del proyecto, con el prompt y las referencias de cada una.
5. Revisa cada variante antes de mostrarla: texto legible y bien escrito, logos correctos, anatomía, parecido,
   esquina libre y lectura a tamaño de feed.
6. **Gate de promesa cumplida:** la frase de la miniatura tiene que existir en sustancia en la transcripción del corte
   final. Si el video no dice eso, la miniatura miente y la retención lo cobra.
7. Muéstralas todas en el visor (`mostrar` del MCP `cabina`, con `vista: documento` y la ruta de cada imagen). **El dueño elige; tú no eliges por él.** Cuando diga
   «la 3», resuélvelo contra las imágenes de su mensaje, no contra el último lote.
8. Guarda la elegida con un nombre estable (`miniatura-final.png`) sin regenerarla, y anota en
   `project/youtube/miniaturas.md` qué ganó y por qué en sus palabras.

Elegir una miniatura no es permiso para publicarla.
