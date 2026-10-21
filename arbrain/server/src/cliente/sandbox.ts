/**
 * Sandbox nativo de Claude Code para el Bash de los agentes en la edición cliente (red team C1, 11 oct 2026).
 *
 * Segunda capa bajo la política (`politica-agentes.ts`): lo que la política deja correr sin preguntar (Bash de solo
 * lectura) corre además dentro del sandbox del sistema que trae el CLI (`sandbox` del SDK 0.3.x): Seatbelt
 * (`sandbox-exec`) en macOS y bubblewrap + socat en Linux. Dentro: escribe solo en el cerebro (ARBRAIN_HOME), no lee
 * llaves ni la carpeta de datos de la app, y sin red (lista de dominios vacía y estricta).
 *
 * Lo que la persona aprueba con su clic (I8) corre FUERA del sandbox (la guardia lo marca `dangerouslyDisableSandbox`):
 * es lo que aprobó, con el comando literal a la vista, y suele necesitar red (git push, npm install).
 *
 * Windows y Linux sin bubblewrap: no hay sandbox; la política entonces pide confirmación para TODO Bash.
 * `ARBRAIN_SANDBOX=0` lo apaga a propósito (mismo efecto: todo Bash con confirmación).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { ContextoPolitica } from './politica-agentes.js'

function enPath(programa: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? '').split(delimiter).filter(Boolean).some(d => existsSync(join(d, programa)))
}

/** ¿Este sistema puede correr el Bash de los agentes dentro del sandbox del CLI? */
export function sandboxDisponible(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform): boolean {
  if (env.ARBRAIN_SANDBOX === '0') return false
  if (plataforma === 'darwin') return existsSync('/usr/bin/sandbox-exec')
  if (plataforma === 'linux') return enPath('bwrap', env) && enPath('socat', env)
  return false
}

/**
 * Red team 3 A-6: «hay sandbox» no puede salir solo de que exista el programa. Antes `ctx.sandbox` era capacidad (existe
 * `sandbox-exec`) y el CLI corría con `failIfUnavailable: false`: si el sandbox no arrancaba, la lectura sin clic seguía
 * permitiéndose y corría sin ninguna contención. Ahora:
 *   1. al primer uso se PRUEBA que el sistema aplica un sandbox de verdad (Seatbelt con un perfil mínimo; bubblewrap
 *      con su espacio de red propio, como lo usa el CLI) y se recuerda el resultado;
 *   2. el CLI corre con `failIfUnavailable: true`: si aun así no puede aplicarlo, el turno falla en vez de seguir sin él;
 *   3. ese fallo (`sandbox required but unavailable`) apaga el sandbox para el resto de la vida del daemon
 *      (`marcarSandboxFallido`) y el turno se reintenta sin él: desde ahí TODO Bash pide confirmación.
 */
let pruebaSandbox: boolean | null = null
let motivoFallo: string | null = null

function sistemaAplicaSandbox(plataforma: NodeJS.Platform): boolean {
  try {
    const r = plataforma === 'darwin'
      ? spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)', '/usr/bin/true'], { timeout: 5000, stdio: 'ignore' })
      : spawnSync('bwrap', ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-net', '--', 'true'], { timeout: 5000, stdio: 'ignore' })
    return r.status === 0
  } catch { return false }
}

/** ¿El Bash de los agentes corre de verdad dentro del sandbox? Capacidad + prueba real + que el CLI no haya fallado. */
export function sandboxActivo(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform): boolean {
  if (motivoFallo !== null || !sandboxDisponible(env, plataforma)) return false
  if (pruebaSandbox === null) pruebaSandbox = sistemaAplicaSandbox(plataforma)
  return pruebaSandbox
}

/** El CLI dijo que no pudo aplicar el sandbox: desde aquí, todo Bash con confirmación. Devuelve true si es nuevo. */
export function marcarSandboxFallido(motivo: string): boolean {
  if (motivoFallo !== null) return false
  motivoFallo = motivo.slice(0, 300) || 'sandbox no disponible'
  return true
}

/** ¿Este error del CLI es «no pude aplicar el sandbox»? */
export const esFalloDeSandbox = (texto: string): boolean => /sandbox required but unavailable|SandboxUnavailable|sandbox_unavailable|sandbox_seccomp_unavailable/i.test(texto)

/** Solo pruebas. */
export function _sandboxParaPruebas(p: { prueba?: boolean | null; fallo?: string | null } = {}): void {
  pruebaSandbox = p.prueba === undefined ? null : p.prueba
  motivoFallo = p.fallo ?? null
}

