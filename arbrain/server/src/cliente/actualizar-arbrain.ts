/**
 * «Actualiza mi Arbrain» en un paso (29 oct 2026): la guardia y `arbrain/scripts/actualizar.mjs`.
 *
 * La skill actualizar-arbrain corría ~15 comandos de git; en «Preguntar siempre» (y en Windows, donde no hay sandbox,
 * también en «Automático en mi carpeta») cada uno era una tarjeta. Ahora la skill corre UN script determinista, y la
 * guardia lo reconoce SOLO si:
 *   - el comando es exactamente `node arbrain/scripts/actualizar.mjs <orden>` (con el prefijo de entorno de la skill y un
 *     `cd` a la carpeta del cerebro como mucho), sin nada encadenado, desde la carpeta del cerebro;
 *   - y los archivos que ese comando ejecuta son idénticos a los de la última versión firmada (etiqueta `v*` alcanzable
 *     desde HEAD, verificada con el ancla de la persona, como los ganchos en `hooks-proyecto.ts`). Un agente que edite el
 *     script (lo que ya pide clic) pierde el atajo.
 * Qué decide:
 *   - `revisar` y `estado` corren sin clic en todos los modos: verifican la firma, traen etiquetas del remoto oficial y
 *     leen; no cambian la copia del dueño.
 *   - `aplicar vX.Y.Z` y `reiniciar`: UNA tarjeta en «Preguntar siempre», sin clic desde «Automático en mi carpeta».
 * Nada de esto es un permiso genérico de git: cualquier otro comando sigue el camino de siempre.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expandirRuta, rutaReal, type ContextoPolitica, type DecisionPolitica } from './politica-agentes.js'

/** Lo que ejecuta el comando de actualizar (rutas relativas a la carpeta del cerebro). */
export const RUTAS_ACTUALIZADOR = [
  'arbrain/scripts/actualizar.mjs',
  'arbrain/scripts/revisar-actualizacion.mjs',
  'arbrain/scripts/servidor.mjs',
  'arbrain/scripts/servidor',
  'arbrain/scripts/espejo',
  'arbrain/scripts/escritorio.mjs',
  'arbrain/scripts/paquete-seguro.mjs',
  'arbrain/cerebro/sembrar.py',
  'arbrain/package.json',
  'arbrain/server/package.json',
  '.claude/skills/actualizar-arbrain/verificar.py',
]

const PREFIJO = String.raw`(?:\.\s+~/\.arbrain/entorno\.sh(?:\s+2>/dev/null)?\s*;\s*)?(?:PY=\$\{PY:-python3\}\s*;\s*)?`
const CD = String.raw`(?:cd\s+(?<cd>"[^"\n]+"|'[^'\n]+'|[^\s;&|<>"'$\x60]+)\s*&&\s*)?`
const NUCLEO = String.raw`node\s+arbrain/scripts/actualizar\.mjs\s+(?<orden>revisar|estado|reiniciar|aplicar\s+(?<etiqueta>v\d{1,4}\.\d{1,4}\.\d{1,4}))`
const COMANDO = new RegExp(String.raw`^\s*${PREFIJO}${CD}${NUCLEO}\s*$`)

export type OrdenActualizar = { orden: 'revisar' | 'estado' | 'reiniciar' | 'aplicar'; etiqueta?: string; cd?: string }

