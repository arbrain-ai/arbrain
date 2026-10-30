---
name: image-generation
description: "Generar y editar imágenes del dueño con GPT Image 2.5 Sunburst vía OpenRouter. Único modelo; variar quality low, medium o high. Miniaturas, ilustraciones y assets de edición."
---

# Image Generation · Sunburst

**Un solo modelo para todas las imágenes: SUNBURST.** La variable es `quality`, nunca sustituir el modelo en silencio. Si el dueño decide otro modelo, se cambia aquí por escrito.

## Antes de generar

Leer [sunburst.md](references/sunburst.md): contrato, llamada a la Images API, costos de referencia y cómo registrar cada imagen. Ese archivo manda sobre recomendaciones de modelo en otras skills.

Requisito: una llave de OpenRouter (`OPENROUTER_API_KEY`) configurada en `arbrain/server/.env`. Si no existe, decirlo y pedirle al dueño que la agregue; esta skill es opcional en tu edición.

1. Identificar el entregable y cargar sus reglas visuales: la guía de marca del dueño si existe (búscala en la memoria, `reference/`, o pregúntala una vez y guárdala con `memory-manager`); para lienzos y diagramas, la skill `canvas`; para assets de un video, `edicion-por-voz`.
2. Abrir las referencias visuales antes de enviarlas (logo, fotos del dueño, ejemplos de estilo aprobados). Guardar la ubicación de las referencias reutilizables en la memoria para no buscarlas cada vez.
3. Llamar `POST https://openrouter.ai/api/v1/images` con `model: openai/gpt-image-2.5-sunburst`. Defaults recomendados: **low para ilustraciones y presentaciones; high para miniaturas**. LOW también sirve como entrega final; no subir por hábito. No es `reasoning_effort`.
4. Guardar PNG y registro de prompt, referencias, modelo, quality, parámetros, tiempo y usage. Mostrar el costo real. Fallos sin usage se reportan como costo desconocido.
5. Revisar identidad, logo, texto, estilo y resolución antes de entregar. Las reglas gráficas las define la guía del entregable. El modelo no redefine la marca.

## Entrega y límites

- **Mostrar en el chat por default:** al terminar, `mostrar` del MCP `cabina` con `vista: documento` y la ruta del PNG, salvo que el dueño diga lo contrario. Imágenes sueltas en una carpeta del repo como `imagenes/<fecha>-<tema>/` (o junto al proyecto que las usa).
- **Local primero.** No subir a almacenamiento público para mostrar una imagen en chat. Subir solo con autorización expresa para compartir o publicar (freno: publicar requiere pedido humano).
- El destino vive junto al proyecto. Las referencias reutilizables, en una carpeta de assets propia que el dueño elija.
- Lienzos y diagramas requieren la skill `canvas` y su estándar visual antes de insertar elementos; el backend de imagen sigue siendo Sunburst.
- No convertir esta skill en un fallback automático hacia otro modelo. Si Sunburst falla, diagnosticar y reportar.
