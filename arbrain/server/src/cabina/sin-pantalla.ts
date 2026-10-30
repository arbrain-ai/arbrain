/**
 * Delegar sin pantalla (6 oct 2026). Spec: docs/builds/delegar-sin-pantalla-2026-10-06/SPEC.md.
 *
 * Hasta hoy `delegar` abría un CLI interactivo en una PTY del motor y lo operaba leyendo su pantalla con regex
 * (diálogos de arranque, caja de entrada, «¿Arranco?», «30 s quieto = terminó»). Cada CLI y cada versión cambian
 * su pantalla, así que esa capa se rompía sola y solo existían claude y codex. Aquí el subagente corre con el CLI
 * en su modo sin pantalla (adaptadores de `./harness/`), como proceso DESACOPLADO del agent-server:
 *
 *  - Sesión y grupo de procesos propios (`detached` = setsid): sobrevive a `launchctl kickstart -k` del
 *    agent-server (probado el 6 oct con un job de launchd de prueba antes de escribir esto).
 *  - Su stdout va a `~/.config/arbrain/subagentes/<id>.jsonl`; una envoltura de shell agrega
 *    `{"arbrain":"salida","codigo":N}` cuando el CLI sale. Terminar = el proceso sale. Nunca se lee una pantalla.
 *  - `retomar` = un turno nuevo con `reanudar` sobre la misma sesión; si sigue trabajando, el mensaje queda en la
 *    cola del registro y el vigía del agent-server lo entrega al salir.
 *  - `cerrar` = matar el grupo si sigue vivo; el resto (tokens, worktree) es lo de siempre.
 *
 * Los ids empiezan en 900001 para no chocar con los del motor (100000+), que reusa al reiniciarse.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { access, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { readEnvFile } from '../env.js'
import type { Harness } from '../motor/lector.js'
import { extraerDoD } from './juez.js'
import { estadoTablero, pasoEnHumano, type Hechos } from './tablero.js'
import { notaAutoria } from './autoria.js'
import { adaptador, aplicarLinea, bitacoraVacia, coherencia, NOMBRES, respuestaDe, tokensDe, type Adaptador, type Bitacora, type Coherencia } from './harness/index.js'
import { resolverEleccion } from './catalogo-delegar.js'
import { cambiosDeRama, prepararAislamiento, type Aislamiento, type CambiosRama, type PuertoAislamiento } from './aislamiento.js'
import { worktreeDe } from './procesos.js'
import { PERFIL_DEFAULT, esPerfil, type Perfil } from './perfiles.js'
import { calcularTopes, cwdPermitido, herramientaLegible, leerRegistro, mutarRegistroAsync, olvidarFoto, permisosDefault, preludioSkills, tachar, type Conversacion, type Mensaje, type Seguimiento, type Subagente, type SubagenteOrigen, type Terminal } from './cuerpo.js'

const run = promisify(execFile)
const configDir = () => DIR_ARBRAIN()
export const dirBitacoras = () => join(configDir(), 'subagentes')
export const rutaBitacora = (id: number) => join(dirBitacoras(), `${id}.jsonl`)
const ENV_FILE = () => join(dirname(fileURLToPath(import.meta.url)), '../../.env')
export const PRIMER_ID = 900_001

/** CABINA_DELEGAR_MODO=pantalla devuelve el camino viejo (motor + lectura de pantalla) sin tocar código. */
export function modoDelegar(): 'pantalla' | 'sin-pantalla' {
  const v = process.env.CABINA_DELEGAR_MODO ?? readEnvFile(['CABINA_DELEGAR_MODO']).CABINA_DELEGAR_MODO
  return v === 'pantalla' ? 'pantalla' : 'sin-pantalla'
}
export const esSinPantalla = (s: Pick<Subagente, 'modo'>) => s.modo === 'sin-pantalla'

/** Variable del proceso o, si falta, del .env del agent-server (el MCP de la Cabina no lo hereda). */
const envFile = () => readEnvFile()
export function leerVar(clave: string, archivo: Record<string, string> = envFile()): string | undefined {
  return process.env[clave] || archivo[clave] || undefined
}

// ── Binario y entorno ──
// Edición cliente: solo el PATH y carpetas del propio usuario; nada de Homebrew.
const CARPETAS = () => esEdicionCliente() ? [join(homedir(), '.local/bin'), join(homedir(), '.npm-global/bin'), join(homedir(), '.bun/bin')] : ['/opt/homebrew/bin', join(homedir(), '.local/bin'), '/usr/local/bin', join(homedir(), '.npm-global/bin'), join(homedir(), '.bun/bin'), '/usr/bin', '/bin']
const rutaDeBusqueda = () => [...new Set([...(process.env.PATH ?? '').split(delimiter).filter(Boolean), ...CARPETAS()])]
/** El binario real (no un alias de la shell: en la de Daniel `qwen` apunta a llama-cli). */
export async function resolverBinario(nombre: string): Promise<string | null> {
  for (const d of rutaDeBusqueda()) {
    const p = join(d, nombre)
    try { await access(p, constants.X_OK); return p } catch { /* sigue */ }
  }
  return null
}

/** Lo que no debe heredar el subagente: las marcas de la sesión de Claude que lo lanzó, la conversación de la Cabina,
 *  `NODE_ENV=production` del job del agent-server (un `npm install` del subagente saltaría devDependencies) y
 *  `ANTHROPIC_API_KEY` (claude cobraría por API en vez de la suscripción; mismo criterio que `cron-account.ts`). */
const NO_HEREDAR = /^(CLAUDECODE|CLAUDE_CODE_.*|CLAUDE_AGENT_SDK.*|ARBRAIN_CABINA_SCOPE|MCP_.*|NODE_ENV|ANTHROPIC_API_KEY)$/

