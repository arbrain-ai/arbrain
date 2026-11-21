# El estándar: capítulos a la derecha, cámara y recorrido

Cualquier lienzo que se va a **enseñar** (un panel, una clase, el mapa de un negocio, un proceso) se arma igual: pocas
partes con nombre, cada una del tamaño de una pantalla, un índice a la derecha que lleva a cada una y un recorrido que
las cuenta en orden. La primera skill que lo usa es `mapa-vivo`; la base es `scripts/lienzo_vivo.py`.

## Las tres distancias

Un lienzo se diseña para leerse a tres distancias, y cada una contesta una pregunta distinta:

| Distancia | Qué se ve | Qué contesta | Qué lo logra |
|---|---|---|---|
| **De lejos** (la página entera) | Los nombres de los capítulos y la silueta de cada uno | «¿De qué va esto?» | Un título de 190 por capítulo, un tinte por territorio, una forma distinta en cada uno |
| **En medio** (un capítulo llena la pantalla) | Su tesis, sus partes y su relación | «¿Cómo funciona esta parte?» | El encuadre 16:9: el capítulo cabe entero |
| **De cerca** (una pieza) | El mecanismo moviéndose, el dato con su fecha | «¿Qué pasa aquí exactamente?» | La pieza viva despierta al acercarte |

Un texto que en pantalla queda por debajo de 6.5 px se pinta como una línea gris. Por eso los nombres de capítulo van
enormes y lo que debe leerse desde la vista completa mide 60 o más.

## Qué es un capítulo

- Un capítulo es un **marco** (una sección) que no está dentro de otro. El índice de la derecha los lista en orden de
  lectura (por renglones, de izquierda a derecha) y `1` a `9` vuelan a cada uno.
- **Encuadre 16:9** (4800 × 2700 unidades). Al volar a un capítulo la cámara lo muestra completo si es tan ancho como la
  pantalla; uno más alto solo enseña la cabeza. Un capítulo que no cabe en una pantalla son dos capítulos.
- **La cabeza** de cada capítulo: una ceja corta (su número y de qué va), su nombre enorme y una tesis: una frase con
  postura («La información sube; las correcciones bajan»), no un tema («Sistema»).
- **Tema:** cada elemento declara a qué capítulo pertenece (`tema`). Con varios temas, el índice los agrupa por nombre.
- **De 3 a 7 capítulos.** Con menos de dos no hay índice; con más de siete nadie recuerda el camino.
- **Cuidado con los marcos sueltos:** un marco fuera de todo capítulo se anuncia en el índice como un capítulo más, y
  seis o más elementos sueltos y juntos, también. Lo que va fuera de los capítulos (el título de la página, una leyenda)
  se dibuja con textos y figuras, pocos y separados.

## El recorrido (el lienzo como clase)

- `⇧P` o el ▶ del índice entra: se esconde el cromo y la cámara vuela al primer capítulo. `Esc` sale.
- `→` o espacio avanza: primero los **pasos** de las piezas del capítulo (cada pieza revela lo suyo) y luego vuela al
  siguiente. `←` regresa igual.
- Un elemento nativo con `aparece: "<capítulo>"` no se ve hasta que el recorrido llega a ese capítulo.
- **A lo sumo dos o tres destapes por pieza.** Ocho pasos seguidos cansan; lo que se revela debe cambiar lo que el
  público entiende, no solo aparecer.
- Proyectado o en pantalla compartida: recorrido siempre. Fuera de él, el índice y la barra de abajo bastan.

## Lo nativo y lo vivo

| Va **nativo** (texto y figuras del Lienzo) | Va en una **pieza viva** |
|---|---|
| Lo que el dueño edita con su mano: títulos, sus frases, sus principios, sus notas | Un mecanismo: algo que fluye, crece, se escapa, sube, baja o se conecta |
| Los enlaces a documentos (`doc:`) | Lo que sale de un archivo de datos y se regenera |
| Poco y grande | Una idea por pieza, con su póster completo |

Lo que una mano mueve, edita, bloquea o borra en el Lienzo es suyo: `lienzo_vivo.py` no lo pisa al volver a correr.
Cómo se hace una pieza: `pieza-viva.md`.

## Imágenes y logos

Una imagen entra **lisa** cuando pertenece a su capítulo (`tema`), se mueve con la cámara, aparece con el recorrido
(`aparece: "<capítulo>"`), conserva su proporción y se ve nítida a media distancia. Hay dos formas, según lo que haga:

| Va **nativa** (`P.imagen`, `P.logo`, `P.tira_logos`) | Va **dentro de una pieza** (`imagenes=` + `imagen()` / `logo()` del kit) |
|---|---|
| Una ilustración o foto que se mira entera; una fila de logos que nombra herramientas o canales | La imagen es parte del mecanismo: se destapa en un paso, se señala, algo se mueve encima |
| El dueño la mueve o la cambia de tamaño con la mano | Aparece con un paso del recorrido (`desde`), sale en el póster |

- **Un logo es el archivo real de la marca** (de su sitio o de un banco como Simple Icons), nunca dibujado por un modelo
  de imagen ni de memoria. `P.logo` falla si el archivo no existe: un logo que falta no se fabrica, no va.
- **En una ilustración generada,** el prompt prohíbe cualquier marca y deja zonas de papel vacías; el logo real se
  compone encima después (con su proporción, como pegatina o sobre una pantalla en blanco) y se revisa con los ojos.
