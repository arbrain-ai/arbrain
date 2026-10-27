/**
 * «Voz con SFlow»: el chat de Arbrain habla en voz alta con SFlow (https://github.com/danielsantacolomavalencia-lang/sflow-voz).
 *
 * Al terminar cada turno del chat, el daemon le pasa el transcript de esa sesión al `voz.py` de SFlow, el MISMO que usa
 * el gancho `Stop` de Claude Code. Así la skill `modo-voz` suena igual en la app que en Claude Code: el último bloque 🔊,
 * el respaldo de «léeme», sin repetir lo dicho, en segundo plano. Con el modo demo encendido, antes de cada acción
 * SFlow dice la línea 🔊 pendiente y la acción espera a que la voz termine.
 *
 * Por qué así y no con un gancho: con el motor de suscripción la app no carga `~/.claude/settings.json` y meter el
 * gancho en el cerebro rompería la huella de ganchos (hooks-proyecto.ts). Esto no toca ninguno. El token de SFlow ni
 * siquiera pasa por Arbrain: lo lee `voz.py`. Si SFlow no está instalada, está cerrada o algo falla: silencio.
 *
 * Dónde está SFlow: su instalador (`claude_hooks/instalar.py`) deja accesos directos estables en
 * `~/Library/Application Support/SFlow/` (`voz.py`, `modo_demo.py`), clonado donde esté. `ARBRAIN_VOZ_SFLOW` lo cambia.
 *
 * Estado en `<ARBRAIN_CONFIG_DIR>/voz-sflow.json`. Nace ENCENDIDO: solo habla cuando el agente escribe una línea 🔊
 * (o con el respaldo de «léeme»), como en Claude Code. Apagarlo silencia todo.
 */
import type { HookCallbackMatcher, HookInput, SyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

/** La carpeta de datos de SFlow (la misma en cualquier Mac). */
export const DIR_SFLOW = () => join(homedir(), 'Library', 'Application Support', 'SFlow')
/** El `voz.py` de SFlow (el mismo del gancho de Claude Code). `ARBRAIN_VOZ_SFLOW` lo cambia sin tocar código. */
export const VOZ_PY = () => process.env.ARBRAIN_VOZ_SFLOW || join(DIR_SFLOW(), 'voz.py')
const PYTHON = '/usr/bin/python3'
/** Margen para que el CLI termine de escribir la última entrada del transcript antes de leerlo. */
const ESPERA_MS = 600

export interface EstadoVozSFlow { encendido: boolean; disponible: boolean }

let encendido: boolean | null = null
const archivo = () => join(DIR_ARBRAIN(), 'voz-sflow.json')

function leer(): boolean {
  if (encendido !== null) return encendido
  try {
    const p = archivo()
    encendido = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { encendido?: unknown }).encendido !== false : true
  } catch { encendido = true }
  return encendido
}

export const estadoVozSFlow = (): EstadoVozSFlow => ({ encendido: leer(), disponible: existsSync(VOZ_PY()) })

export function fijarVozSFlow(valor: boolean): EstadoVozSFlow {
  encendido = valor
  try { const p = archivo(); mkdirSync(dirname(p), { recursive: true, mode: 0o700 }); writeFileSync(p, JSON.stringify({ encendido: valor }) + '\n', { mode: 0o600 }) }
  catch { /* el estado en memoria manda */ }
  return estadoVozSFlow()
}

/** Dónde guarda el CLI los transcripts: la carpeta de la cuenta en uso (`CLAUDE_CONFIG_DIR`) y la de siempre. */
export const raicesDeTranscripts = (): string[] =>
  [...new Set([process.env.CLAUDE_CONFIG_DIR, join(homedir(), '.claude')].filter((d): d is string => !!d).map(d => join(d, 'projects')))]

