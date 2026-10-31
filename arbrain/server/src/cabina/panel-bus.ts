/**
 * Bus del panel (4 oct 2026): el camino de Levy hacia las pestañas que Daniel VE, con acuse.
 *
 * Antes `mostrar {fijar|soltar|guardar}` solo validaba y respondía «hecho»; el cliente actuaba únicamente si
 * un efecto de React corría mientras el turno estaba en vivo en pantalla. Si la app no renderizaba ese
 * mensaje (otra conversación, recarga, ventana dormida), no pasaba nada y Levy lo daba por cumplido.
 *
 * Ahora la herramienta deja un COMANDO y espera el ACUSE de la app, que responde con el estado real de su
 * panel. Y la app reporta su panel cada pocos segundos (latido): así sabemos si hay alguien conectado y qué
 * pestañas tiene de verdad.
 *
 * Archivos en `~/.config/arbrain/panel/` (o `ARBRAIN_PANEL_DIR`), uno por escritor para no pisarse entre el
 * proceso MCP (stdio) y el daemon: `cmd-<id>.json` lo crea la herramienta y el daemon le añade acuses;
 * `cli-<id>.json` solo lo escribe el daemon con lo que reporta cada cliente.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN } from '../edicion.js'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { leer as leerAjustes, type Ajustes } from './panel-ajustes.js'
import { sincronizarCompartido, type PedidoCompartido, type RespuestaCompartido } from './panel-compartido.js'

export const DIR_PANEL = () => process.env.ARBRAIN_PANEL_DIR || path.join(DIR_ARBRAIN(), 'panel')

/** Un cliente sin latido en este tiempo se da por desconectado. Aguanta un latido tardío: el navegador frena los temporizadores de una ventana oculta (7 oct 2026: la app latía cada minuto y `mostrar` la daba por ausente). */
export const VIDA_CLIENTE_MS = 30_000
const SEG_CLIENTE = Math.round(VIDA_CLIENTE_MS / 1000)
/** Cuánto vive un comando sin atender (la app que abra después de eso ya no lo aplica). */
export const VIDA_COMANDO_MS = 10 * 60_000

export interface Pestana {
  id: string; vista: string; titulo: string
  ruta?: string; paginaId?: string; seccion?: string; agenteId?: number
  deLevy?: boolean; guardada?: boolean; activa?: boolean; enVentana?: boolean
  /** La ventana aparte donde vive («Ventana 2», 5 oct 2026); sin este campo, en el panel principal. */
  ventana?: string
}
export interface VistaPanel { vista: string; alcance?: string; fecha?: string; paginaId?: string; titulo?: string; enfoque?: string; seccion?: string; agenteId?: number; zona?: string; ruta?: string; compararCon?: string; fijar?: boolean; pestana?: string }
export interface Acuse { etiqueta: string; en: string; ok: boolean; detalle: string; cerradas: string[]; abiertas: string[]; pestanas: Pestana[]; /** En qué ventana quedó lo que abrió: «Ventana 1 (la de la izquierda)». */ donde?: string }
export interface Comando {
  id: string; accion: 'fijar' | 'soltar' | 'guardar' | 'conversacion'
  input: VistaPanel; conversacion?: string
  /** `conversacion` (31 oct 2026): la conversación nueva que Levy abrió (conversaciones.ts); la app la pinta en Fijadas y, si `abrir`, la abre. */
  sesion?: { id: string; titulo: string; abrir: boolean }
  /** El dispositivo al que va (8 oct 2026): el de la conversación que lo pidió. Un pedido nunca va a «cualquier cliente conectado». */
  para?: string
  creado: string; expira: string
  acuses: Record<string, Acuse>
}
export interface Cliente {
  id: string; etiqueta: string; latido: string; pestanas: Pestana[]; casa: { tareas: boolean; taller: boolean }; activa: string
  /** La versión de los ajustes del panel (panel-ajustes.ts) que esta app ya aplicó. */
  ajustesRev?: number
  /** Id estable del dispositivo (la app instalada o el perfil del navegador): sobrevive a recargas y reinicios. Ausente en una web anterior al 8 oct. */
  dispositivo?: string
  /** Quién es, VERIFICADO por la ruta del Studio con la sesión (nunca lo dice el cliente): solo Daniel llega al bus. */
  usuario?: string
  /** El aparato, deducido por la ruta del Studio (Mac · Chrome · local). */
  equipo?: string
  /** La conversación que tiene abierta ahora (sin el prefijo sdk:). */
  conversacion?: string
  /** Dónde escribió Daniel en este cliente y cuándo (conversación → ISO). */
  escribio?: Record<string, string>
  /** En qué ventana vive cada casa (Tareas y Taller). */
  casaEn?: { tareas?: string; taller?: string }
  /** Comandos nuevos que esta web sabe atender (31 oct 2026: «conversacion»). Una web anterior no los recibe. */
  sabe?: string[]
}

