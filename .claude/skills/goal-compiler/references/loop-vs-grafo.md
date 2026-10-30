# Loop vs Grafo — la guía de diagnóstico de FORMA (21 jul 2026)

> Se consulta en la Fase 1.5 del compiler, ANTES de compilar. Fuentes: AI Builder Club
> ("Graph Engineering Guide" + "Graph vs Loop Engineering", jul 2026) + nuestra doctrina
> grafo×lazo×variedad + un PoC de edición de video (21 jul: topología → gates → compositor en un día).
> **Documentada para que cualquiera (el dueño, alguien de su equipo, un agente fresco) tenga la
> autonomía de elegir bien la forma sin re-litigar.**

## Los dos objetos (no confundir)

- **LOOP** = UN trabajo con línea de meta clara que repite hasta quedar bien (discover→plan→
  execute→verify). Es el default de `/goal`. La verificación vive DENTRO (el agente se auto-checa).
- **GRAFO** = varias ESPECIALIDADES con handoffs: contextos separados, herramientas/modelos
  distintos por nodo, ruteo legible como diagrama, fan-out/fan-in real.
- **Se COMPONEN, no se gradúan**: "un loop es un nodo del grafo". Cada nodo del grafo ES un loop
  corriendo su ciclo. El stack completo: prompt → context → harness → loop → grafo → **regulación**
  (la capa 6, la nuestra: comparadores tipados SOBRE el grafo — el mainstream aún no la nombra).

## El diagnóstico: 4 preguntas (2+ síes = grafo; 0-1 = loop disfrazado)

1. ¿Partiste UN contexto en varios ESPECIALIZADOS (prompts/herramientas distintas por nodo)?
2. ¿Hay fan-out/fan-in REAL (ejecución paralela que se fusiona)?
3. ¿El flujo de control se LEE como diagrama (ruteo definido de antemano, no emergente)?
4. ¿Cambian el objetivo y el criterio de éxito entre nodos?

**El test de colapso (el veto final):** *"si puedes colapsar tus nodos de vuelta en el loop de un
solo agente y no pierdes nada, es un loop."* La mayoría de las tareas NUNCA necesitan grafo.
Sobre-grafear una tarea simple (5 nodos para resumir un PDF) = teatro de complejidad.

## Señales rápidas

| Es LOOP si… | Es GRAFO si… |
|---|---|
| un trabajo, una línea de meta | especialidades con nombre y flechas entre ellas |
| pasos secuenciales, mismas herramientas | herramientas/modelos distintos por paso |
| el agente se auto-verifica adecuadamente | un revisor DEDICADO revisa trabajo ajeno (anti auto-sello) |
| — | paralelismo real, o una falla no debe envenenar el resto |

## Fallos típicos de cada forma (para la red de seguridad del prompt)

- **Loop:** contexto ahogado en datos irrelevantes · auto-sello (el mismo agente aprueba su propio
  trabajo) · drift sin heartbeat (por eso el comando de validación es obligatorio SIEMPRE).
- **Grafo:** un merge que TIRA una fuente en silencio · ruteo que loopea infinito · estado que se
  FUGA entre nodos · y el fundamental: *"un grafo construido sobre loops débiles solo falla en más
  lugares a la vez"* — primero clava el loop, luego cablea el grafo.

## Nuestra capa extra: la REGULACIÓN (sea loop o grafo, SIEMPRE)

El mainstream tipa flujos; nosotros tipamos LAZOS. Todo prompt compilado — loop O grafo — lleva
comparadores con referencia explícita (el comando de validación + la DoF ya lo son). Cuando el
diagnóstico da GRAFO, además:

1. **El spec.md gana la sección `## GRAFO DEL SISTEMA`**: nodos = ARTEFACTOS (no agentes), aristas
   = transformaciones tipadas (script/agente/manual) con contratos, lazos = comparadores
   (sensor/comparador/referencia) montados sobre nodos o aristas. Topología ANTES que dinámica.
2. **Los agentes se derivan del grafo, no al revés**: el orden topológico dicta qué corre en
   paralelo; dos agentes solo pueden coexistir si escriben nodos disjuntos y se hablan por aristas.
3. **(Opcional, si el sistema es durable)** el grafo se materializa como conectoma
   (`arbrain/public/conectoma/grafos/<slug>.json`, schema en su README) → visible en la Biblioteca,
   con cobertura morado/ámbar/gris = la agenda de trabajo visible.

## EL TRABAJO DEL GRAPH ENGINEER: el ciclo de cierre (21 jul)

"Ir convirtiendo dinámica morada y cerrando los grafos" — ese ES el trabajo. El ciclo completo:

1. **MAPEAR (topología primero)**: nodos = artefactos, aristas tipadas, lazos con referencia, y
   ESTADOS HONESTOS: morado solo lo validado, ámbar lo que existe sin estreno, gris lo que falta.
2. **LA AGENDA EMERGE SOLA**: los grises y ámbar del mapa SON el backlog, priorizado por dolor
   real (¿qué costó sangre en el último run?) y test de Hormozi (¿cerrar esto paga?).
3. **CERRAR CON EVIDENCIA**: cada cierre = un gate/script/convención VALIDADO contra material
   real (el dedup se probó contra el EDL del run que sangró; jamás flip por fe).
4. **FLIP DE ESTADO**: actualizar el `estado` en el JSON del conectoma. El mapa respira con el
   trabajo — un mapa que no se actualiza al cerrar es un mapa muerto.
5. **ESTRENAR**: ámbar → morado SOLO tras uso en producción real. Instalado ≠ estrenado.
6. **POST-MORTEM AL GRAFO** (el lazo de plasticidad): cada falla del siguiente run se vuelve
   gate/regla/estado nuevo. La dinámica esculpe la topología; el grafo del mes que viene es
   mejor que el de hoy.

**Reglas duras del ciclo:** el estado se GANA con evidencia, nunca se regala · un hueco
descubierto al mapear es ORO, no vergüenza (el mapa honesto te dice dónde trabajar) · si cierras
algo y el mapa no cambió, no cerraste nada · si el mapa cambió y no cerraste nada, mentiste.

**El compilador `scripts/grafo2plan.py`** cierra el tramo mapa→máquina: lee un grafo (schema
conectoma) y deriva el PLAN determinista — fases por orden topológico, grupos hacia artefactos
disjuntos = PARALELO, convergencias marcadas (el merge silencioso es EL fallo de grafo), y los
lazos montados como gates de su fase. Validado: derivó solo que en un pipeline de edición de video el corte y
el diseño corren en paralelo y convergen en el SSOT — idéntico a la producción real.

## El caso de estudio (por qué este orden paga)

Un pipeline de edición de video (20-21 jul): el run 1 falló donde no había regulación (retomas cross-chunk,
composición antes de sellar, máster horneado). Se dibujó el grafo PRIMERO (19 nodos, 23 aristas,
10 lazos — los huecos grises ERAN la agenda), se cerraron gates baratos sobre las aristas
(dedup, candado, keyscan) y al final el compositor declarativo. Un día: de 6 huecos a grafo
completo, cada cierre validado contra material real. Topología → regulación → dinámica.
