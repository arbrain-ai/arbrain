---
name: goal-compiler
description: "Convertir una intención ambiciosa en un spec y un prompt verificable para /goal. Usar para compilar o elevar prompts, elegir loop o grafo y definir criterios de calidad con referentes y crítica A/B. Diseña el contrato de ejecución; no ejecuta el proyecto por invocarlo."
---

# Goal Compiler — De ambicion vaga a prompt soberano para `/goal`

> **La frase nucleo (no la olvides, es el alma de esta skill):**
> **"No reduzcas la ambicion para hacerla implementable. Aumenta la claridad para que el modelo pueda descubrir como implementarla."**

## ⛔ REGLA INNEGOCIABLE: el bloque `/goal` SIEMPRE < 4000 caracteres

El campo de condicion de `/goal` corta a **4000 caracteres**. Un bloque mas largo lo rechaza con `Goal condition is limited to 4000 characters`. Esto NO es negociable:

1. **Objetivo: <2000 caracteres.** Limite absoluto: 4000. Nunca lo cruces.
2. **VERIFICA antes de entregar.** Antes de dar CUALQUIER bloque `/goal` al usuario, mide su largo de verdad (escribelo a un archivo y corre `wc -m`, o cuentalo). Si pasa de 4000 (idealmente de 2500), NO lo entregues: mueve detalle al `spec.md` y recorta hasta que quepa. Reporta el conteo al usuario para que lo vea.
3. **Toda la profundidad va al `spec.md`, no al bloque.** El bloque solo lleva: puntero al spec + outcome en una linea + DoF verificable + restricciones + red de seguridad. La vision, el horizonte y el detalle de features viven en el spec (sin limite).
4. **Lo que se pega en `/goal` es el bloque corto, NUNCA el `spec.md`.** Dejaselo claro al usuario para que no pegue el archivo largo por error.

## Por que existe esta skill

El cuello de botella de lo que se construye con IA dejo de ser el modelo. Ahora el cuello de botella somos nosotros cuando prompteamos. Cuando le decimos al modelo "usa three.js", "hazlo simple", "primero un MVP", "el componente va aqui", lo estamos **encadenando a nuestro propio techo de conocimiento** justo cuando el modelo probablemente sabe mas que nosotros sobre como resolverlo.

Anthropic lo dice explicito para los modelos nuevos (Fable 5): *describe el resultado, no los pasos*. Fable esta construido para trabajo ambicioso, largo y asincrono: planea por etapas, llama herramientas, lee resultados, y en effort alto **valida su propio output antes de devolverlo**. Skills y prompts viejos demasiado prescriptivos pueden **empeorar** el output porque le matan ese scoping natural.

Esta skill toma una idea ("un simulador de robots IA tipo SolidWorks", "el sistema solar interactivo", "anatomia humana 3D estilo Da Vinci con experimentacion simulada") y la **compila** en un prompt para `/goal` que protege la ambicion y le da al modelo libertad de ejecucion, sin perder lo unico que `/goal` necesita para funcionar: **una condicion de parada verificable**.

## La tension que TIENES que resolver (mecanica real de `/goal`)

`/goal` no es magia. Es un Stop hook de sesion: defines una condicion, el agente trabaja, y al final de cada turno **un evaluador separado** (modelo fresco, Haiku por default) decide si la condicion ya se cumplio. Si no, el agente sigue. Hasta el infinito si hace falta.

**El detalle que define todo el diseño del prompt:** el evaluador **solo juzga lo que el agente dejo visible en la conversacion. NO corre comandos, NO lee archivos, NO abre el navegador por su cuenta.** Cita oficial: *"write the condition as something Claude's own output can demonstrate."*

Entonces la ambicion y la condicion de parada tiran en direcciones opuestas, y el prompt compilado las separa en dos capas:

| Capa | Donde vive | Como se escribe |
|------|-----------|-----------------|
| **Ambicion** (el QUE, al horizonte) | Mision + libertad tecnica | Abierta, sin stack impuesto, "el mejor del mundo", sin MVP |
| **Verificacion** (la prueba de que existe) | Definicion de Hecho | Cerrada y demostrable EN EL TRANSCRIPT: build corriendo, Playwright con screenshots, reporte de decisiones |
| **Validacion continua** (la prueba DURANTE el loop) | Comando de validacion | UN comando shell exacto que el agente corre tras cada cambio grande y cuyo output surfea. Ver seccion siguiente |

## COMANDO DE VALIDACION — parte obligatoria del contrato (fusion goal-loop, 8 jul 2026)

La DoF le da evidencia al **evaluador** al final. Pero el agente puede driftar 30 turnos antes de llegar ahi. El antidoto (adoptado del contrato de 5 partes del goal-loop de David Ondrej): **todo prompt compilado incluye UN comando de validacion** que el agente corre despues de cada cambio grande, no solo al final. Es el heartbeat del loop.

Como se compila SIN romper la soberania del stack:
- **Infra conocida** (restriccion real: "vive en arbrain/", "es un script en arbrain/server/"): da el comando EXACTO (`npm run build`, `npx tsx script.ts`, `pytest -q`). Un comando concreto NO es imponer stack: es imponer prueba.
- **Stack libre** (el modelo elige todo): no inventes el comando. El contrato ordena: *"En tu primer checkpoint DECLARA tu comando de validacion (build/test/lint en uno) y correlo tras cada cambio grande, surfeando el output."* El agente elige el comando; declararlo y correrlo es innegociable.

Regla: lo obligatorio es el **mecanismo** (un comando, corrido siempre, output visible), no el comando en si.

Si la condicion no es demostrable desde el transcript, `/goal` nunca cierra el loop (o cierra en falso). Por eso el prompt **obliga al agente a surfear evidencia**.

## El proceso (4 fases)

### Fase 1 — Detecta la intencion profunda (no preguntes todavia)
Lee la idea y extrae, en silencio, lo que ya puedas inferir:
- **Dominio real** (simulacion fisica, motor 3D, juego, herramienta educativa, mundo virtual...).
- **Usuario final** y que "realidad debe existir" para el cuando termine.
- **Restricciones REALES** (debe correr en web para grabarlo en stream, debe vivir dentro de tal infra, debe ser una sola pagina) vs **restricciones FALSAS** (el stack, la libreria, "que sea simple"). Las falsas se tiran a la basura: son justo lo que limita al modelo.

### Fase 1.5 — DIAGNÓSTICO DE FORMA: ¿loop o grafo? (21 jul 2026 — LEER `references/loop-vs-grafo.md`)

Antes de compilar, decide la FORMA con las 4 preguntas de la guía (¿contextos especializados
separados? ¿fan-out/fan-in real? ¿flujo legible como diagrama? ¿objetivo/criterio cambia por nodo?):
**0-1 síes = LOOP** (el default de /goal, la mayoría de las tareas) · **2+ = GRAFO**. Veto final =
el test de colapso: *si puedes colapsar los nodos en el loop de un agente y no pierdes nada, es
loop.* No te gradúas de loops a grafos: COMPONES loops en grafos (cada nodo ES un loop).

- **LOOP** → compila normal (Fases 2-4). La regulación va igual: comando de validación + DoF.
- **GRAFO** → el `spec.md` gana la sección **`## GRAFO DEL SISTEMA`** (nodos = ARTEFACTOS, aristas
  = transformaciones tipadas script/agente/manual con contratos, lazos = comparadores con
  sensor/referencia; topología ANTES que dinámica), y **el plan de orquestación se COMPILA, no se
  improvisa**: `python3 scripts/grafo2plan.py GRAFO.json -o plan.md` deriva fases por orden
  topológico, paralelismo (artefactos disjuntos), convergencias y gates por fase — el plan entra
  al spec. Si el sistema es durable se materializa como conectoma
  (`arbrain/public/conectoma/grafos/<slug>.json` → Biblioteca). Caso de estudio, anti-patrones y
  EL CICLO DE CIERRE (el trabajo del graph engineer): la reference. ⛔ Sobre-grafear tareas
  simples = teatro de complejidad; ante la duda, loop.