function leerJson<T>(archivo: string): T | undefined {
  try { return JSON.parse(readFileSync(archivo, 'utf8')) as T } catch { return undefined }
}
function escribirJson(archivo: string, dato: unknown) {
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(dato))
  renameSync(tmp, archivo)
}
// Rechaza nombres que contaminarían un objeto al usarlos como clave (`cmd.acuses[id] = …`): CodeQL
// js/remote-property-injection (noche 21→22 oct). `seguro` ya limita a [A-Za-z0-9_-], pero `__proto__`/`constructor`/
// `prototype` pasan ese filtro; aquí se vacían (y `!id` los rechaza donde la clave es obligatoria).
const CLAVE_PELIGROSA = /^(__proto__|constructor|prototype)$/
const seguro = (id: string) => { const s = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64); return CLAVE_PELIGROSA.test(s) ? '' : s }
const archivoCmd = (id: string, dir = DIR_PANEL()) => path.join(dir, `cmd-${seguro(id)}.json`)
const archivoCli = (id: string, dir = DIR_PANEL()) => path.join(dir, `cli-${seguro(id)}.json`)
function archivos(prefijo: string, dir = DIR_PANEL()): string[] {
  try { return readdirSync(dir).filter(f => f.startsWith(prefijo) && f.endsWith('.json')).map(f => path.join(dir, f)) } catch { return [] }
}

/** Clientes con latido reciente, el más fresco primero. */
export function clientesVivos(ahora = Date.now(), dir = DIR_PANEL()): Cliente[] {
  return archivos('cli-', dir).map(a => leerJson<Cliente>(a)).filter((c): c is Cliente => !!c && ahora - Date.parse(c.latido) < VIDA_CLIENTE_MS)
    .sort((a, b) => Date.parse(b.latido) - Date.parse(a.latido))
}

/** La conversación sin el prefijo `sdk:` (la app y el chat de Levy la nombran de las dos formas). */
export const idConversacion = (c?: string) => (c ?? '').replace(/^sdk:/, '')
/** El dispositivo del cliente; uno de la web anterior al 8 oct no lo trae y se cuenta como su propio dispositivo. */
export const dispositivoDe = (c: Cliente) => c.dispositivo || c.id
const ultimaEscritura = (c: Cliente, conv?: string): number => {
  const e = c.escribio ?? {}
  return conv ? Date.parse(e[conv] ?? '') || 0 : Math.max(0, ...Object.values(e).map(t => Date.parse(t) || 0))
}
/** Todos los clientes que el bus conoce (vivos o no, hasta una hora), el más fresco primero. */
function clientesConocidos(dir = DIR_PANEL()): Cliente[] {
  return archivos('cli-', dir).map(a => leerJson<Cliente>(a)).filter((c): c is Cliente => !!c).sort((a, b) => Date.parse(b.latido) - Date.parse(a.latido))
}

/**
 * A quién va un pedido de Levy (8 oct 2026, firmado por Daniel): SOLO al cliente que tiene abierta la conversación que lo pidió; si
 * ninguno la tiene abierta, al último donde Daniel escribió en esa conversación (aunque esté dormido: el pedido espera su turno en
 * la cola de ese dispositivo); sin conversación, al último donde escribió en cualquiera. Si no hay ninguno, a nadie: jamás a «cualquier
 * cliente conectado». Una web anterior al 8 oct (sin `conversacion` ni `escribio`) por eso nunca recibe nada.
 */