/** ¿Es el comando de actualizar, tal cual? */
export function comandoActualizar(cmd: string): OrdenActualizar | null {
  const m = COMANDO.exec(cmd)
  if (!m?.groups) return null
  const orden = m.groups.orden.split(/\s+/)[0] as OrdenActualizar['orden']
  const cd = m.groups.cd?.replace(/^(["'])(.*)\1$/, '$2')
  return { orden, ...(m.groups.etiqueta ? { etiqueta: m.groups.etiqueta } : {}), ...(cd ? { cd } : {}) }
}

const git = (repo: string, args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 15_000, windowsHide: true })

function sshKeygen(repo: string): string {
  if (process.platform !== 'win32') return 'ssh-keygen'
  const exec = git(repo, ['--exec-path']).stdout?.trim()
  const candidato = exec ? join(exec, '..', '..', '..', 'usr', 'bin', 'ssh-keygen.exe') : ''
  return candidato && existsSync(candidato) ? candidato : 'ssh-keygen'
}

const cache = new Map<string, { etiqueta?: string; motivo?: string }>()

/**
 * ¿Lo que ejecuta el actualizador es idéntico a una versión firmada? Devuelve la etiqueta o el motivo por el que no.
 * Cachea por HEAD y fecha de modificación de esos archivos (la guardia lo pregunta en cada llamada que coincide).
 */
export function actualizadorFirmado(home: string, env: NodeJS.ProcessEnv = process.env): { etiqueta?: string; motivo?: string } {
  const ancla = env.ARBRAIN_FIRMAS_PERMITIDAS || join(homedir(), '.config', 'arbrain', 'firmas-permitidas')
  if (!existsSync(ancla)) return { motivo: 'no hay ancla de firmas' }
  if (!existsSync(join(home, 'arbrain/scripts/actualizar.mjs'))) return { motivo: 'no está arbrain/scripts/actualizar.mjs' }
  const head = git(home, ['rev-parse', 'HEAD'])
  if (head.status !== 0) return { motivo: 'la carpeta del cerebro no es un repositorio git' }
  const mtimes = RUTAS_ACTUALIZADOR.map(r => { try { return statSync(join(home, r)).mtimeMs } catch { return 0 } }).join(',')
  let ancla2 = 0
  try { ancla2 = statSync(ancla).mtimeMs } catch { /* */ }
  const clave = `${home}\0${head.stdout.trim()}\0${mtimes}\0${ancla}\0${ancla2}`
  const previo = cache.get(clave)
  if (previo) return previo
  const r = calcular(home, ancla)
  if (cache.size > 32) cache.clear()
  cache.set(clave, r)
  return r
}

function calcular(home: string, ancla: string): { etiqueta?: string; motivo?: string } {
  const d = git(home, ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'])
  const etiqueta = d.status === 0 ? (d.stdout ?? '').trim() : ''
  if (!etiqueta) return { motivo: 'sin etiqueta de versión alcanzable' }
  if (git(home, ['cat-file', '-t', etiqueta]).stdout?.trim() !== 'tag') return { motivo: `${etiqueta} no es una etiqueta anotada` }
  const v = git(home, ['-c', 'gpg.format=ssh', '-c', `gpg.ssh.program=${sshKeygen(home)}`, '-c', `gpg.ssh.allowedSignersFile=${ancla}`, 'verify-tag', etiqueta])
  if (v.status !== 0) return { motivo: `la firma de ${etiqueta} no verifica con tu ancla` }
  if (git(home, ['cat-file', '-e', `${etiqueta}:arbrain/scripts/actualizar.mjs`]).status !== 0) return { motivo: `${etiqueta} no trae el actualizador` }
  // Archivos sin versionar dentro de esas carpetas (algo que el script pudiera importar) tampoco valen.
  const sueltos = git(home, ['ls-files', '--others', '--exclude-standard', '--', ...RUTAS_ACTUALIZADOR])
  if (sueltos.status !== 0 || (sueltos.stdout ?? '').trim()) return { motivo: 'hay archivos nuevos sin versionar junto al actualizador' }
  const dif = git(home, ['diff', '--quiet', '--no-ext-diff', '--no-textconv', etiqueta, '--', ...RUTAS_ACTUALIZADOR])
  if (dif.status !== 0) return { motivo: `el actualizador difiere de la versión firmada ${etiqueta}` }
  return { etiqueta }
}

/**
 * Decisión de la guardia para el comando de actualizar, o null si no lo es (o no se puede confiar en él: entonces
 * decide la política de siempre).
 */
export function decidirActualizar(cmd: string, ctx: ContextoPolitica, env: NodeJS.ProcessEnv = process.env): DecisionPolitica | null {
  const o = comandoActualizar(cmd)
  if (!o) return null
  const home = rutaReal(ctx.home)
  const donde = o.cd ? rutaReal(expandirRuta(o.cd, ctx)) : rutaReal(ctx.cwd)
  const igual = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  if (!igual(donde, home)) return null
  if (!actualizadorFirmado(home, env).etiqueta) return null
  if (o.orden === 'revisar' || o.orden === 'estado') return { tipo: 'permitir' }
  const resumen = o.orden === 'aplicar'
    ? `Actualizar Arbrain a la versión ${o.etiqueta}, firmada por el autor: guarda lo tuyo en un commit, crea una rama de respaldo, mezcla la versión nueva con lo tuyo y reinicia Arbrain`
    : 'Terminar la actualización de Arbrain: sembrar lo nuevo de la plantilla y reiniciar Arbrain y su app con la versión que ya tienes'
  return { tipo: 'confirmar', categoria: 'otra', resumen, literal: cmd, avisos: ['nada tuyo se borra: si algo no te gusta, vuelves con la rama de respaldo'], relajable: 'carpeta' }
}

/** Solo pruebas. */
export function _vaciarCacheActualizarParaPruebas(): void { cache.clear() }
