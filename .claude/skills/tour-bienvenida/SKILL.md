---
name: tour-bienvenida
description: "El recorrido de bienvenida de Levy en el chat: qué es cada parte de la app, su personalidad, la meta, el retrato, el contexto de hoy, la memoria, los manuales, las rutinas precargadas y el freno, por capítulos y una sola vez. Usar ante «el tour», «el recorrido», «retoma el tour», «otra vez el recorrido», «explícame la app», «qué es cada cosa», «repásame el capítulo de…», «qué hay de nuevo» o «novedades», y para editar el guion (guion.md)."
---

# Tour de bienvenida

La app da el recorrido sola, en el chat, al terminar la bienvenida («Listo»): un mensaje tuyo por capítulo, con
**Siguiente**, **Muéstramelo** (abre el panel del capítulo), **Pausar** y **Saltar**. El texto sale de
[guion.md](guion.md), en esta carpeta; la app lo lee en vivo y llena la lista de manuales y de rutinas con lo real.

## Lo que tú haces

- **Entre capítulos, el dueño puede preguntarte lo que sea.** Responde corto y desde lo real de su cerebro; luego
  recuérdale que el recorrido sigue con **Siguiente** abajo del chat.
- **«Repásame el capítulo de X»:** lee ese capítulo en `guion.md` y explícalo con tus palabras, con lo vivo de su
  cerebro (sus manuales en `arbrain/cerebro/manuales/README.md`, sus rutinas en Taller › Rutinas). No inventes
  funciones que la app no tiene. Al dueño, los manuales por su título y los reportes como «tus reportes», nunca rutas.
- **«Retoma el tour»:** dile que toque **Retomar el recorrido** abajo del chat. Si ya lo terminó o lo saltó, no
  vuelve solo: explícale el capítulo que pida.
- **«¿Qué hay de nuevo?»:** si una versión trae capítulos nuevos, la app los ofrece una vez como «Novedades». Si ya
  los vio, explícaselos tú desde `guion.md`.

## Una sola vez (cómo lo sabe la app)

La app guarda en su carpeta de datos (`primer-arranque.json`, campo `tour`) los ids de capítulo vistos y la versión
del guion. Saltar cuenta como visto. En una actualización, solo los capítulos con id nuevo salen como «Novedades», una
vez. Quien ya usaba Arbrain antes de que existiera el recorrido da por vistos los `conocidos:` del guion y solo ve lo
demás, como «Novedades». No edites ese archivo: es de la app.

## Editar el guion

Sigue las reglas de la cabecera de `guion.md`: ids estables, capítulos de menos de 30 segundos de lectura, un
`<!-- mostrar: … -->` opcional bajo el título. Antes de cambiarlo, enséñale al dueño el texto nuevo; es su cerebro.
