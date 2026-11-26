# El núcleo de marca: `mi-marca/guia.md`

Este es el contrato visual del dueño. Todo lo demás (la app, las imágenes, las presentaciones, el código en pantalla)
lo lee de aquí. Arriba del archivo: versión, fecha, estado (borrador o firmada) y, si firmó, sus palabras.

Los colores del ejemplo son **ficticios** (una consultora para clínicas dentales); úsalos para ver la forma, nunca como
paleta de nadie.

## 1. El alma del color

Una marca fuerte vive de **un contraste que significa algo**, no de muchos colores bonitos. Decide con él qué es la
luz y qué es la sombra de su marca, y qué representa cada uno. Escríbelo en dos o tres líneas.

Ejemplo: «Verde bosque es la calma, lo que ya está resuelto, el fondo. Cobre es la acción, lo que importa, el número
que hay que ver. El cobre nunca baña la pieza: señala».

Consecuencias que se escriben junto al alma:
- **Qué color es protagonista** (el que lleva la tesis, el número, el botón) y cuál es secundario (el concepto, el
  contexto, lo que queda atrás).
- **El protagonista se usa poco.** Un acento domina cada pieza; el segundo aparece en un solo momento. Si todo brilla,
  nada brilla.

## 2. La paleta

Una tabla corta. Cada color con nombre, valor, para qué sirve y por qué.

| Rol | Nombre | Valor | Para qué | Por qué |
|---|---|---|---|---|
| Principal | Cobre | `#C8743A` | Tesis, números, botones | La acción, lo que hay que ver |
| Secundario | Verde bosque | `#1F6F5C` | Conceptos, contexto, bordes | La calma, lo resuelto |
| Fondo oscuro | Tinta | `#0E1412` | Fondo de pantalla y láminas de golpe | De donde emerge la luz |
| Fondo claro | Marfil | `#F6F1E7` | Láminas que enseñan, impresión | Se lee de lejos y en videollamada |

**Variantes permitidas** (el mismo tono más claro u oscuro para estados y bordes) y **colores prohibidos** (los tonos
cercanos que ensucian la marca: el amarillo eléctrico junto a un dorado, un naranja pálido junto al cobre). Los
prohibidos se escriben porque el modelo de imágenes y otros agentes tienden a derivar hacia ellos.

**Variaciones declaradas:** si un medio usa otro tono a propósito, una línea con el medio, el valor y el porqué.

## 3. Fondos y texto

- El fondo por defecto de cada medio (pantalla, láminas que enseñan, láminas de golpe, impresión).
- Texto sobre oscuro y sobre claro: principal, secundario y tenue. Contraste mínimo de 7:1 el principal y 4.5:1 el
  secundario.
- **Verde y rojo solo para estado real** (algo que funciona o que falla y se puede medir), nunca como decoración. Si su
  paleta ya usa verde o rojo como marca, anota cómo se distingue el estado.

## 4. Tipografía

- **Dos letras por superficie, no más:** una de títulos (con carácter: serifa, display, la de su logo) y una de texto
  (muy legible). Una tercera monoespaciada **solo** para código, contadores y datos tabulares, nunca para el cuerpo.
- Pesos y usos: cuál para títulos, cuál para frases que se quedan, cuál para etiquetas.
- Si sus letras no vienen en sus archivos, las que ya trae `presentaciones` (una serifa clásica y una sans legible)
  son un buen arranque; anótalo.

## 5. Contraste y profundidad

Reglas cortas que definen cómo se siente su marca. Ejemplos de reglas que funcionan:
- La luz viene de un lado y proyecta sombra: profundidad pintada, no plástico 3D genérico.
- El acento va en línea fina o en un punto que sella, no en degradados que bañan toda la superficie.
- Nada de brillo neón, sombras por todas partes ni íconos genéricos.

## 6. Logo

Ruta del aprobado en `mi-marca/`, en qué fondos funciona, tamaño mínimo y las versiones retiradas (si las hay, que no
se vuelvan a usar). El logo va en portada y cierre, no en cada pieza.

## 7. Cómo sale el dueño

Un párrafo y la ruta de su kit (`mi-marca/referencias/fotos/INDEX.md`, su personaje aprobado). Detalle en
`persona.md`.

## 8. Sus estilos de imagen

Para cada estilo que haya aprobado (normalmente dos o tres, ver `imagenes.md`): nombre en sus palabras, para qué se
usa, la imagen ancla en `referencias/estilos/` y las cláusulas del prompt que lo producen.

## 9. Cómo se pasa a cada medio

- **App de Arbrain:** `mi-marca/tema.css`. Su principal va a `--primary` (y `--primary-rgb`, `--primary-hover` un poco
  más oscuro), su acento de conversación a `--brand` y `--brand-ink`, su color cálido de un solo foco a `--gold`, sus
  fondos a `--background` y `--card`, en los dos bloques (claro y oscuro). Se descomenta la línea, se pone el valor y
  se cambia también su `-rgb`.
- **Presentaciones:** `presentaciones` toma `--acento` de su principal y `--acento-2` de su secundario.
- **Imágenes:** el color entra por las referencias y por la descripción de objetos, nunca con valores escritos en el
  prompt (ver `imagenes.md`).
- **Código en pantalla:** `codigo.md`.

## Cómo se ve bien hecho

- El alma cabe en tres líneas y el dueño la puede decir con sus palabras.
- Cada color tiene un porqué; ninguno está «porque se ve bonito».
- Hay prohibidos escritos.
- Una lámina de prueba con su paleta se ve como suya sin poner el logo.