/** Entorno del CLI: el del proceso sin marcas de la sesión padre, PATH con las carpetas de la casa y las credenciales
 *  que el adaptador declara (de su nombre en la casa al que el CLI espera). */
export function entornoPara(ad: Adaptador, base: NodeJS.ProcessEnv = process.env, archivo: Record<string, string> = envFile()): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (v != null && !NO_HEREDAR.test(k)) env[k] = v
  env.PATH = [...new Set([...(base.PATH ?? '').split(delimiter).filter(Boolean), ...CARPETAS()])].join(delimiter)
  for (const [destino, d] of Object.entries(ad.entorno ?? {})) {
    const v = (d.fuentes ?? []).map(f => base[f] || archivo[f]).find(Boolean) ?? d.valor
    if (v) env[destino] = v
  }
  return env
}

const CON_ENTORNO = () => join(dirname(fileURLToPath(import.meta.url)), '../../scripts/subagentes/con-entorno.sh')
const q = (s: string) => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
/**
 * El comando de la terminal interactiva: binario por ruta absoluta (en la shell de Daniel `qwen` es un alias de
 * llama-cli) y las credenciales que declara el adaptador leídas del .env en el momento por `con-entorno.sh`: el
 * secreto nunca queda escrito en el comando.
 */
export function comandoInteractivo(ad: Adaptador, bin: string, sesion: string, modelo: string | null, archivo: Record<string, string> = envFile(), o: { rutaEnv?: string; script?: string; esfuerzo?: string | null } = {}): string {
  const deArchivo: string[] = [], fijos: string[] = []
  for (const [destino, d] of Object.entries(ad.entorno ?? {})) {
    const fuente = (d.fuentes ?? []).find(f => archivo[f])
    if (fuente) deArchivo.push(`${destino}=${fuente}`)
    else if (d.valor) fijos.push(`${destino}=${d.valor}`)
  }
  const cli = [bin, ...ad.interactivo(sesion, modelo, o.esfuerzo ?? null)]
  const argv = deArchivo.length ? [o.script ?? CON_ENTORNO(), o.rutaEnv ?? ENV_FILE(), ...deArchivo, '--', ...(fijos.length ? ['env', ...fijos] : []), ...cli]
    : fijos.length ? ['env', ...fijos, ...cli] : cli
  return argv.map(q).join(' ')
}

// ── El proceso ──
/** `"$@"` corre el CLI con su stdout en la bitácora; al salir, la envoltura deja la marca con su código. */
const ENVOLTURA = `"$@"; c=$?; printf '{"arbrain":"salida","codigo":%d,"en":%s000}\\n' "$c" "$(date +%s)"; exit $c`
export const MARCA_PROCESO = 'arbrain-subagente'

export interface Turnar { id: number; harness: string; cwd: string; modelo: string | null; esfuerzo?: string | null; /** El que recibe el CLI (catalogo-delegar.ts); sin él, el equivalente del adaptador. */ esfuerzoCli?: string | null; permisos: Subagente['permisos']; /** Perfil de permisos (perfiles.ts); sin campo, total. */ perfil?: Perfil; sesion?: string; texto: string; reanudar: boolean }

/** El esfuerzo que recibe el CLI: el que validó el catálogo o, en registros viejos y sin catálogo, el equivalente del adaptador. */
export function esfuerzoParaCli(ad: Adaptador, pedido: string | null | undefined, cli?: string | null): string | null {
  if (!pedido) return null
  return cli ?? (ad.esfuerzoCli ? ad.esfuerzoCli(pedido) : pedido)
}

/** La guardia de perfil (`guardia-perfil.ts`) como comando de shell para el gancho PreToolUse del CLI. En dist corre el .js
 *  con el node del agent-server; desde las fuentes (tsx), el .ts con los mismos argumentos de node (el cargador de tsx). */
export function comandoGuardia(perfil: Perfil, raiz: string, bitacora: string, url: string = import.meta.url): string {
  const ts = url.endsWith('.ts')
  const entrada = fileURLToPath(new URL(ts ? './guardia-perfil.ts' : './guardia-perfil.js', url))
  return [process.execPath, ...(ts ? process.execArgv : []), entrada, perfil, raiz, bitacora].map(q).join(' ')
}

/** ¿Este turno corre con pastor (entrada en vivo)? Con guardia, solo si el CLI la respeta en vivo (codex no). */
export const conPastor = (ad: Adaptador) => !!ad.vivo && entradaViva() && (!ad.guardia || !!ad.guardiaEnVivo)

