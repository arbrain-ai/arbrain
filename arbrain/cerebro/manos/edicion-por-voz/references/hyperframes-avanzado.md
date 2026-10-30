# Opción avanzada: Hyperframes

La ruta por defecto es ligera a propósito (Python 3 + ffmpeg + Pillow): corre en una laptop y no instala nada pesado. Si el dueño ya tiene instaladas las skills de Hyperframes y quiere un acabado más cinematográfico, se pueden combinar sin cambiar el flujo de conversación:

| Necesidad | Skill | Cómo se encaja |
|---|---|---|
| Subtítulos con identidad (detrás del orador, efectos, catálogo de estilos) sobre un video ya cortado | `embedded-captions` | Renderiza primero el corte con esta skill (`render.py`, `subtitulos.modo = ninguno`) y pásale ese mp4 y `palabras.json`. |
| Tarjetas gráficas sincronizadas (títulos, datos, citas, imagen sobre imagen) sobre el video | `talking-head-recut` | Úsala sobre el mp4 del corte; el video debajo queda intacto. |
| Gráficos animados o intros hechas por código | `hyperframes`, `hyperframes-animation`, `hyperframes-core` | Entrada obligatoria `hyperframes`; la pieza resultante se inserta como un tramo más o se renderiza aparte. |
| Voz, música, efectos, recorte y reencuadre de medios | `media-use` | Para conseguir o generar audio y abrir medios; el mezclado fino es `hyperframes-audio`. |

Reglas:
- Hyperframes decide su propio flujo: **léelo a él primero** (`hyperframes` es la entrada), no mezcles sus archivos con los de `versiones/`.
- El resultado de Hyperframes se guarda como otra versión (`versiones/vN-hf.mp4`) para poder compararla en el visor contra las de la ruta ligera.
- Pide a Hyperframes un render local; no subas material a servicios en la nube sin que el dueño lo sepa.
- Transcripción: esas skills tienen su propio motor; si ya hay `palabras.json` de esta skill, pásalo en vez de transcribir de nuevo.
- Si su instalación no está, esta skill se basta sola.
