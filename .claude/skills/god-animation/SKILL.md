---
name: god-animation
description: "Todo lo visual que se mueve, hecho con código y con la vara más alta: videos (intro, comercial, video que explica un tema, historia, sus cortos verticales) y piezas vivas (un solo HTML que se mueve y se toca, un explicable, un panel, un pergamino que se explica solo). Guarda las palabras que desatan al modelo, la vara, el oficio, los principios de animación de Lasseter, la galería y la bitácora. Usar ante «haz una animación de X», «hazme un video de X», «un video explicativo», «un intro», «un comercial», «hazle sus reels o shorts», «un HTML vivo», «que se pueda tocar», «que se explique solo», «una interfaz hermosa», «sorpréndeme», «practiquemos animación», «god animation», «code animation». Decks y diapositivas: presentaciones. Imágenes sueltas o miniaturas: image-generation."
metadata:
  resumen: "Hace videos y animaciones con código y arma páginas vivas que se mueven y se tocan."
---

# god-animation · rieles, no riendas

Lo que más ha asombrado en animación con IA no salió de plantillas ni de un motor obligatorio: salió de **una frase
con la vara bien alta y libertad total**, y de dejar al modelo trabajar sin prisa. Esta skill guarda esas palabras, la
vara y el oficio para revisar cada ronda. No es un recetario: si le dictas escenas, paleta o herramienta, el resultado
baja al techo de lo que ya imaginabas.

## 1. Lo común (léelo siempre, antes de encargar)

- **Cómo dirigir a un modelo sin bajarle el techo** («cuando le digo X, pasa Y») →
  [../../references/principios-dirigir-modelos.md](../../references/principios-dirigir-modelos.md)
- **Las palabras que lo desatan** y la plantilla de encargo → [references/invocacion.md](references/invocacion.md)
- **La vara viva:** se compara contra lo mejor de hoy, nunca contra una pieza vieja → [references/vara-viva.md](references/vara-viva.md)
- **El oficio** para ver cada ronda y escribir el empuje de la siguiente → [references/oficio.md](references/oficio.md)
- **Principios de Lasseter** («más lento, que respire») → [references/principios-lasseter.md](references/principios-lasseter.md)
- **Lo que tu dueño ya aprendió:** si existe `mi-negocio/animaciones/MI-OFICIO.md`, léelo completo. Manda sobre el
  oficio general cuando se contradicen, porque es su gusto medido.

## 2. Elige la rama (una rama, una entrada)

| Rama | Cuándo | Entrada |
|---|---|---|
| **Video por código** (por defecto) | Intro, comercial, historia, concepto: imagen, música y efectos salen del mismo código | [references/video-por-codigo.md](references/video-por-codigo.md) |
| **Video que explica un tema** | 4 a 15 minutos que enseñan algo con voz narrada, y sus cortos | [references/explicativo.md](references/explicativo.md) (y después de idear, [video-por-codigo.md](references/video-por-codigo.md)) |
| **Cortos verticales** | Reels o shorts: cada largo nace con los suyos | [references/cortos.md](references/cortos.md) |
| **Pieza viva** | Se toca o se recorre en el navegador: explicable, panel, juguete, interfaz | [references/piezas-vivas.md](references/piezas-vivas.md) |
| **Pergamino** | Un documento de scroll que se explica solo, con mecanismos que se tocan | [references/pergamino.md](references/pergamino.md) |

Si tu dueño ya tiene un estilo propio (sus colores en `mi-marca/`, una ficha de estilo en
`mi-negocio/animaciones/estilos/`), úsalo: da colores, letras y tono, nunca composición. Si no tiene, el modelo elige y
al final se lo dices en una línea. Cómo se escribe una ficha de estilo: [references/estilos.md](references/estilos.md).

## 3. El ciclo