/** Lanza un turno como proceso desacoplado. Devuelve el pid de la envoltura (= su grupo de procesos). */
export async function lanzarTurno(t: Turnar): Promise<number> {
  // Red team A1: procesos desacoplados (detached) fuera de la guardia: nunca en la edición cliente.
  if (esEdicionCliente()) throw new Error('Los subagentes no están disponibles en esta edición de Arbrain.')
  const ad = adaptador(t.harness)
  if (!ad) throw new Error(`Harness sin adaptador: ${t.harness}`)
  const bin = await resolverBinario(ad.binario)
  if (!bin) throw new Error(`No encuentro el CLI «${ad.binario}» en el Studio (busqué en el PATH y en ${CARPETAS().slice(0, 4).join(', ')}).`)
  const permisos = t.permisos ?? permisosDefault()
  if (t.reanudar && !t.sesion) throw new Error('Para reanudar hace falta la sesión del subagente.')
  mkdirSync(dirBitacoras(), { recursive: true })
  const ruta = rutaBitacora(t.id)
  // lo PEDIDO viaja en la marca de inicio de cada turno: el Taller lo compara con lo que el CLI reporte (coherencia.ts)
  const esfuerzo = esfuerzoParaCli(ad, t.esfuerzo, t.esfuerzoCli)
  // Perfil (29 oct 2026): la guardia va en TODO turno de un CLI que la acepta, también en «total»: la lista negra no se apaga.
  const perfil = t.perfil ?? PERFIL_DEFAULT
  const pt = { perfil, ...(ad.guardia ? { guardia: comandoGuardia(perfil, t.cwd, ruta) } : {}) }
  const vivo = conPastor(ad)
  appendFileSync(ruta, JSON.stringify({ arbrain: 'inicio', en: Date.now(), texto: t.texto.slice(0, 4000), reanudar: t.reanudar, modelo: t.modelo, esfuerzo: t.esfuerzo ?? null, perfil, ...(vivo ? { vivo: true } : {}) }) + '\n')
  if (vivo) return lanzarConPastor(t, ad, ad.vivo!, bin, permisos, pt)
  const argv = t.reanudar ? ad.reanudar({ sesion: t.sesion!, texto: t.texto, modelo: t.modelo, esfuerzo, cwd: t.cwd, permisos, ...pt }) : ad.lanzar({ encargo: t.texto, modelo: t.modelo, esfuerzo, cwd: t.cwd, permisos, ...pt, ...(t.sesion ? { sesion: t.sesion } : {}) })
  const out = openSync(ruta, 'a'), err = openSync(ruta.replace(/\.jsonl$/, '.err'), 'a')
  try {
    const hijo = spawn('/bin/sh', ['-c', ENVOLTURA, MARCA_PROCESO, bin, ...argv], { cwd: t.cwd, env: entornoPara(ad), detached: true, stdio: ['ignore', out, err] })
    const pid = hijo.pid
    if (!pid) throw new Error('El sistema no dio pid al subagente.')
    hijo.on('error', () => { /* el código de salida queda en la bitácora */ })
    hijo.unref()
    return pid
  } finally { closeSync(out); closeSync(err) }
}

// ── Entrada en vivo (ajuste de Levy, 6 oct): el pastor sostiene el stdin del CLI ──
/** CABINA_ENTRADA_VIVA=0 vuelve al modo «encola y entrega al salir» para todos, sin tocar código. */
export function entradaViva(): boolean {
  return (process.env.CABINA_ENTRADA_VIVA ?? readEnvFile(['CABINA_ENTRADA_VIVA']).CABINA_ENTRADA_VIVA) !== '0'
}
export const rutaFifo = (id: number) => join(dirBitacoras(), `${id}.in`)
const dirEntradas = (id: number) => join(dirBitacoras(), `${id}.entradas`)
export const PASTOR = () => join(dirname(fileURLToPath(import.meta.url)), '../../scripts/subagentes/pastor.mjs')

async function lanzarConPastor(t: Turnar, ad: Adaptador, vivo: NonNullable<Adaptador['vivo']>, bin: string, permisos: NonNullable<Subagente['permisos']>, pt: { perfil: Perfil; guardia?: string }): Promise<number> {
  const pv = { sesion: t.sesion, reanudar: t.reanudar, modelo: t.modelo, esfuerzo: esfuerzoParaCli(ad, t.esfuerzo, t.esfuerzoCli), permisos, cwd: t.cwd, ...pt }
  const ruta = rutaBitacora(t.id)
  const rpc = vivo.rpc?.(pv)
  const config = {
    protocolo: vivo.protocolo, bitacora: ruta, err: ruta.replace(/\.jsonl$/, '.err'), fifo: rutaFifo(t.id), bin, argv: vivo.argv(pv), cwd: t.cwd, texto: t.texto,
    ocioMs: Number(process.env.CABINA_PASTOR_OCIO_MS) || 1500,
    ...(rpc ? { codex: { hiloParams: rpc.hiloParams, ...(rpc.turno ? { turno: rpc.turno } : {}), ...(t.reanudar && t.sesion ? { hilo: t.sesion } : {}) } } : {}),
  }
  const rutaConfig = join(dirBitacoras(), `${t.id}.pastor.json`)
  writeFileSync(rutaConfig, JSON.stringify(config))
  const err = openSync(config.err, 'a')
  try {
    const hijo = spawn(process.execPath, [PASTOR(), MARCA_PROCESO, rutaConfig], { cwd: t.cwd, env: entornoPara(ad), detached: true, stdio: ['ignore', 'ignore', err] })
    if (!hijo.pid) throw new Error('El sistema no dio pid al pastor del subagente.')
    hijo.on('error', () => { /* queda en la bitácora */ })
    hijo.unref()
    return hijo.pid
  } finally { closeSync(err) }
}

/** Escribe una línea a la FIFO del pastor. false = no hay pastor escuchando (ENXIO) o no se pudo. */
function escribirFifo(id: number, linea: object): boolean {
  let fd: number
  try { fd = openSync(rutaFifo(id), constants.O_WRONLY | constants.O_NONBLOCK) } catch { return false }
  try { writeSync(fd, JSON.stringify(linea) + '\n'); return true } catch { return false } finally { closeSync(fd) }
}

/**
 * Mensaje EN VIVO a un subagente que trabaja: el texto va a un archivo y por la FIFO solo viaja su puntero (una línea
 * corta, atómica). Espera el acuse del pastor en la bitácora. false = no se pudo (sin pastor o ya cerraba su turno):
 * quien llama lo encola para entregarlo al salir.
 */