/** El transcript JSONL de una sesión del CLI: `<raíz>/<carpeta>/<sesión>.jsonl` (sin suponer el nombre de la carpeta). */
export function transcriptDe(sesion: string, raices: string | string[] = raicesDeTranscripts()): string | null {
  if (!/^[0-9a-f-]{8,64}$/i.test(sesion)) return null
  for (const raiz of Array.isArray(raices) ? raices : [raices]) {
    try {
      for (const d of readdirSync(raiz, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const p = join(raiz, d.name, `${sesion}.jsonl`)
        if (existsSync(p)) return p
      }
    } catch { /* sin carpeta de proyectos: la siguiente */ }
  }
  return null
}

/** Al terminar un turno del chat: que SFlow diga el bloque 🔊 de la respuesta. Nunca lanza ni hace esperar al chat. */
export function decirConSFlow(sesion: string | undefined): void {
  try {
    if (!sesion || !leer()) return
    const voz = VOZ_PY()
    if (!existsSync(voz)) return
    setTimeout(() => {
      try {
        const transcript = transcriptDe(sesion)
        if (!transcript) return
        const hijo = spawn(PYTHON, [voz], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] })
        hijo.on('error', () => { /* sin python o sin voz.py: silencio */ })
        hijo.stdin?.end(JSON.stringify({ hook_event_name: 'Stop', session_id: sesion, transcript_path: transcript }))
        hijo.unref()
      } catch { /* la voz nunca rompe un turno */ }
    }, ESPERA_MS).unref?.()
  } catch { /* la voz nunca rompe un turno */ }
}

/** Solo pruebas. */
export function _vozSFlowParaPruebas(v: boolean | null = null): void { encendido = v }

/* ── Narración en vivo (modo demo de la skill `modo-voz`) ───────────────────────────────────────────────────────────
 * En Claude Code lo hace el gancho PreToolUse `test -e demo.json && voz.py pre`: antes de cada acción, SFlow dice la
 * línea 🔊 pendiente y la acción ESPERA a que la voz termine (tope de voz.py: 10 s). Aquí, lo mismo como callback del
 * SDK en los turnos del chat. Solo actúa si el modo demo está encendido (el agente lo enciende con `modo_demo.py on`
 * cuando la persona pide «con demo»; se apaga solo a las 3 h) y si «Voz con SFlow» está encendida. Apagado cuesta un
 * `existsSync`.
 */

/** El marcador del modo demo que crea `modo_demo.py on` (el mismo que mira el gancho de Claude Code). */
export const DEMO_JSON = () => join(DIR_SFLOW(), 'demo.json')
/** Un poco más que el tope de voz.py (10 s): si algo se cuelga, la acción sigue. */
const TOPE_NARRACION_MS = 12_000

export function narrarAntesDeAccion(input: HookInput, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    try {
      if (input.hook_event_name !== 'PreToolUse' || !leer() || !existsSync(DEMO_JSON()) || !existsSync(VOZ_PY())) return resolve()
      const hijo = spawn(PYTHON, [VOZ_PY(), 'pre'], { stdio: ['pipe', 'ignore', 'ignore'] })
      let listo = false
      const fin = () => { if (listo) return; listo = true; clearTimeout(t); try { hijo.kill() } catch { /* ya terminó */ } resolve() }
      const t = setTimeout(fin, TOPE_NARRACION_MS)
      hijo.on('exit', fin)
      hijo.on('error', fin)
      signal?.addEventListener?.('abort', fin, { once: true })
      hijo.stdin?.end(JSON.stringify({
        hook_event_name: 'PreToolUse', session_id: input.session_id, transcript_path: input.transcript_path,
        tool_name: input.tool_name, tool_input: input.tool_input, tool_use_id: input.tool_use_id,
      }))
    } catch { resolve() }
  })
}

/** Suma la narración a los hooks de una sesión del chat. Nunca niega ni cambia nada: solo hace esperar a la voz. */
export function conNarracion<T extends Partial<Record<string, HookCallbackMatcher[]>>>(hooks: T, activo: boolean): T {
  if (!activo) return hooks
  const narrar: HookCallbackMatcher = {
    hooks: [async (input: HookInput, _id: string | undefined, op: { signal: AbortSignal }): Promise<SyncHookJSONOutput> => {
      await narrarAntesDeAccion(input, op?.signal)
      return { continue: true }
    }],
  }
  return { ...hooks, PreToolUse: [...(hooks.PreToolUse ?? []), narrar] }
}