export function destinoDe(conversacion: string | undefined, ahora = Date.now(), dir = DIR_PANEL()): { cliente?: Cliente; vivo: boolean; motivo: 'abierta' | 'escribio' | 'ninguno' } {
  const conv = idConversacion(conversacion)
  const conocidos = clientesConocidos(dir)
  const vivos = (c: Cliente) => ahora - Date.parse(c.latido) < VIDA_CLIENTE_MS
  if (conv) {
    const abiertas = conocidos.filter(c => vivos(c) && idConversacion(c.conversacion) === conv)
    // Si la tienen abierta dos (el Studio y la laptop), la que tocó por última vez; si ninguna escribió, la más fresca.
    const abierta = abiertas.sort((a, b) => ultimaEscritura(b, conv) - ultimaEscritura(a, conv) || Date.parse(b.latido) - Date.parse(a.latido))[0]
    if (abierta) return { cliente: abierta, vivo: true, motivo: 'abierta' }
  }
  const quien = conocidos.filter(c => ultimaEscritura(c, conv || undefined) > 0).sort((a, b) => ultimaEscritura(b, conv || undefined) - ultimaEscritura(a, conv || undefined))[0]
  if (quien) return { cliente: quien, vivo: vivos(quien), motivo: 'escribio' }
  return { vivo: false, motivo: 'ninguno' }
}

/** Los clientes que deben acusar un pedido: su destino si está vivo; nadie si está dormido o no hay destino (el pedido espera en cola). */
export const objetivosDe = (d: ReturnType<typeof destinoDe>): Cliente[] => d.cliente && d.vivo ? [d.cliente] : []

