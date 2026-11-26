# Rama · video por código

Para videos que nacen de código: historia o concepto, comerciales, intros, cualquier render donde imagen, música y
efectos salen de la misma línea de tiempo. Si el video enseña un tema con voz narrada, lee antes
[explicativo.md](explicativo.md).

## Tesis

Los mejores resultados públicos salieron de **una frase y libertad**, no de plantillas. Creadores que hicieron piezas
virales observaron que el modelo rinde peor amarrado a herramientas de terceros (incluso a un motor de video conocido)
y mejor en terminal y navegador con una sola restricción de formato. Por eso esta rama no trae recetario ni motor
obligatorio: **libertad total por código**, y el modelo genera imagen y sonido como considere. Tampoco se le dicta la
historia: se le da el tema y la vara, y él decide qué contar.

## Modos

| Modo | Cuándo | Referente público |
|---|---|---|
| **Código puro** (por defecto) | Video renderizado: imagen, música y efectos del mismo código | «occidente», «partículas» ([galeria.md](galeria.md)) |
| **Pieza viva** | El resultado se toca en el navegador. Rama propia: [piezas-vivas.md](piezas-vivas.md) | «moyun» |
| **Mixto** | El estilo pide personajes o ilustración rica: imágenes generadas como capa, compuestas y animadas por código | Donald Jewkes, «PC-98» |

En modo mixto las imágenes salen de `image-generation`. Si el modelo no las pide, no se le imponen.

## Las tres capas de apoyo (cada una en su momento)

1. **Gusto y vara, siempre visibles:** la ficha de estilo de tu dueño, si tiene ([estilos.md](estilos.md)). Son
   palabras, no ejemplos.
2. **Motor sin escenas, opcional:** si piezas anteriores dejaron código reutilizable (render, sonido, medir) en
   `mi-negocio/animaciones/kit/`, ahorra horas pero no decide nada creativo. Se copia a la carpeta nueva; el original
   no se toca; las escenas y la partitura nacen en blanco. Se abre después de idear, nunca antes.
3. **Referencias como vara, al final:** el agente escribe sus ideas a ciegas primero y solo después mira la galería o
   las piezas anteriores para superarlas. Mejor aún: que las vea un crítico aparte que juzga el resultado.

## El primer minuto (la intro que atrapa)

Reglas medidas al competir contra canales que retienen bien. Son rangos para revisar, no un guion:
1. **Lo más fuerte del video va en 0 a 3 s:** el giro o lo que está en juego, dicho en una frase. La noticia o el
   contexto entra después, como prueba.
2. **Algo grande en pantalla antes de 1.6 s:** una cifra o un símbolo enorme con su golpe grave.
3. **Cambios frecuentes en la intro:** un corte cada 1 a 3 s, con material real (capturas, titulares, código) la mayor
   parte del tiempo. El cuerpo puede ir más calmado.
4. **Tamaños que se leen en el teléfono:** lo principal nunca chico; las cifras enormes; las listas grandes.
5. **Nunca quieto sin propósito:** cada plano empuja un poco (un acercamiento lento, una capa que avanza).
6. **Sonido de la intro:** nada de bombo bajo la voz, como mucho cuatro golpes grandes (el giro, la revelación, la
   apuesta y el capítulo), whoosh solo en los cambios de mundo, ningún efecto por encima de la voz.
7. **Un hueco de curiosidad:** algo que se insinúa y no se revela hasta después.
8. **Cierre de la intro:** una frase de entrada, un respiro de negro y la tarjeta del primer capítulo.

## Si hay un presentador en pantalla

Si tu dueño sale a cámara o tiene un avatar que habla, sus gestos van por intención y no por palabra suelta: señalar
solo cuando hay algo real a ese lado de la pantalla, las cifras nunca se cuentan con los dedos (las pone el texto
grande), una pregunta ladea la cabeza, una afirmación asiente, «tú» o «fíjate» se inclina hacia la cámara. Un cabeceo es
acento, no tic. Su cara nunca queda tapada ni recortada: nada encima de la frente al mentón, los gráficos a los lados
o a pantalla completa con su voz debajo, y en un recuadro su cabeza entera con aire arriba (≥ 12 % del alto del marco)
y abajo (mentón y algo de hombros), la cara en ≤ 45 % del alto de su marco. Si no cabe, se aleja la toma.

## Ciclo de trabajo

El de `SKILL.md`, con dos pasos propios de esta rama:
- **Los tres cortos:** un largo (un video de 4 minutos o más con voz, como un explicativo)
  no está terminado sin sus cortos verticales: [cortos.md](cortos.md). Intros y comerciales no cuentan como largo.
- **Registro de la familia:** si tu dueño hace varios videos del mismo tipo, cada uno anota en la bitácora su forma, su
  motivo, su orientación y su cierre. Esa tabla es la vara y el detector de copias (ver [explicativo.md](explicativo.md)).

## Devolver al kit

Cuando un video inventa una herramienta que puede servir a otro tema (una gráfica, un dispositivo, un efecto):
1. Vive en su propio archivo, no enterrada en las escenas.
2. Es pura en el tiempo y determinista (sin `Math.random`, reloj ni estado del cuadro anterior) y su texto se lee.
3. Tiene sus parámetros y qué hace escritos en `mi-negocio/animaciones/kit/KIT.md`, con su banco de cuadros sueltos
   de prueba.
4. Se anota de qué video salió, para que el siguiente sepa que es una herramienta y no un rasgo del estilo.
5. Un arreglo al motor común se anota y se lleva hacia adelante; no se bifurca en silencio.

Lo que es tema y no herramienta (la forma que dice la tesis de un video) se queda en su carpeta.

## Trampas medidas

- La transición se **centra** en el golpe; el tiempo local de un plano cuenta desde el corte.
- Un golpe sonoro sin acción en su cuadro se nota aunque el audio mida perfecto: mide también el pico visual por golpe.
- Si hay narración, mide el guion antes de grabar (alrededor de 13 a 14 caracteres por segundo con respiro): el primer
  borrador casi siempre dura más de lo que se cree.
- Varios renders pesados a la vez saturan la computadora: de uno en uno o dos en dos, en tramos de unos minutos.
- Un `while read` con ffmpeg o node adentro se come sus líneas: el bucle lee por otro descriptor (`read -u 3`) y lo de
  adentro lleva `< /dev/null`. Cuenta los cuadros que salieron contra los esperados.
