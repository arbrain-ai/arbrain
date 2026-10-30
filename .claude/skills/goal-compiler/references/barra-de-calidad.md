# Barra de Calidad (Gauntlet) — de "existe" a "mejor que el referente" (29 jul 2026)

> Origen: Matt Shumer, "Claude-of-Duty" (un FPS de ~55K lineas y 11 subsistemas nacido de un
> prompt de 152 palabras, 3.8M vistas) + su write-up "How to Run a Gauntlet Loop"
> (somethingbig.ai/gauntlet-loop · repo: github.com/mshumer/Claude-of-Duty).
> Se consulta en la **Fase 3.5** del compiler, ANTES de compilar el spec.
>
> **La distincion que gobierna este archivo (29 jul 2026): lo de Shumer es UN prompt;
> lo nuestro es una MAQUINA de prompts.** No copiamos su texto — compilamos su MECANICA dentro
> de nuestros specs cuando el dominio la amerita. El compilador decide CUANDO va la barra y la
> emite con nuestro contrato completo (comando de validacion, DoF surfeable, red de seguridad),
> que su prompt no tiene.

## La mecanica original, destilada (que es un Gauntlet Loop)

1. **Referencia COMPARATIVA, no adjetivos.** El lead agent recibe la meta + un ejemplo REAL de
   "que se ve excelente" (screenshots de Call of Duty de verdad). "Nivel AAA" sin referente
   inspeccionable es un adjetivo muerto: el critico no tiene contra que medir.
2. **Descomposicion en las piezas mas chicas mejorables por separado** (armas, manos, arboles,
   luz, movimiento, enemigos, audio...). Cada pieza tiene su propio loop de calidad.
3. **Builder y critico SEPARADOS, contexto fresco.** El critico NUNCA ve el razonamiento del
   builder. Solo ve el artefacto renderizado (pixeles, paginas, codigo corriendo) vs la
   referencia, en comparacion A/B ciega. Eso mata el auto-sello y el sesgo de confirmacion.
   **Y el critico se calibra DESPIADADO**: su default es "gana el referente"; solo cede cuando
   el nuestro gana claramente (ante la duda, gana el referente). Esto no es drama — es el
   antidoto al modo de falla #1 de los jueces LLM: la sycophancy (tienden a aprobar). El
   nombre "gauntlet" (el castigo de baquetas: dos filas que te golpean al pasar) ES esa
   instruccion de postura; Shumer la codifico como "really harsh critic" + "utterly wowed".
   Un comparador sesgado a aprobar es un sensor que miente en verde.
4. **Señal de error DIRIGIDA: el gap mas grande.** El critico no devuelve una lista — devuelve
   UN gap, el mas grande que queda. El builder lo ataca. El ciclo repite. (Comparador
   cibernetico bien diseñado: referencia → sensor → error → actuador.)
5. **Sin parada artificial** — hasta que el critico prefiera el artefacto propio o se agoten
   los recursos. (Nosotros SI le ponemos parada: ver "meseta honesta" abajo.)
6. **Pagina de progreso viva** para mirar sin interrumpir al agente.

## El diagnostico de Fase 3.5: ¿EXISTENCIA o EXCELENCIA?

La pregunta binaria: **cuando esto FUNCIONE, ¿ya gano?**

- **SI → dominio de EXISTENCIA.** Un cron, un script de datos, un endpoint, una migracion, un
  pipeline. La DoF normal (corre, verde, screenshots) es el contrato correcto. NO montes barra:
  seria teatro de calidad.
- **NO — un resultado funcional pero MEDIOCRE seria un fracaso → dominio de EXCELENCIA.** Todo
  lo que se califica por oficio u ojo: juegos/experiencias 3D, pergaminos y explicables, decks,
  thumbnails, edicion de video, landing copy, diseño de marca, UIs de producto. Aqui la DoF de
  solo-existencia deja pasar lo mediocre → el spec gana la seccion `## BARRA DE CALIDAD`.

