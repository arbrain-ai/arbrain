---
name: libro-os
description: "Leer e internalizar libros, PDFs o cursos completos, página por página, sin sustituirlos por resúmenes de subagentes; destilar conocimiento persistente. También crear, regenerar y publicar libros de estudio HTML en voz de Levy con imágenes y TTS."
---

# libro-os — Leer y Crear libros (input + output unificado)

El bucle completo del exocortex de conocimiento del dueño: **absorbe libros ajenos** y **produce
libros propios en su voz**, legibles y escuchables desde cualquier aparato con navegador. El motor es
mecánico y reutilizable; el CORAZÓN (leer, escribir en su voz, decidir las imágenes) lo hace Levy.
El moat no es el motor (cualquiera lo tiene): es la VOZ + las IMÁGENES + el CONTEXTO del dueño.

---

## VERBO 1 · LEER (input)

Protocolo completo: `references/pdf-deep-read.md`. Levy (agente principal) lee el PDF **E2E verbatim, página por página**,
y destila a un `.md` con el lente del dueño. **NUNCA delegar a subagentes que resuman.** Los libros
fuente viven donde el dueño decida; sugerencia: `biblioteca/libros/` con un `INDICE.md`. El destilado se guarda junto.

---

## VERBO 2 · CREAR (output) — el pipeline E2E

### ⚠️ REGLAS DURAS (no negociables)

1. **CITAS SIEMPRE EN EL IDIOMA DEL LECTOR.** Toda cita del autor va TRADUCIDA (por defecto al español),
   con **autor + obra + página** (`~ Autor, *Obra*, p. N`). Nada de citas en otro idioma en el cuerpo
   del libro. La traducción es fiel; si el original es célebre, se traduce igual.
2. **80/20 de CADA capítulo, sin perder esencia.** El libro debe ser **tan extenso y denso como sea
   posible CONSERVANDO el 80/20 de cada capítulo del original.** NO sobre-comprimir: cada capítulo
   fuente merece su destilado rico. La meta es que el dueño NO pierda información ni la esencia del
   libro: que leer nuestro libro equivalga a haber leído el original, en su voz y en su idioma.
   Regla práctica: si el original tiene 12 capítulos, el nuestro cubre los 12 (agrupables por Parte),
   cada uno con sus ideas madre, sus citas reales y su aterrizaje. Mejor un libro largo y completo
   que uno corto que dejó ideas fuera.
3. **VOZ de Levy hablándole al dueño.** Directo, con energía, analogías, flujo de consciencia
   disciplinado. Segunda persona ("tú"). Cada idea con peso técnico llega como RETO sobre su negocio
   antes que como lección (se aprende construyendo). Escrito "para una sola persona: para ti". Si el
   dueño tiene una voz definida en su memoria (`user/`), esa manda.
4. **Fidelidad verificable.** Las citas son REALES (contra el PDF fuente), no inventadas. Si no
   tienes la cita textual, parafraseas y lo dices. NUNCA fabricar una cita con página falsa.
5. **Imágenes densas en info, texto MÍNIMO.** El único texto permitido en la imagen es el
   título/etiquetas del slug. Se generan con la skill `image-generation` y siguen la guía visual del
   dueño. **Dos manifestaciones (elegir en el manifiesto por `style`):**
   - `style="hero"` → para SENTIR (portadas, aperturas, cierres).
   - `style="didactico"` → para ENSEÑAR (mecanismos, procesos, diagramas). La lámina debe explicar
     una diferencia o un mecanismo concreto, no decorar.

### Convenciones del markdown (→ HTML)

En los `.md` de cada capítulo:
- `> texto de cita` seguido de `~ Autor, *Obra*, p. N` → bloque de cita con fuente.
- `@epigrafe texto ~ fuente` → epígrafe del capítulo.
- `[[LAMINA: slug | texto alternativo]]` → punto de inserción de una lámina (el slug debe existir
  en el manifiesto de láminas).
- `:::reto Titulo` … `:::resp` … `:::` → caja de reto + respuesta (aplicación al negocio del dueño).

### El motor (se construye una vez y se reusa)

Tu edición no trae un motor de libros armado: la primera vez, Levy lo construye en
`biblioteca/libros/_motor/` con estas piezas, y cada libro nuevo lo reusa:

| Script | Qué hace |
|---|---|
| `make-book.py` | Markdown de `book/*.md` (orden en `ORDEN.txt`) → HTML del libro, con las convenciones de arriba |
| `laminas_manifest.py` | `LAMINAS = [ dict(slug, style="hero", concept, title, labels?, aspect?), ... ]`. El `slug` DEBE coincidir con cada `[[LAMINA: slug]]` |
| `gen-laminas.py` | Genera las láminas en paralelo con Sunburst (contrato en `image-generation`). Idempotente (no regenera lo hecho). `--force <slug>` para rehacer |
| `validate.py` | Regenera HTML + verifica 0 imágenes rotas + cuenta caps/citas/retos |
| `make-estudio.py <libro.html> <estudio.html>` | Inyecta el **Modo Estudio** (lector TTS) |

### Para un LIBRO NUEVO