export async function entregarEnVivo(sub: Subagente, texto: string, esperaMs = 6000): Promise<boolean> {
  const ad = adaptador(sub.harness)
  if (!ad || !conPastor(ad) || !(await bitacora(sub)).b.turnos.at(-1)) return false
  const id = randomUUID().slice(0, 8)
  mkdirSync(dirEntradas(sub.id), { recursive: true })
  const archivo = join(dirEntradas(sub.id), `${id}.json`)
  writeFileSync(archivo, JSON.stringify({ texto: texto.slice(0, 4000) }))
  // el pastor recién nacido puede no haber abierto aún su FIFO: se reintenta mientras viva
  const fin = Date.now() + esperaMs
  while (!escribirFifo(sub.id, { tipo: 'mensaje', id, archivo })) {
    if (Date.now() > fin || !(await estaVivo(sub.pid))) return false
    await new Promise(r => setTimeout(r, 150))
  }
  while (Date.now() < fin) {
    const a = (await bitacora(sub)).b.acuses[id]
    if (a !== undefined) return a
    await new Promise(r => setTimeout(r, 150))
  }
  return false
}

/** ¿Sigue vivo ESTE subagente? (el pid podría haberse reusado: se exige la marca de la envoltura). */
export async function estaVivo(pid: number | undefined): Promise<boolean> {
  if (!pid) return false
  try { process.kill(pid, 0) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EPERM') return false }
  try { return (await run('ps', ['-o', 'command=', '-p', String(pid)], { timeout: 4000 })).stdout.includes(MARCA_PROCESO) } catch { return false }
}

/** Mata el grupo entero (la envoltura y el CLI con sus hijos): TERM y, si sigue, KILL a los 4 s. */
export async function matar(pid: number | undefined): Promise<boolean> {
  if (!(await estaVivo(pid))) return false
  try { process.kill(-pid!, 'SIGTERM') } catch { try { process.kill(pid!, 'SIGTERM') } catch { return false } }
  setTimeout(() => { void estaVivo(pid).then(v => { if (v) { try { process.kill(-pid!, 'SIGKILL') } catch { /* ya salió */ } } }) }, 4000).unref()
  return true
}

// ── Lectura incremental de la bitácora ──
const lecturas = new Map<string, { offset: number; resto: string; b: Bitacora; estado: { delta?: boolean }; mtime: number }>()
export async function bitacora(sub: Pick<Subagente, 'id' | 'harness'>): Promise<{ b: Bitacora; mtime: number }> {
  const ad = adaptador(sub.harness)
  const ruta = rutaBitacora(sub.id)
  if (!ad) return { b: bitacoraVacia(), mtime: 0 }
  let f
  try { f = await open(ruta, 'r') } catch { return { b: bitacoraVacia(), mtime: 0 } }
  try {
    const st = await f.stat()
    let c = lecturas.get(ruta)
    if (!c || st.size < c.offset) { c = { offset: 0, resto: '', b: bitacoraVacia(), estado: {}, mtime: 0 }; lecturas.set(ruta, c) }
    while (c.offset < st.size) {
      const b = Buffer.alloc(Math.min(4 * 1024 * 1024, st.size - c.offset))
      const { bytesRead } = await f.read(b, 0, b.length, c.offset)
      if (!bytesRead) break
      c.offset += bytesRead
      const lineas = (c.resto + b.subarray(0, bytesRead).toString('utf8')).split('\n')
      c.resto = lineas.pop() ?? ''
      for (const l of lineas) if (l.trim()) aplicarLinea(c.b, l, ad, c.estado)
    }
    c.mtime = st.mtimeMs
    if (lecturas.size > 100) lecturas.delete(lecturas.keys().next().value!)
    return { b: c.b, mtime: c.mtime }
  } finally { await f.close() }
}

export interface Estado { b: Bitacora; mtime: number; corriendo: boolean; detenido: boolean; turno: Bitacora['turnos'][number] | undefined; terminado: boolean; finMs: number | null; error: string | null; sesion: string | undefined; tokens: number | null }
/** Estado del subagente: corriendo, o terminado (con su fin: marca de salida o, si lo mataron, la última escritura). */
export async function estadoDe(sub: Subagente): Promise<Estado> {
  const { b, mtime } = await bitacora(sub)
  const turno = b.turnos.at(-1)
  const corriendo = !turno?.salida && await estaVivo(sub.pid)
  const terminado = !!turno && !corriendo
  const muerto = terminado && !turno!.salida
  const codigo = turno?.salida?.codigo
  const detenido = !!turno && (!!turno.salida?.detenido || !!turno.detenido || (!!sub.detenidoEn && Date.parse(sub.detenidoEn) >= turno.inicio))
  const error = !terminado || detenido ? null
    : muerto ? 'el proceso terminó sin cerrar su turno (lo mataron o se cayó)'
    : turno!.error ? turno!.error
    : codigo ? `el CLI salió con código ${codigo}${respuestaDe(turno) ? '' : ' sin respuesta'}` : null
  return { b, mtime, corriendo, turno, terminado, detenido, finMs: terminado ? (turno!.salida?.en || mtime || null) : null, error, sesion: sub.sesion ?? b.sesion, tokens: tokensDe(b) }
}

/** La última pregunta con la que cerró su respuesta, si la hay (la respuesta termina en «?»). */
export function preguntaDeRespuesta(r: string): string | null {
  const t = r.trim()
  if (!/[?？]\s*$/.test(t)) return null
  const parrafo = t.split(/\n\s*\n/).at(-1)!.replace(/\s+/g, ' ').trim()
  return parrafo.slice(-600)
}

// ── Verbos ──
export function siguienteId(l: Subagente[]): number {
  return Math.max(PRIMER_ID - 1, ...l.filter(esSinPantalla).map(s => s.id)) + 1
}

/** Ids de los subagentes que ocupan lugar en el tope: los del motor vivos y los sin pantalla corriendo. */
async function vivosParaTope(registro: Subagente[]): Promise<Set<number>> {
  const ids = new Set<number>()
  try { const { motor } = await import('../motor/cliente.js'); for (const t of (await motor.info()).terms) ids.add(t.id) } catch { /* sin motor */ }
  await Promise.all(registro.filter(s => esSinPantalla(s) && !s.cerrado).map(async s => { if (await estaVivo(s.pid)) ids.add(s.id) }))
  return ids
}

/** En modo sin pantalla el proceso sale al responder y mata lo que dejó en segundo plano (6 oct: un claude mandó
 *  su espera a background, respondió «esperando…» y el turno cerró con el trabajo a medias). */
export const NOTA_SIN_PANTALLA = '\n\n[Modo de trabajo] Corres sin pantalla: tu turno termina cuando respondes y tu proceso sale. No dejes nada en segundo plano ni esperes notificaciones o despertadores; haz cada espera en primer plano y responde solo cuando el encargo esté hecho (o con la pregunta concreta que te bloquea).'

export interface PedidoDelegar { nombre: string; harness: string; encargo: string; cwd: string; modelo?: string; esfuerzo?: string; aislamiento?: Aislamiento; avisarA?: SubagenteOrigen; /** total (default), codigo o lectura: perfiles.ts. */ perfil?: Perfil; /** Plan versionado del que sale el encargo (plan.ts). */ plan?: { ruta: string; commit: string | null } }

/** El perfil pedido, validado contra lo que el CLI sabe cumplir. */
export function perfilPara(ad: Adaptador, pedido: unknown): Perfil {
  if (pedido == null || pedido === '') return PERFIL_DEFAULT
  if (!esPerfil(pedido)) throw new Error(`Perfil desconocido «${String(pedido)}» (hay: total, codigo, lectura).`)
  const puede = ad.perfiles ?? [PERFIL_DEFAULT]
  if (!puede.includes(pedido)) throw new Error(`El perfil «${pedido}» necesita un CLI que lo cumpla (${ad.nombre} solo: ${puede.join(', ')}). Usa claude o codex.`)
  return pedido
}

/** Modelo y esfuerzo validados contra el catálogo vivo (catalogo-delegar.ts). */
const elegir = (ad: Adaptador, pedido: { modelo?: string | null; esfuerzo?: string | null }) => {
  const archivo = envFile()
  return resolverEleccion(ad, pedido, k => leerVar(k, archivo))
}

export async function delegarSinPantalla(p: PedidoDelegar, o: { aislar?: PuertoAislamiento } = {}): Promise<Subagente> {
  const ad = adaptador(p.harness)
  if (!ad) throw new Error(`Harness no registrado (hay: ${NOMBRES.join(', ')}).`)
  if (!cwdPermitido(p.cwd)) throw new Error('Directorio no permitido para un subagente (solo /tmp o ~/Developer).')
  const perfil = perfilPara(ad, p.perfil)
  const eleccion = await elegir(ad, { modelo: p.modelo, esfuerzo: p.esfuerzo })
  const modelo = eleccion.modelo
  if (!(await resolverBinario(ad.binario))) throw new Error(`El CLI «${ad.binario}» no está instalado en el Studio.`)
  const registro = await leerRegistro()
  const topes = calcularTopes(registro, await vivosParaTope(registro))
  if (topes.paralelo.vivos >= topes.paralelo.max) throw new Error(`Tope de subagentes en paralelo alcanzado (${topes.paralelo.vivos}/${topes.paralelo.max}). Cierra uno antes de lanzar otro.`)
  if (topes.tokens.hoy >= topes.tokens.max) throw new Error(`Tope de tokens del día alcanzado (${topes.tokens.hoy.toLocaleString('es-MX')}/${topes.tokens.max.toLocaleString('es-MX')}).`)
  // el worktree nace solo si el lanzamiento pasó validación y topes: un rechazo no deja copias
  const aislado = await prepararAislamiento({ nombre: p.nombre, cwd: p.cwd, ...(p.aislamiento ? { aislamiento: p.aislamiento } : {}) }, o.aislar)
  const cwd = aislado.cwd
  mkdirSync(cwd, { recursive: true })
  const sesion = ad.sesionPropia ? randomUUID() : undefined
  const permisos = permisosDefault()
  const skills = preludioSkills(cwd)
  const encargo = p.encargo + (skills?.texto ?? '') + notaAutoria(p.nombre) + NOTA_SIN_PANTALLA
  const dod = extraerDoD(p.encargo)
  let sub: Subagente | null = null
  // id, registro y proceso bajo el mismo candado: dos delegar a la vez no comparten id ni bitácora
  await mutarRegistroAsync(async l => {
    const id = siguienteId(l)
    if (existsSync(rutaBitacora(id))) throw new Error(`Ya existe la bitácora ${rutaBitacora(id)}; no la piso.`)
    const pid = await lanzarTurno({ id, harness: ad.nombre, cwd, modelo, esfuerzo: eleccion.esfuerzo, esfuerzoCli: eleccion.esfuerzoCli, permisos, perfil, sesion, texto: encargo, reanudar: false })
    sub = {
      id, nombre: p.nombre.slice(0, 80), harness: ad.nombre, encargo: p.encargo.slice(0, 2000), cwd, creado: new Date().toISOString(), modo: 'sin-pantalla', pid, turno: 1, permisos,
      entrega: 'entregado', entregaNota: 'el encargo viajó como argumento del CLI (sin pantalla)', bitacora: rutaBitacora(id).replace(homedir(), '~'),
      perfil, ...(ad.guardia ? {} : { sinGuardia: true }), ...(p.plan ? { plan: p.plan } : {}),
      ...(skills ? { aviso: skills.aviso } : {}), ...(sesion ? { sesion } : {}), ...(modelo ? { modelo } : {}), ...(eleccion.esfuerzo ? { esfuerzo: eleccion.esfuerzo, ...(eleccion.esfuerzoCli ? { esfuerzoCli: eleccion.esfuerzoCli } : {}) } : {}), ...(p.avisarA ? { avisarA: p.avisarA } : {}),
      eleccion: eleccion.resumen, aislamiento: aislado.aislamiento, ...(aislado.rama ? { rama: aislado.rama } : {}),
      // La DoD completa, para el juez (el encargo se recorta a 2,000 caracteres y la DoD suele ir al final).
      ...(dod ? { dod } : {}),
    }
    return [...l, sub]
  })
  olvidarFoto()
  return sub!
}

export interface CambioTurno { modelo?: string; esfuerzo?: string }

/**
 * Un turno más con la misma sesión, o a la cola si sigue trabajando (lo entrega el vigía al salir). `cambio` (29 oct
 * 2026, brecha 4): otro modelo o esfuerzo desde ESTE turno, validados igual que en delegar; el caso típico es un
 * subagente que falló en medium y se reintenta en high sin perder su contexto.
 */
export async function retomarSinPantalla(id: number, texto: string, cambio: CambioTurno = {}): Promise<Seguimiento & { eleccion?: string }> {
  let r: Seguimiento & { eleccion?: string } = { encolado: false, confirmado: false }
  const cambia = !!(cambio.modelo || cambio.esfuerzo)
  await mutarRegistroAsync(async l => {
    const sub = [...l].reverse().find(s => s.id === id && !s.cerrado && esSinPantalla(s))
    if (!sub) throw new Error('Ese subagente no es de Levy o ya se cerró.')
    if (sub.interactivo && await terminalViva(sub.interactivo)) throw new Error(`${DUENO_M} tiene abierta la sesión de este subagente a mano (terminal ${sub.interactivo}); no le escribo encima. Ciérrala o pídele que conteste ahí.`)
    const ad = adaptador(sub.harness)
    const eleccion = cambia && ad ? await elegir(ad, { modelo: cambio.modelo ?? sub.modelo ?? null, esfuerzo: cambio.esfuerzo ?? sub.esfuerzo ?? null }) : null
    const e = await estadoDe(sub)
    // el modelo y el esfuerzo se fijan al arrancar el turno: a mitad del paso no se cambian
    if (eleccion && e.corriendo) throw new Error('Sigue trabajando: el cambio de modelo o esfuerzo aplica desde un turno nuevo. Espera a que termine o detenlo, y retómalo con el cambio.')
    // Entrada en vivo: el mensaje entra al turno en curso (lo toma al terminar el paso, como en la terminal).
    if (e.corriendo && entradaViva() && await entregarEnVivo(sub, texto)) { r = { encolado: false, confirmado: true, enVivo: true }; return null }
    if (e.corriendo) {
      r = { encolado: true, confirmado: true }
      return l.map(s => s === sub ? { ...s, cola: [...(s.cola ?? []), texto.slice(0, 4000)] } : s)
    }
    const sesion = e.sesion
    if (!sesion) throw new Error('El subagente todavía no reportó su sesión (¿su CLI falló al arrancar?). Mira su bitácora con mostrar trabajos.')
    const modelo = eleccion ? eleccion.modelo : sub.modelo ?? null, esfuerzo = eleccion ? eleccion.esfuerzo : sub.esfuerzo ?? null
    const esfuerzoCli = eleccion ? eleccion.esfuerzoCli : sub.esfuerzoCli ?? null
    const pid = await lanzarTurno({ id, harness: sub.harness, cwd: sub.cwd, modelo, esfuerzo, esfuerzoCli, permisos: sub.permisos, perfil: sub.perfil, sesion, texto, reanudar: true })
    r = { encolado: false, confirmado: true, ...(eleccion ? { eleccion: eleccion.resumen } : {}) }
    const nuevo = eleccion ? { modelo: modelo ?? undefined, esfuerzo: esfuerzo ?? undefined, esfuerzoCli: esfuerzoCli ?? undefined, eleccion: eleccion.resumen } : {}
    return l.map(s => s === sub ? { ...s, ...nuevo, pid, sesion, turno: (s.turno ?? 1) + 1, pregunta: undefined, escalado: undefined, escaladoPor: undefined } : s)
  })
  olvidarFoto()
  return r
}

/**
 * Detener (ajuste de Levy, 6 oct): corta el paso en curso SIN perder la sesión; el siguiente retomar la reanuda.
 * Con entrada en vivo, el pastor manda la interrupción del protocolo (claude `control_request` interrupt, codex
 * `turn/interrupt`) y el CLI cierra el turno solo. Sin ella (o si no responde), SIGINT al grupo y, al final, TERM.
 * El aviso de ese turno no sale: lo pidió Levy. La cola se vacía (se devuelve lo que quedó sin entregar).
 */
export async function detenerSubagente(id: number, o: { esperaMs?: number } = {}): Promise<{ estaba: boolean; como: 'protocolo' | 'señal' | 'terminado' | null; respuesta: string; colaDescartada: string[] }> {
  const sub = [...(await leerRegistro())].reverse().find(s => s.id === id && !s.cerrado && esSinPantalla(s))
  if (!sub) throw new Error('Ese subagente no es de Levy, no es sin pantalla o ya se cerró.')
  const e0 = await estadoDe(sub)
  if (!e0.corriendo) return { estaba: false, como: null, respuesta: respuestaDe(e0.turno), colaDescartada: [] }
  const espera = o.esperaMs ?? 20_000
  await mutarRegistroAsync(async l => l.map(s => s.id === id && !s.cerrado ? { ...s, detenidoEn: new Date().toISOString() } : s))
  const salio = async (ms: number) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (!(await estaVivo(sub.pid))) return true; await new Promise(r => setTimeout(r, 250)) } return false }
  let como: 'protocolo' | 'señal' | 'terminado' = 'protocolo'
  if (!(adaptador(sub.harness)?.vivo && escribirFifo(id, { tipo: 'detener' }) && await salio(espera))) {
    como = 'señal'
    try { process.kill(-sub.pid!, 'SIGINT') } catch { /* ya salió */ }
    if (!(await salio(8000))) { como = 'terminado'; await matar(sub.pid); await salio(6000) }
  }
  const e = await estadoDe(sub)
  let cola: string[] = []
  await mutarRegistroAsync(async l => l.map(s => {
    if (s.id !== id || s.cerrado) return s
    cola = s.cola ?? []
    return { ...s, cola: [], ...(e.finMs != null ? { avisadoHasta: e.finMs } : {}) }
  }))
  olvidarFoto()
  return { estaba: true, como, respuesta: respuestaDe(e.turno), colaDescartada: cola }
}