**Test rapido del referente:** ¿puedes NOMBRAR un artefacto real contra el que un juez ciego
compararia el output y diria "cual es mejor"? Si no puedes nombrar el referente, no hay barra
montable (y probablemente no la necesitas).

## Como se compila la barra (sin romper la soberania)

1. **Referente CONCRETO e inspeccionable.** Paths a screenshots, URL del artefacto real, archivo
   de ejemplo. Va en el spec como material que el ejecutor puede abrir y el critico puede usar
   en el A/B. Referencias posibles en nuestro mundo: los mejores thumbnails del nicho, un
   Ciechanowski/3Blue1Brown para pergaminos, el master de un editor top para video.
2. **El mandato del lazo** (va en el spec, seccion BARRA DE CALIDAD): por cada componente
   calificable, critico de contexto fresco + A/B ciego + gap mas grande + iterar.
3. **La DoF gana una linea:** veredicto A/B final del critico por componente + gap residual
   DECLARADO. El evaluador de /goal ve el veredicto surfeado en el transcript.
4. **La barra NO reemplaza el comando de validacion.** Leccion del propio repo de Shumer: su
   critico miraba pixeles y nadie media frame times — el p50 decia 94 fps mientras stalls
   de 728ms hacian el juego injugable; tuvo que improvisar tooling de profiling a mitad del
   run. **El critico ve calidad; el comando de validacion ve verdad mecanica. Los dos, siempre.**
5. **Meseta honesta como parada del lazo de calidad:** si 2 rondas seguidas no mueven el A/B,
   el builder DECLARA el gap residual y sigue con el resto — no lo maquilla ni loopea infinito.
   (Shumer no tiene esta clausula; su parada es "critico wowed", subjetiva. La nuestra hereda
   la red de seguridad del bloque.)

## ⛔ LOS DOS AGUJEROS DE LA BARRA (enmienda 27 ago 2026, tres casos medidos)

La barra de arriba se puede cumplir ENTERA y aun asi entregar algo muerto. Pasó tres veces en
tres dominios distintos en tres dias, y el diagnostico cabe en la misma frase para los tres:
**"la meta se baja al comparador"**.

| caso | dominio | el referente estaba puesto | y aun asi |
|---|---|---|---|
| laminas de un curso | imagen | si (un estilo visual firmado) | *"el modelo se adapta al comparador… no exprimimos el potencial"* |
| tablero de un socio | diagramas | si (su tablero, delante) | *"todos son cajas… la meta se baja al comparador"* |
| video de un curso | edicion | si, por RUTA (3 .mp4 de un creador referente) | 17/17 en el A/B ciego, y la pelicula congelada 113 s de un tiron |

El tercero es el que enseña, porque paso TODOS los tests de esta reference y el resultado medido
fue: **69% de los cuadros en blanco, 40 bloques quietos de mas de 20 s (29 de 78 minutos), 198
inversiones de tono** contra 2 del referente en 19 minutos. Ningun instrumento del lazo podia verlo.

### Agujero 1 — la barra manda DESCOMPONER y nunca manda RECOMPONER

El paso 2 de la mecanica dice, textual: *"Descomposicion en las piezas mas chicas mejorables por
separado… Cada pieza tiene su propio loop de calidad"*. Eso viene de Shumer, donde el dominio era
arte de videojuego y **las piezas SON el entregable**. En una pelicula, una landing, un lienzo o un
deck, el entregable es el CONJUNTO — y el conjunto no tenia lazo. El critico juzgo 36 stills y
nadie miro los 75 minutos.

⚠️ El "pase de integracion (smoothing)" de la doctrina de subagentes NO cubre esto: es un pase de
COHERENCIA hecho por un builder, no un juicio A/B contra el referente. Coherente y mediocre pasa.

