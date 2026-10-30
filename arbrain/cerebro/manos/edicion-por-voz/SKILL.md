---
name: edicion-por-voz
description: Edita un video hablando con tu agente, sin abrir un editor. «Edita este video» transcribe, arma el corte limpio (sin repeticiones ni muletillas), prepara 2 o 3 versiones con tratamientos distintos, pule con frases como «más rápido al inicio», «quita el minuto 2:10» o «sácame un vertical de 40 s», y exporta horizontal y vertical listos para subir. Funciona con cualquier cliente de agente (Claude Code incluido), en macOS, Linux o Windows, con Python 3, ffmpeg y Pillow. Nunca publica nada por su cuenta.
---

# Edición por voz

El dueño habla; el agente edita. Nadie abre un editor de video. La edición es **datos** (`edicion.json`), un solo `render.py` la convierte en video y cada pulido es una revisión nueva que conserva la anterior.

**Prueba de punta a punta (una sola orden desde la carpeta de esta skill, como los demás comandos; imprime las rutas de todo):**

```
python3 scripts/prueba_e2e.py
```

Usa una grabación sintética, la API de transcripción que haya en el entorno (o un respaldo declarado) y deja todo bajo `/tmp/edicion-por-voz-prueba/`. En Windows o Linux, o sin la voz `say` de macOS: `--fuente mi-video.mp4`.

## Antes de la primera vez

1. `python3 scripts/entorno.py` revisa Python 3.9+, ffmpeg/ffprobe (con libx264 y aac), Pillow y una tipografía. Si falta algo, dile al dueño exactamente qué instalar (macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, todos `python3 -m pip install pillow`). En Windows usa `py` o `python` donde dice `python3`.
2. **Ficha de marca** (una vez, por conversación, nunca un formulario). Si `python3 scripts/ficha.py ver` dice `existe: false`, haz las 5 preguntas de `python3 scripts/ficha.py preguntas`, **una a una**, esperando cada respuesta, y guarda con `ficha.py guardar --json '{...}'` en `~/.cerebro/ficha-de-marca.json`. Un proyecto puede traer la suya en `<proyecto>/ficha-de-marca.json` y gana sobre la global. Plantilla neutra: `references/ficha-de-marca.ejemplo.json`. Mientras no exista, el render usa la neutra.
3. **Aviso de privacidad (una vez).** Transcribir manda el AUDIO a un proveedor externo. Antes del primer uso corre `ficha.py proveedor` para ver cuál recibiría el audio, díselo al dueño con su nombre («tu audio se envía a Groq para transcribirlo») y pregunta si está de acuerdo. Solo con su sí: `ficha.py confirmar-proveedor --proveedor <nombre>`. `transcribir.py` se niega a enviar sin esa confirmación (código 3). Si prefiere no enviar audio: `--palabras` (su propia transcripción) o `--local` (faster-whisper, opcional, más lento, sin red).

## El flujo (la conversación)

Carpeta del proyecto = una carpeta por video, p. ej. `<proyecto>/` con `fuente/`, y los scripts crean `versiones/` y `finales/`. Nombres de archivos y carpetas **neutros** (`video-01`, no el tema): hasta el nombre filtra tema a quien mira.

### 1. «Edita este video»
```
python3 scripts/transcribir.py <video> --proyecto <proyecto>
python3 scripts/corte_limpio.py proponer --proyecto <proyecto>
```
`transcribir.py` autodetecta el proveedor por variable de entorno (`GROQ_API_KEY`, `OPENAI_API_KEY` o `LEMONFOX_API_KEY`; también en `<proyecto>/.env` o `~/.cerebro/.env`; nunca imprimas la clave), pide palabras con tiempos (`verbose_json` + `timestamp_granularities[]=word`) y trocea el audio si pasa el límite de 25 MB. Salida: `palabras.json`.

`proponer` escribe `frases.txt` (lista **numerada** de frases con tiempos y las marcas de cada propuesta) y `decisiones.json`. El script solo propone: repeticiones y falsos arranques (frases adyacentes parecidas), autocorrecciones («…, perdón, …»), muletillas y silencios largos (se acortan a un respiro de 0.6 s, nunca se eliminan). **Tú decides por significado**: lee `frases.txt` completo, no solo las marcas. Una repetición que es énfasis deliberado, una demostración o un matiz se conservan; una duda real se le pregunta al dueño. Edita `decisiones.json` (`aplicar` true/false, y en `manual`: `quitar_frases`, `quitar_tramos`, `conservar_frases`). Luego:
```
python3 scripts/corte_limpio.py aplicar --proyecto <proyecto>
```
Escribe `corte.json`. Los cortes caen siempre en el hueco entre palabras y en el punto de menor energía del audio (sin clics, sin cortar a media palabra). Oficio completo: `references/oficio-de-edicion.md`.

