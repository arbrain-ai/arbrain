# Gramática · cómo se escribe una presentación

Una carpeta por presentación:

| Archivo | Qué es | Quién lo toca |
|---|---|---|
| `deck.json` | `titulo`, `tema` (`noche`, `papel`), `universo` (`polvo`, `constelacion`, `ninguno` o el tuyo), `minutos` y, al entregar, `entregar` | tú |
| `piezas/NN.html` | una lámina (`00`, `01`…), con su `<style>` propio si lo necesita | tú |
| `piezas/NN.js` | el dibujo de esa lámina | tú |
| `tema.css` | colores y letras, si tiene marca (si no existe se usa `tema`) | tú |
| `propio.css` | estilos que comparten varias láminas (opcional) | tú |
| `universo.js` | el fondo vivo propio de esta presentación (opcional) | tú |
| `index.html`, `presentador.html`, `GUION.md`, `_capturas/` | generados por `listo.py` | nadie |
| `motor/` | el motor de esta presentación; lo pone `listo.py` | nadie |

```json
{"titulo": "Fuerte toda la vida", "tema": "noche", "universo": "polvo", "minutos": 30}
```

## Una lámina

```html
<section class="lamina" data-titulo="El cuello de botella" data-b="El problema" data-min="5-12" data-pasos="2">
  <div class="lienzo"><canvas class="enactivo" data-enactivo="cuello"></canvas></div>
  <div class="arriba">
    <div class="kicker rev">El problema</div>
    <div class="t2 rev" style="--r:1">Tu negocio va a la velocidad <span class="brillo">de su parte más lenta.</span></div>
  </div>
  <div class="dice">
    <div class="p" data-p="0" data-hasta="0">Todo llega <b>al mismo punto.</b></div>
    <div class="p" data-p="1" data-hasta="1">Empujar más <em>solo hace más fila.</em></div>
    <div class="p" data-p="2">Abre ahí, <em>y todo lo demás se mueve.</em></div>
  </div>
  <aside class="notas">
    <p data-p="0">Lo que dices al llegar a la lámina, en su voz.</p>
    <p data-p="1">Lo que dices en el clic 1.</p>
    <p data-p="2">Lo que dices en el clic 2.</p>
  </aside>
</section>
```

| Quieres | Escribes |
|---|---|
| Que algo aparezca en el clic 2 | `data-p="2"` (y `data-hasta="3"` si se apaga después del 3) |
| Que entre al llegar a la lámina, en orden | `class="rev" style="--r:1"` |
| Animar por CSS según el clic | la lámina recibe `.p1`, `.p2`…: `.p2 .barra{width:80%}` |
| Una frase a la vez en el mismo lugar | `.dice` con hijos `.p` y `data-p`/`data-hasta` (`.dice.grande` para frase con serifa) |
| Clics sin elementos (solo cambia el dibujo) | `data-pasos="3"` en la `<section>` |
| Secciones y tiempos en el presentador | `data-b="Bloque"` y `data-min="5-12"` en la primera lámina del bloque |
| Sin la línea de avance (portada) | `data-sin-rumbo` en la `<section>` |
| Algo que se toca sin avanzar | `data-toca` en el elemento |
| Video en un clic | `<div class="vcaja" style="left:300px;top:150px;width:1320px;height:742px"><video data-play-en="1" src="media/x.mp4" poster="media/x.jpg" playsinline></video><div class="vplay"><i></i></div></div>` |
| El prompt o ejercicio que se llevan | `<div id="p1">texto</div><button data-copia="#p1">Copiar</button>` |
| Que la auditoría ignore un elemento a propósito | `data-libre` |

Piezas listas en el CSS: `.kicker`, `h1`/`.t1`, `h2`/`.t2`, `.t3`, `.sub`, `.cita`, `.acento`, `.brillo` (texto con barrido de
luz), `.cifra`, `.arriba`, `.centro`, `.duo`, `.lienzo`, `.vidrio` (y `.vidrio.acento`), `.chip`. Las posiciones se escriben en
píxeles sobre una escena de 1920×1080: el motor la escala a cualquier pantalla. Letra principal de 42 px o más; nada debajo
de 24 px. Para ver un ejemplo de cada pieza, lee `assets/demo/piezas/` de esta skill: estudia cómo está escrito, no copies sus ideas
ni su forma.

## Lo que hace el dueño al darla

Flechas, espacio o clic avanzan · clic derecho o flecha izquierda regresan · **F** pantalla completa · **P** vista de presentador
(notas del clic actual, lo que sigue en miniatura, bloque, reloj y si va a tiempo) · **N** notas dentro de la lámina · **V** play y
pausa del video · **D** marca la zona de la cara (círculo abajo a la derecha, si se va a grabar con su cara encima) · número +
Enter salta a esa lámina.