/** Bitácora del bus (JSONL junto a los comandos): lo técnico que Daniel no debe ver en el chat, p. ej. un pedido que quedó en cola. Nunca lanza. */
export function anotarBitacora(evento: Record<string, unknown>, dir = DIR_PANEL()) {
  try { mkdirSync(dir, { recursive: true }); appendFileSync(path.join(dir, 'bitacora.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), ...evento })}\n`) } catch { /* la bitácora nunca rompe la herramienta */ }
}

/** Deja un comando para los clientes conectados (y para el que abra en los próximos 10 min). */
export function emitir(accion: Comando['accion'], input: VistaPanel, conversacion?: string, ahora = Date.now(), dir = DIR_PANEL()): { comando: Comando; objetivos: Cliente[]; destino: ReturnType<typeof destinoDe> } {
  const destino = destinoDe(conversacion, ahora, dir)
  const comando: Comando = { id: `c-${ahora.toString(36)}${randomBytes(3).toString('hex')}`, accion, input, ...(conversacion ? { conversacion } : {}), ...(destino.cliente ? { para: dispositivoDe(destino.cliente) } : {}), creado: new Date(ahora).toISOString(), expira: new Date(ahora + VIDA_COMANDO_MS).toISOString(), acuses: {} }
  // Sin destino el comando se escribe igual (queda a la vista en disco) pero con `para: 'nadie'`: ningún cliente lo recibe.
  if (!destino.cliente) comando.para = 'nadie'
  escribirJson(archivoCmd(comando.id, dir), comando)
  return { comando, objetivos: objetivosDe(destino), destino }
}

/**
 * La conversación nueva que Levy abrió (31 oct 2026): un aviso a la app de la conversación desde donde la pidió, para que la pinte
 * en Fijadas sin esperar su refresco y, si `abrir`, la abra. Si esa app es de una versión que no lo sabe atender, no se le manda
 * (lo vería como pestaña): `objetivos` queda vacío y la conversación aparece en su próximo refresco.
 */
export function emitirConversacion(sesion: NonNullable<Comando['sesion']>, conversacion?: string, ahora = Date.now(), dir = DIR_PANEL()): { comando: Comando; objetivos: Cliente[]; destino: ReturnType<typeof destinoDe>; versionVieja: boolean } {
  const destino = destinoDe(conversacion, ahora, dir)
  const versionVieja = !!destino.cliente && !sabeAtender(destino.cliente, 'conversacion')
  const comando: Comando = { id: `c-${ahora.toString(36)}${randomBytes(3).toString('hex')}`, accion: 'conversacion', input: { vista: 'conversacion', titulo: sesion.titulo }, sesion, ...(conversacion ? { conversacion } : {}), para: destino.cliente && !versionVieja ? dispositivoDe(destino.cliente) : 'nadie', creado: new Date(ahora).toISOString(), expira: new Date(ahora + VIDA_COMANDO_MS).toISOString(), acuses: {} }
  escribirJson(archivoCmd(comando.id, dir), comando)
  return { comando, objetivos: versionVieja ? [] : objetivosDe(destino), destino, versionVieja }
}

/** Espera a que cada objetivo acuse (o se agote el tiempo). Devuelve los acuses recibidos. */
export async function esperarAcuses(id: string, objetivos: Cliente[], { esperaMs = 8000, cadaMs = 150, dir = DIR_PANEL() }: { esperaMs?: number; cadaMs?: number; dir?: string } = {}): Promise<Record<string, Acuse>> {
  const limite = Date.now() + esperaMs
  let acuses: Record<string, Acuse> = {}
  for (;;) {
    acuses = leerJson<Comando>(archivoCmd(id, dir))?.acuses ?? {}
    if (!objetivos.length || objetivos.every(c => acuses[c.id]) || Date.now() >= limite) return acuses
    await new Promise(r => setTimeout(r, cadaMs))
  }
}

/** Espera a que cada app conectada reporte (en su latido) haber aplicado los ajustes de versión `rev`. Devuelve quién acusó y quién no. */
export async function esperarAjustes(rev: number, objetivos: Cliente[], { esperaMs = 8000, cadaMs = 150, dir = DIR_PANEL() }: { esperaMs?: number; cadaMs?: number; dir?: string } = {}): Promise<{ acusaron: Cliente[]; sinRespuesta: Cliente[] }> {
  const limite = Date.now() + esperaMs
  for (;;) {
    const ahora = clientesVivos(Date.now(), dir)
    const acusaron = objetivos.map(o => ahora.find(c => c.id === o.id)).filter((c): c is Cliente => !!c && (c.ajustesRev ?? 0) >= rev)
    if (!objetivos.length || acusaron.length === objetivos.length || Date.now() >= limite) return { acusaron, sinRespuesta: objetivos.filter(o => !acusaron.some(c => c.id === o.id)) }
    await new Promise(r => setTimeout(r, cadaMs))
  }
}

export interface Sincronizacion {
  clientId: string; etiqueta?: string; pestanas?: Pestana[]; casa?: { tareas: boolean; taller: boolean }; activa?: string; ajustesRev?: number
  dispositivo?: string; usuario?: string; equipo?: string; conversacion?: string; escribio?: Record<string, string>; casaEn?: { tareas?: string; taller?: string }
  acuses?: { comando: string; ok: boolean; detalle: string; cerradas: string[]; abiertas: string[]; pestanas: Pestana[]; donde?: string }[]
  /** El panel compartido entre aparatos (14 oct 2026, panel-compartido.ts). Una web anterior no lo manda y sigue solo local. */
  compartido?: PedidoCompartido
  /** Comandos nuevos que la web sabe atender (ver Cliente.sabe). */
  sabe?: string[]
}

/** Comandos que solo recibe una web que los declara en `sabe` (una anterior haría con ellos lo de `fijar`). */
const COMANDOS_NUEVOS = new Set<Comando['accion']>(['conversacion'])
const sabeAtender = (c: Cliente | undefined, accion: Comando['accion']) => !COMANDOS_NUEVOS.has(accion) || !!c?.sabe?.includes(accion)

const texto = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : ''
function limpiarPestanas(v: unknown): Pestana[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 80).filter(p => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.vista === 'string').map(p => ({
    id: texto(p.id, 120), vista: texto(p.vista, 40), titulo: texto(p.titulo, 160),
    ...(p.ruta ? { ruta: texto(p.ruta, 1000) } : {}), ...(p.paginaId ? { paginaId: texto(p.paginaId, 100) } : {}),
    ...(p.seccion ? { seccion: texto(p.seccion, 40) } : {}), ...(Number.isInteger(p.agenteId) ? { agenteId: p.agenteId } : {}),
    ...(p.deLevy ? { deLevy: true } : {}), ...(p.guardada ? { guardada: true } : {}), ...(p.activa ? { activa: true } : {}), ...(p.enVentana ? { enVentana: true } : {}), ...(typeof p.ventana === 'string' && p.ventana ? { ventana: p.ventana.slice(0, 40) } : {}),
  }))
}

/**
 * ¿Este pedido es para este cliente? Solo si va a su dispositivo (`para`; un pedido de un proceso anterior al 8 oct, sin `para`, se
 * resuelve aquí con la misma regla de `destinoDe`) Y es el cliente que le toca dentro de él: si el mismo dispositivo tiene dos
 * pestañas abiertas, solo la que tiene la conversación (o la que escribió); nunca las dos.
 */
function esParaMi(cmd: Comando, yo: Cliente, ahora: number, dir: string): boolean {
  const para = cmd.para ?? (() => { const d = destinoDe(cmd.conversacion, Date.parse(cmd.creado) || ahora, dir); return d.cliente ? dispositivoDe(d.cliente) : 'nadie' })()
  if (para !== dispositivoDe(yo) || !sabeAtender(yo, cmd.accion)) return false
  const conv = idConversacion(cmd.conversacion)
  const hermanos = clientesVivos(ahora, dir).filter(c => dispositivoDe(c) === para)
  const elegido = hermanos.sort((a, b) => Number(idConversacion(b.conversacion) === conv) - Number(idConversacion(a.conversacion) === conv) || ultimaEscritura(b, conv || undefined) - ultimaEscritura(a, conv || undefined) || Date.parse(b.latido) - Date.parse(a.latido))[0]
  return !elegido || elegido.id === yo.id
}

/**
 * Lo que hace el daemon cuando la app llama (cada pocos segundos, y al cambiar su panel): anota su estado,
 * guarda los acuses de lo que ya aplicó y le devuelve los comandos que aún no ha atendido.
 */
export function sincronizar(s: Sincronizacion, ahora = Date.now(), dir = DIR_PANEL(), archivoAjustes?: string): { comandos: Comando[]; ajustes?: Ajustes; compartido?: RespuestaCompartido } {
  const id = seguro(s.clientId ?? '')
  if (!id) throw new Error('clientId obligatorio.')
  const etiqueta = texto(s.etiqueta, 60) || 'Arbrain'
  const pestanas = limpiarPestanas(s.pestanas)
  const escribio = Object.fromEntries(Object.entries(s.escribio && typeof s.escribio === 'object' ? s.escribio : {}).filter(([k, v]) => k && typeof v === 'string' && Number.isFinite(Date.parse(v))).slice(0, 30).map(([k, v]) => [idConversacion(texto(k, 120)), v as string]).filter(([k]) => k && !CLAVE_PELIGROSA.test(k)))
  const dispositivo = seguro(s.dispositivo ?? ''), conversacion = idConversacion(texto(s.conversacion, 120))
  const cliente: Cliente = {
    id, etiqueta, latido: new Date(ahora).toISOString(), pestanas, casa: { tareas: !!s.casa?.tareas, taller: !!s.casa?.taller }, activa: texto(s.activa, 120), ajustesRev: Number.isInteger(s.ajustesRev) && (s.ajustesRev as number) >= 0 ? s.ajustesRev : 0,
    ...(dispositivo ? { dispositivo } : {}), ...(s.usuario ? { usuario: texto(s.usuario, 60) } : {}), ...(s.equipo ? { equipo: texto(s.equipo, 80) } : {}),
    ...(conversacion ? { conversacion } : {}), ...(Object.keys(escribio).length ? { escribio } : {}),
    ...(Array.isArray(s.sabe) ? { sabe: s.sabe.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 40)).slice(0, 20) } : {}),
    ...(s.casaEn ? { casaEn: { ...(s.casaEn.tareas ? { tareas: texto(s.casaEn.tareas, 40) } : {}), ...(s.casaEn.taller ? { taller: texto(s.casaEn.taller, 40) } : {}) } } : {}),
  }
  escribirJson(archivoCli(id, dir), cliente)
  for (const a of Array.isArray(s.acuses) ? s.acuses : []) {
    const cmd = leerJson<Comando>(archivoCmd(texto(a.comando, 80), dir))
    if (!cmd || cmd.acuses[id]) continue
    cmd.acuses[id] = { etiqueta, en: new Date(ahora).toISOString(), ok: !!a.ok, detalle: texto(a.detalle, 400), cerradas: (Array.isArray(a.cerradas) ? a.cerradas : []).map(x => texto(x, 160)).slice(0, 40), abiertas: (Array.isArray(a.abiertas) ? a.abiertas : []).map(x => texto(x, 160)).slice(0, 40), pestanas: limpiarPestanas(a.pestanas), ...(a.donde ? { donde: texto(a.donde, 120) } : {}) }
    escribirJson(archivoCmd(cmd.id, dir), cmd)
  }
  const comandos: Comando[] = []
  for (const a of archivos('cmd-', dir)) {
    const cmd = leerJson<Comando>(a)
    if (!cmd) continue
    if (Date.parse(cmd.expira) < ahora - 60_000) { try { rmSync(a) } catch { /* ya no está */ } continue }
    if (Date.parse(cmd.expira) >= ahora && !cmd.acuses[id] && esParaMi(cmd, cliente, ahora, dir)) comandos.push(cmd)
  }
  // Clientes que nadie ha visto en una hora: se limpian.
  for (const a of archivos('cli-', dir)) { const c = leerJson<Cliente>(a); if (!c || ahora - Date.parse(c.latido) > 3_600_000) { try { rmSync(a) } catch { /* ya no está */ } } }
  // Los ajustes del panel viajan en el mismo latido: si la app no tiene la versión vigente, se los llevamos (difusión en vivo).
  const { ajustes } = leerAjustes(archivoAjustes)
  // El panel compartido (14 oct 2026) viaja en el mismo latido: el cambio de esta app y lo que le falta de las demás.
  const compartido = s.compartido && typeof s.compartido === 'object' ? sincronizarCompartido(s.compartido, dispositivo || id, ahora, dir) : undefined
  return { comandos: comandos.sort((x, y) => Date.parse(x.creado) - Date.parse(y.creado)), ...(ajustes.rev > cliente.ajustesRev! ? { ajustes } : {}), ...(compartido ? { compartido } : {}) }
}

