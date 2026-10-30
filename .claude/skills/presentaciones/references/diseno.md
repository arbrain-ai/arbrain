# Diseño · tomar la marca del dueño o proponerle dos

## Si ya tiene marca

Tradúcela a las variables de `tema.css` (las mismas de `assets/motor/temas/noche.css`):

| Variable | Qué es | De dónde sale |
|---|---|---|
| `--fondo`, `--fondo-fuera` | el fondo de la lámina y lo que queda fuera de ella | su color de fondo o un neutro muy oscuro/claro que lo acompañe |
| `--tinta`, `--tinta-suave` | texto principal y secundario | contraste mínimo 7:1 el principal, 4.5:1 el suave |
| `--acento` | el único color que grita | su color principal (`--primary` en `mi-marca/tema.css`) |
| `--acento-2` | contraste puntual, poco | su secundario; si no tiene, déjalo frío y discreto |
| `--letra-titulo`, `--letra-texto`, `--letra-mono` | tipografías | las suyas si están instaladas o vienen en la carpeta (`@font-face` local); si no, la familia más cercana del sistema |

Reglas: un acento domina cada lámina; el segundo color aparece en un solo momento. Colores de estado
(verde, rojo) solo cuando significan estado real. Si su logo va, en la portada y el cierre, no en cada
lámina.

## Si no tiene marca: dos direcciones

Propón dos, cada una con nombre, para qué sirve, tres colores y dos letras, y una frase de por qué
encaja con su público. Que elija una; no mezcles. Ejemplos de partida (adáptalos a él, no los copies):

- **Noche** (`temas/noche.css`): luz sobre oscuro, acento cálido, títulos con serifa. Para clases y
  webinars que se dan compartiendo pantalla; los enactivos brillan.
- **Papel** (`temas/papel.css`): editorial claro, tinta oscura, acento sobrio. Para contenido que se
  lee como libro o se imprime.
- **Luz grabada** (opcional, uno más entre muchos): fondo casi negro, polvo de luz que flota detrás,
  dorado y violeta como únicos colores, letras finas con mucho aire. Se ve cinematográfico; pide
  enactivos hechos de luz y no de cajas.

Otras ideas según el negocio: «clínica» (blanco, un azul, sans geométrica), «taller» (crudo, negro y
un naranja industrial, mono para cifras), «lujo» (marfil, negro, serifa alta, cero ornamento).

## Lo que nunca

- Fondos con degradados chillones, sombras por todos lados, íconos genéricos, emojis como diseño.
- Más de tres tamaños de letra por lámina. Texto debajo de 28 px en la escena de 1920×1080.
- Tarjetas en rejilla como respuesta por defecto: solo cuando el contenido ES una comparación o lista.
