# El corpus: lo que dicen tus referentes, con cita y minuto

Tus mentores y referentes hechos texto local, buscable con `rg` y citable al minuto. Una fuente de verdad (archivos
`.md` en tu cerebro), sin embeddings ni base vectorial: se llega a la respuesta leyendo poco y en orden.

## Dónde vive

```
contenido/intel/
  INDICE.md                         el mapa maestro: campos, quién, carpeta, cobertura y fecha (lo mantiene Levy)
  <slug-del-referente>/youtube/     un corpus por fuente (también podcast/, eventos/, libros/…)
    transcripts/  fichas/  _index.json  INDICE.md
  _temas/                           opcional: un archivo por tema con los items de todos los corpus
```

## Antes de bajar nada: los campos del dueño

El corpus sirve a la vida y al negocio del dueño, no a una lista ajena. La primera vez:

1. Lee lo que ya sabes de él: `.claude/memory/RETRATO.md`, `.claude/memory/PERSONALIDAD.md` (su mentor de fábrica),
   `.claude/memory/project/mi-negocio/` (su oferta, su mercado) y `contenido/intel/INDICE.md` si existe.
2. Si el pedido ya nombra a alguien («qué dice X sobre precios»), empieza por ese: baja su corpus, responde y anótalo
   en el mapa; la lista completa se arma después. Si no hay mapa ni nombre, pregúntale una vez: «¿A quién quieres tener a la mano para consultar? Dime de dos a cinco personas
   y para qué parte de tu vida o tu negocio te sirve cada una.» Ofrece tú una propuesta corta si duda.
3. Ordénalos por **campo** (negocio, comunicar, cuerpo, sabiduría, su nicho, frontera…), no por persona, y escríbelo
   en `contenido/intel/INDICE.md`. Agrega una línea en `.claude/memory/MEMORY-indice.md` con sus palabras como
   disparadores («qué dice X», «mis mentores», el nombre de cada uno), siguiendo `memory-manager`.

**Mentor no es competidor.** Un mentor se consulta para pensar; un competidor del mismo nicho se estudia como
benchmark (`references/referente.md`). Un mismo creador puede estar en los dos lados: se archiva por la **función del
contenido**, no por quién habla.

## Bajar un corpus

```bash
python3 .claude/skills/intel/scripts/corpus.py bajar "https://www.youtube.com/@canal/videos" \
  --corpus contenido/intel/<slug>/youtube --idioma en --limite 50
python3 .claude/skills/intel/scripts/corpus.py indice contenido/intel/<slug>/youtube --titulo "<Nombre> · YouTube"
```

- Es reanudable: lo ya bajado se salta. `--desde AAAAMMDD` para lo reciente, `--min-segundos 600` para saltar clips.
- Guarda la **descripción** de cada video junto al verbatim: ahí viven sus enlaces y llamados (los usa `ideal-funnels`).
- Empieza chico (20 a 50 videos del tema que importa) y crece cuando una pregunta lo pida. Un corpus enorme que nadie
  consulta es inventario, no inteligencia.

**Fallas medidas de yt-dlp (no improvisar):**
- «Only images are available for download»: no es un video sin formatos, es el reto de YouTube. El script ya pasa
  `--remote-components ejs:github`; si sigue, actualiza yt-dlp (`pip install -U yt-dlp`): una versión de más de 90
  días suele fallar aunque tenga cookies.
- «Sign in to confirm you're not a bot»: agrega `--cookies-del-navegador chrome` (o el navegador donde el dueño tenga
  sesión de YouTube). Las cookies son suyas: pídele permiso la primera vez.
- `--list-subs` con 200 idiomas: los `xx-en` son traducciones automáticas. Lo que vale es lo que está bajo
  «Available subtitles» (los del creador) o el automático en su idioma original.

## Buscar (lee lo mínimo, en este orden)

1. **Tema:** `contenido/intel/_temas/<tema>.md` si existe, o la tesis por item en `<corpus>/INDICE.md`.
2. **Ficha:** `<corpus>/fichas/<archivo>.md` dice si el video responde y en qué minuto (`references/fichas.md`).
3. **Frase:** `python3 .claude/skills/intel/scripts/corpus.py buscar contenido/intel "la frase"` o `rg` directo:
   ```bash
   rg -i -B1 -A3 "leverage" contenido/intel/<slug>/youtube/transcripts/      # con contexto
   rg -il "first principles" contenido/intel/                                  # solo qué archivos
   rg -il "subir precios" contenido/intel/*/*/fichas                           # las fichas están en español
   ```
4. **Leer** el verbatim en ese rango. Se cita el verbatim, nunca la ficha.

Comparar dos referentes: busca el tema en cada corpus, lee los mejores resultados de cada uno y sintetiza con cita y
link de cada quien. Marca el contraste (uno táctico, otro filosófico) en vez de promediarlos.

## Citar con minuto (regla de oro)

```bash
python3 .claude/skills/intel/scripts/corpus.py link <transcript.md> 01:02:00   # → https://youtu.be/<ID>?t=3720
```

A mano: `segundos = H×3600 + M×60 + S` y `https://youtu.be/<VIDEO_ID>?t=<segundos>`. Toda cita de un video lleva su
link al minuto. Si la fuente no es video (libro, ensayo, discurso), cita su URL real.

## Dos modos de acceso

- **Destilado** («qué dice X sobre Y», «compara a X y Y»): Levy ubica el campo, busca y responde con cita y link.
- **Verbatim** («pásame el texto», «quiero leerlo yo»): la ruta local exacta del transcript y la URL de la fuente.

## Reglas

- **No inventar citas.** Si la búsqueda no lo trae, «no está en el corpus». Lo que no está en disco no existe para ti.
- **El verbatim no se edita ni se resume en su lugar.** Las fichas rutean encima; nunca lo sustituyen.
- **Idioma:** el verbatim queda en su idioma; al dueño se le cita traducido y se le da el original si lo pide.
- **Cifras de terceros, atribuidas:** «dice que…». Una cifra dicha en un video es una declaración, no un dato auditado.
- Al bajar más contenido: `indice` del corpus y una línea con fecha y cobertura en `contenido/intel/INDICE.md`.