/** Opciones `sandbox` del SDK para el contexto de la política. */
export function opcionesSandbox(ctx: ContextoPolitica): NonNullable<Options['sandbox']> {
  const u = ctx.usuario
  const llaves = ['.ssh', '.gnupg', '.aws', '.kube', '.docker', '.azure', '.password-store', '.config/gcloud', '.config/gh', '.netrc', '.git-credentials', 'Library/Keychains', 'Library/Cookies']
  // Muro de carpeta (12 oct 2026): perfiles de navegador, gestores de contraseñas, carteras, correo y mensajes. La
  // política ya los niega por secuencia de carpetas; aquí, la misma lista para el Bash dentro del sandbox.
  llaves.push(...PERFILES_PRIVADOS)
  return {
    enabled: true,
    // Red team 3 A-6: si el CLI no puede aplicar el sandbox, el turno falla (nunca corre «lectura sin clic» sin
    // contención); agent.ts lo detecta (`esFalloDeSandbox`), apaga el sandbox y reintenta con todo Bash confirmado.
    failIfUnavailable: true,
    // La decisión de qué corre sin preguntar es de la política (hook + canUseTool), no del CLI.
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: true,
    network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
    filesystem: {
      allowWrite: [ctx.home],
      denyWrite: [...ctx.protegidas, ...denyWriteCerebro(ctx.home)],
      denyRead: [...llaves.map(l => join(u, l)), ...ctx.protegidas],
      ...(ctx.lecturaExtra.length || ctx.abiertas?.length ? { allowRead: [...ctx.lecturaExtra, ...(ctx.abiertas ?? [])] } : {}),
    },
  } as NonNullable<Options['sandbox']>
}

/** Carpetas privadas del usuario (relativas a su carpeta personal) que el sandbox tampoco deja leer. */
export const PERFILES_PRIVADOS = [
  ...['Google/Chrome', 'Chromium', 'BraveSoftware', 'Microsoft Edge', 'Arc', 'Firefox', 'Vivaldi', 'com.operasoftware.Opera', '1Password', 'Bitwarden',
    'Exodus', 'Electrum', 'Ledger Live', 'Bitcoin', 'atomic'].map(d => `Library/Application Support/${d}`),
  'Library/Safari', 'Library/Containers/com.apple.Safari', 'Library/Mail', 'Library/Messages', 'Library/Group Containers/2BUA8C4S2C.com.1password',
  '.config/google-chrome', '.config/chromium', '.config/BraveSoftware', '.config/microsoft-edge', '.config/Bitwarden', '.config/1Password',
  '.mozilla', '.local/share/keyrings', '.bitcoin', '.ethereum', '.electrum',
]

/** Hijos conocidos de `.claude/` y de `arbrain/` que se protegen aunque todavía no existan. */
const CLAUDE_CONOCIDOS = ['settings.json', 'settings.local.json', 'hooks', 'agents', 'commands', 'skills', 'output-styles', 'plugins', 'rules', 'references', 'plan', 'scripts', 'statusline', 'now.md', 'CLAUDE.md', 'AGENTS.md']
const CLAUDE_LIBRES = new Set(['memory', 'knowledge', 'daily', 'diario'])
const ARBRAIN_CONOCIDOS = ['server', 'src', 'scripts', 'extension', 'src-tauri', 'supabase', 'public', 'tests', 'docs', 'empaquetado', 'node_modules', 'package.json', 'EDICION']

const hijos = (dir: string): string[] => { try { return readdirSync(dir) } catch { return [] } }

/**
 * Lo que el Bash del sandbox no escribe dentro del cerebro (red team 2 C-1): todo lo que un hook o el CLI ejecuta o
 * carga como instrucciones. Seatbelt/bubblewrap trabajan con rutas (no con «todo salvo»): se listan los hijos de
 * `.claude/` salvo memory, knowledge, daily y diario (los que existen más los conocidos) y los de `arbrain/` salvo
 * `cerebro`, más CLAUDE.md, AGENTS.md, .mcp.json, .codex, .git y la marca de siembra. Lo nuevo que no esté en la lista
 * lo frena la política (en el sandbox solo corren lecturas y mkdir/touch revisados ruta por ruta).
 */
export function denyWriteCerebro(home: string): string[] {
  const claude = join(home, '.claude'), arbrain = join(home, 'arbrain')
  const enClaude = new Set([...CLAUDE_CONOCIDOS, ...hijos(claude)].filter(h => !CLAUDE_LIBRES.has(h.toLowerCase())))
  const enArbrain = new Set([...ARBRAIN_CONOCIDOS, ...hijos(arbrain)].filter(h => h.toLowerCase() !== 'cerebro'))
  return [
    ...[...enClaude].map(h => join(claude, h)),
    ...[...enArbrain].map(h => join(arbrain, h)),
    ...['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', '.codex', '.git', '.gitattributes', '.gitmodules', '.arbrain-sembrado.json'].map(h => join(home, h)),
  ]
}
