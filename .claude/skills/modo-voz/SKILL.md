---
name: modo-voz
description: La voz de Claude en tu Mac (SFlow la dice en voz alta). Tres usos — (1) resumen hablado en lenguaje sencillo, de una respuesta o de cada respuesta del chat; (2) narración en vivo de una demo en pantalla (con demo); (3) apagar. Úsala SIEMPRE que la persona pida voz, con sus palabras o con comando — "léeme el resumen", "dímelo en voz", "resumen en voz", "modo voz", "usa la skill de modo voz", "con demo", "sin demo", "modo demo", "nárrame la demo", "muéstrame en pantalla con voz", /modo-voz, /modo-voz demo — y para apagarla — "apaga el modo voz", "apaga el demo", "para la voz", "/modo-voz apagar".
---

# Modo voz — Claude habla contigo a través de SFlow

Cada línea que **empieza con 🔊** la dice SFlow en voz alta en tu Mac (con la voz que elegiste en su menú «Voz de lectura»). El 🔊 es la marca que buscan los ganchos de Claude Code (`claude_hooks/voz.py`); es la única excepción si tus instrucciones piden no usar emojis.

## Cómo se habla (vale para todo)

- **El 🔊 va al inicio de su propia línea.** Nunca dentro de código ni a mitad de una frase: ahí no cuenta.
- **Es para oírse, no para leerse:** en el idioma de la persona y en tono de conversación. Sin código, rutas, comandos, siglas técnicas, tablas ni enlaces. Números solo si importan, dichos como se hablan.
- **El resto de tu respuesta no cambia.** Lo técnico sigue escrito igual, en líneas aparte, y no se oye.

## 1 · Resumen hablado (sin demo)

- **Una vez** ("léeme el resumen", "dímelo en voz"): cierra ESA respuesta con un párrafo que empiece con 🔊, antes de la firma si la hay.
- **En cada respuesta** ("modo voz", "usa el modo voz", "sin demo", /modo-voz): haz lo mismo en todas las respuestas de este chat hasta que lo apague.
- **Cómo:** 2 a 4 frases (unas 40-80 palabras), empezando con el nombre de la persona si lo sabes. Qué hiciste o encontraste, y qué necesita decidir o hacer. Nada más.
- **UN SOLO 🔊 por respuesta, y un solo bloque.** Fuera del modo demo, SFlow solo dice el **último** bloque 🔊 de la respuesta, y el bloque termina en el primer renglón en blanco. Un segundo 🔊 anula todo lo anterior, y un renglón en blanco corta lo que sigue.
- **Si piden comentarios en voz con varias ideas:** una línea 🔊 de entrada y, **pegadas debajo sin renglón en blanco**, las ideas en viñetas (`- `), cada una en una o dos frases que terminen en punto. Ejemplo:

  ```
  🔊 Te doy mis comentarios en tres ideas.
  - Primera idea, en llano.
  - Segunda idea.
  - Tercera idea.
  ```

## 2 · Narración en vivo de una demo ("con demo", "modo demo", /modo-voz demo, /modo-demo)

Mientras muestras algo en el navegador o en pantalla, cada línea 🔊 la dice SFlow **antes** de tu siguiente acción, y la acción espera a que la voz termine (máximo ~10 s): lo que se oye y lo que se ve van juntos.

**Encender:** corre `/usr/bin/python3 "$HOME/Library/Application Support/SFlow/modo_demo.py" on` y confírmalo en una línea. Si no encuentra SFlow, avisa: la demo sigue igual, solo que sin voz. Se apaga sola a las 3 horas.

**Narrar:**
- **Intro:** antes de la primera acción, una línea 🔊 con lo que vas a mostrar.
- **Un paso, una línea:** antes de cada paso **visible**, UNA línea 🔊 de menos de ~20 palabras con lo que va a ver o por qué importa. Narra el paso, no cada herramienta: una ráfaga de clic y captura lleva una sola línea, o ninguna.
- **Cierre:** al final, un párrafo 🔊 con qué se vio, qué quedó bien y qué hay que decidir.

**Protecciones de calidad (obligatorias). Lo primero es la prueba; la narración es un extra:**
1. **Tiempos:** una línea 🔊 hace esperar a la acción siguiente. Nunca la pongas **entre una acción y su verificación** cuando el tiempo importa: un aviso que desaparece solo, una animación, medir cuánto tarda en cargar, una sesión que vence. Narra **antes** de empezar esa secuencia.
2. **Nada se omite por narrar:** mismas revisiones, mismo orden, mismas esperas y mismos criterios que sin voz. Si dudas entre narrar y verificar, verifica.
3. **Coherencia:** narra lo que vas a hacer justo antes de hacerlo. Si algo falla o sale distinto, dilo en la siguiente línea 🔊. No narres un éxito que no verificaste.
4. **Si no hay voz** (SFlow cerrada o silenciada), todo sigue exactamente igual: nada espera.

## 3 · Apagar

- **"Apaga el modo voz"** o "para la voz" (/modo-voz apagar): corre `/usr/bin/python3 "$HOME/Library/Application Support/SFlow/modo_demo.py" off` y deja de poner 🔊, en resúmenes y en narración.
- **"Apaga el demo"** o "sin demo": corre el mismo `off`, deja de narrar, y sigue con el resumen hablado si estaba encendido.