const lista = (xs: string[]) => xs.map(x => `«${x}»`).join(', ')
const casaDe = (c: Cliente) => [c.casa.tareas && `Tareas${c.casaEn?.tareas ? ` (${c.casaEn.tareas})` : ''}`, c.casa.taller && `Taller${c.casaEn?.taller ? ` (${c.casaEn.taller})` : ''}`].filter(Boolean) as string[]

/** Un nombre que Daniel entiende: qué es, en qué aparato y de quién («App de escritorio de Arbrain · Mac · local · Daniel»). */
export function nombreCliente(c: Cliente): string {
  return [c.etiqueta, c.equipo, c.usuario ? `sesión de ${c.usuario}` : 'sesión sin verificar'].filter(Boolean).join(' · ')
}

/** Dónde vive la pestaña: siempre se dice (el panel principal o «Ventana N» en otro monitor). */
const dondeVive = (p: Pestana) => p.enVentana ? `en la ${p.ventana ?? 'otra ventana'} (no en el panel principal)` : 'en el Panel principal'

/** El estado real de un cliente en una línea por pestaña (para que Levy lo lea). `recibe`: por qué sí o no le llegan los pedidos de Levy. */
export function describirCliente(c: Cliente, ahora = Date.now(), recibe?: string): string {
  const hace = Math.max(0, Math.round((ahora - Date.parse(c.latido)) / 1000))
  const filas = c.pestanas.map(p => `  · ${p.id} · «${p.titulo}» (${p.vista}${p.ruta ? `, ${p.ruta}` : ''}${p.paginaId ? `, página ${p.paginaId}` : ''}${p.seccion ? `, ${p.seccion}` : ''}) · ${p.deLevy ? 'fijada por Levy' : `abierta por ${DUENO}`}${p.guardada ? ' · guardada' : ''}${p.activa ? ' · a la vista' : ''} · ${dondeVive(p)}`)
  const conv = c.conversacion ? ` · conversación abierta: ${c.conversacion.slice(0, 12)}` : ''
  return `${nombreCliente(c)} (cliente ${c.id}, latido hace ${hace} s${conv}) · casa: ${casaDe(c).join(' y ') || 'ninguna'} · ${c.pestanas.length} pestaña(s) fijada(s)${recibe ? ` · ${recibe}` : ''}${filas.length ? `\n${filas.join('\n')}` : ''}`
}

