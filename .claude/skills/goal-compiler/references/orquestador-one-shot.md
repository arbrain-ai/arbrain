# Orquestador one-shot: compilar el spec y ejecutarlo delegando nodos a subagentes (23 oct 2026)

> Esta referencia cubre el caso en que la skill no solo compila: **un agente coordinador recibe el encargo, compila
> el spec y lo ejecuta hasta el reporte**, sin `/goal` de por medio y sin que la persona pegue nada. Se usa cuando el diagnóstico de `loop-vs-grafo.md` da GRAFO o
> cuando el encargo dice «delega», «con subagentes», «orquesta», «de one shot».

## La idea en tres líneas

1. El **spec es el contrato**; el orquestador es su dueño y el único que integra a `main`.
2. Cada **nodo del grafo es un loop** que corre un subagente con su ficha: artefacto que posee, DoD verificable hoy,
   comando de validación y freno.
3. **Nadie se auto-sella.** El orquestador vuelve a correr la prueba del nodo antes de aceptarlo; el reporte del
   subagente es una afirmación, no evidencia.

## El ciclo (siete pasos, en orden)

| # | Paso | Qué produce | Gate para pasar al siguiente |
|---|---|---|---|
| 0 | **Chequeo previo** (`velocidad-de-la-luz.md`) | Sección `## CHEQUEO PREVIO` del spec: scopes de `gh`, cuotas, disco y carga, política del proveedor, dónde se prueba, decisiones de la persona en lote | Cada punto resuelto o declarado como riesgo con su sustituto |
| 1 | **Compilar el spec** (Fases 1–4 de la skill) | `spec.md` con MISIÓN, `## GRAFO DEL SISTEMA`, DoD, comando de validación, restricciones y **FECHAS** por fase | Grafo con nodos = artefactos y aristas tipadas; ninguna DoD exige datos del futuro (si no se puede verificar hoy, es Action Item) |
| 2 | **Plan** | `python3 .claude/skills/goal-compiler/scripts/grafo2plan.py GRAFO.json -o plan.md`: fases topológicas, paralelo solo entre artefactos disjuntos, convergencias | Cada nodo tiene ficha (abajo) |
| 3 | **Lanzar por fase** | Un subagente por nodo, cada uno en su worktree | Fichas entregadas completas; rutas reclamadas en la bitácora compartida |
| 4 | **Gate por nodo** | El orquestador re-corre el comando de validación en el worktree del nodo y lee el diff | Verde re-corrido por el orquestador + DoD del nodo surfeada; si falla, el nodo vuelve con **el gap más grande** (uno) |
| 5 | **Integrar** | Merge secuencial a `main` desde el worktree del orquestador, uno por nodo, re-validando tras cada uno | Comando de validación global verde después de cada merge; nunca un merge que tire cambios en silencio |
| 6 | **Reporte** | `REPORTE.md` junto al spec + resumen a la persona | Tabla DoD (probado / ámbar / falta), fechas, lo que espera la palabra de la persona, real vs límite (velocidad de la luz) |

## La ficha de cada nodo (lo que recibe el subagente)

El prompt del subagente es la ficha completa, autocontenida: el subagente no ve esta conversación.

```text
NODO: <nombre> · parte del spec <ruta absoluta> (léelo entero antes de empezar; tu sección es <§>)
WORKTREE: <ruta>  (rama <rama>; no trabajes en el checkout principal)
POSEES: <rutas que puedes crear o modificar>
NO TOCAS: <rutas de otros nodos o de otro agente, según la bitácora>
ENTRADAS: <artefactos que otros nodos ya dejaron y su contrato>
DoD (verificable hoy, con evidencia):
  - <comando> → <salida esperada>
  - <prueba real en la plataforma de destino: runner de CI, contenedor Linux>
VALIDA: <comando exacto>; córrelo tras cada cambio grande.
FRENO: no publicar releases, no comprar, no tocar producción, no pull/stash en el checkout principal, no `rm -rf`. Si algo de esto hace falta, para y repórtalo como bloqueo.
REPORTE (≤ 300 palabras): rama y commits; el comando de validación con sus últimas líneas de salida; links de los runs
  de CI; qué quedó fuera y por qué; las formas en que esto podría estar mal.
```

Libertad técnica dentro del nodo: la ficha dice qué artefacto debe existir y cómo se prueba, no cómo se construye.

## Mecánica en Claude Code

- **Worktrees:** uno por nodo con `git worktree add ../wt-<nodo> -b <nodo>` (o el script de worktrees ralos de tu
  instalación, si existe). Si el disco está justo, preferirlo a `isolation: "worktree"` del Agent tool, que hace un
  checkout entero. Al integrar: `git worktree remove` cuando la rama ya esté en `main`.
- **Agent tool:** subagentes `general-purpose` con el modelo más capaz disponible. Los nodos paralelos de una fase se lanzan en **un solo
  mensaje con varias llamadas**, para que corran a la vez.
- **Sin pantalla (headless):** el turno termina cuando el orquestador responde. Lanzar con `run_in_background: false`,
  esperar en primer plano y no dejar procesos, vigías ni despertadores vivos al cerrar. Con pantalla rige lo contrario:
  el coordinador nunca se duerme y siempre deja un despertador vivo.
- **Prueba donde corre:** Linux en contenedor local o runner de CI; Mac/Windows en runners de GitHub Actions. Un verde en emulación no cierra un nodo de otra plataforma.
- **Un build pesado a la vez** en tu máquina: los nodos que compilan van en fila o a CI.

## Coordinación con otros agentes vivos

- Antes de lanzar: `git worktree list`, `ListAgents` y la bitácora del dominio (un `BITACORA.md` en el checkout principal para que todos la vean). Escribir ahí las rutas que se
  reclaman y leer las ajenas. Archivo compartido = un solo dueño por fase; si hace falta tocarlo, se pide por la
  bitácora y se integra después del otro.
- Los cambios de otro agente nunca se revierten para que pase el propio merge.

## Anti-patrones

| Anti-patrón | Qué rompe | Antídoto |
|---|---|---|
| Aceptar «listo, todo verde» del subagente | Auto-sello; verdes falsos | Gate 4: el orquestador re-corre |
| Dos nodos escribiendo el mismo archivo en paralelo | Merge que tira una fuente | Paralelo solo con artefactos disjuntos; acoplado = secuencial con un dueño |
| Nodo trabajando en el checkout principal | Pisa el trabajo local de la persona | Worktree siempre; nada de pull/stash ahí |
| DoD con algo que aún no puede ocurrir (una noche entera, la clase del lunes) | Loop sin cierre | Se vuelve Action Item con fecha; la DoD prueba el mecanismo con reloj acelerado |
| Subagente que publica, compra o despliega | Acción irreversible sin firma | Freno en la ficha; la versión queda lista y se le dice a la persona |
| Orquestador que escribe el código de los nodos | Pierde la vista del grafo | Él escribe spec, fichas, pegamento de integración y reporte |
| Reporte sin fechas ni faltantes | La persona no puede prometer nada | Paso 6 obligatorio con la tabla DoD |