- **Nunca deformada:** el alto sale de su proporción (`P.imagen` lee la cabecera del archivo; con `alto=` cabe y se centra).
- **En tema oscuro, una ilustración de papel claro grita** más que el mecanismo del capítulo (lo midió el crítico ciego
  del 17 nov). La nativa no cambia con el tema; dentro de una pieza, `imagen(…, { clase: 'foto' })` la atenúa y la
  enmarca sola en oscuro. Por eso, en una página que se proyecta en los dos temas, la ilustración va en una pieza sin
  pasos (una «lámina»: `imagen()` a todo lo ancho); lo nativo queda para logos y fotos que se ven igual en los dos.
- **Nítida a media distancia:** con el capítulo en pantalla (zoom ≈ 0.4), una imagen de 1700 u ocupa ~680 px; un archivo
  de 1536 px de ancho sobra. JPEG o WebP para ilustraciones; PNG con transparencia para logos.
- **Dónde carga:** la nativa la sirve el Lienzo desde el disco (rutas bajo `/Users`, `/Volumes` o `~/`; si no, `revisar()`
  lo avisa y va dentro de una pieza). La de una pieza viaja por su ficha, sin red, en cualquier máquina.

## La base: `scripts/lienzo_vivo.py`

Como biblioteca, desde el script de otra skill:

```python
import sys; sys.path.insert(0, ".claude/skills/canvas/scripts")
import lienzo_vivo as LV

P = LV.Pagina("Mi panel")                                   # rejilla de 2 columnas (columnas=3 para una tira)
c = P.capitulo("ventas", "Las ventas", tema="Las ventas", tinte="ambar",
               ceja="1 · cómo entra el dinero", tesis="Se vende lo que se cotiza a tiempo.")
P.frase("ventas:meta", c.x0, c.baja(430), 1400, 430, "La meta", "Vender 22,000 al mes", "firmado")
P.pieza("embudo", c.x0, c.baja(1500), c.ancho, "doc:<ruta>/embudo.html", ficha)   # ficha = LV.ficha_de(html)
P.imagen("ventas:foto", c.x0, c.baja(950), 1690, "<carpeta>/img/escena.jpg", tema=c.tema, aparece=c.tema)  # sin deformar
P.tira_logos("ventas:canales", c.x0, c.baja(110), 110, ["<banco>/whatsapp.png", "<banco>/gmail.png"], tema=c.tema)
P.titular("pagina", "Mi negocio", "Una línea que dice qué es esto.", "Panel · noviembre")
P.leyenda("pagina:ley", 2 * LV.ANCHO + LV.HUECO, -404)       # firmado · abierto · pendiente · idea
print(P.revisar())                                           # lo que se sale de su capítulo, antes de escribir
P.escribir(manifiesto=Path("<carpeta>/lienzo.manifiesto.json"))   # crea o actualiza «Mi panel», respetando la mano
```

- `c.x0`, `c.ancho` y `c.baja(alto)` son el cursor del capítulo: cada cosa va debajo de la anterior. No se calculan
  coordenadas a mano.
- `LV.armar_pieza(id, titulo, fuente_js, kit_js, datos, pasos, imagenes=[…])` devuelve el `.html` de una pieza con sus datos
  adentro y, en su ficha, las imágenes que dibuja (`LV.imagen_de(ruta)` da `{ruta, ancho, alto}` para sus datos).
- `P.escribir()` usa la API del Lienzo de la app (el pase del agente). Fuera de la app: `sin_app`. Con `ensayo=True`
  dice qué cambiaría sin escribir. Devuelve `paginaId`, los `capitulos` con su `zona` (para `mostrar`) y `bloqueados`.

Como comando, para un lienzo declarado en un archivo (cero coordenadas):

```bash
python3 .claude/skills/canvas/scripts/lienzo_vivo.py capitulos <spec.json>   # qué capítulos y encuadres saldrían
python3 .claude/skills/canvas/scripts/lienzo_vivo.py armar <spec.json>       # lo dibuja en el Lienzo
```

```json
{ "nombre": "Mi clase", "titular": "Cómo cotizamos", "bajada": "De la llamada al cobro.", "columnas": 2,
  "capitulos": [
    { "id": "hoy", "titulo": "Cómo es hoy", "ceja": "1 · el antes", "tesis": "Cada cotización espera dos días.", "tinte": "ambar",
      "bloques": [ { "tipo": "frases", "lista": [ { "ceja": "El dolor", "texto": "«Cuando mando el precio ya compraron»", "estado": "firmado" } ] },
                   { "tipo": "pieza", "ruta": "piezas/flujo.html" },
                   { "tipo": "imagen", "ruta": "img/escena.jpg", "ancho": 0.5 },
                   { "tipo": "logos", "lista": ["logos/whatsapp.png", "logos/gmail.png"], "alto": 110 } ] },
    { "id": "manana", "titulo": "Cómo será", "tesis": "El precio sale el mismo día.", "tinte": "morado",
      "bloques": [ { "tipo": "texto", "texto": "Una lista de precios por tipo de obra." } ] } ] }
```

## Antes de enseñarlo

1. **De lejos:** ¿se leen los nombres y se distinguen los territorios? Si un capítulo es una mancha gris, le falta una
   forma propia o un dato grande.
2. **En medio:** entra a cada capítulo con su número. ¿Cabe entero? ¿La tesis se lee sin acercarse?
3. **De cerca:** ¿cada pieza dice lo suyo quieta (su póster) y lo mismo, mejor, en movimiento?
4. **El recorrido completo,** en claro y en oscuro, con las flechas. Si en algún `→` no cambia nada que importe, sobra.
5. **Los estados:** nada punteado se lee como hecho; nada firmado sin su fuente.
6. **Las imágenes y los logos:** ¿cada logo es el archivo real? ¿alguna imagen deformada, borrosa o con texto inventado?