/** Las pestañas abiertas AHORA según lo que reporta cada cliente conectado, y a cuál le llegan los pedidos de la conversación `conversacion`. */
export function describirPanel(ahora = Date.now(), dir = DIR_PANEL(), conversacion?: string): { text: string; conectado: boolean } {
  const vivos = clientesVivos(ahora, dir)
  if (!vivos.length) return { conectado: false, text: `No hay ningún cliente de Arbrain conectado ahora (nadie ha reportado su panel en los últimos ${SEG_CLIENTE} s): no puedo saber qué pestañas tiene abiertas ${DUENO}. La app lo reporta sola cuando está abierta.` }
  const d = destinoDe(conversacion, ahora, dir)
  const recibe = (c: Cliente) => d.cliente?.id === c.id ? `RECIBE lo que abras en esta conversación (${d.motivo === 'abierta' ? 'la tiene abierta' : `es donde ${DUENO} escribió último`})` : 'no recibe tus pedidos de esta conversación'
  const aviso = d.cliente ? '' : '\nNingún cliente tiene abierta ni escribió en esta conversación: lo que muestres no tiene a dónde ir y lo dirá como NO confirmado.'
  return { conectado: true, text: vivos.map(c => describirCliente(c, ahora, recibe(c))).join('\n') + aviso }
}