1. Crear carpeta `biblioteca/libros/<slug>/` con `book/*.md` + `ORDEN.txt` + `build/`.
2. Apuntar los scripts del motor a ese slug (nombre del libro y rutas); `make-estudio.py` se REUSA tal cual.
3. Las láminas se generan a `build/laminas/*.jpg`; el manifiesto define slug→concepto.
4. **Fuentes/citas** en `notas-fuente/` (destilado E2E + citas verbatim traducidas con página).

---

## El LECTOR (Modo Estudio) — cómo se ve y se opera

`make-estudio.py` inyecta una barra de lectura flotante (píldora):

- **TTS = Web Speech API**, corre en el NAVEGADOR del aparato (no en un servidor). El host solo sirve
  HTML + imágenes estáticas. Cada aparato pone su propia voz.
- **Voz:** opción "Voz del sistema" (`__system__`) PRIMERA y default en iOS → `currentVoice()`
  devuelve `null` → NO se fija `utterance.voice` → el sistema usa su mejor voz instalada (Safari no
  expone por nombre las voces mejoradas). En escritorio se prefiere la mejor voz local del idioma.
- **Highlight:** el ÚNICO acompañante visual es el resaltado de cada palabra (`::highlight(est-word)`).
  Sin fondo de bloque ni contorno. El bloque actual solo es ancla de scroll invisible.
- **Barra:** Play circular, **velocidad = 1 botón que cicla** 1x→1.25x→1.5x→1.75x→2x,
  progreso, **ajustes (popover)** = Voz + Capítulo + Tema (sol/luna) + **Tamaño de texto A-/A+**,
  y ocultar. Iconos SVG inline (no emojis). Responsiva (`min(460px, 100vw-24px)`, breakpoint <380px).
- **Gestos (móvil/tablet):**
  - **Deslizar DERECHA→IZQUIERDA** = pausa/reanuda (`dx < -80`, horizontal dominante).
  - **Deslizar IZQUIERDA→DERECHA desde el borde** = VOLVER (lo maneja el contenedor de Arbrain / la Biblioteca).
  - Escritorio: `espacio` play/pausa, `←→` bloques, `↑↓` velocidad, `H` ocultar, `Esc` cierra popover.
- **PWA:** meta apple-mobile-web-app + safe-area-inset (el header respeta el notch).

---

## Publicar — local primero

**1. Biblioteca de Arbrain (local, por defecto):** agregar el libro al array `BOOKS` en
`arbrain/src/shared/components/LibraryOverlay.tsx` (slug, title, subtitle, cover = portada webp
local en `arbrain/public/library-covers/<slug>.webp`, ~16-20K) y servir su `estudio.html` desde la
app. El overlay embebe el lector por iframe. Verificar en la app que abre, que las láminas cargan y
que el TTS suena.

**2. Hosting propio (opcional, solo con pedido explícito del dueño):** publicar es una acción del
freno. Si el dueño tiene un sitio estático para sus libros, cuidado con esta trampa:

> 🔴 **LA TRAMPA DEL DEPLOY.** Si todos los libros viven en UN solo proyecto de hosting estático,
> cada despliegue a producción **reemplaza el sitio ENTERO**. Desplegar un solo slug **BORRA los
> demás libros**. Y reconstruir la carpeta de deploy desde el repo **NO SIRVE**: el repo puede traer
> trabajo posterior que el dueño nunca aprobó, y publicarlo viola la regla de no cambiar outputs
> publicados al mejorar una herramienta.
>
> **Procedimiento seguro:**
> ```bash
> # 1. hash de lo VIVO, ANTES de tocar nada
> for s in <slug-1> <slug-2>; do
>   curl -s "https://<tu-dominio>/$s/" | shasum -a 256 | cut -c1-12; done
> # 2. espejear lo VIVO: bajar cada index.html, parsear sus (src|href) de láminas/css, bajarlos
> # 3. copiar SOLO lo nuevo/actualizado a la carpeta de deploy/<slug>/
> # 4. verificar espejo == paso 1   ← si algún hash cambió, PARAR
> # 5. desplegar, y re-verificar los hashes contra producción + 200 en el slug nuevo
> ```
> La excepción: si el libro que actualizas ES el que quieres cambiar, su hash SÍ debe cambiar.
> Los OTROS jamás.

**Regla de ruteo:** si es texto + imagen que se lee capítulo a capítulo → **libro** (esta skill, con
Modo Estudio TTS). Si tiene un MECANISMO que el lector toca (simulación, interactivo) → es otra
pieza, no un libro.

---

## AI-first
El dueño opera esto HABLANDO: "lee este libro y créalo en mi voz", "agrega el libro a la biblioteca",
"regenera X". Levy corre el pipeline y devuelve la ruta o el link. La UI (el lector) es para
LEER/ESCUCHAR, no para operar.

## Pipeline resumido (checklist)
1. Deep-read E2E del fuente (`references/pdf-deep-read.md`) → notas + citas traducidas con página.
2. Escribir `book/*.md` en voz de Levy para el dueño, 80/20 de CADA capítulo, `[[LAMINA]]` + `:::reto:::`.
3. `laminas_manifest.py` → `gen-laminas.py` (Sunburst, `quality: low`).
4. `validate.py` (0 rotas) → `make-estudio.py` (lector TTS).
5. Agregar a `BOOKS` (LibraryOverlay) y verificar en la app. Hosting externo solo si el dueño lo pide.
