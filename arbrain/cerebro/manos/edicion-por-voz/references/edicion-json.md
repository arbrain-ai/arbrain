# El `edicion.json`

La edición es **datos**. Un editor (agente) escribe esto; `render.py` lo convierte en video. Todo lo que apunta al video original usa **tiempo de fuente**; el render lo traduce a tiempo de salida. Lo que ve el dueño en el visor es **tiempo de la versión**; `aplicar.py` traduce en ambos sentidos con los cortes y velocidades.

```json
{
  "version": 1,
  "nombre": "v2",
  "base": null,
  "tratamiento": "dinamica",
  "fuente": "fuente/grabacion.mp4",
  "palabras": "palabras.json",
  "fps": 30,
  "cortes": [
    {"inicio": 0.4, "fin": 12.8, "velocidad": 1.08},
    {"inicio": 15.2, "fin": 31.0, "velocidad": 1.0, "nota": "tramo que demuestra el método"}
  ],
  "zooms": [
    {"inicio": 4.0, "fin": 6.6, "escala": 1.12, "foco_x": 0.47, "foco_y": 0.42}
  ],
  "tarjetas": [
    {"inicio": 4.0, "fin": 5.8, "texto": "Tres prioridades"}
  ],
  "subtitulos": {
    "modo": "frases_clave",
    "frases": [
      {"inicio": 3.9, "fin": 6.4, "texto": "Tres prioridades", "destacar": true}
    ],
    "estilo": {"escala": 1.0, "opacidad_fondo": 0.78}
  },
  "vertical": {"modo": "recorte", "foco_x": 0.5, "duracion_max": null, "desde": 0.0},
  "marca": {"logo": true},
  "audio": {"fade": 0.02, "loudnorm": false},
  "historial": []
}
```

| Campo | Significado |
|---|---|
| `fuente` | Video original (ruta relativa al proyecto o absoluta). No se modifica nunca. |
| `palabras` | Transcripción con tiempos; la usan los subtítulos automáticos, `quitar_frase` y el corte del vertical a final de frase. |
| `cortes` | Tramos que se **conservan**, en orden cronológico y en tiempo de fuente. `velocidad` 0.5 a 2.0 (ritmo por tramo). |
| `zooms` | Énfasis suave (entrada y salida de 0.55 s). `escala` 1.0 a 1.6 (usa 1.08 a 1.15); un zoom largo sobre varias ideas se sostiene como acercamiento (la plantilla `dinamica` alterna plano medio / acercamiento cada 4 s o más), `foco_x`/`foco_y` 0 a 1. |
| `tarjetas` | Tarjeta de frase clave: la frase en grande, a casi pantalla completa, 1.2 a 2 s, con el color `primario` de la ficha; entra deslizando desde arriba. Vive en el tercio inferior (fuera de la cara) y nunca coincide con un subtítulo. El render completa con la transcripción una frase clave truncada (o avisa) y `exportar.py` se detiene si queda alguna. La plantilla `dinamica` pone 3. |
| `subtitulos.modo` | `ninguno`, `frases_clave` o `por_frase`. `frases` es la lista explícita y editable: el agente puede escribir las suyas. `destacar` usa el estilo grande con barra de acento. |
| `vertical` | `modo`: `recorte` (centrado en `foco_x`, por defecto) o `fondo_difuso` (el cuadro completo sobre su propio fondo difuminado). `duracion_max` recorta a esa duración **terminando al final de una frase** desde `desde` (tiempo de versión). |
| `marca.logo` | Pone el logo de la ficha de marca (esquina superior derecha) si existe. |
| `audio.fade` | Fundido de entrada y salida en cada unión (20 ms) contra clics. `loudnorm` solo en el export. |
| `historial` | Cada revisión anota de dónde viene, las operaciones y el mensaje del dueño. |

## Mapeo de tiempos
- Versión → fuente: se recorre cada corte con `salida = (fuente - inicio) / velocidad` acumulado.
- Un instante que cayó en un tramo ya cortado se lleva al inicio del siguiente tramo.
- Los cortes se ajustan a la rejilla de fotogramas (`fps`) para que audio y video no se desfasen entre uniones.

## Validación
`python3 scripts/aplicar.py validar --ruta versiones/v2.edicion.json` revisa fuente existente, orden cronológico, velocidades, zooms y modo de subtítulos.
