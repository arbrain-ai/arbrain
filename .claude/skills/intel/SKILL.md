---
name: intel
description: "Inteligencia externa para decidir y crear contenido: estudiar a un competidor o referente de tu nicho, bajar los videos de tus mentores a texto y responder qué dijeron con cita y minuto exacto, fichar videos para encontrarlos rápido, y traer fuentes de otros idiomas (China, Bilibili) traducidas. Usar ante «qué dice X sobre Y», «compara lo que dicen X y Y», «pásame la cita», «en qué minuto lo dice», «baja los videos de este canal», «estudia a mi competencia», «qué le funciona a X», «benchmark de X», «qué están haciendo en China con esto», «transcribe este video», «traduce este video», «quiero aprender cómo piensa X», «mis mentores». El embudo completo de un competidor (recorridos, recursos, correo, cobro) va en ideal-funnels."
metadata:
  resumen: "Estudia a tus referentes y competidores con cita y minuto exacto, también en otros idiomas."
---

# Intel: lo que pasa afuera, con evidencia

Este hub **mide el mundo exterior** del negocio del dueño: qué dicen sus mentores, qué le funciona a su competencia y
qué viene de ecosistemas que nadie traduce. Todo con cita, fecha y fuente. Carga solo la referencia del caso.

| Si el tema es… | Abrir | Qué hay dentro |
|---|---|---|
| Qué dice un mentor o referente (cita, minuto, comparar a dos) · bajar un canal a texto | `references/corpus.md` | Dónde vive el corpus, cómo se baja, cómo se busca leyendo poco y cómo se cita al minuto |
| Encontrar rápido qué video y qué minuto responde algo · fichar videos nuevos | `references/fichas.md` | La ruta índice → ficha → verbatim, el contrato de la ficha y las instrucciones del fichador |
| Un competidor o referente de su nicho: qué contenido le funciona, cómo opera su comunidad | `references/referente.md` | Benchmark, no molde: qué se extrae, cómo se lee su canal y su comunidad, qué se entrega |
| Su embudo completo: por dónde entra la gente, qué regala, cómo cobra | skill `ideal-funnels` | Expedientes por referente y el embudo propio del dueño |
| Fuentes en chino u otro idioma · Bilibili · un video sin subtítulos | `references/otros-idiomas.md` | YouTube primero, la ruta sin cuenta de Bilibili, transcribir audio, traducir y curar a quién seguir |
| Aprender los fundamentos detrás de un referente (su formación, sus marcos) | `references/aprender-de-un-referente.md` | Fuentes primarias, límites y el método para bajarlo al negocio del dueño |

## Herramientas (autocontenidas)

- `scripts/corpus.py`: `bajar` (YouTube con `yt-dlp`: transcript, descripción y metadatos), `texto` (subtítulos o
  transcripción local a corpus), `indice`, `buscar`, `link`, `ficha`, `pendientes` y `validar`. Solo Python y
  `yt-dlp`; sin llaves. Ayuda: `python3 .claude/skills/intel/scripts/corpus.py -h`.
- `scripts/audio_a_texto.sh`: audio sin subtítulos a texto con minuto (whisper local o Groq con la llave del dueño en
  `GROQ_API_KEY`). Necesita `ffmpeg`.
- Si falta `yt-dlp` o `ffmpeg`, dile al dueño el comando de instalación de su sistema en una línea y sigue con lo que
  sí se pueda.

## Dónde vive todo

- **Corpus:** `contenido/intel/<slug>/<fuente>/` (transcripts, fichas, índice). El mapa maestro de quién es quién,
  por campo y con cobertura, en `contenido/intel/INDICE.md`.
- **Lo que decide el dueño** (sus mentores, sus competidores elegidos, su rúbrica): una línea en
  `.claude/memory/MEMORY-indice.md` que apunte a `contenido/intel/INDICE.md`, con sus palabras como disparadores.
- **El resumen de competidores para su panel:** `.claude/memory/project/mi-negocio/mercado.json` (pestaña
  Estrategia), con fuente y fecha en cada cifra.

## Antes de empezar: el contexto del dueño

Lee lo que ya existe: `.claude/memory/RETRATO.md`, `.claude/memory/project/mi-negocio/` (oferta, mercado, embudo) y
`contenido/intel/INDICE.md`. De ahí salen sus campos, su nicho, su avatar y su diferencia. Lo que falte, pregúntalo
**una vez** («¿a quién quieres tener a la mano para consultar?», «¿quién le habla a tu mismo cliente?») y guárdalo.
Lo que él diga en esta conversación manda sobre lo escrito.

## Salida: qué se hace con lo medido

Este hub mide; no decide por el dueño. Cada entrega cierra con el ángulo para él: qué ya tenía, qué le falta al
otro, y a dónde va:

| Quiere… | Va a |
|---|---|
| Comparar embudos o adaptar el mecanismo de un referente a su recorrido | `ideal-funnels` |
| Afilar su oferta con lo que vio en la competencia | `oferta` |
| Convertir un hallazgo en una idea de video o un guion | la skill de contenido que tenga instalada; si no hay, una lista de ideas con su evidencia en `contenido/ideas/` |

## Reglas

- **No inventar citas ni cifras.** Si no está en el corpus o en una fuente abierta hoy, «no lo encontré» y dónde se
  buscaría. Lo que no está en disco no existe para ti.
- **El verbatim no se resume en su lugar.** Las fichas rutean encima; se cita siempre el verbatim con link al minuto.
- **Toda cifra de un tercero con fecha y fuente**, y como declaración suya («dice que…»), no como dato auditado.
  Nunca números de un competidor de memoria.
- **Benchmark, no molde:** se extrae el método, nunca la identidad. La adaptación pasa por la diferencia del dueño.
- **Investigar no autoriza actuar:** comprar, registrarse con sus datos, escribirle a alguien o publicar espera su
  «va». Crear una cuenta o usar sus cookies, con su permiso la primera vez.
- Lo privado de terceros (correos, miembros, mensajes) no se copia al corpus: se conserva el mecanismo y los enlaces
  públicos.