**La regla que se agrega: el lazo tiene DOS escalas, y la segunda es obligatoria.**

```
lazo de COMPONENTE   pieza  vs  pieza del referente        (el que ya estaba)
lazo de OBJETO       LA ENTREGA COMPLETA  vs  LA ENTREGA COMPLETA del referente
```

El lazo de objeto se monta con las mismas piezas (critico fresco, A/B ciego, UN gap, meseta) pero
la unidad es lo que se entrega: el video entero contra su video entero, la landing entera contra
su landing entera, el lienzo entero contra el suyo. Y sus metricas son de conjunto, no de pieza:
ritmo, continuidad, densidad, deriva, huecos.

⭐ **La forma correcta es una tabla de conjunto:** un informe de doce renglones donde **los doce
comparan pelicula completa contra pelicula completa** (% que no es cara, cutaways/min, duracion
p50, hueco maximo, variedad, top-5, color). Esa tabla es la plantilla del lazo de objeto.

**Test de escala, barato:** ¿la unidad que juzga el critico es la misma cosa que se le entrega a
quien lo va a consumir? Si el critico ve un still y el usuario ve una pelicula, la barra esta
midiendo otra cosa.

### Agujero 2 — el spec se puede EXCUSAR del referente, con argumento, y nadie lo frena

Verbatim del spec del video del curso:

> *"La vara de '~40% no-cara / 5 cutaways-min' es de perfil CAMARA. **No aplica aqui y aplicarla
> seria el error.** La vara de este video son las **38 piezas**."*

El argumento es CIERTO (el referente graba 100% a camara; el curso es screen-rec). No hubo desobediencia:
hubo un permiso razonado. Y lo que entro en lugar del referente no fue otro referente — fue **una
cifra que elegimos nosotros**. Ahi, exactamente ahi, la meta se bajo al comparador.

**La regla que se agrega:**

> **Del referente se puede CAMBIAR; sin referente no se puede QUEDAR.** Si el spec argumenta que
> el referente no aplica a una dimension, esta obligado a nombrar OTRO artefacto real e
> inspeccionable **de la misma escala** para esa dimension. Un numero propio, un conteo interno o
> una vara derivada de nuestros videos anteriores **no son sustitutos validos**: son el propio
> pasado con el nombre del referente encima (la degradacion del referente).

Si no existe referente externo para esa dimension, se DECLARA el hueco en el spec en vez de
taparlo con una cifra: *"esta dimension va sin barra"* es honesto; *"la vara son 38 piezas"* no.

### Para LIENZOS y diagramas

Mismo lazo: el builder dibuja (skill `canvas`), un subagente fresco recibe el render y el referente
en orden aleatorio junto con una hoja de principios sin figuras, y devuelve el gap mas grande. Guarda
un banco de referentes por ESCALA y CLASE (mapa, flujo, blueprint) para no improvisar el comparador.

## Doctrina de subagentes (lo que el spec le dice al ejecutor)

Esto responde "¿cuando fan-out y cuando no?" — compilado desde la data honesta del propio
Claude-of-Duty + nuestro test de colapso (`loop-vs-grafo.md`):

- **Critico fresco: SIEMPRE que hay barra.** Es barato y mata el fallo #1 del loop (auto-sello:
  el mismo agente aprueba su propio trabajo). El builder JAMAS se califica a si mismo.
- **Builders en paralelo: SOLO artefactos disjuntos.** Materiales vs audio vs cielo = si;
  fisica vs movimiento del jugador = no. Es la misma regla del grafo: dos agentes coexisten si
  escriben nodos disjuntos y se hablan por aristas.
- **Sistemas ACOPLADOS: pase secuencial con UN dueño.** No es opinion nuestra — es el
  post-mortem del propio Shumer: *"sequential single-owner development passes outperformed
  parallel multi-agent approaches"* (mas calidad, menos defectos). El "fan out sub-agents" de
  su prompt viral es el gancho; la carne vino de pases secuenciales con critico.