/** Respuesta honesta para Levy: lo que la app confirmó, o por qué no hay confirmación. */
export function informe(comando: Comando, objetivos: Cliente[], acuses: Record<string, Acuse>, ahora = Date.now(), dir = DIR_PANEL(), destino?: ReturnType<typeof destinoDe>): { text: string; confirmado: boolean } {
  const verbo = comando.accion === 'soltar' ? 'quitar' : comando.accion === 'guardar' ? 'sacar de la barra' : 'fijar'
  if (!objetivos.length) {
    if (!destino?.cliente && destino) return { confirmado: false, text: `NO confirmado: ningún cliente de Arbrain tiene abierta ni escribió en esta conversación, así que el pedido de ${verbo} no tiene a dónde ir (no lo mando a otro cliente conectado). Pídele a ${DUENO} que abra o escriba aquí, o dile que lo abra él.` }
    const dormido = destino?.cliente ? ` El dispositivo de esta conversación (${nombreCliente(destino.cliente)}) no ha latido en los últimos ${SEG_CLIENTE} s: el pedido espera ${Math.round(VIDA_COMANDO_MS / 60_000)} min en SU cola y solo ese dispositivo lo aplicará.` : ''
    return { confirmado: false, text: `NO confirmado: no hay ningún cliente de Arbrain conectado ahora (nadie reportó su panel en los últimos ${SEG_CLIENTE} s).${dormido || ` El pedido de ${verbo} quedó en cola ${Math.round(VIDA_COMANDO_MS / 60_000)} min y la app lo aplicará si abre en ese plazo; si no, no pasó nada.`} No le digas a ${DUENO} que ya está hecho.` }
  }
  const recibidos = Object.values(acuses)
  if (!recibidos.length) {
    return { confirmado: false, text: `NO confirmado: ${objetivos.map(nombreCliente).join(', ')} estaba conectado pero no respondió en unos segundos. El pedido sigue en cola (${Math.round(VIDA_COMANDO_MS / 60_000)} min). Verifica con panel {accion:"listar"} antes de afirmar nada.` }
  }
  const fallos = recibidos.filter(a => !a.ok)
  const partes = recibidos.map(a => {
    const cambios = [a.cerradas.length ? `cerró ${lista(a.cerradas)}` : '', a.abiertas.length ? `dejó abierta ${lista(a.abiertas)}${a.donde ? ` en ${a.donde}` : ''}` : ''].filter(Boolean).join(' y ')
    return `${a.etiqueta} ${a.ok ? 'confirmó' : 'RECHAZÓ'}: ${cambios || a.detalle || 'sin cambios que hacer'}${a.ok && cambios && a.detalle ? ` (${a.detalle})` : ''}. Panel real ahora: ${a.pestanas.length ? a.pestanas.map(p => `«${p.titulo}»${p.enVentana ? ` (${p.ventana ?? 'otra ventana'})` : ''}`).join(', ') : 'sin pestañas fijadas'}.`
  })
  const sinRespuesta = objetivos.filter(c => !acuses[c.id])
  return { confirmado: !fallos.length, text: `${partes.join(' ')}${sinRespuesta.length ? ` Sin respuesta de: ${sinRespuesta.map(c => c.etiqueta).join(', ')}.` : ''}` }
}