### Fase 2 — Pregunta solo lo que BLOQUEA el outcome (2-4 max)
No hagas un cuestionario. Pregunta unicamente lo que cambia el resultado y que no puedas inferir. Buenos ejemplos de pregunta que si mueve la aguja: "¿esto lo vas a mostrar en pantalla (web) o corre local?", "¿quien lo usa, tu o un usuario final?", "¿hay alguna restriccion real de infra/plataforma o el modelo elige todo?". Si no hay nada que de verdad bloquee, **no preguntes, compila**.

**Como preguntar las pocas que sobrevivan (mecanica de grilling / Matt Pocock, 22 jul 2026):**
- **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza del dueño y el modelo no puede inferir— se le ponen a el.
- **Una a la vez.** Si necesitas 2-4, hazlas de una en una esperando respuesta; varias juntas desconciertan y bajan la calidad de cada respuesta.
- **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que el dueño confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.

Regla de oro: ante la duda entre preguntar un detalle tecnico o dejarlo abierto, **dejalo abierto**. El detalle tecnico es justo lo que el modelo resuelve mejor que tu.

### Fase 3 — Expande el horizonte
Reescribe el outcome a su version world-class. No "un visor de anatomia", sino "un atlas anatomico 3D interactivo nivel referencia mundial, con sistemas seleccionables, cortes, capas, y experimentacion simulada". Sube el techo a proposito. Es mas barato pedir el horizonte y aterrizar, que pedir poco y quedarse corto.

### Fase 3.5 — ¿EXISTENCIA o EXCELENCIA? La BARRA DE CALIDAD (Gauntlet, 29 jul 2026 — LEER `references/barra-de-calidad.md`)

Pregunta binaria antes de compilar: **cuando esto FUNCIONE, ¿ya gano?**

- **SI → dominio de EXISTENCIA** (crons, scripts, endpoints, pipelines): la DoF normal basta.
  NO montes barra — seria teatro de calidad.
- **NO — funcional-pero-mediocre seria un fracaso → dominio de EXCELENCIA** (juegos/3D,
  pergaminos, decks, thumbnails, edicion de video, landing copy, UIs de producto): el spec gana
  la seccion **`## BARRA DE CALIDAD`** — un referente REAL e inspeccionable a vencer (test: si
  no puedes NOMBRAR el artefacto del A/B, no hay barra) + lazo builder→critico-ciego por
  componente (contexto fresco, A/B contra el referente, devuelve EL gap mas grande, meseta
  honesta como parada) + la DoF gana el veredicto A/B surfeado.

⛔ **Las DOS enmiendas del 27 ago 2026 — sin ellas la barra cierra en verde con algo muerto**
(tres casos medidos en tres dominios; detalle en `references/barra-de-calidad.md` §los dos agujeros):
1. **El lazo va en DOS escalas.** Componente vs componente **y ademas OBJETO ENTREGADO vs objeto
   entregado del referente** (la pelicula entera, la landing entera, el lienzo entero), con
   metricas de conjunto. El smoothing pass NO cuenta: es coherencia, no juicio. *Test de escala:
   ¿la unidad que juzga el critico es la misma que consume el usuario?*
2. **Del referente se puede CAMBIAR; sin referente no se puede QUEDAR.** Si el spec argumenta que
   no aplica a una dimension, debe nombrar OTRO artefacto real de la misma escala — nunca una
   cifra propia — o declarar el hueco. La frase para las tres: *"la meta se baja al
   comparador"*.

