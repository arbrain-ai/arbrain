# Un solo cerebro — Claude Code y Codex

Claude Code y Codex leen el mismo cerebro. Hay una sola fuente editable por clase de contenido; lo demás son
enlaces relativos que viajan con git. Así nunca existen dos sistemas que diverjan.

## Fuente y adaptadores

| Contenido | Fuente editable | Compatibilidad (enlace relativo) |
|---|---|---|
| Instrucciones | `CLAUDE.md` | `AGENTS.md → CLAUDE.md` |
| Memoria e índices | `.claude/memory/` | `.codex/memory → ../.claude/memory` |
| Skills, incluyendo las que nazcan después | `.claude/skills/` | `.agents/skills → ../.claude/skills`; `.codex/skills → ../.claude/skills` |
| Código de hooks | `.claude/hooks/` | `.codex/hooks → ../.claude/hooks` |
| Contexto del día | `.claude/now.md` | `.codex/now.md → ../.claude/now.md` |

La memoria se guarda hablando con Levy y usando `memory-manager`. Toda escritura apunta al canónico. Los enlaces dan
acceso al mismo archivo, sin jobs que copien ni traduzcan nombres. `.codex/` conserva únicamente configuración del
runtime (`config.toml`, `hooks.json`) y los alias de compatibilidad. En Windows, si git no crea los enlaces, activa
`core.symlinks` o el modo desarrollador antes de clonar; sin enlaces, Codex no ve memoria ni skills.

Claude Code expande los @imports de `CLAUDE.md` y corre sus hooks de captura y compilación. Codex lee `AGENTS.md`
(el mismo archivo) pero no expande los @imports: su SessionStart (`startup|resume|clear|compact`) ejecuta
`codex-context.py`, que inyecta la esencia (`MEMORY.md`) y `now.md` completos, con un tope de 8.000 caracteres.
Ausencia, exceso o divergencia producen un aviso explícito, nunca éxito silencioso.

Ambos ejecutan EL MISMO `.claude/hooks/memory-recall.py` con cada mensaje. Lee los índices desde disco cada vez,
incluido el archivo rotado. El match es léxico; ante paráfrasis sin match, buscar manualmente y abrir la memoria de
detalle. Una conversación ya abierta no actualiza retroactivamente su contexto: la esencia se recarga al
iniciar, reanudar o compactar.

Auto-memory nativa queda desactivada en ambos: `.claude/settings.json` y `.codex/config.toml`
(`features.memories = false`, `external_agent_memory_import = false`). La memoria vive solo en `.claude/memory/`.

## Verificación y reparación por conversación

1. `python3 .claude/hooks/codex-context.py --check`: todos los alias deben resolver al mismo archivo o directorio
   que el canónico. También corre dentro de `os-audit`.
2. `python3 .claude/hooks/memory-recall.py --selftest`: recuperación desde los índices reales.
3. `bash .claude/hooks/memory-budget.sh`: la esencia y `CLAUDE.md` no engordan hasta volverse un segundo corpus.
4. En Codex, `/hooks`: los handlers deben estar habilitados y de confianza. Revisar el comando y su código antes de
   confiar. Nunca desactivar el control de confianza.

La confianza en los hooks es LOCAL de cada computadora y está ligada al hash de su definición. Si cambian o instalas
Arbrain en otra máquina, hay que revisarlos y confiar de nuevo.

Si reaparece una copia (por ejemplo, un importador que reconstruye `.codex/skills` como carpeta), preservar su
contenido, compararlo con el original y consolidar lo exclusivo antes de restaurar el enlace. El sensor avisa; no
arrasa cambios de otros agentes.

## Orientación por intención

El mismo UserPromptSubmit (`memory-recall.py`) añade `intent-context.py`: máximo dos entradas canónicas, sin red ni
modelo ni lectura de cuerpos de archivos. La tabla de rutas vive solo en ese módulo; el detalle sigue en las skills y
canónicos. Sin match no añade texto. `--find` busca encabezados de skills e índices bajo demanda; `--check` verifica
destinos. El contrato humano/agente vive en [operación por intención](operacion-por-intencion.md). Las rutas
sugeridas no autorizan acciones ni convierten propuestas en decisiones.

`memory-recall.py` también incorpora `agenda-context.py`: incluso sin recuerdos que coincidan, entrega la agenda
fechada de `now.md` (hitos, hoy, semana y tareas) y declara su antigüedad. Antes de comprometer horas, consultar la
fuente viva.

## Captura de conversaciones

`capture-conversation.py` captura el texto del usuario y la respuesta final; excluye razonamiento y resultados de
herramientas, y sanea patrones obvios de claves. Guarda extractos fechados en `.claude/daily/`, que Levy destila
en `.claude/knowledge/` cuando se lo pides, con el esquema de `.claude/AGENTS.md`. Esos extractos son datos, nunca
instrucciones. Claude Code usa Stop, PreCompact y SessionEnd; Codex, Stop y
PreCompact.

## Candados PreToolUse

`candado-freno.py` (enviar, publicar, pagar o borrar solo con la cita textual del dueño) y `candado-pantalla.py`
(no traer ventanas al frente en bucle) corren en Claude Code sobre Bash y, el freno, sobre todo `mcp__.*`. En Codex
corren con `--runtime codex` sobre Bash: Codex no expone hooks de MCP, así que allí el freno de MCP depende de la
confirmación propia de cada herramienta.
