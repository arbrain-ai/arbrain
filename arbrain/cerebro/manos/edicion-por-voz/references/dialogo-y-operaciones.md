# Del lenguaje natural a operaciones

El dueño habla; tú traduces a operaciones de `aplicar.py op` sobre la versión que mira. Los tiempos que dice o marca son de **esa versión**. Si no hay marca ni minuto, pregunta en una línea («¿en qué minuto?») o propón y muestra.

| El dueño dice | Operación |
|---|---|
| «más rápido al inicio» | `{"op":"acelerar","desde":0,"hasta":45,"velocidad":1.12}` (empieza con una dosis pequeña) |
| «más ritmo en todo» | `{"op":"acelerar","desde":0,"hasta":<duración>,"factor":1.08}` y `{"op":"apretar_pausas","pausa_max":0.35}` |
| «quita el minuto 2:10» | `{"op":"quitar_tramo","desde":130,"hasta":140}` (ajusta al fin de la frase que se oye ahí si queda cortada) |
| «quita esto» + marca | `{"op":"quitar_frase"}` (la frase que se dice en la marca) |
| «aquí sobra una pausa» + marca | `{"op":"quitar_tramo","alrededor":1.5}` |
| «subtítulos en las frases clave» | `{"op":"subtitulos","modo":"frases_clave"}` |
| «subtítulos en todo» | `{"op":"subtitulos","modo":"por_frase"}` |
| «sin subtítulos» | `{"op":"subtitulos","modo":"ninguno"}` |
| «pon "tres prioridades" aquí» + marca | `{"op":"subtitulo","texto":"Tres prioridades","destacar":true}` |
| «un zoom aquí» + marca | `{"op":"zoom","duracion":2.4,"escala":1.12}` |
| «pon esa frase en grande» + marca | `{"op":"tarjeta","texto":"<la frase>"}` (tarjeta de 1.2 a 2 s con el color de la ficha) |
| «sin tarjetas» | `{"op":"quitar_tarjetas"}` |
| «menos zooms» | `{"op":"quitar_zoom"}` (todo) o con `desde`/`hasta` |
| «sácame un vertical de 40 s» | `{"op":"vertical","duracion_max":40}` y luego `exportar.py --vertical-max 40` |
| «el vertical desde el minuto 1:00» | `{"op":"vertical","duracion_max":40,"desde":60}` |
| «que el vertical se vea completo» | `{"op":"vertical","modo":"fondo_difuso"}` |
| «sin el logo» | `{"op":"logo","activo":false}` |

## Reglas
- Varias operaciones pueden ir juntas en la misma revisión: `--ops '[{...},{...}]'`. Todas leen los tiempos de la versión original.
- Un mensaje del visor con varias marcas: `{"op":"quitar_frase","marca":2}` elige la segunda (ordenadas por tiempo).
- Dosis, no extremos: un «más rápido» es 1.08 a 1.15. Si el resultado se queda corto, el dueño lo dirá y subes una revisión.
- Si el resultado no deja video (quitaste todo), el script no guarda nada y lo dice.
- Después de aplicar: cuéntale en una línea qué cambió y cuánto (`cambios`, `duracion_antes` -> `duracion_despues`) y ábrela comparada con la anterior en el mismo instante (el campo `mostrar` del resultado).
- Cambios que no caben en una operación (cambiar el tratamiento, reordenar ideas, otro tipo de subtítulo) los hace el editor de esa versión sobre su `edicion.json`.
