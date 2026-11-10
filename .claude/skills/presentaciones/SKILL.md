---
name: presentaciones
description: "Presentaciones que dejan callada a la sala, en HTML de doble clic: un universo visual propio, una idea por lámina, dibujos que se mueven con cada clic, vista de presentador con notas y reloj. El dueño solo dice de qué es; todo el oficio lo pone el modelo, con su marca. Usar ante «hazme una presentación», «un deck», «slides», «diapositivas», «láminas», «mi clase», «mi pitch», «mi webinar», «mi taller», «una presentación como las de las clases», «la skill de presentaciones», «cómo hago presentaciones», «cámbiale la lámina 5». No es para PowerPoint (.pptx) ni Google Slides."
---

# presentaciones · el dueño dice de qué es, tú pones el oficio

Tu dueño no sabe de diseño ni de código, ni tiene que saberlo. **Todo lo que puedas decidir tú, lo decides tú.**
Él pone el tema y sus ideas; tú pones todo lo demás. La vara no es «limpio y correcto»: es que quien la vea
pregunte «¿cómo hiciste esto?».

Si solo pregunta cómo se usa, contesta en dos líneas: «Dime de qué es tu presentación y para quién, y yo la armo. Te
la entrego abierta, lista para darla». Háblale en español simple: nada de HTML, canvas, scripts ni carpetas.

## El camino completo (él vive solo los pasos 1, 3 y 6)

**1. De qué es.** Si ya te lo dijo, no preguntes nada. Si no: una sola pregunta, «¿De qué es y para quién?». Lo que falte
(duración, si se graba) lo supones: 20 a 30 minutos, compartida en videollamada. Si te dio un PDF, un documento, un audio o
sus notas, ese es el contenido: léelo completo.

**2. Su contenido y su diseño, sin molestarlo.** Lee su memoria (`.claude/memory/`, `project/mi-negocio/`): su negocio, su
público, cómo habla, qué ofrece. Busca su marca en `mi-marca/` (tema, logo, `marca.json`) y en su memoria. Si tiene, la
usas. **Si no tiene, eliges tú** la dirección que mejor le quede a su negocio ([references/diseno.md](references/diseno.md))
y al final le dices en una línea que la cambias si quiere. Nunca le pongas a escoger colores.

**3. El guion, una sola confirmación.** Una línea por lámina, con la frase que se queda, en lenguaje de la gente que lo va
a escuchar. Enséñaselo en un mensaje corto: «Así la voy a contar. ¿La armo o le cambias algo?». Solo ideas que él pueda
defender en voz alta; si algo viene de ti y no de él, lo marcas. Si te dijo «hazla de una» o ya te dio su guion, te saltas
la pregunta. Con su sí, avísale: «Va, te la entrego en unos minutos» y no vuelvas a preguntar.

**4. El universo, y construir.** Antes de una sola lámina lee y créete [references/oficio.md](references/oficio.md): ahí
está cómo apuntar alto, cómo inventar el universo visual que une toda la presentación y la fórmula de lámina que funciona.

Luego escribe la presentación con tus herramientas de archivos, en `mi-negocio/presentaciones/<fecha>-<tema>/` (salvo que
él pida otro lugar): `deck.json` con su título, y una lámina por archivo, `piezas/00.html`, `piezas/01.html`…, con su dibujo
en `piezas/01.js`. Cómo se escribe todo: [references/gramatica.md](references/gramatica.md). Cómo se inventa un dibujo que
enseña: [references/enactivos.md](references/enactivos.md). Con su marca, escribe también `tema.css`. Para una animación
compleja o para exprimir más la forma, también tienes `.claude/skills/code-animation/`.

**5. Revisar y criticarte (no se entrega sin esto).** Hay un solo comando, y se corre **siempre exactamente así, sin nada
antes ni después** (ni `cd`, ni `&&`, ni carpeta como argumento):

```bash
python3 .claude/skills/presentaciones/scripts/listo.py
```

(En Windows, `python` en lugar de `python3`.) Arma la presentación, revisa cada clic de cada lámina (errores, texto que se
sale, que no cabe o encimado) y deja `_capturas/hoja.png` y una captura por lámina. La primera vez, Arbrain puede pedirle
permiso: **avísale antes, en una línea**: «Te va a salir un permiso para correr mi revisor; si eliges *Permitir siempre*, no
te lo vuelvo a pedir». Ese es el único permiso que la skill necesita, y por eso el comando nunca cambia.

Arregla cada falla. Después **mira las capturas** con [references/critico.md](references/critico.md) y da otra vuelta hasta
que no puedas nombrar una sola cosa que la mejore. Si dice `NO_REVISADO`, revisa el código con más cuidado y entrega de todos
modos; si es porque no hay Chrome, dile que instalarlo te deja revisarla mejor. A tu dueño le llega la presentación terminada,
no la lista de fallas.

**6. Entregar.** Agrega `"entregar": true` a `deck.json` y corre el mismo comando: se la abre en su navegador. Si dice
`NO_ABIERTA`, dile dónde quedó: doble clic en `index.html` de esa carpeta. Le dices, en tres líneas:
- Ya está abierta. Flechas o clic para avanzar; **F**, pantalla completa.
- **P** abre tu vista con tus notas y el reloj. Para una videollamada: comparte solo esa pestaña.
- Si quieres cambiar algo, dime qué: «cámbiale la lámina 5», «ponla más corta», «usa estos colores».

## Cuando pide cambios

Editas solo la pieza que toca, y con `"entregar": true` corres el mismo comando: se revisa y se le abre sola. Versión nueva
solo si la pide. No le pidas que busque archivos ni que recargue nada a mano.

## Límites

- PowerPoint o Google Slides: aquí no; dile que esta se abre en cualquier navegador y que, si la necesita en otro lado,
  le sacas las imágenes de cada lámina (`_capturas/`).
- Imágenes generadas para las láminas: `image-generation`, solo si aportan; nunca inventes caras ni cifras. Diagramas
  editables: `canvas`.
- Sin dependencias externas: nada de internet ni de librerías. Letras y motor van dentro del archivo.
- Para compartirla: `index.html` basta si no lleva fotos ni video; si lleva, manda la carpeta completa.
