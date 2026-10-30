# Oficio · cómo apuntar alto

## Las palabras que te desatan

Léelas como dirigidas a ti antes de diseñar. Vienen de prompts reales que hicieron que un modelo
entregara piezas que la gente no podía creer:

- «Suelta tu imaginación y moviliza todas tus capacidades: crea algo que deje asombrado a cualquiera
  que lo vea, sean expertos, gente que no sabe nada de tecnología o niños.» La vara es heterogénea: legible
  sin explicación y profundo a la vez.
- «Ya me cansé de ver lo mismo.» Nombra lo promedio (viñetas, tarjetas con íconos, plantillas de
  PowerPoint) para no hacerlo.
- «Más compleja, más fina, más bella.» Tres ejes a la vez, no uno.
- «No te apures.» Una lámina que enseña vale el tiempo de escribir su propio dibujo en canvas.
- «No te quedes con tu primera idea: genera varias, descarta los clichés, elige y justifica.» La primera
  idea suele ser la de todos.
- La referencia que te pasen es piso, no plantilla: igualar su calidad y luego superarla con lo que
  solo tú puedes hacer (código que se mueve).

## Una idea por lámina

- El título es una afirmación («Alinear vale más que sumar»), no un tema («Alineación»).
- Si la lámina necesita una lista de cinco, son cinco clics o cinco láminas.
- Menos texto, más dibujo: lo que el dueño va a decir no se escribe también en pantalla.
- Máximo cinco clics por lámina; más, divídela.

## Enactivo: la caja contra el dibujo que ES la idea

Una **caja** rotula el concepto desde afuera (tarjeta + ícono + texto). Un **enactivo** lo encarna: en
vez de «las ventas suben», la curva se dibuja y el número cuenta; en vez de «tus procesos se conectan»,
los nodos sueltos se enlazan uno por clic. La caja está bien solo para estructura pura (agenda,
comparación); todo lo que explica un mecanismo pide enactivo.

Tres tests antes de darlo por bueno (escríbelos en un comentario arriba del enactivo):

1. **Tapa:** si tapas el texto, ¿el dibujo solo enseña la idea?
2. **Después:** quien lo vio, ¿puede explicarlo con sus palabras?
3. **Clic:** cada paso cambia el estado del sistema (se alinean, se conectan, se llena), no solo aparece.

Técnica: canvas 2D en `enactivos.js`, semilla fija (mismo dibujo cada vez), colores leídos del tema con
`getComputedStyle`, nada que corra si su lámina no está visible (el motor ya lo cuida). Si simula algo
(crecimiento, flujo), que los números sean coherentes: nada de constantes al azar que mientan.

## Movimiento que respira

- Una cosa a la vez: «mira esto, ahora mira esto».
- Acelera y frena; nada lineal. Curva de la casa: `cubic-bezier(.2,.7,.3,1)`, medio segundo, 14 px.
- Lo importante se queda quieto al menos un segundo. El texto nunca va encima de la acción.
- Un solo punto de luz bueno vale más que brillo repartido por todos lados.
- El chrome (contador, avance) nunca se anima ni compite; si va a grabarse, que no se vea nada encima.

## Ritmo de la clase

- Portada con una frase que se queda; cierre con una sola acción.
- Alterna materia: lámina de dibujo, lámina de una cifra enorme, lámina de una frase. Tres láminas
  seguidas iguales aburren.
- Las notas por clic son el guion del dueño: lo que dice en ese clic, en una línea, en su voz.