### 2. Versiones en paralelo
2 o 3 «editores» independientes, cada uno con un tratamiento distinto y su propio `versiones/vN.edicion.json`; un solo `render.py` los renderiza (borrador 720p para revisar). Arranque rápido desde plantillas:
```
python3 scripts/aplicar.py nueva --proyecto <proyecto> --nombre v1 --plantilla sobria     # cortes limpios + subtítulos en frases clave
python3 scripts/aplicar.py nueva --proyecto <proyecto> --nombre v2 --plantilla dinamica   # ritmo apretado + zooms de énfasis + subtítulos por frase
```
Para tratamientos propios, cada editor redacta su `edicion.json` (esquema en `references/edicion-json.md`), lo valida con `aplicar.py validar --ruta <archivo>` y renderiza con `render.py <archivo>`. **Cómo lanzarlos**: en Claude Code, un mensaje con 3 llamadas a la herramienta Agent a la vez; sin subagentes, uno tras otro. Prompt base y reglas (no abrir las carpetas hermanas, no ver las otras versiones antes de terminar, vara de calidad al final): `references/editores-en-paralelo.md`.

Abre las versiones en el visor para comparar (ver «Abrir en Arbrain»).

### 3. Pulir hablando
El dueño dice cosas como «más rápido al inicio», «quita el minuto 2:10», «subtítulos en las frases clave», «sácame un vertical de 40 s». Tú las traduces a operaciones estructuradas y las aplicas a **esa** versión:
```
python3 scripts/aplicar.py op --ruta <proyecto>/versiones/v2.mp4 --ops '[{"op":"acelerar","desde":0,"hasta":40,"velocidad":1.15}]'
```
Resultado: `v2.1.edicion.json` + `v2.1.mp4`; la v2 queda intacta (la siguiente corrección da v2.2, y así). Catálogo de operaciones (quitar tramo o frase, acelerar, apretar pausas, subtítulos en 3 modos o a mano, zoom, vertical con duración máxima, logo) y traducciones típicas de frases: `references/dialogo-y-operaciones.md`. Cambios creativos que no caben en una operación («hazlo más enérgico») van al **mismo editor** (el subagente que hizo esa versión, o tú releyendo su `edicion.json`) y se guardan como la siguiente revisión (`aplicar.py siguiente`).

**El instante marcado.** El visor deja marcar un momento y manda un mensaje cuya primera línea es exactamente:
```
⏱ Video «v2.mp4» · 2:10 (tiempo=130.4) · ruta=/abs/ruta/v2.mp4
```
y debajo el comentario del dueño. Puede llegar con **varias marcas** (bloques separados por una línea en blanco) y también como `⏱ Audio «…»`. Ese tiempo es de la **línea de tiempo de la versión mirada, no de la fuente**: `aplicar.py op --mensaje "<el mensaje completo>" --ops '[...]'` lo parsea (la `ruta` se normaliza con realpath, así que `/tmp` y `/private/tmp` coinciden), lo mapea a tiempo de fuente con los cortes y velocidades de esa versión y traduce juntas todas las operaciones antes de ejecutarlas (varias marcas u operaciones no se desplazan entre sí). «Quita esto» = `{"op":"quitar_frase"}` sobre la marca; «quita el minuto 2:10» es también tiempo de la versión que mira. Para comprobar un mapeo: `aplicar.py tiempo --ruta <v.mp4> --tiempo 130.4`.

Cada corrección: dile al dueño en una línea qué cambió y cuánto (los `cambios` y duraciones que imprime el script) y vuelve a abrirla en el visor comparada con la anterior, en el mismo instante (el script imprime el JSON de `mostrar` listo).

### 4. Exportar
```
python3 scripts/exportar.py --proyecto <proyecto> --version v2.1 --nombre mi-video --vertical-max 40
```
Produce `finales/mi-video-horizontal.mp4` (1920x1080) y `finales/mi-video-vertical.mp4` (1080x1920, con la duración máxima pedida y terminando al final de una frase): H.264 + AAC, yuv420p, faststart, sonoridad a -16 LUFS en dos pasadas. Mide y reporta duración, resolución, sonoridad y tamaño, y escribe `<proyecto>/entrega.json` = `{"titulo", "finales": [rutas relativas], "piezas": [rutas relativas], "nota"}`.

**Nunca publica ni sube nada.** Esta skill no trae código de publicación. Subir a YouTube, redes, comunidad o correo solo si el dueño lo pide explícito en ese mensaje, y con la herramienta que él tenga para eso. Exportar no es permiso para publicar.

