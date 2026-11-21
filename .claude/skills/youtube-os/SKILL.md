---
name: youtube-os
description: "Tu canal de YouTube de principio a fin: ideas que sí se graban, guion con tu voz, preparación antes de grabar, título, miniatura y descripción, y qué aprender de cada video publicado. Usar ante «dame ideas de video», «qué video hago», «mi próximo video», «guarda esta idea», «escríbeme el guion», «arma el guion de mi video», «qué título le pongo», «hazme la miniatura de mi video», «la descripción del video», «los capítulos», «prepárame para grabar», «voy a grabar», «cómo le fue a mi video», «mi canal» o «youtube». Editar la grabación: edicion-de-video. Imágenes sueltas: image-generation."
metadata:
  resumen: "Lleva tu canal de YouTube: ideas con evidencia, guion con tu voz, título, miniatura y descripción."
---

# YouTube OS: del tema al video publicado

Un canal crece por **volumen sostenido y por mejorar lo mismo una y otra vez**, no por cambiar de estrategia cada
semana. Esta skill es el hub: decide qué video conviene, lo prepara para grabar y arma su paquete de publicación. La
grabación y el corte viven en `edicion-de-video`, que llega como extensión de Arbrain: si no está instalada, dilo en
una línea y no prometas editar; las imágenes, en `image-generation`.

## Antes de la primera vez: la ficha del canal

Todo lo de abajo depende del contexto del dueño, no de reglas genéricas. Antes de proponer nada, lee lo que ya existe:

1. `.claude/memory/project/youtube/canal.md` (la ficha del canal). Si no existe, créala con `references/canal.md`:
   haz sus preguntas **una a una**, esperando cada respuesta (si quiere ir rápido, bastan las 3 primeras y el resto se
   pregunta cuando haga falta), y guárdala. Agrega una línea a `MEMORY-indice.md` con
   disparadores en sus palabras («mi canal», el nombre del canal) siguiendo `memory-manager`.
2. Su oferta y su avatar: `.claude/memory/project/mi-negocio/02-oferta.md` (skill `oferta`). El canal le habla a ese
   avatar y la llamada a la acción lleva a esa oferta. Si no existe, no lo preguntes aparte: la pregunta 2 de la ficha
   lo cubre, y al final sugiérele armar su oferta con `oferta` cuando quiera. No inventes el avatar. Si ya te contó a
   qué se dedica y qué vende en esta conversación, úsalo y confírmalo en una línea en vez de volver a preguntar.
3. Su voz: `.claude/memory/project/youtube/voz.md`. Si no existe, se arma la primera vez que escribas un guion
   (`references/guion.md` › «La voz del dueño»).
4. Sus referentes: `.claude/memory/project/youtube/referentes.md`, con fecha de medición
   (`references/aprender.md`).

Lo que falte se pregunta **una vez** y se guarda. Nunca vuelvas a preguntar lo que ya está en su cerebro.

## Dónde vive cada video

Una carpeta por video, todo adentro: `contenido/youtube/proyectos/AAAA-MM-DD-slug/` (o, si `canal.md` dice otra
«Carpeta de los videos», `<esa carpeta>/proyectos/`). Un artefacto de un video fuera de su carpeta es un error. Para
arrancarla:

```
python3 .claude/skills/youtube-os/scripts/nuevo_video.py "el tema del video"
```

Crea las subcarpetas (`guion/`, `raw/`, `edicion/`, `miniaturas/`, `visuales/`, `publicacion/`, `finales/`) y
escribe `ESTRUCTURA.md`: la ficha de la pieza y la lista de antes de grabar, con el destino de la llamada a la acción
tomado de `canal.md`. Existe porque **un dato que hay que ir a buscar no existe**: la estructura tiene que aparecer
justo cuando se abre el proyecto, no cuando alguien se acuerda. Con `--prueba` va a `pruebas/` en vez de `proyectos/`
(experimentos que no se publican). Crear la carpeta no significa que el dueño eligió ese video.

**Los videos no entran a git.** Un crudo pesa gigas y rompe el push de su copia. `nuevo_video.py` deja en cada
proyecto un `.gitignore` con los formatos de video y audio; guiones, miniaturas y textos sí se versionan. Si el dueño
guarda videos en otra carpeta del repo, agrégale el mismo `.gitignore` antes de copiar nada ahí.