0. **Juntar lo real.** Si la pieza habla de su negocio, saca de su memoria y de `mi-negocio/` lo que existe (nombre,
   qué vende, a quién, su logo, sus cifras con fecha). Lo que falte se lo preguntas en una sola línea o no va: nada se
   inventa. Para un video que enseña un tema, esto es `HECHOS.md` ([references/explicativo.md](references/explicativo.md)).
1. **Encargar.** Compila el prompt con la anatomía de `invocacion.md`: identidad, vara heterogénea (un experto,
   alguien que no sabe nada y un niño), tema abierto, tiempo sin prisa, medio libre y solo restricciones de entrega.
   No metas tu opinión sobre el contenido; si tu dueño trae una idea, va como tema, no como guion. Una pieza chica la
   puedes hacer tú; una grande rinde más en un subagente con el contexto limpio, que solo recibe ese prompt, el
   material y la carpeta.
2. **Dejar trabajar.** Una carpeta por pieza dentro de su capa: `mi-negocio/animaciones/<fecha>-<nombre neutro>/`
   (por ejemplo `2026-12-03-p01`): hasta el nombre de una carpeta filtra tema. La primera vez, prepara la carpeta como
   dice [references/bitacora.md](references/bitacora.md) (su `.gitignore` y su entorno de Python). Para el render
   hace falta `ffmpeg`; si no está, pide permiso para instalarlo antes de empezar.
3. **Ver con ojos, no con el log.** Hoja de cuadros: `bash .claude/skills/god-animation/scripts/hoja.sh <video>`
   (30 cuadros en una imagen). Sincronía imagen-sonido, con el Python del entorno de la carpeta (`numpy` y `librosa`,
   nunca en el Python del sistema): `mi-negocio/animaciones/.venv/bin/python .claude/skills/god-animation/scripts/sincronia.py <video>`
   (en Windows, `mi-negocio\animaciones\.venv\Scripts\python`). Una pieza viva se revisa con capturas de navegador
   en escritorio y teléfono.
4. **Empujar la vara, no comparar.** La ronda siguiente se escribe contra la vara («¿esto deja boquiabierto a un niño
   y a un experto?»), nunca contra la versión anterior. Las piezas que más asombraron tuvieron varias rondas.
5. **Revisar como animador.** Antes de entregar, revisa los cuadros contra Lasseter y deja una tabla
   «principio → qué cambió».
6. **Entregar.** El archivo final abierto o con su ruta, y en tres líneas: la idea, qué mirar primero, qué tiene que
   juzgar él. Nada se publica sin que tu dueño lo vea.
7. **Anotar en la bitácora.** Una entrada por pieza en `mi-negocio/animaciones/BITACORA.md`. Lo que se repite en dos
   piezas sube a `MI-OFICIO.md`. Método y formato: [references/bitacora.md](references/bitacora.md).

La galería de referencias públicas que ya asombraron, para medir y para nombrar un estilo en un empuje (nunca para
copiar): [references/galeria.md](references/galeria.md).

## Límites

- Música, voces, logos, caras o imágenes de terceros: solo si tu dueño tiene derecho a usarlos. Lo que genera el código
  es suyo. Nunca clones la voz de alguien sin su permiso.
- Cifras, fechas, citas y ganadores con fuente; lo que no la tiene se rotula como ejemplo o no va.
- Decks, diapositivas y clases para presentar: `presentaciones`. Imágenes sueltas o miniaturas: `image-generation`.
- Una pieza gasta mucho del plan de tu dueño. Antes de lanzar subagentes, de varios editores en paralelo o de
  cualquier trabajo que esperes de más de media hora, dile en una línea cuánto esperas que tarde y pide su «va».
- Esta versión de Arbrain no trae edición de video: esta skill crea piezas nuevas por código, no edita las grabaciones
  de tu dueño. Si te pide editar una, díselo en una línea y ofrécele lo que sí puedes hacer (una intro, un video
  explicativo o sus cortos hechos por código).