La doctrina de subagentes que el spec le dicta al ejecutor (critico fresco SIEMPRE que hay
barra; paralelo SOLO artefactos disjuntos; sistemas acoplados = pase secuencial con UN dueño —
data del propio Claude-of-Duty; smoothing pass al final) vive en la reference. Clave: se
prescribe el PROCESO de calidad, jamas la implementacion. La barra NO sustituye el comando de
validacion: el critico ve calidad, el comando ve verdad mecanica.

### Fase 4 — Compila (bloque `/goal` corto + `spec.md`)
El campo de condicion de `/goal` **corta a 4000 caracteres**; si te pasas, lo rechaza. Por eso NO metas todo inline. Genera DOS cosas: un **`spec.md`** en disco con toda la ambicion y el detalle (sin limite), y un **bloque `/goal` corto** (apunta a <2000 chars) que referencia el spec y solo carga lo que el evaluador necesita ver. Devuelve el bloque `/goal` en un bloque de codigo para copiarlo limpio, y crea el `spec.md` en disco con ruta absoluta. **Antes de entregar el bloque, VERIFICA su largo con `wc -m` y confirma que es <4000 (idealmente <2000); si pasa, recorta moviendo detalle al spec.** Reporta el conteo al usuario. No ejecutes el build (a menos que el dueño lo pida): esta skill **produce el prompt y el spec**, no construye la app.

## Limite duro: 4000 caracteres en la condicion de `/goal`

El campo de condicion de `/goal` corta a **4000 caracteres**; si te pasas, lo rechaza. Por eso la salida es de **dos archivos**: toda la profundidad va a un `spec.md` en disco (sin limite), y el bloque que se pega queda corto (apunta a <2000 chars para margen). El bloque referencia el spec por ruta absoluta; el agente lo lee antes de construir. Asi el evaluador solo necesita ver el outcome + la DoF verificable + la parada, y la vision/horizonte/detalle viven en el spec sin tocar el limite.

## Plantilla A — el `spec.md` (en disco, SIN limite)

Aqui va toda la ambicion. Es lo que en la version vieja iba inline. Guardalo con ruta absoluta (ej. dentro de `docs/specs/<slug>/`).

````markdown
# [Nombre] — Spec

## MISION
[El outcome al horizonte maximo, como la REALIDAD que debe existir cuando termines.
Ambicioso, world-class, no un MVP. El que, no el como. Detalla features sin miedo.]

## LIBERTAD TECNICA
Tu eliges arquitectura, stack, librerias, motores y estrategia: probablemente sabes
mejor que yo que conviene. Cualquier tecnologia que aparezca aqui es sugerencia
descartable, NO requisito, salvo la seccion RESTRICCIONES. Optimiza por el mejor
resultado posible, no por el camino mas corto.

## INVESTIGA ANTES DE CONSTRUIR
Investiga 2-3 referencias world-class de [dominio] y decide el enfoque tecnico a partir
de eso. [Datos reales si aplica.] Reafirma el objetivo en una linea antes de cada
edicion grande para no driftar.

## DEFINICION DE HECHO (evidencia visible en la conversacion)
[La version expandida y detallada de la DoF: cada flujo interactivo del dominio.]

## BARRA DE CALIDAD (solo dominios de EXCELENCIA — si no aplica, BORRA esta seccion)
Referente a vencer: [artefacto REAL e inspeccionable: paths de screenshots / URL / archivo].
⛔ Si en alguna dimension este referente NO aplica, NOMBRA otro artefacto real de la MISMA ESCALA
para esa dimension o declara el hueco ("esta dimension va sin barra"). Una cifra propia, un conteo
interno o una vara derivada de nuestro material anterior NO son sustitutos: eso es quedarse sin vara.
El lazo corre en DOS ESCALAS y las dos son obligatorias:
 · COMPONENTE — cada pieza calificable contra la pieza equivalente del referente.
 · OBJETO — [la entrega completa: el video entero / la landing entera / el lienzo entero] contra
   la entrega completa del referente, con metricas de CONJUNTO (ritmo, continuidad, densidad,
   huecos, deriva), no de pieza. El pase de integracion final NO sustituye este lazo.