## El recorrido

| # | Fase | Quién | Sale |
|---|---|---|---|
| 1 | Ideas | `references/ideas.md` | 3 a 5 ideas con evidencia, ventaja y costo; el dueño elige |
| 2 | Guion | `references/guion.md` | `guion/guion.md` en su voz, con los 8 tiempos marcados |
| 3 | Antes de grabar | `ESTRUCTURA.md` del proyecto | lista revisada, demo ensayada, destino del enlace listo |
| 4 | Grabar | el dueño (humano a cámara) | el material en `raw/` |
| 5 | Corte y edición | `edicion-de-video` | finales horizontal y vertical en `finales/` |
| 6 | Título y miniatura | `references/miniaturas.md` + `image-generation` | 2 a 4 variantes por activo; el dueño elige |
| 7 | Descripción y capítulos | `references/publicar.md` | `publicacion/descripcion.md` sobre el corte final |
| 8 | Publicar | el dueño, o tú con su orden explícita | el video arriba, verificado |
| 9 | Aprender | `references/aprender.md` | el delta propuesto → elegido, y la regla que deja |

Cada fase la decide el dueño antes de pasar a la siguiente. Si una fase falla, detente y dilo; no avances con un
artefacto incompleto.

## Principios

1. **Humano a cámara, máquina en el resto.** El dueño pone la cara, la voz y el criterio; tú preparas, cortas,
   diseñas y verificas. Un canal hecho entero por IA compite peor y no construye confianza.
2. **Evidencia, nunca corazonada.** Una idea sin demanda medida va al backlog, no al calendario. Una cifra que no
   mediste no se escribe; falta de dato no es cero.
3. **Mejor es mejor que nuevo.** Se afinan los mismos ganchos, títulos y miniaturas video tras video. Cambiar de
   fórmula cada semana borra lo aprendido.
4. **Cada video entrena al siguiente.** Lo que el dueño corrige se vuelve regla en su memoria (`aprender.md`); la vara
   es que las rondas por activo bajen.
5. **Tú propones, el dueño elige.** Ideas, títulos, miniaturas y descripciones salen como opciones; nunca eliges por
   él ni das por aprobado algo que solo propusiste.
6. **Local primero.** Videos, miniaturas y borradores se quedan en su carpeta. Se sube a la web solo con su pedido.

## Límites

- **Nunca publicar sin su orden en ese mensaje.** Subir, programar, cambiar un título publicado o responder
  comentarios es publicar. Exportar o elegir una miniatura no es permiso. Sin herramienta para subir, le das el
  paquete listo y él lo sube.
- **Nada de cifras inventadas** en guiones, títulos ni descripciones: ni de su canal, ni de clientes, ni de terceros.
  Si el guion necesita un número, se pide o se marca `[DATO: …]` para que él lo llene.
- **Datos de clientes:** un caso de éxito solo entra al guion con el permiso del cliente registrado en su ficha
  (`clientes`).
- **Si no tiene canal todavía:** las fases 1 a 3 sirven igual para empezar; la de aprender espera a tener videos.

## Referencias

- `references/canal.md` · la ficha del canal: qué preguntar y dónde se guarda.
- `references/ideas.md` · el método de veta: competencia medida por activo injusto, filtro de 3 preguntas.
- `references/guion.md` · formatos, el esqueleto de 8 tiempos, retención, llamadas a la acción y la voz del dueño.
- `references/miniaturas.md` · título como hecho y miniatura como veredicto, composición, identidad y variantes.
- `references/publicar.md` · descripción, capítulos, enlaces verificados, el regalo y la lista de publicación.
- `references/aprender.md` · referentes con fecha, pico contra renta y el lazo de aprendizaje.
- `scripts/nuevo_video.py` · crea la carpeta del video y emite su `ESTRUCTURA.md`.
- Skills vecinas: `edicion-de-video` (grabar, cortar, exportar), `image-generation` (miniaturas e ilustraciones),
  `code-animation` (animaciones para el video), `presentaciones` (láminas para grabar), `oferta` (avatar y promesa),
  `clientes` (casos con permiso), `memory-manager` (dónde guardar).