### 5. Cerrar la pieza
Cuando el dueño eligió y terminó el feedback: lista lo que el propio pipeline generó y ya no hace falta (borradores `versiones/*.mp4` descartados, `.trabajo/`), muéstrasela y bórrala **solo** con su visto bueno, archivo por archivo. Conserva `fuente/`, `palabras.json`, los `edicion.json`, los finales y `entrega.json`. Nunca borres con comodines recursivos ni toques nada que el pipeline no haya generado.

## Abrir en Arbrain (la experiencia de primera)

Todo lo que produzcas se abre **dentro de Arbrain**, con la herramienta `mostrar` del MCP `cabina` (vista `documento`, ruta absoluta; el visor acepta rutas del repo, `~/Developer`, `/tmp`, `~/Movies`, `~/Desktop`, `~/Downloads`, `~/Documents`, `~/Pictures` y `~/Music`). `scripts/abrir.py` imprime el JSON exacto de cada caso; tú lo pasas a `mostrar`:

| Qué | Orden | Parámetros de `mostrar` |
|---|---|---|
| Una versión | `abrir.py version v2.mp4 [--tiempo 130.4]` | `ruta`, `titulo`, `tiempo` (segundos donde abrir) |
| Comparar dos (lado a lado o alternando) | `abrir.py par v1.mp4 v2.mp4` | `ruta` + `compararCon` = ruta de la otra |
| Los 3 editores | `abrir.py trio v1.mp4 v2.mp4 v3.mp4` | `ruta` + `versiones` (lista de rutas) |
| Revisión vs la anterior en el mismo instante | lo imprime `aplicar.py op` (campo `mostrar`) | `ruta`, `compararCon`, `tiempo` |
| La entrega | `abrir.py entrega --proyecto <p>` o `abrir.py carpeta <dir>` | `ruta` = la **carpeta**: se abre como entrega (finales primero, luego piezas, según `entrega.json`) |

Si el cliente **no** tiene Arbrain, abre con el reproductor del sistema (macOS `open <ruta>`, Windows `start "" <ruta>`, Linux `xdg-open <ruta>`) y dile al dueño que comparar versiones y marcar un instante para corregirlo son del visor de Arbrain; sin él, te dice el minuto en palabras y tú usas `--ops` con `desde`/`hasta`.

## Límites y seguridad (decláralos, no los escondas)
- **No publica, no envía mensajes, no sube material.** Lo único que sale de la máquina es el audio hacia el proveedor de transcripción, con el aviso y el sí del dueño ya registrados en la ficha.
- Ruta ligera: Python 3 + ffmpeg + Pillow (ffmpeg sin `drawtext` ni libass: los subtítulos son PNG de Pillow superpuestos con `overlay` y `enable`). Sin dependencias raras, sin bash; funciona con `pathlib` y listas de argumentos en Windows.
- Tiempos de render medidos (equipo de escritorio de 10 núcleos): borrador 720p de un video de 1 min ≈ 5 s; export final de 56 s horizontal 1080p + 40 s vertical 1080x1920 ≈ 26 s en total. En una laptop sin GPU cuenta **2 a 4 veces más**; un video de 30 min exporta en minutos, no segundos. Para videos de más de 20 min, trabaja el borrador y exporta una vez. La resolución final es 1080p; el vertical es un recorte (`foco_x`) o fondo difuso, y sube de escala 1.78x un video 16:9, así que se ve más blando que el horizontal (límite conocido).
- Los cortes van en orden cronológico; reordenar fragmentos no está soportado en la ruta ligera.
- Whisper suele omitir muletillas: la pausa que dejan queda como hueco y el silencio largo se acorta igual.
- Opción avanzada con las skills de Hyperframes (subtítulos cinematográficos, capas sobre el orador, gráficos): `references/hyperframes-avanzado.md`. No es la ruta por defecto.

## Referencias
- `references/oficio-de-edicion.md` · criterio del corte limpio, ritmo, subtítulos, tres editores, feedback como ingredientes con dosis.
- `references/edicion-json.md` · esquema completo del `edicion.json` y cómo se mapean los tiempos.
- `references/editores-en-paralelo.md` · cómo lanzar 2-3 editores (subagentes o secuencial) y qué prompt darles.
- `references/dialogo-y-operaciones.md` · del lenguaje natural a operaciones; ejemplos.
- `references/hyperframes-avanzado.md` · cuándo y cómo apoyarse en las skills de Hyperframes.
- `references/ficha-de-marca.ejemplo.json` · plantilla neutra de la ficha.
- `scripts/` · `entorno.py`, `ficha.py`, `transcribir.py`, `corte_limpio.py`, `aplicar.py`, `render.py`, `exportar.py`, `abrir.py`, `prueba_e2e.py`, `prueba_transcribir_simulado.py`.
