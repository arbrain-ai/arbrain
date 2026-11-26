# La pieza viva: un mecanismo que se mueve dentro del Lienzo

Una **pieza viva** es código visual (HTML + CSS + SVG + Canvas) que vive dentro de una página del Lienzo como un
elemento más: se mueve con la cámara, pertenece a un capítulo y participa en el recorrido. De lejos, o mientras la
cámara se mueve, el Lienzo pinta su **póster** (una foto fiel); de cerca y en reposo, la pieza **despierta** y anima.
Cuándo usar una y cuándo no: `capitulos.md` («Lo nativo y lo vivo»).

## El método, en seis pasos (siempre en este orden)

1. **Nombra el mecanismo en una frase con verbo.** «La gente entra, y en la tercera etapa dos de cada tres se van.»
   Si no hay verbo, no hay pieza: es un texto o una tabla, y eso va nativo.
2. **Dibuja primero el póster.** La pieza quieta, completa y en reposo ya tiene que contar la historia: tapa los
   rótulos y mira si la forma sola dice qué pasa. La animación es adorno; nada importante depende de que se mueva.
3. **Mueve solo lo que el mecanismo mueve.** Lo que fluye, fluye; lo que crece, crece; lo demás se queda quieto. Una
   cosa a la vez y despacio: se está explicando, no decorando.
4. **Lo que se mide, a escala.** Dos cifras comparables se dibujan como dos largos, no como dos números grandes. Un
   grosor, un ancho o una altura dicen más que un rótulo.
5. **Cada cosa con su estado** (abajo). Lo que no existe hoy se ve como hueco; nunca se rellena para que «quede bonito».
6. **Parte el recorrido en dos o tres destapes** y mírala en claro y en oscuro, quieta y viva, antes de entregarla.

## El formato

Una pieza es un módulo que pinta dentro de `raiz` con los datos que recibe:

```js
import { marco, bucle, api, pasos, svgEl, e, sello } from '../../../canvas/assets/pieza/kit.js'

const W = 1600, H = 500                       // su tamaño lógico; la cámara la escala entera

export default function montar(raiz, ctx, D) {
  const div = marco(raiz, ctx, { ancho: W, alto: H, clase: 'mia', css: `.mia .t{font:600 34px var(--serif);color:var(--titulo)}`, marca: D.marca })
  div.innerHTML += `<div class="t" data-desde="1">${e(D.titulo)}</div>${sello(D.estado)}`
  const paso = pasos(div, ctx, 2)             // el recorrido: lo que lleva data-desde="n" aparece desde el paso n
  const reloj = bucle(ctx, (t, dt) => {       // t < 0 es el póster: pinta todo, en reposo
    /* mover solo lo que se mueve; con paso() sabes hasta dónde va el recorrido */
  })
  return api(div, reloj)
}
```

`lienzo_vivo.armar_pieza(id, titulo, fuente_js, kit_js, datos, pasos)` la convierte en el `.html` que lee el Lienzo: su
ficha, el kit, la pieza y **sus datos escritos adentro**. La página la lleva como un elemento `embed` con
`pieza: "doc:<ruta>.html"` (`Pagina.pieza(...)` lo pone). Con la página abierta, el Lienzo relee el archivo cada segundo:
vuelves a armar y se repinta sola, sin reiniciar nada.

## El kit (`assets/pieza/kit.js`)

| | Para qué |
|---|---|
| `marco(raiz, ctx, {ancho, alto, clase, css, marca})` | El contenedor: transparente, con tema claro u oscuro y los colores del negocio si los hay |
| `bucle(ctx, pintar)` · `POSTER_T` | El reloj: `pintar(t, dt)` cada cuadro mientras está despierta; `t < 0` es el póster |
| `pasos(div, ctx, total, alCambiar?)` | El recorrido: `data-desde="n"` y una función que dice el paso actual |
| `sello(estado, texto?)` · `estadoDe(x)` · `trazoDe(estado)` | Los estados, iguales en todas las piezas |
| `e(texto)` | **Todo texto que venga de los datos pasa por aquí** antes de entrar a `innerHTML` |
| `svgEl` · `svgTexto` · `muestra(path, n)` | SVG y puntos a lo largo de un trazo (para que algo lo recorra) |
| `lienzo(div, ancho, alto)` · `paleta(div)` · `figura(g, motivo, …)` | Canvas nítido, colores ya resueltos y la figura de lo que fluye |
| `boton` · `botones(ctx, lista)` | Botones con destino: `lienzo:<capítulo>`, `doc:<ruta>`, `panel:<sección>` |
| `semilla(n)` · `suave` · `sujeta` · `mezcla` · `corto(texto, n)` | Azar repetible, curvas y recortes de texto |
| `imagen(div, ctx, img, {x, y, ancho, desde})` · `logo(div, ctx, img, {x, y, alto, desde})` | Una imagen o un logo REAL del repo, sin deformar (abajo) |

