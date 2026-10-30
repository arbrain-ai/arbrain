# PDF Deep Read (VERBO 1 de libro-os)

> Ex-skill `pdf-deep-read`, fusionada aquí el 20 jul 2026 (cirugía de skills: libro-os ya la
> envolvía). Es el protocolo del VERBO LEER: PDF/libro/curso COMPLETO end-to-end (verbatim,
> página por página) hacia el contexto del agente PRINCIPAL, destilado a un .md persistente,
> SIN delegar a subagentes que resuman.

El dueño quiere que el agente PRINCIPAL lea e internalice el documento, NO un resumen de subagente.
La comprensión genuina + el lente de SU contexto (su negocio, sus metas, su voz) importa.
Regla #1: **NO delegar a subagentes para resumir. Yo leo, yo destilo.**

## Cómo lee PDFs el Read tool

- Parámetro `pages` (ej: `"1-20"`). **Máximo 20 páginas por request.**
- Para PDFs de más de 10 páginas, `pages` es OBLIGATORIO.
- Un libro de N páginas = `ceil(N/20)` bloques secuenciales. (240 pág = 12 bloques.)

## El loop (verbatim, en orden, sin parar)

1. `Read(pages: "1-20")` → destila lo esencial a un `.md` persistente (append).
2. `Read(pages: "21-40")` → append al mismo `.md`.
3. … continúa en bloques de 20 hasta la última página, EN ORDEN.
4. Nota de progreso breve entre bloques (qué cubrió ese bloque) — para el dueño y para mí.
5. No parar hasta terminar TODAS las páginas. Es un bucle, no un sample.

## La realidad de persistencia (CLAVE — por esto existe la skill)

- El harness **evicta los tokens pesados de imágenes** de turnos viejos. Las imágenes del PDF NO
  persisten en contexto a lo largo de muchos turnos. Por eso "lo leí todo" no significa "lo tengo
  todo en contexto para siempre".
- **Por eso se destila a un `.md` MIENTRAS se lee** (no solo al final): el `.md` es lo que SOBREVIVE,
  no las imágenes. Ese `.md` denso (estilo 80/20) ES "pasarlo a memoria".
- Ejemplo: un libro de negocios de 240 páginas = 12 bloques → un `expert-secrets-8020.md` denso junto al PDF.

## Dónde guardar el `.md` destilado

- Junto al PDF, o en la carpeta del proyecto relevante, o en `.claude/memory/reference/` si es
  conocimiento de referencia duradero. Nombrarlo claro: `<libro>-8020.md` o `<curso>-notas.md`.

## Atajo más barato (si el PDF tiene capa de texto seleccionable, no escaneado)

- Extraer la capa de texto a `.txt`/`.md` pesa MUCHÍSIMO menos que las imágenes y persiste:
  `python3 -c "import pypdf; ..."` o `pdftotext archivo.pdf salida.txt`.
- Si el PDF es ESCANEADO (imágenes), el Read tool con `pages` es la vía (no hay capa de texto).

## Reglas duras

1. NO delegar a subagentes para resumir. El agente principal lee e internaliza.
2. Verbatim, página por página, en orden. No saltar.
3. Destilar a `.md` mientras avanzas (no solo al final) → vence la eviction de imágenes.
4. Notas de progreso breves entre bloques.
5. No parar hasta E2E completo.
6. El `.md` se escribe con el LENTE del dueño (qué aplica a su negocio), no genérico.
