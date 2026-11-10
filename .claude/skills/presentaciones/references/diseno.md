# Diseño · tomar la marca del dueño o elegir por él

## Si ya tiene marca

Pásala a `tema.css`. Basta cambiar los colores de acento: el fondo y los dibujos los siguen solos.

| Variable | Qué es | De dónde sale |
|---|---|---|
| `--acento`, `--acento-claro`, `--acento-rgb` | el color que manda, su versión clara y sus valores R,G,B | su color principal (`--primary` en `mi-marca/tema.css`) |
| `--acento-2`, `--acento-2-claro`, `--acento-2-rgb` | contraste puntual, poco | su secundario; si no tiene, uno frío y discreto |
| `--base`, `--tinta`, `--tinta-suave`, `--tinta-tenue`, `--linea` | fondo, textos y líneas | contraste de 7:1 el principal y de 4.5:1 el suave |
| `--letra-titulo`, `--letra-texto`, `--letra-mono` | tipografías | las suyas si van en la carpeta (`@font-face` local); si no, las que ya vienen (Cormorant e Inter) |

Reglas: un acento domina cada lámina; el segundo color aparece en un solo momento. Verde y rojo solo cuando significan
estado real. Su logo va en la portada y el cierre, no en cada lámina.

## Si no tiene marca, eliges tú

No lo pongas a escoger. Lee su negocio y su público, y toma la dirección que mejor le quede. Al entregar, una línea: «Le puse
estos colores; si quieres otros, dímelo». Puntos de partida (adáptalos, no los copies):

- **Noche** (`noche`): luz sobre oscuro, acento cálido, títulos con serifa. Para clases y webinars compartidos en pantalla; los
  dibujos brillan. Es la opción por defecto.
- **Papel** (`papel`): editorial claro, tinta oscura, acento sobrio. Para contenido serio que se lee como libro o se imprime.
- Por negocio, con los mismos dos temas y otros colores: salud y longevidad (fondo muy oscuro, verde vivo de vitalidad, serifa
  serena); finanzas o legal (papel marfil, azul profundo, cero ornamento); restaurante (crudo, negro y rojo terracota); lujo
  (marfil y negro, serifa alta, mucho aire); taller o industria (negro y naranja industrial, cifras en mono).

## Lo que nunca

- Degradados chillones, sombras por todos lados, íconos genéricos, emojis como diseño.
- Más de tres tamaños de letra por lámina. Texto debajo de 24 px en la escena de 1920×1080.
- Tarjetas en rejilla como respuesta por defecto: solo cuando el contenido ES una comparación o lista.
- Caras inventadas: siluetas, o foto real que el dueño te dé.
