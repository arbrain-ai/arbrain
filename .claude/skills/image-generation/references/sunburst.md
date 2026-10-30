# Sunburst · modelo único de imágenes

Un solo modelo, tres niveles de esfuerzo. Simplifica la operación: no hay que decidir modelo en cada pedido, solo `quality`. Gobierna cualquier recomendación de modelo en otras skills y referencias.

## Contrato vigente

- **Único modelo habitual:** `openai/gpt-image-2.5-sunburst`, vía OpenRouter **Images API** (`POST https://openrouter.ai/api/v1/images`).
- **La variable es `quality`: `low`, `medium`, `high`.** No es `reasoning_effort`. No introducir otro modelo como alternativa barata ni fallback automático. Si Sunburst falla, diagnosticar y reportar; cambiar de modelo requiere instrucción nueva del dueño.
- Ámbito: miniaturas, ilustraciones, láminas didácticas, piezas de marca e imágenes para edición. El estilo lo gobierna la guía del entregable, no el modelo. No redibujar logos que ya existen ni sustituir gráficos deterministas que conviene producir en código.
- **Defaults recomendados:** `quality: low` para ilustraciones, láminas didácticas y assets de presentaciones o videos; `quality: high` para miniaturas. LOW es acabado habitual, no solo boceto. No elevar a medium por hábito. Una instrucción explícita del dueño puede cambiar el nivel. "Esfuerzo" aquí se traduce al parámetro `quality`, no al razonamiento del agente.
- `xhigh` y `max` pueden figurar en el catálogo del proveedor; no se convierten en default sin probarlos.
- Guardar localmente en el proyecto; no subir a almacenamiento público para mostrar en chat. Guardar modelo, quality, prompt, referencias, parámetros, dimensiones, tiempo, ID si existe y `usage` completo. Mostrar costo real de entradas + salidas, no tarifa estimada como cargo.

## La llamada

Solicitud básica:

```json
{
  "model": "openai/gpt-image-2.5-sunburst",
  "prompt": "La escena y sus textos exactos",
  "quality": "low",
  "aspect_ratio": "16:9",
  "n": 1,
  "input_references": [
    {"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}
  ]
}
```

Autenticación: `Authorization: Bearer $OPENROUTER_API_KEY`, con la llave en `arbrain/server/.env`; nunca imprimirla ni copiarla a otro archivo. Respuesta: imagen en `data[0].b64_json`; consumo en `usage.cost` y sus campos de tokens.

Para una imagen suelta, escribe un script corto de un solo uso (lee la llave del entorno, arma el JSON, decodifica `b64_json` a PNG y guarda un `.json` con el registro). Si el dueño repite el mismo tipo de pieza, conviértelo en un script reutilizable dentro de su proyecto.

Transparencia: la documentación oficial de GPT Image 2.5 admite `background: "transparent"` y salida PNG/WebP. Verificar el canal alpha en la primera pieza que lo necesite: que el proveedor lo documente no equivale a QA local.

## Costos de referencia

Orden de magnitud observado a 1536×864, incluyendo referencias de entrada:

- Miniatura con referencias: low ≈ $0.04, medium ≈ $0.04, high ≈ $0.07.
- Ilustración con una referencia: low ≈ $0.026, medium ≈ $0.031, high ≈ $0.055.
- Ilustración simple: low ≈ $0.014, medium ≈ $0.019, high ≈ $0.043.

En ese tamaño, la salida fue de 120 / 280 / 1078 tokens de imagen para low / medium / high; las referencias también cuestan, por eso las tareas no tienen el mismo total. Son cargos de pruebas fechadas, NO precios universales ni un estimador para otra resolución. El `usage` de cada llamada es la única fuente del cargo real.

Una muestra por combinación no es prueba estadística: hay variación aleatoria. El buen aspecto no acredita por sí solo una buena explicación; una lámina didáctica se juzga por si enseña.

## Diseño y activos del dueño

- **Logo:** usar el archivo aprobado por el dueño tal cual; no pedirle al modelo que lo redibuje. Si hay varias versiones, guardar en la memoria cuál es la canónica y cuáles se rechazaron.
- **Cara:** si el dueño aparece en miniaturas, mantener un kit pequeño de fotos elegidas por él con un `INDEX.md`. Leerlo y mirar las fotos antes de elegir; no mandar todas indiscriminadamente.
- **Miniaturas:** pocos elementos, contraste claro y 2–4 palabras que complementan el título, salvo que la guía del dueño diga otra cosa.
- **Láminas didácticas:** la composición debe enseñar una diferencia o un mecanismo concreto, no decorar.

## Fuentes

- OpenRouter: https://openrouter.ai/openai/gpt-image-2.5-sunburst y https://openrouter.ai/docs/guides/overview/multimodal/image-generation .
- OpenAI: https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst y https://developers.openai.com/api/docs/guides/image-generation .

Disponibilidad y precios cambian: revalidarlos cuando haga falta una cotización nueva.
