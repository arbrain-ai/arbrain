# Oficio · lo que ya asombró, destilado

Esto no se le dicta al modelo en el primer encargo. Sirve para **ver** cada ronda y escribir el empuje de la
siguiente cuando algo falla.

## Sonido pegado a la imagen

- **Misma línea de tiempo.** En código puro el golpe sonoro se programa en el cuadro exacto del corte; no se ajusta a
  oído después. En las piezas que más asombraron, la energía de ataque junto al corte es de 2.2× a 3.2× la media,
  entre 50 y 90 ms después. Las que mezclan audio ajeno quedan cerca de 1.9× y con desfase.
- Vara: un corte sin golpe o un golpe sin imagen se nota. Si `scripts/sincronia.py` da menos de ~2×, empujar.

## Estructura que sostiene dos minutos

- **Un motivo que hila todo:** un objeto o una luz abre, cruza la pieza y cierra. El cierre repite la apertura,
  transformada.
- **Actos de materia:** el cambio de material (oscuro, papel, espacio) marca el cambio de acto.
- **Una palabra enorme por escena** en el color de acento; el resto es susurro tipográfico.
- **Instrumentos de orientación:** un año o un contador en la esquina y una barra de progreso; quien mira siempre
  sabe dónde está.

## Emoción: nosotros + un medidor que sube + futuro

Las piezas que enganchan hablan en primera persona plural con verbos de logro («medimos, navegamos, aprendimos»),
llevan un número que sube en la esquina y terminan en el futuro. Nunca se quedan quietas sin propósito y el volumen
sube de principio a fin. Narrar en tercera persona, como museo, se siente «bonito pero sin energía».

## Sincronía con audio ajeno: el audio se vuelve datos

Cuando la pista no la genera el modelo (una canción o **la voz de tu dueño**), primero se analiza y después se anima:
voz separada de la música, narración alineada palabra por palabra, beats y envolventes de energía en un JSON. Cada
escena lee esos datos: la palabra se enciende al decirse, el golpe cae en el bombo. Nadie ajusta a oído.

## Biblia antes del código

Antes de programar, el modelo escribe su tratamiento: la idea en un párrafo, una paleta mínima con un acento dueño de
un solo momento, tipografías con un papel cada una, un motivo que cruza la pieza, el tono y **una lista explícita de lo
prohibido** («nada de neón morado, cerebros brillantes, lluvia de Matrix ni destellos de lente; nada que se vea hecho
por IA»). Luego un motor común y un subagente por escena, todos contra la misma biblia. La biblia la escribe el
modelo, no se le impone.

## Acabado premium

- Movimiento con carácter: acelera fuerte, se sostiene y hace «snap». Nunca flota.
- Profundidad: 3D por raymarching o three.js; resplandor solo en el color de acento, halo y grano.
- Desenfoque de movimiento: promediar ~4 subcuadros con un obturador corto quita el temblor de las líneas finas.
- Las palabras son parte de la imagen (escritas, tecleadas, selladas), no subtítulos encima.

## Respiración y ritmo

- Lo que se quiere recordar se sostiene quieto ≥1 s; el título final, más.
- La velocidad viene de la aceleración, no de moverse rápido y parejo; nada lineal.
- La primera versión casi siempre sale rápida: si hay duda, respirar más.
- Sacudidas de pantalla o flashes: máximo 3 por pieza, en los golpes más fuertes.
- Brillo decorativo repartido por todos lados se ve barato; un solo punto de luz bueno, no.
- Una idea a la vez; el texto nunca va encima de la acción; anticipación antes de cada golpe; cada pose se sostiene
  ≥1.3 s. Detalle en [principios-lasseter.md](principios-lasseter.md).

## Técnica

- **Determinismo:** nada de `Math.random()` ni reloj; semillas fijas para que cada cuadro se pueda reproducir y corregir.
- **Nitidez:** el texto en 3D se rasteriza a 2–4× y se reduce; si se ve borroso, revisa la resolución de la textura
  antes que la cámara.
- El modelo rinde más en terminal y navegador que operando programas ajenos.
