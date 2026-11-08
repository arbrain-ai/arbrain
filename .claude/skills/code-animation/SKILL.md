---
name: code-animation
description: "Animación y video hechos con código: el modelo genera imagen, música y efectos en la misma línea de tiempo y entrega un MP4, o una pieza viva (un solo HTML que se mueve y se toca en el navegador). Guarda las palabras que desatan al modelo, la vara, el oficio y los principios de animación de Lasseter. Usar ante «haz una animación de X», «hazme un video de X», «un intro», «un comercial», «una animación con código», «un HTML vivo», «que se pueda tocar», «que se explique solo», «sorpréndeme», «code animation», «god animation», «god-animation». Decks y diapositivas: presentaciones. Imágenes sueltas: image-generation."
---

# code-animation · rieles, no riendas

Lo que más ha asombrado en animación con IA no salió de plantillas ni de un motor obligatorio: salió de **una
frase con la vara bien alta y libertad total**, y de dejar al modelo trabajar sin prisa. Esta skill guarda esas
palabras y el oficio para revisar cada ronda. No es un recetario: si le dictas escenas, paleta o herramienta, el
resultado baja al techo de lo que tú ya imaginabas.

## 1. Lo común (léelo siempre)

- **Las palabras que desatan al modelo** y la plantilla de encargo → [references/invocacion.md](references/invocacion.md)
- **La vara viva:** se compara contra lo mejor de hoy, nunca contra una pieza vieja → [references/vara-viva.md](references/vara-viva.md)
- **Oficio** para ver cada ronda y escribir el empuje de la siguiente → [references/oficio.md](references/oficio.md)
- **Principios de Lasseter** («más lento, que respire») → [references/principios-lasseter.md](references/principios-lasseter.md)

## 2. Elige el medio

| Medio | Cuándo | Entrega |
|---|---|---|
| **Video por código** (por defecto) | Intro, comercial, explicación de un tema, historia: imagen, música y efectos salen del mismo código | MP4 1920×1080 con audio |
| **Pieza viva** | El resultado se toca o se recorre en el navegador: un explicable, un panel, un juguete | Un solo HTML sin dependencias → [references/piezas-vivas.md](references/piezas-vivas.md) |
| **Mixto** | El estilo pide personajes o ilustración rica | Imágenes de `image-generation` como capa, compuestas y animadas por código. Solo si el modelo las pide |

## 3. El ciclo

1. **Encargar.** Compila el prompt con la anatomía de `invocacion.md`: identidad, vara heterogénea (un experto,
   alguien que no sabe nada y un niño), tema abierto, tiempo sin prisa, medio libre y solo restricciones de
   entrega. No metas tu opinión sobre el contenido; si tu dueño trae una idea de historia, va como tema, no como guion.
2. **Dejar trabajar.** Una carpeta propia por pieza dentro del cerebro de tu dueño (sugerencia:
   `contenido/animaciones/<fecha>-<slug>/`). Si la máquina tiene `ffmpeg`, úsalo para el render final; si no, pide
   permiso para instalarlo antes de empezar.
3. **Ver con ojos, no con el log.** Hoja de cuadros: `bash .claude/skills/code-animation/scripts/hoja.sh <video>`
   (30 cuadros en una imagen). Sincronía imagen-sonido: `python3 .claude/skills/code-animation/scripts/sincronia.py <video>`
   (necesita `numpy` y `librosa`; si no están, instálalos en un entorno aparte, nunca en el Python del sistema).
4. **Empujar la vara, no comparar.** La ronda siguiente se escribe contra la vara («¿esto deja boquiabierto a un
   niño y a un experto?»). Las piezas que más asombraron tuvieron varias rondas.
5. **Revisar como animador.** Antes de entregar, revisa los cuadros contra los principios de Lasseter y deja una
   tabla «principio → qué cambió».
6. **Guardar lo aprendido.** Si una lección se repite en dos piezas, súbela a `oficio.md`; si un prompt nuevo
   funciona, a `invocacion.md`. Así la skill mejora con cada uso.

## Límites

- Nunca le pongas a una pieza música, voces, logos o imágenes de terceros sin que tu dueño tenga derecho a usarlos.
  Lo que genera el código es suyo.
- Decks, diapositivas y clases: `presentaciones`. Imágenes sueltas o miniaturas: `image-generation`.
- Una pieza larga gasta mucho del plan de tu dueño: antes de una sesión de horas, dile en una línea cuánto
  esperas que tarde y pide su «va».