Por cada componente calificable, monta un lazo builder→critico: el critico es un subagente de
CONTEXTO FRESCO que nunca ve tu razonamiento; compara tu artefacto RENDERIZADO contra el
referente en A/B ciego y devuelve EL gap mas grande (uno solo, no lista). El critico es
DESPIADADO por calibracion: su default es "gana el referente" y solo cede la victoria cuando
el tuyo gana CLARAMENTE — ante la duda, gana el referente. Atacalo y repite
hasta que el critico prefiera el tuyo o haya meseta honesta (2 rondas sin avance → declara el
gap residual y sigue). Paralelo SOLO entre componentes disjuntos; sistemas acoplados = pase
secuencial con UN dueño. Al final, un pase de integracion con agente fresco revisa la
coherencia del conjunto. Surfea cada veredicto A/B en la conversacion.

## COMANDO DE VALIDACION
[Infra conocida: el comando exacto, ej. `npm run build && npm test`. Stack libre:
"Declara tu comando de validacion en el primer checkpoint (build/test/lint en uno)."
Siempre: correlo tras cada cambio grande y surfea el output en la conversacion.]

## RESTRICCIONES REALES
[Solo lo no negociable. Si no hay, "ninguna, libertad total".]
````

## Plantilla B — el bloque `/goal` (lo que se pega, <2000 chars)

ALWAYS conserva esta forma; ata la parada a evidencia que el evaluador pueda VER:

````
/goal Construye lo descrito en el spec completo: [PATH ABSOLUTO al spec.md]. Leelo
ENTERO antes de empezar y reafirma el objetivo en una linea antes de cada edicion grande.
Outcome: [una linea del que, al horizonte].
Libertad tecnica total: tu eliges stack, arquitectura y librerias; las tecnologias del
spec son sugerencias descartables salvo su seccion RESTRICCIONES. Investiga 2-3
referencias world-class antes de codear.
VALIDA: [comando exacto si la infra es conocida | "declara tu comando de validacion en el
primer checkpoint"] — correlo tras cada cambio grande y surfea su output.
HECHO cuando (el evaluador solo ve esta conversacion, no corre comandos: surfea evidencia):
- la app corre, sin errores de consola
- el ultimo output del comando de validacion pegado, en verde
- con Playwright abres la pagina y pegas screenshots de: [flujo 1]; [flujo 2]; [flujo 3
  con antes/despues que demuestre movimiento/interaccion]
- reporte de decisiones (que stack elegiste y por que)
- [solo si el spec tiene BARRA DE CALIDAD] veredicto A/B final del critico por componente +
  gap residual declarado
- lista las formas en que podria estar mal/incompleto y resuelvelas
RESTRICCIONES: [app web que corre con un comando; sin APIs de pago; lo que no se toca].
RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo.
````

> ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal`.**
> El effort y el Auto mode los fija el dueño DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
> caracteres del limite. El bloque solo lleva outcome + DoF + restricciones + red de seguridad.

### Dos notas operativas que van junto al artefacto (fuera del bloque)
- **Effort es un dial por tarea (lo fija el usuario al lanzar, NO va en el prompt).** Para builds ambiciosos: `xhigh`, y `max` cuando quieras que Fable se autovalide a fondo. No lo dejes en bajo para algo grande.
- **`/goal` da profundidad secuencial.** Si lo que quieres es amplitud masiva (decenas de variantes/exploraciones en paralelo), eso es territorio de `/workflows` o subagentes, no de `/goal`. Ver `references/goal-mechanics.md`.

## Ejemplos de compilacion (mini)

**Entrada:** "quiero un simulador estilo SolidWorks pero para robots de IA avanzados, quiza con three.js?"
**Lo que hace la skill:** detecta dominio = simulacion 3D de robotica; marca "three.js" como restriccion FALSA (sugerencia descartable); pregunta solo si corre en web para mostrarlo; expande a "entorno de diseño y simulacion 3D de robots con cinematica, fisica e IA de comportamiento, nivel herramienta profesional"; compila con DoF = Playwright navegando el viewport, manipulando un robot, corriendo una simulacion, screenshots pegados.

**Entrada:** "una app para estudiar anatomia humana en 3D, estilo Da Vinci pero con experimentacion simulada"
**Lo que hace la skill:** dominio = atlas anatomico 3D interactivo; sin stack impuesto; expande a sistemas seleccionables + capas + cortes + experimentos simulados; DoF = navegacion real por sistemas con screenshots + un experimento simulado funcionando + reporte de decisiones.

## Anti-patrones (NO hagas esto)
- **Devolver un prompt mas largo y prescriptivo.** Eso es el juego viejo; mata el scoping de Fable. Mas claridad en el outcome, no mas instrucciones en el como.
- **Imponer el stack que menciono el usuario.** Es casi siempre una restriccion falsa.
- **DoF no demostrable** ("que quede bonito", "que funcione bien"). Si el evaluador no lo puede ver en el transcript, no sirve. Atalo a evidencia (Playwright, screenshots, reporte).
- **Cuestionario de 10 preguntas.** Solo lo que bloquea el outcome. El resto se deja abierto a proposito.
- **Bajar la ambicion a un MVP.** El default es la version world-class.
- **Pasarte de 4000 chars en el bloque `/goal`.** Es un limite duro que lo rechaza. Si no cabe, mueve la profundidad al `spec.md` y deja el bloque corto apuntando al spec.
- **Barra de calidad en dominio de EXISTENCIA** (cron, script, endpoint) = teatro de calidad. Y su inversa, mas cara: **DoF de solo-existencia en dominio de EXCELENCIA** — el loop cierra en verde con un resultado mediocre-funcional. Diagnostica en Fase 3.5.
- **Barra sin referente nombrable** ("que se vea increible"). Si el critico no puede montar el A/B contra un artefacto real, no hay lazo — solo adjetivos.

## Fase 5 — Post-mortem al grafo (el lazo de plasticidad, formalizado 21 jul)

Cuando un `/goal` compilado termina (converge o se detiene por la red de seguridad), el ciclo NO
cierra hasta el post-mortem: (1) pedir/extraer el retrospectivo del ejecutor (fricciones, gaps,
fallas, qué funcionó); (2) mapear CADA hallazgo a un elemento del grafo del sistema (¿qué arista
era frágil? ¿qué lazo faltaba?); (3) los hallazgos se vuelven gates/reglas/estados — se actualiza
el conectoma Y la skill del dominio; (4) lo que funcionó se declara intocable. Ejemplo: un
retrospectivo honesto puede parir varios scripts y el cierre completo del grafo en un día. La
dinámica esculpe la topología — sin este paso, el grafo se pudre y las mismas fallas se repiten.

## El metagrafo de esta skill (se contempla a sí misma)

Esta skill también puede mapearse como conectoma con su propia semántica (cubierto · sin estreno ·
hueco · lazos): un JSON en `arbrain/public/conectoma/grafos/goal-compiler.json` que el visor
`/conectoma/index.html?g=goal-compiler` dibuja. Ahí se VE qué fase ya tuvo su primera compilación
real, qué huecos quedan (por ejemplo, `grafo → orquestación`: hoy el ejecutor deriva sus agentes
leyendo el spec) y el lazo de plasticidad (post-mortem → skill). Si lo creas, al cerrar cada hueco
actualiza su `estado`: el mapa respira con el trabajo, no se pudre.

## Profundidad tecnica
Para la mecanica fina de `/goal` (evaluador, exit codes de hooks), niveles de effort, combos con Auto mode, y la lista verificada de comandos nuevos de Claude Code: leer `references/goal-mechanics.md`.