/** El vigía, al ver un turno terminado con mensajes en cola: los entrega juntos como un turno nuevo. */
export async function entregarCola(id: number): Promise<boolean> {
  let lanzado = false
  await mutarRegistroAsync(async l => {
    const sub = l.find(s => s.id === id && !s.cerrado && esSinPantalla(s))
    if (!sub?.cola?.length) return null
    const e = await estadoDe(sub)
    if (e.corriendo || !e.sesion) return null
    const pid = await lanzarTurno({ id, harness: sub.harness, cwd: sub.cwd, modelo: sub.modelo ?? null, esfuerzo: sub.esfuerzo ?? null, esfuerzoCli: sub.esfuerzoCli ?? null, permisos: sub.permisos, perfil: sub.perfil, sesion: e.sesion, texto: sub.cola.join('\n\n'), reanudar: true })
    lanzado = true
    return l.map(s => s === sub ? { ...s, pid, sesion: e.sesion, turno: (s.turno ?? 1) + 1, cola: [] } : s)
  })
  if (lanzado) olvidarFoto()
  return lanzado
}

/** Mata el proceso si sigue vivo y devuelve los tokens medidos de su bitácora. */
export async function detenerSinPantalla(sub: Subagente): Promise<number | null> {
  await matar(sub.pid)
  return tokensDe((await bitacora(sub)).b) ?? sub.tokens ?? null
}