- **Pase de integracion (smoothing) al final** si hubo mejora por piezas: un agente FRESCO
  revisa coherencia del conjunto, para que las piezas mejoradas por separado no se sientan de
  fabricas distintas.
- **Forma de compilarlo:** NO como pasos de implementacion (eso mata el scoping de Fable) sino
  como PROCESO de control de calidad mandatado. **Prescribir el proceso de calidad ≠ prescribir
  la implementacion** — esa es la distincion fina que hace compatible el Gauntlet con nuestra
  alma anti-prescripcion: Shumer nunca dice COMO hacer el render; dice como se JUZGA.

## Anti-patrones

- **Barra en dominio de existencia** = teatro de calidad. Y su inversa, mas cara: **DoF de
  solo-existencia en dominio de excelencia** — el loop cierra en verde con un resultado
  mediocre-funcional.
- **Barra vaga** ("que se vea increible", "nivel mundial" sin artefacto). Si el critico no puede
  montar el A/B, no hay lazo — solo hay adjetivos.
- ⛔ **Barra SOLO de componente** (el caso mas caro, porque cierra en verde). Todos los A/B son de
  pieza, ninguno del objeto entregado. Sintoma: cada pieza aguanta sola y el conjunto esta muerto.
  Medido el 27 ago: 17/17 al referente y 40 bloques congelados en la pelicula.
- ⛔ **Excusar al referente y no reemplazarlo.** El spec argumenta —con razon— que el referente no
  aplica a una dimension, y pone en su lugar un numero propio. Eso NO es cambiar de vara: es
  quedarse sin ella. Cambiar exige nombrar otro artefacto real de la misma escala, o declarar el
  hueco.
- **Critico que ve el razonamiento del builder** → A/B contaminado por sesgo de confirmacion.
  Contexto fresco es innegociable.
- **Confundir el critico con el evaluador de /goal.** Son lazos DISTINTOS en niveles distintos:
  el evaluador (Haiku, Stop hook) cierra la PARADA leyendo el transcript al final de cada turno;
  el critico Gauntlet es un SUBAGENTE dentro de la sesion que empuja CALIDAD durante el loop.
  El critico alimenta evidencia (veredictos A/B surfeados) que el evaluador luego lee.
- **Copiar el prompt de Shumer tal cual** (ver apendice): mete el harness en el prompt, manda
  fan-out siempre, y no tiene sensor mecanico ni parada demostrable.

## Apendice — el prompt original verbatim (referencia historica, NO plantilla)

```
I want you to build a first-person shooter at the level of the most recent Call of Duty
games. It should be utterly perfect, visually beautiful, with every single thing done at
AAA quality—from textures to physics to anything you could think of.

Fan out sub-agents and have sub-agents tackle each one individually so that the game is
utterly perfect. You should /loop on each item and have a separate sub-agent check it
visually to ensure it looks triple A. That separate sub-agent should be a really harsh
critic, and if it doesn't look triple A, it should keep going.

Don't stop until each sub-agent is utterly wowed with the quality when compared with the
actual Call of Duty game. It should literally compare them side by side blind and say
which one looks better. Do this in ThreeJS. /loop until it's utterly perfect. Fan out
sub-agents and ultracode.
```

**Por que NO se copia tal cual en nuestra maquina:**
1. Mete el harness dentro del prompt ("ultracode", "/loop") — aqui eso lo fija el dueño DESDE
   FUERA al lanzar.
2. "Fan out siempre" — contradicho por su propia data (secuencial-un-dueño gano en acoplados).
3. Sin comando de validacion, sin red de seguridad, sin DoF surfeable — en /goal eso cierra en
   falso o no cierra nunca.

Lo que SI se roba: la referencia comparativa, el critico ciego de contexto fresco, el gap mas
grande como señal de error, y el smoothing pass. Eso es lo que esta seccion compila.
