---
name: diseno-de-marca
description: "La identidad visual del dueño en un solo lugar: arma con él su guía de marca (colores con su porqué, tipografías, contraste, logo aprobado, cómo sale él en las imágenes y los estilos de imagen de su marca), la guarda en mi-marca/ y la aplica a la app, a sus imágenes, a sus presentaciones y al código que enseña. Si no tiene marca, Levy propone una a partir de su negocio y él elige. Usar ante «mi marca», «mis colores», «pon mis colores», «mi paleta», «mi logo», «qué tipografía uso», «mi guía de marca», «cómo se ve mi marca», «el estilo de mis imágenes», «hazme las imágenes de mi clase», «una lámina que explique X», «un paquete visual», «que todas mis imágenes se vean iguales», «sácame en la imagen» o ante cualquier duda de color, letra, contraste o estilo. La llamada al modelo de imágenes: image-generation. Decks: presentaciones. Animación o HTML vivo: code-animation."
metadata:
  resumen: "Arma tu guía de marca (colores, letras, logo, estilo de imágenes) y la aplica a todo lo que Levy hace por ti."
---

# Diseño de marca: cómo se ve el dueño, en una sola fuente

Una marca se reconoce porque todo sale de la misma fuente: los mismos colores con la misma intención, las mismas
letras, el mismo logo y un estilo de imagen que se repite. Esta skill arma esa fuente con el dueño, la guarda en su
capa (`mi-marca/`, que ninguna actualización toca) y la aplica cada vez que Levy produce algo visual.

Háblale en español simple: nada de hex, CSS ni variables salvo que él pregunte. Él ve muestras y decide.

## Dónde vive lo suyo

| Archivo | Qué es |
|---|---|
| `mi-marca/guia.md` | **La fuente única** de su marca: el alma del color, la paleta con su porqué, fondos, texto, tipografías, contraste, logo, cómo sale él y sus estilos de imagen. Forma: `references/nucleo.md` |
| `mi-marca/tema.css` | Sus colores en la app de Arbrain (se ven al recargar, sin compilar). Se escribe desde `guia.md` |
| `mi-marca/logo.svg`, `logo.png` o `logo.webp` | Su logo aprobado, el único que se usa |
| `mi-marca/marca.json` | `{ "nombre": "Su negocio" }`: el nombre en la ventana |
| `mi-marca/referencias/` | Las imágenes que fijan su estilo (`estilos/`), su kit de fotos con `INDEX.md` (`fotos/`) y sus personajes (`personajes/`) |

La primera vez que guardes `guia.md`, agrega su línea en `MEMORY-indice.md` con disparadores en sus palabras («mi
marca», «mis colores», el nombre de su negocio), siguiendo `memory-manager`. Ningún otro archivo **define** un color
de su marca: los demás apuntan a `guia.md`.

## El camino

1. **Lee lo que ya existe.** `mi-marca/` completo, su memoria (`project/mi-negocio/`, su retrato), su avatar y su
   oferta si existen. Si ya tiene `guia.md`, se continúa; nunca se empieza de cero.
2. **¿Tiene marca?** Pregunta una vez: «¿Ya tienes colores, logo o algo que te guste cómo se ve?». Si te da archivos
   (logo, un manual, capturas de su página, una imagen que le encanta), míralos antes de proponer nada.
   - **Si tiene:** extrae su paleta y sus letras de lo que te dio, enséñale lo que entendiste y lo confirma.
   - **Si no tiene:** no lo pongas a escoger colores en el vacío. Lee su negocio y su avatar, propón **dos direcciones**
     con su porqué en una línea cada una (cómo se siente, para quién) y tu recomendación. Él elige una.
3. **Arma el núcleo** con `references/nucleo.md`: el alma del color primero, luego paleta, fondos, tipografía y
   contraste. Escríbelo en `guia.md` como **borrador**.
4. **Enséñaselo.** Una muestra que pueda ver: una lámina de prueba o una página HTML corta con su paleta, sus letras y
   un ejemplo de título, texto y botón (`mostrar` de la cabina si está, o la ruta del archivo). Pregunta «¿así se ve tu
   marca, o la ajusto?». Con su sí, `guia.md` queda **firmada**.
5. **Aplícalo a la app:** pasa sus colores a `mi-marca/tema.css` (las variables del ejemplo comentado; cada color con su
   `-rgb`) y dile que recargue con Cmd+R o Ctrl+R. Si tiene logo y nombre, `logo.*` y `marca.json`.
6. **Fija sus estilos de imagen** con `references/imagenes.md` cuando pida la primera imagen: se prueban dos o tres
   variantes, él elige, y la elegida se guarda en `referencias/estilos/` como el ancla de ese estilo. Si todavía no
   tiene llave de imágenes (`image-generation` lo dice), fija el estilo por escrito con una imagen que a él le guste
   como ancla y avísale en una línea que las imágenes salen en cuanto la conecte.

## Cada vez que produces algo visual

- **Imágenes:** decide el medio y el estilo con `references/imagenes.md`; escribe el prompt con sus reglas; la llamada
  al modelo la hace `image-generation`. Si sale él o un personaje suyo, `references/persona.md`.
- **Presentaciones:** las hace `presentaciones`, que toma su marca de `mi-marca/` (su `guia.md` manda sobre la
  dirección que ella elegiría sola).
- **Código en pantalla** (en una lámina, un video o una página): `references/codigo.md`.
- **Animación, HTML vivo, algo que se toca:** `code-animation`, con su paleta de `guia.md`.

## Las reglas que no se doblan

- **Una sola fuente.** El color se define en `guia.md`; lo demás apunta ahí. Si un medio necesita otro tono a propósito
  (un fondo claro para imprimir, un acento más vivo para una miniatura pequeña), se anota en `guia.md` como **variación
  declarada** con su porqué. Copiar la tabla en otro lado es como se rompe una marca.
- **Logo: solo el aprobado, tal cual.** Se copia el archivo; no se recorta, no se redibuja, no se le pide al modelo que
  lo genere ni que lo «mejore». Si hay versiones viejas, `guia.md` dice cuál es la buena y cuáles quedaron fuera.
- **Su cara no se inventa.** Si sale él, siempre a partir de sus fotos o de su personaje aprobado (`persona.md`).
- **El texto de las imágenes, en el idioma de su público**, completo, salvo nombres propios y siglas que su público usa.
- **Un estilo aprobado es el piso, no el techo.** Las referencias fijan la vara mínima; si ves una forma mejor de
  explicar algo, propónla. Y cuando compares estilos, compáralos a la escala de lo que se entrega (el deck completo, la
  clase entera), no solo una imagen suelta.
- **La aprobación del estilo no es aprobación del concepto.** Que le guste cómo se ve una lámina no significa que esa
  lámina explique lo que debe.

## Qué NO hace

- No publica ni sube imágenes a ningún lado: se guardan en su carpeta y se le muestran. Publicar es suyo.
- No toca archivos del autor de Arbrain (`arbrain/src/`, estilos de la app): su marca vive solo en `mi-marca/`.
- No cambia su marca firmada sin su sí, aunque una dirección nueva te parezca mejor: la propones y él decide.
- Estrategia, mensaje y copy → `arquitectura-marketing`. Las 11 piezas de su oferta → `oferta`. Diagramas editables →
  `canvas`. Miniaturas: la llamada y su oficio, `image-generation`; su estilo, aquí.
