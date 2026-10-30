---
name: presentaciones
description: "Presentaciones hermosas en HTML que se abren con doble clic: una idea por lámina, la idea se arma por clics, enactivos 2D que se mueven con la clase, vista de presentador con notas y reloj, pantalla completa con F. Toma el diseño del dueño (su marca, paleta y tipografía; si no hay, propone dos direcciones) y exprime al máximo la capacidad creativa del modelo. Usar ante «hazme una presentación», «un deck», «slides», «diapositivas», «mi clase», «mi pitch», «la presentación de mi webinar o mi taller», «que se vea tan hermosa como…». No es para PowerPoint (.pptx) ni Google Slides."
---

# presentaciones · decks que se entienden solos

Un deck aquí es una carpeta con `index.html` que abre con doble clic, sin internet ni servidor. Tu dueño
habla encima; la lámina le da ritmo y hace visible lo que dice. La vara no es «limpio y correcto»: es que
alguien que nunca lo vio diga «¿cómo hiciste esto?».

## 1. Antes de una sola lámina

1. **El diseño es del dueño.** Búscalo antes de preguntar, en este orden: `mi-marca/tema.css`,
   `mi-marca/logo.*` y `mi-marca/marca.json`; su memoria (`.claude/memory/`, busca marca, colores,
   tipografía); una presentación, web o imagen suya que te haya pasado. Si lo encuentras, dilo en una
   línea («uso tu morado y tu logo») y sigue. Si no hay nada, **propón dos direcciones** con un nombre,
   tres colores y dos letras cada una, y que elija. Detalle y ejemplos: [references/diseno.md](references/diseno.md).
2. **El contenido, en sus palabras.** Qué quiere que su público sepa, sienta y haga al final. Cuánto
   dura. Si va a grabarse con su cara encima (entonces se respeta la zona de la cara).
3. **Guion de una línea por lámina** antes del HTML: título que es una afirmación, no un tema. Si una
   lámina necesita dos ideas, son dos láminas.

## 2. Dirigirte a ti mismo (las palabras que desatan al modelo)

Antes de diseñar, léete esto y créetelo: [references/oficio.md](references/oficio.md). Lo esencial:

- No te quedes con tu primera idea. Para cada lámina importante piensa varias formas de hacer visible el
  concepto, descarta los clichés (íconos con texto, tarjetas en rejilla, viñetas) y elige la que el
  público recordaría mañana.
- Cada lámina que explica algo lleva un **enactivo**: un dibujo que ES la idea y cambia con cada clic
  (no una caja que la rotula). Los tres tests: tapa el texto y aún se entiende; después de verlo,
  alguien podría explicarlo; cada clic cambia el estado del sistema, no solo la opacidad.
- Letra grande, mucho aire, un solo acento de color por lámina. Lo que se quiere recordar se queda
  quieto lo suficiente para leerlo.

## 3. Construir

```bash
python3 .claude/skills/presentaciones/scripts/nuevo_deck.py <carpeta> --tema noche --titulo "Mi clase"
```

Crea la carpeta con el motor, el presentador, un `tema.css` y un demo de 4 láminas que muestra cada pieza
(portada, idea por clics, enactivo, cierre). Reescríbelo entero con el contenido del dueño. Temas de
partida: `noche` (luz sobre oscuro) y `papel` (editorial claro); con su marca, escribe su propio
`tema.css` con las mismas variables. Dónde guardar: donde el dueño diga; si no dice, en
`mi-negocio/presentaciones/<fecha>-<tema>/`.

Gramática del motor (todo en `index.html`, cada lámina es una `<section class="lamina">`):

| Quieres | Escribes |
|---|---|
| Que algo aparezca en el clic 2 | `data-p="2"` (y `data-hasta="3"` si se apaga después del 3) |
| Animar por CSS según el paso | la lámina recibe `.p1`, `.p2`…: `.p2 .barra{width:80%}` |
| Notas para el presentador | `<aside class="notas"><p data-p="1">lo que dices en el clic 1</p></aside>` |
| Un enactivo 2D | `<canvas class="enactivo" data-enactivo="x">` + `Enactivos.registrar("x",{w,h,nuevo,cuadro})` en `enactivos.js` |
| Pasos sin elementos (solo el enactivo cambia) | `data-pasos="3"` en la `<section>` |
| Algo que se toca sin avanzar | `data-toca` en el elemento |

Teclas para el dueño: flechas, espacio o clic avanzan; **F** pantalla completa; **P** abre el
presentador (notas del clic actual, el siguiente clic en miniatura, hora y cronómetro); **N** notas
dentro del deck; **D** marca la zona de la cara (círculo de 380 px abajo a la derecha; ningún texto ahí
si va a grabarse); **?** ayuda. `index.html#3.2` abre la lámina 3 en su paso 2. Para compartir en una
videollamada: abre el deck en Chrome, F, y comparte esa pestaña; el presentador va en otra ventana.

## 4. Verificar y criticarte (no se entrega sin esto)

```bash
python3 .claude/skills/presentaciones/scripts/verificar.py <carpeta>
```

Abre el deck en Chrome sin pantalla, falla si hay errores de JavaScript o el motor no arranca, y saca
una captura por lámina en su último paso (`<carpeta>/_capturas/`). Luego **mira cada captura** con el
crítico de [references/critico.md](references/critico.md), corrige lo que falle y repite hasta que no
puedas nombrar una sola cosa que la mejore. Al dueño le llega el deck terminado, no la lista de fallas.

## 5. Entregar

En tres líneas: dónde está (`<carpeta>/index.html`, doble clic), cómo darla (F, P, flechas) y qué
decidir si algo quedó abierto. Si el dueño pide cambios, edita el mismo deck; una versión nueva solo si
la pide.

## Límites

- PowerPoint o Google Slides: aquí no; si los pide, díselo y ofrécele este formato o exportar capturas.
- Imágenes generadas para las láminas: `image-generation`. Diagramas editables: `canvas`.
- Sin dependencias externas: nada de CDNs ni fuentes de internet; si quiere una letra suya, el archivo
  va en la carpeta del deck.