async function terminalViva(id: number): Promise<boolean> {
  try { const { motor } = await import('../motor/cliente.js'); return (await motor.info()).terms.some(t => t.id === id) } catch { return false }
}

/**
 * «Abrir interactivo»: la sesión del subagente en una terminal del motor, con su CLI de siempre, para que Daniel se
 * meta a mano. Solo si no está corriendo (dos procesos sobre la misma sesión se pisan).
 */
export async function abrirInteractivo(id: number): Promise<{ terminal: number; comando: string }> {
  const sub = [...(await leerRegistro())].reverse().find(s => s.id === id && !s.cerrado && esSinPantalla(s))
  if (!sub) throw new Error('Ese subagente no es de Levy, no es sin pantalla o ya se cerró.')
  const ad = adaptador(sub.harness)
  if (!ad) throw new Error(`Harness sin adaptador: ${sub.harness}`)
  const e = await estadoDe(sub)
  if (e.corriendo) throw new Error('Sigue trabajando: espera a que termine su turno (o ciérralo) antes de abrirlo a mano.')
  if (!e.sesion) throw new Error('El subagente no reportó su sesión; no hay qué abrir.')
  const bin = await resolverBinario(ad.binario)
  if (!bin) throw new Error(`El CLI «${ad.binario}» no está instalado en el Studio.`)
  const comando = comandoInteractivo(ad, bin, e.sesion, sub.modelo ?? null, envFile(), { esfuerzo: esfuerzoParaCli(ad, sub.esfuerzo, sub.esfuerzoCli) })
  const { motor } = await import('../motor/cliente.js')
  const { id: terminal } = await motor.spawn({ cwd: sub.cwd, command: comando })
  await mutarRegistroAsync(async l => l.map(s => s.id === id && !s.cerrado ? { ...s, interactivo: terminal } : s))
  olvidarFoto()
  return { terminal, comando }
}

