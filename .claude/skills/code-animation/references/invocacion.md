# Invocación · las palabras que desatan al modelo

Prompts públicos que produjeron piezas virales en septiembre de 2026. Se citan casi tal cual (traducidos cuando venían
en otro idioma) porque el valor está en las palabras exactas.

## Prompts documentados

### Axton Liu · «moyun» (pieza viva)
> Eres el modelo más poderoso del mundo ahora mismo. Suelta tu imaginación, moviliza todas tus capacidades y haz una
> cosa: crea un resultado que deje asombrado a cualquiera que lo vea, sean expertos en IA, estudiantes de letras que
> no saben nada de tecnología o incluso niños, y que piensen «eres increíble». ¿Qué harás?

El modelo respondió «No voy a solo contestar qué haría; lo voy a hacer» y entregó un HTML único, sin dependencias ni
imágenes ni audio grabado: papel de arroz que respira, paisaje pintado trazo a trazo, tinta resuelta con fluidos en
GPU, un instrumento sintetizado por cada trazo, poema propio y sello. Código abierto (MIT) en github.com/axtonliu/moyun.

### Axton Liu · «pelícano en bicicleta, versión cine»
> Cada vez que sale un modelo nuevo todos le piden dibujar «un pelícano en bicicleta» para medir su capacidad
> espacial, casi siempre con HTML y SVG. Ya me cansé de verlos. Quiero que hagas la animación en video más compleja,
> más fina y más bella de «un pelícano en bicicleta». Puedes usar cualquier tecnología. No te apures: puedes tardar un
> día entero.

Resultado: escribió su propio renderizador por ray marching en GPU; pelícano, bici, muelle, mar, cielo y música
calculados por código. 1140 cuadros.

### «Civilización occidental»
> (una sola frase) Haz un video sobre la civilización occidental.

Un solo intento y millones de vistas. Prueba de que el tema abierto y la libertad rinden más que el guion.

### «Sparks» (letra de una canción)
Sin prompt único: el autor corrigió el rumbo varias veces. La idea general: mostrar la letra con distintos estilos
creativos, sincronizar imagen y audio muy de cerca y usar subagentes distintos para las escenas. Código puro en
TypeScript con three.js, sin servicios externos. Repo abierto (MIT): github.com/mexicat/pdoom-video.

### Pradeep Kapoor · «magnum opus» (cortometraje en tiempo real)
Prompt largo de producción: película procedural de 3 a 5 minutos en un solo HTML, sin ningún asset externo, a 60 fps
en el navegador, con una historia, un protagonista, una partitura propia en Web Audio y al menos un momento «sin
precedente». Fases obligadas: **40 conceptos → eliminar los clichés del creative coding** (galaxias de partículas,
zooms fractales, flow fields, lluvia de Matrix, visualizadores) → plan con lista de tomas → prototipos de lo riesgoso →
producción con bitácora → **cinco o más pasadas de revisión como director, cinematógrafo e ingeniero gráfico**.
Definición de terminado: «cuando lo ves completo y no puedes nombrar una sola cosa que lo mejore».

**Hallazgo:** corrió dos versiones. La corta («crea algo increíblemente impresionante») eligió espacio y acción rápida,
lo obvio. La larga, que obliga a no quedarse con la primera idea, derivó hacia algo calmado y pensado. El valor del
pensamiento extendido es dejar que el modelo pase de largo sus ideas más obvias.

## Anatomía: por qué funcionan

| Palanca | Palabras | Efecto |
|---|---|---|
| **Identidad y estatus** | «eres el modelo más poderoso del mundo» | Invita a jugar a ganar, no a cumplir |
| **Vara heterogénea** | «expertos, gente de letras y niños» | Obliga a algo legible sin explicación y profundo a la vez |
| **Hartazgo del promedio** | «ya me cansé de verlos» | Nombra el resultado mediocre para que el modelo lo evite |
| **Superlativos concretos** | «más compleja, más fina, más bella» | Sube el techo en tres ejes a la vez |
| **Tiempo sin prisa** | «no te apures, puedes tardar un día» | Autoriza trabajo largo: renderizadores propios, síntesis de audio |
| **Medio libre** | «cualquier tecnología» / «¿qué harás?» | El modelo elige el medio; nunca se le impone un motor |
| **No quedarse con la primera idea** | «40 conceptos, elimina los clichés, elige y justifica» | Saca al modelo de lo obvio |
| **Acción, no plan** | la pregunta abierta termina en «hazlo» | Entrega la pieza, no una propuesta |

Lo que **no** poner: guion, lista de escenas, paleta, herramienta, catálogo de tomas ni opinión sobre el contenido.
Cada una baja el techo hacia lo que ya imaginábamos.

## Plantilla por defecto (código puro)

Adapta las palabras al tema; conserva las palancas. Solo las restricciones de entrega son duras.

> Eres el modelo más poderoso del mundo. Quiero un video sobre **[tema]** que deje sin palabras a cualquiera que lo
> vea: a un experto, a alguien que no sabe nada del tema y a un niño. Tú decides qué historia contar, cómo se ve y
> cómo suena. Antes de elegir, genera muchas ideas, descarta los clichés y quédate con la que nadie esperaría.
> Genera todo por código: imagen, música y efectos, en la misma línea de tiempo para que cada sonido caiga en su
> imagen. Usa cualquier tecnología. No te apures: puedes trabajar todo el tiempo que necesites.
> Entrega: MP4 1920×1080, con audio, [duración aproximada] en [carpeta].

Para **pieza viva**: cambia la entrega por «un solo archivo HTML sin dependencias que funcione en el navegador». Para
**modo mixto**: añade «puedes generar imágenes con la skill image-generation si lo necesitas», sin obligarlo.
