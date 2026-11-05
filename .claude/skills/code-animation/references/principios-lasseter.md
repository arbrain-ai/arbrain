# Principios de animación de Lasseter

**Fuente:** John Lasseter, «Principles of Traditional Animation Applied to 3D Computer Animation», SIGGRAPH 1987
(*Computer Graphics* 21(4), pp. 35–44). Lleva a la animación por computadora los principios clásicos de los
animadores de Disney.

## Los principios, en una línea cada uno
1. **Aplastar y estirar:** el volumen se conserva mientras la forma cede; da peso y elasticidad.
2. **Timing:** cuántos cuadros dura una acción decide su peso y su significado.
3. **Anticipación:** un pequeño movimiento contrario antes de la acción grande, para que el ojo sepa qué va a pasar.
4. **Puesta en escena:** una sola idea a la vez, clarísima; nada compite con lo importante.
5. **Continuidad y acción superpuesta:** las partes no paran al mismo tiempo; lo que sigue se mueve un poco después.
6. **Directo contra pose a pose:** planear las poses clave y luego intercalar.
7. **Entradas y salidas suaves:** acelerar al arrancar y frenar al llegar; nada en velocidad constante.
8. **Arcos:** el movimiento natural va en curva, no en línea recta.
9. **Exageración:** empujar la idea lo suficiente para que se lea.
10. **Acción secundaria:** un detalle que apoya la acción principal sin robarle la atención.
11. **Atractivo:** formas y movimientos que dan ganas de seguir mirando.

## El error más común con IA: ir demasiado rápido
Las piezas generadas meten muchas cosas a la vez y no dejan que cada acción se lea. Regla: menos cosas a la vez, más
tiempo por acción, una pose clara antes de pasar a la siguiente y anticipación antes de cada golpe.

## Cómo usarlo
Pídele al agente que, ANTES de entregar, revise sus cuadros contra esta lista «como un animador de Pixar» y deje una
tabla «principio → qué cambió». No le dictes la historia: solo la vara del movimiento.

## Lo que dice el artículo
- **Timing:** «spend enough time (but no more) preparing the audience for: the anticipation of an action; the action
  itself; and the reaction to the action. … If too little time is spent, the movement may be finished before the
  audience notices it, thus wasting the idea.»
- **Anticipación:** «If they are not properly prepared for a very fast action, they may miss it completely; the
  anticipation must be made larger or the action slower.»
- **Puesta en escena:** «only one idea be seen by the audience at a time. … The animator is saying, in effect, "Look
  at this, now look at this, and now look at this."»
- **Superposición:** «An action should never be brought to a complete stop before starting another action, and the
  second action should overlap the first.»
- **Acción secundaria:** «A change in the middle of a major move will go unnoticed … The change must come before, or
  after, the move.»
- **Arcos:** «Straight inbetweens can completely kill the essence of an action.»
- **Personalidad:** no es un principio más, sino «the intelligent application of all of the principles».

## Trampas medidas
1. **El impacto no se escalona.** El golpe sonoro y la acción principal van en el mismo cuadro; lo que se escalona
   es lo que sigue (palabra +0.25 s, detalle +0.6 s). Retrasar el pulso principal 80 ms para «que siga» bajó la
   sincronía medida de 3.6× a 2.0×.
2. **Una pose que no llega no se lee.** Revisa en la hoja de cuadros que cada pose esté completa y quieta (≥1.3 s)
   antes de la anticipación que sigue.
3. **El respiro alarga.** Aplicar estos principios a una pieza de 43 s la llevó a 61 s. Para redes, decide antes
   cuánto respiro cabe en lugar de recortar después.
4. **La medición por cortes castiga el respiro.** En una pieza lenta, mide la sincronía en cada golpe agendado, no
   con los mayores cambios visuales.