// ── Observación para el vigía y la vista «trabajos» ──
export interface ObservacionSinPantalla {
  vivo: true; trabajando: boolean; ultimaActividad: number | null; ultimaRespuesta: string | null; pregunta: string | null
  error: string | null; motivo: string; tokens: number | null; sesion?: string; turno: number
  /** «pediste max · corre medium»: lo que el CLI reportó no es lo que se pidió (va en el aviso al terminar). */
  desajuste?: string | null
}
export async function observarSinPantalla(sub: Subagente): Promise<ObservacionSinPantalla> {
  const e = await estadoDe(sub)
  const respuesta = respuestaDe(e.turno)
  const codigo = e.turno?.salida?.codigo
  const motivo = !e.terminado ? 'trabajando'
    : e.detenido ? `Levy detuvo el paso en el turno ${e.turno!.n} (la sesión sigue: retomar la reanuda)`
    : !e.turno!.salida ? 'su proceso desapareció sin cerrar el turno'
    : codigo === 0 ? `su proceso terminó el turno ${e.turno!.n} (salió con código 0)` : `su proceso salió con código ${codigo} en el turno ${e.turno!.n}`
  return {
    vivo: true, trabajando: e.corriendo, ultimaActividad: e.finMs, ultimaRespuesta: e.terminado ? (respuesta || (e.error ? `(sin respuesta: ${e.error})` : null)) : null,
    pregunta: e.terminado && !e.error ? preguntaDeRespuesta(respuesta) : null, error: e.error, motivo, tokens: e.tokens, turno: e.turno?.n ?? 0, ...(e.sesion ? { sesion: e.sesion } : {}),
    desajuste: coherenciaDe(sub, e.turno).desajuste,
  }
}

/** Lo pedido (marca de inicio del turno; bitácoras viejas: el registro) contra lo que el CLI reportó en ese turno. */
export function coherenciaDe(sub: Pick<Subagente, 'modelo' | 'esfuerzo'>, turno: Bitacora['turnos'][number] | undefined): Coherencia {
  return coherencia(turno?.pedido ?? { modelo: sub.modelo ?? null, esfuerzo: sub.esfuerzo ?? null }, turno?.efectivo)
}

