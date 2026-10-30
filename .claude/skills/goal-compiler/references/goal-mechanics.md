# Mecanica tecnica de `/goal` y comandos de Claude Code (verificado jun 2026)

> Profundidad para cuando el prompt compilado necesite afinarse. Todo cruzado contra
> docs oficiales (code.claude.com/docs) + corroboracion de comunidad. Lo NO verificado
> esta marcado como tal: no lo metas en un prompt como si fuera real.

## Como funciona `/goal` por dentro

- `/goal <condicion>` instala un **Stop hook de sesion** (solo dura la sesion actual).
- El agente trabaja un turno. Al terminar, **un evaluador separado** (modelo fresco,
  Haiku por default) juzga si la condicion se cumplio.
- Si NO: el agente arranca otro turno solo. Si SI: libera y para.
- **El evaluador NO ejecuta tools, NO lee archivos, NO navega.** Solo juzga el texto/
  evidencia que el agente dejo visible en la conversacion. Cita oficial: *"The evaluator
  judges your condition against what Claude has surfaced in the conversation. It doesn't
  run commands or read files independently, so write the condition as something Claude's
  own output can demonstrate."*
- Consecuencia de diseño: la Definicion de Hecho del prompt DEBE forzar al agente a
  surfear evidencia (build corriendo, screenshots de Playwright, reporte de decisiones,
  comparativa contra referencias). Sin eso, el loop no cierra o cierra en falso.

## Limite de 4000 caracteres (VERIFICADO en uso real)
El campo de condicion de `/goal` corta a **4000 caracteres**. Un prompt mas largo lo
rechaza ("Goal condition is limited to 4000 characters"). Por eso el patron es de dos
archivos: `spec.md` en disco con toda la profundidad + bloque `/goal` corto (<2000 chars
para margen) que referencia el spec por ruta absoluta. El agente lee el spec; el evaluador
solo juzga la DoF que quedo en el bloque. Apunta SIEMPRE con ruta absoluta para que el
`Read` del agente funcione sin importar el cwd donde el dueño lance `/goal`.

## `/goal` vs `/loop` vs `/workflows` vs `/batch`
- **`/goal`** — "trabaja hasta que la condicion verificable se cumpla". Profundidad
  secuencial. Para builds donde importa que quede correcto.
- **`/loop`** — recurrente por intervalo (vigilar deploys, chequeos periodicos). NO es por
  condicion de correctitud.
- **`/workflows`** — orquesta decenas/cientos de agentes en paralelo (amplitud masiva).
  Se dispara con la keyword "ultracode". Para explorar muchas variantes a la vez.
- **`/batch`** — reparte cambios mecanicos grandes entre agentes paralelos.

Regla: profundidad en un artefacto -> `/goal`. Amplitud de muchos -> `/workflows`/`/batch`.

## Effort (el dial por tarea, no global)
Niveles: `low` / `medium` / `high` / `xhigh` / `max` (via comando `/effort` o frontmatter
`effort:` en skills).
- **max / xhigh** — trabajo abierto, ambicioso, de alto riesgo. En el nivel mas alto Fable 5
  **reflexiona y valida su propio output antes de devolverlo**. Default para builds world-class.
- **medium** — tareas bien definidas que aun necesitan razonamiento, sin auto-chequeo exhaustivo.
- **low** — pasos rutinarios dentro de un trabajo mayor; mas rapido y barato.
- Opus 4.8 viene en `xhigh` por default.

## Combinar para autonomia real
- **Auto mode + `/goal`**: Auto mode quita los prompts de aprobacion por tool; `/goal` quita
  los prompts por turno. Juntos = el agente corre solo de verdad.
- **`/ultraplan`** antes de ejecutar: planea y bloquea escrituras hasta aprobar el plan.
  Util para builds grandes donde quieres revisar el enfoque antes de soltar al agente.

## Costo (Fable 5)
~$10 / $1M tokens input, ~$50 / $1M output. Output cuesta 5x el input. Una tarea de
~200K in + 50K out ~= $4.50 antes de caching. Implicacion para el prompt: pide trabajo
sustancial que justifique el premium, y batchea el contexto al inicio (Fable tiene
time-to-first-token alto; mejor contexto upfront que a goteo).

## Filosofia de fondo (harness engineering)
Boris Cherny (Anthropic): *"You're not supposed to prompt Claude. You're supposed to
build a system that prompts itself."* El ciclo es Observe -> Plan -> Act -> Reflect. El
prompt compilado de esta skill ES ese sistema: le da al agente el objetivo, los criterios
de exito, y el mecanismo de auto-verificacion, y lo deja correr.

## Comandos de Claude Code relevantes (VERIFICADOS)
`/goal`, `/effort`, `/loop`, `/workflows`, `/batch`, `/ultraplan`, `/code-review`,
`/agents`, `/model`, sesiones en background (`--bg`), `/compact`, `/context`. El plugin
**ralph-loop** (`/ralph-loop`) sobrevive para quien quiera `--completion-promise` +
`--max-iterations` con stop-hook propio.

## NO verificados (otra IA los menciono; tratar como dudosos hasta confirmar)
`/run-skill-generator`, `/insights`, `/deep-research` como slash nativo, `/plan` como
comando separado de `/ultraplan`, `/btw`. **No los metas en un prompt como reales sin
verificarlos primero** (regla dura: no fabricar features).

## Secretos practicos de la comunidad (destilados)
- No dictes el stack salvo restriccion real.
- Define "que realidad debe existir" + "como se prueba que existe".
- Haz que el agente investigue referencias world-class antes de implementar.
- Pide restate del goal antes de editar para evitar drift.
- Para outputs visuales/subjetivos, la verificacion va con screenshots, navegacion real,
  Playwright/browser, o un reviewer fresco.
- Siempre pon red de seguridad (tope de turnos) para no loopear en lo imposible.
- "Lista las formas en que tu respuesta podria estar mal y corrigelas" mata el falso "termine".
