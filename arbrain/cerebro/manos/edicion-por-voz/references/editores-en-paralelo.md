# Editores en paralelo

Dos o tres editores independientes, cada uno con un tratamiento distinto, cada uno escribe **su** `versiones/vN.edicion.json` y lo renderiza con el mismo `render.py`. El dueño elige.

## Antes de lanzarlos (lo hace el agente principal)
1. `corte.json`, `palabras.json` y `frases.txt` listos (corte limpio ya decidido).
2. Lee la ficha (`ficha.py ver`) y resume en 3 líneas su tono, paleta y ritmo preferido: es la vara de gusto que verán al final.
3. Decide los tratamientos (distintos de verdad): p. ej. sobrio / dinámico / editorial (ver `oficio-de-edicion.md`).
4. Nombres neutros: `v1`, `v2`, `v3`.

## Con Claude Code (herramienta Agent)
Un solo mensaje con tres llamadas a la herramienta Agent a la vez (paralelo real). Cada subagente recibe un prompt corto, casi sin instrucciones de gusto:

```
Eres un editor de video. Trabajas SOLO en <proyecto>/versiones/v1.edicion.json (y su render v1.mp4).
Material: <proyecto>/corte.json (tramos del corte limpio, en tiempo de fuente), <proyecto>/palabras.json
(transcripción con tiempos), <proyecto>/frases.txt (la lista numerada). La fuente está en <proyecto>/fuente/.
Tratamiento asignado: <sobrio | dinámico | editorial>, en una frase: <qué lo distingue>.
Esquema del edicion.json: <proyecto-skill>/references/edicion-json.md. Puedes partir de
`python3 <skill>/scripts/aplicar.py nueva --proyecto <p> --nombre v1 --plantilla <sobria|dinamica|limpia>` y
editar el JSON a mano (cortes, velocidades, zooms, subtítulos). Valida con `aplicar.py validar` y renderiza con
`python3 <skill>/scripts/render.py <p>/versiones/v1.edicion.json`.
Antes de entregar extrae 4 fotogramas (inicio, un zoom, un subtítulo, el final) y míralos: tipografía legible,
nada sobre la boca, sin cortes a media palabra. No abras las carpetas ni versiones de los otros editores.
No publiques ni subas nada. Al final, la vara de gusto del dueño (solo para contrastar tu resultado): <3 líneas>.
Devuelve: ruta del mp4, duración, qué decidiste y por qué en 5 líneas.
```

No les des guion, metáforas ni referencias antes de que terminen: eso baja el techo de lo que proponen. Si el cliente permite elegir el modelo de los subagentes, usa uno rápido y capaz (no hace falta el más grande para editar por datos).

## Sin subagentes
Hazlo tú, uno tras otro, y entre uno y otro **no mires** el resultado anterior hasta terminar el siguiente: la independencia es lo que evita tres versiones iguales. Misma carpeta, mismos nombres.

## Después
- Abre las versiones con `abrir.py trio` (o `par`) y deja que el dueño compare.
- Su comentario sobre una versión elegida va al **mismo editor** (en Claude Code: continúa ese subagente con SendMessage si lo permite; si no, relee su `edicion.json` y aplica tú el cambio) y se guarda como la siguiente revisión (`aplicar.py siguiente`).
- Las correcciones mecánicas («quita el minuto 2:10», «más rápido al inicio») no necesitan editor: `aplicar.py op`.