/** Sus cambios desde main si trabaja en un worktree (la rama del registro o la que tenga su carpeta). */
async function cambiosDe(sub: Subagente): Promise<CambiosRama | null> {
  const wt = worktreeDe(sub.cwd.replace(/^~(?=\/)/, homedir()))
  if (!wt || !existsSync(wt.raiz)) return null
  return cambiosDeRama(wt.raiz, sub.rama).catch(() => null)
}

/** Las tarjetas de la vista «trabajos» para los subagentes sin pantalla: la conversación sale de su bitácora. */
export async function terminalesSinPantalla(registro: Subagente[], lineas: number): Promise<Terminal[]> {
  const abiertos = registro.filter(s => esSinPantalla(s) && !s.cerrado)
  return Promise.all(abiertos.map(async (sub): Promise<Terminal> => {
    const e = await estadoDe(sub).catch(() => null)
    const turnos = e?.b.turnos ?? []
    const ultimo = turnos.at(-1)
    const mensajes: Mensaje[] = turnos.slice(-2).flatMap(t => {
      const out: Mensaje[] = [t.texto, ...t.entradas].map(x => ({ rol: 'user' as const, texto: tachar(x).slice(0, 700), herramientas: [] }))
      const r = respuestaDe(t)
      if (r || t.herramientas.length) out.push({ rol: 'assistant', texto: tachar(r).slice(0, 700), herramientas: [...new Set(t.herramientas.map(h => herramientaLegible(h)))].slice(-3) })
      return out
    }).slice(-6)
    const respuesta = respuestaDe(ultimo)
    // Lo que se pinta como medido sale del CLI; lo pedido va aparte, en `coherencia` (nunca un pedido pintado como medido)
    const coh = coherenciaDe(sub, ultimo)
    const conversacion: Conversacion = {
      harness: sub.harness as Harness, modelo: coh.modelo.efectivo ?? sub.modelo ?? null, esfuerzo: coh.esfuerzo.efectivo, coherencia: coh, ctxPct: null, ctxVentana: null,
      turno: e?.corriendo ? 'trabajando' : ultimo ? 'terminado' : null, pregunta: !!(e?.terminado && preguntaDeRespuesta(respuesta)), tokens: e?.tokens ?? null,
      mensajes, titulo: null, ...(e?.error ? { error: tachar(e.error) } : {}),
    }
    const herr = ultimo?.herramientas.at(-1)
    const medido = e ? estadoTablero(hechosDe(sub, e, e.turno ? e.corriendo : await estaVivo(sub.pid)), Date.now()) : undefined
    const paso = ultimo?.paso ? tachar(pasoEnHumano(ultimo.paso.herramienta, ultimo.paso.detalle)) : undefined
    const tablero = medido ? { ...medido, ...(paso ? { paso } : {}), ...(ultimo?.inicio ? { desde: ultimo.inicio } : {}) } : undefined
    const cambios = await cambiosDe(sub)
    return {
      id: sub.id, pid: sub.pid, titulo: tachar(sub.nombre), cwd: sub.cwd.replace(homedir(), '~'), proc: sub.harness,
      estado: e?.corriendo ? 'trabajando' : 'esperando', origen: 'sin-pantalla', soloLectura: true,
      actividad: e?.corriendo ? `turno ${ultimo?.n ?? 1}${herr ? ` · ${herramientaLegible(herr)}` : ''}` : null,
      ultimaAccion: herr ? herramientaLegible(herr) : null,
      ultimas: tachar(respuesta).split('\n').map(x => x.trimEnd()).filter(Boolean).slice(-lineas),
      conversacion, subagente: sub, ...(tablero ? { tablero } : {}), ...(cambios ? { cambios } : {}),
    }
  }))
}

/** Los hechos medidos de un subagente sin pantalla para el tablero (tablero.ts decide la columna). */
export function hechosDe(sub: Subagente, e: Estado, procesoVivo: boolean): Hechos {
  const respuesta = respuestaDe(e.turno)
  // Detenido y su proceso salió con error (28 oct 2026, un encargo en «Te espera» 21 días: Levy detuvo un `sleep`, el
  // CLI cerró con `error_during_execution`, código 1). Un proceso que terminó con error no espera a nadie: es «falló».
  const codigo = e.turno?.salida?.codigo
  const errorDetenido = e.detenido && e.terminado && codigo ? `Lo detuvieron y su proceso salió con código ${codigo}` : null
  return {
    hayTurno: !!e.turno, cerroTurno: !!e.turno?.salida, procesoVivo, ultimaEscritura: e.mtime || null, creado: Date.parse(sub.creado) || 0,
    error: e.error ? tachar(e.error) : errorDetenido, detenido: e.detenido,
    pregunta: sub.pregunta?.texto ?? (e.terminado && !e.error ? preguntaDeRespuesta(respuesta) : null),
    entregaFallo: sub.entrega === 'falló',
  }
}

/** Actividad viva para la app (7 oct 2026): lo que haría su terminal, leído de la bitácora desde `desde`. */
export async function actividadSinPantalla(id: number, desde: number | null, turnoBase: number) {
  const sub = (await leerRegistro()).find(s => s.id === id && esSinPantalla(s))
  if (!sub) return null
  const { leerActividad } = await import('./actividad.js')
  const [lectura, e] = await Promise.all([leerActividad(rutaBitacora(id), sub.harness, desde, tachar, turnoBase), estadoDe(sub).catch(() => null)])
  return { ...lectura, corriendo: !!e?.corriendo, harness: sub.harness, ...(desde == null ? { encargo: tachar(sub.encargo).slice(0, 4000) } : {}) }
}