Tintas (variables CSS, cambian solas con el tema): `--titulo`, `--cuerpo`, `--mudo`, `--tenue`, `--linea`, `--linea2`,
`--papel`, `--hondo`, `--oro` (acento) con `--oroluz`, `--orotinta`, `--orohondo`; `--mor` (segundo color) con
`--morluz`, `--mortinta`, `--morhondo`; `--rojo` solo para lo que se pierde o no existe. Letras: `var(--serif)` para lo
que se dice en voz alta y los números grandes; `var(--sans)` para lo demás. Tamaños: nada por debajo de 12; el cuerpo, 13.5 a 16.

## Imágenes y logos dentro de una pieza

La pieza no pide nada a la red: las imágenes viajan por su **ficha**. Al armarla se declaran y el Lienzo se las entrega
antes de montarla (también al póster):

```python
foto = LV.imagen_de("<carpeta>/img/escena.jpg")            # {ruta, ancho, alto}: va en los datos
wa = LV.imagen_de("<banco>/logos/whatsapp.png")
html = LV.armar_pieza("mi-pieza", "Mi pieza", fuente, kit, {"foto": foto, "wa": wa}, pasos=2, imagenes=[foto, wa])
```

```js
imagen(div, ctx, D.foto, { x: 40, y: 60, ancho: 720, desde: 1 })   // aparece en el paso 1; el alto sale de su proporción
logo(div, ctx, D.wa, { x: 800, y: 60, alto: 48, desde: 2 })        // un logo real, medido por su alto
```

- Si la imagen llega después de montar, el host le pone su `src` solo (`<img data-imagen>`). Fuera del Lienzo (el visor
  de pruebas) se ve un hueco rotulado con su nombre, nunca un hueco mudo.
- Con `clase: 'foto'` lleva esquinas redondas y sombra, y en tema oscuro se atenúa sola (el papel claro no deslumbra).
- Las imágenes **no** se escriben adentro del `.html` (el Lienzo no lee una pieza de más de 512 KB; `armar_pieza` lo
  impide). A lo sumo 24 por pieza, y viven dentro de la carpeta de Arbrain.
- Los logos son archivos reales de la marca; una ilustración generada nunca trae logos dibujados (`capitulos.md`).

## Los estados

| Estado | Trazo | Uso |
|---|---|---|
| `firmado` | lleno, continuo, acento | Decidido por el dueño, o medido con fuente y fecha |
| `opera` | lleno, continuo, segundo color | Funciona hoy |
| `abierto` | guiones, acento | Se está decidiendo |
| `pendiente` | guiones, gris | Falta: por construir, por escribir, por medir |
| `idea` | puntos, tenue | Algún día |

`estadoDe()` entiende también «firmada», «borrador», «vacía», «por medir», «por construir». Lo que no reconoce es
`pendiente`: ante la duda, no es un hecho.

## Lo que una pieza no puede (a propósito)

Pedir nada a la red ni a la app, leer la sesión, abrir ventanas o guardar en el navegador. Corre aislada: por eso sus
datos viajan escritos en su archivo y por eso es seguro enseñarla. Si necesita un dato nuevo, cambia su fuente y se
vuelve a armar.

## Reglas de oficio (aprendidas midiendo)

- **El póster es el primer cuadro, pintado al montar.** Si tu pieza simula algo (gente caminando), «caliéntala» antes
  del primer cuadro para que la foto ya traiga el flujo.
- **Sin `transition: all`** y sin transiciones en los primeros segundos: una foto a media transición sale deforme (el
  kit las apaga con `data-quieto` mientras se toma el póster).
- **Un canvas encima de botones se los tapa:** el del kit ya no toma el puntero.
- **Piezas chicas no despiertan.** Una pieza vive cuando cubre al menos el 12 % de la pantalla (y 360 px de ancho); a lo
  sumo cuatro vivas a la vez. En un capítulo 16:9 en pantalla eso es, medido, una pieza de unos 2560 u de ancho con
  proporción 2:1 o más alta; una de 1300 u se queda en su póster y **sus pasos no se ven**. Si una pieza con pasos no
  cabe grande, es otro capítulo. Lo pequeño (una leyenda, dos botones) va nativo: su póster no se leería.
- **Lo que pesa es pintar, no calcular:** anima zonas chicas, no brillos a pantalla completa.
- **Una idea por pieza.** Si necesita dos títulos, son dos piezas.
