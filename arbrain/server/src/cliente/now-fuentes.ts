/**
 * Google Calendar y Todoist en el `now.md` del alumno (1 nov 2026, Daniel: «quiero que en una version actualizada
 * puedan tener el now.md sincronizado al calendario como lo hacemos nosotros»). El de Daniel lo arma `now-snapshot.py`
 * con su Google y su Todoist; aquí el daemon de la edición cliente lee lo que el alumno haya conectado:
 *
 *   Google    `gog` (manuales/google-calendar-gmail.md, opción B): todas sus cuentas con calendario, todos sus
 *             calendarios, de hoy a 7 días. Cada llamada va con `--readonly` y `--enable-commands-exact` a la orden
 *             exacta (`auth.list`, `calendar.events`): aunque alguien cambiara los argumentos, `gog` no escribe.
 *   Todoist   su token (manuales/todoist.md, opción B): variable `TODOIST_API_TOKEN`, llavero de Mac
 *             (`todoist-api-token`), Secret Service en Linux (`servicio todoist`) o variable de usuario en Windows.
 *             Solo GET a la API v1; solo tareas con fecha.
 *
 * Sin `gog`, sin cuentas o sin token: esa fuente no existe y `now.md` sale igual que antes, sin errores.
 * Timeout corto. Si una fuente falla, se usa su última lectura buena y `now.md` dice de cuándo es.
 *
 * Lo último bueno vive fuera del repo del alumno, en la carpeta de configuración de Arbrain (`DIR_ARBRAIN`,
 * `now-fuentes/<huella de la raíz>.json`, permisos 600): solo títulos y horas, nunca descripciones, enlaces ni
 * llaves. El token no se guarda en ningún archivo, no se registra y no viaja en ningún mensaje de error.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export interface EventoExterno { titulo: string; inicio: string; fin?: string; todoElDia: boolean }
/** `fecha`: `YYYY-MM-DD`, hora de pared `YYYY-MM-DDTHH:MM[:SS]` o instante con `Z`/desfase (como la da Todoist). */
export interface TareaExterna { titulo: string; fecha: string }
export type Motivo = 'tiempo agotado' | 'no respondió' | 'llave rechazada' | 'respuesta ilegible'
/** Una lectura: `leido` es la última buena (null si nunca la hubo); `fallo` dice por qué la de ahora no lo fue. */
export interface Lectura<T> { leido: string | null; datos: T[]; fallo?: Motivo }
export interface Fuentes {
  /** Por cuenta de Google (su correo). */
  google: Record<string, Lectura<EventoExterno>>
  todoist: Lectura<TareaExterna> | null
}
export const SIN_FUENTES: Fuentes = { google: {}, todoist: null }

export interface Salida { codigo: number | null; salida: string; agotado: boolean }
export interface Respuesta { estado: number; cuerpo: unknown }
export interface Dependencias {
  /** Corre un binario sin shell; nunca lanza. */
  ejecutar: (bin: string, args: string[], ms: number) => Promise<Salida>
  /** GET con cabeceras; lanza si se aborta o no hay red. */
  pedir: (url: string, cabeceras: Record<string, string>, senal: AbortSignal) => Promise<Respuesta>
  binarioGog: () => string | null
  tokenTodoist: () => Promise<string | null>
}

const MS_GOG_CUENTAS = 5_000
const MS_GOG_EVENTOS = 8_000
const MS_TODOIST = 8_000
const MS_LLAVERO = 3_000
const DIAS = 7
const TD_API = 'https://api.todoist.com/api/v1'

// ── Lo último bueno ────────────────────────────────────────────────────────────────────────────────────────────────

export function rutaFuentes(raiz: string): string {
  return join(DIR_ARBRAIN(), 'now-fuentes', `${createHash('sha256').update(resolve(raiz)).digest('hex').slice(0, 16)}.json`)
}

const texto = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

function lecturaValida<T>(v: unknown, valido: (x: unknown) => x is T): Lectura<T> | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.leido !== null && typeof o.leido !== 'string') return null
  return {
    leido: o.leido as string | null,
    datos: Array.isArray(o.datos) ? o.datos.filter(valido) : [],
    ...(typeof o.fallo === 'string' ? { fallo: o.fallo as Motivo } : {}),
  }
}
const esEvento = (x: unknown): x is EventoExterno => !!x && typeof x === 'object' && typeof (x as EventoExterno).titulo === 'string' && typeof (x as EventoExterno).inicio === 'string'
const esTarea = (x: unknown): x is TareaExterna => !!x && typeof x === 'object' && typeof (x as TareaExterna).titulo === 'string' && typeof (x as TareaExterna).fecha === 'string'

/** Lo último leído de Google y Todoist para este cerebro; vacío si no hay o no se entiende. */
export function leerFuentes(raiz: string): Fuentes {
  try {
    const j = JSON.parse(readFileSync(rutaFuentes(raiz), 'utf8'))
    const google: Fuentes['google'] = {}
    if (j?.google && typeof j.google === 'object') for (const [cuenta, l] of Object.entries(j.google)) {
      const v = lecturaValida(l, esEvento)
      if (v) google[cuenta] = v
    }
    return { google, todoist: lecturaValida(j?.todoist, esTarea) }
  } catch { return { google: {}, todoist: null } }
}

function guardarFuentes(raiz: string, f: Fuentes) {
  const ruta = rutaFuentes(raiz)
  if (!Object.keys(f.google).length && !f.todoist) { try { unlinkSync(ruta) } catch { /* no había */ } return }
  mkdirSync(join(ruta, '..'), { recursive: true, mode: 0o700 })
  const tmp = `${ruta}.${process.pid}.tmp`
  try { writeFileSync(tmp, JSON.stringify(f), { encoding: 'utf8', mode: 0o600 }); renameSync(tmp, ruta) }
  finally { if (existsSync(tmp)) try { unlinkSync(tmp) } catch { /* noop */ } }
}

// ── Lo real: binarios, llavero y red ───────────────────────────────────────────────────────────────────────────────

function ejecutarReal(bin: string, args: string[], ms: number): Promise<Salida> {
  return new Promise(res => {
    try {
      execFile(bin, args, { timeout: ms, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null
        res({ codigo: e ? (typeof e.code === 'number' ? e.code : null) : 0, salida: e ? '' : String(stdout), agotado: !!e?.killed })
      })
    } catch { res({ codigo: null, salida: '', agotado: false }) }
  })
}

async function pedirReal(url: string, cabeceras: Record<string, string>, senal: AbortSignal): Promise<Respuesta> {
  const r = await fetch(url, { method: 'GET', headers: cabeceras, signal: senal })
  let cuerpo: unknown = null
  try { cuerpo = await r.json() } catch { /* cuerpo ilegible */ }
  return { estado: r.status, cuerpo }
}

/** `gog` donde lo deja su manual: PATH, Homebrew (Mac y Linux), `~/.local/bin` o `%LOCALAPPDATA%\Programs\gog`. */
export function binarioGog(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform): string | null {
  const nombre = plataforma === 'win32' ? 'gog.exe' : 'gog'
  const carpetas = [
    ...(env.PATH ?? env.Path ?? '').split(plataforma === 'win32' ? ';' : delimiter).filter(Boolean),
    ...(plataforma === 'win32'
      ? [join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'gog')]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin', join(homedir(), '.local/bin')]),
  ]
  for (const d of carpetas) { const p = join(d, nombre); if (existsSync(p)) return p }
  return null
}

/** El token de Todoist donde lo guarda su manual. Nunca se imprime ni se escribe; null si no está. */
export async function leerTokenTodoist(
  ejecutar: Dependencias['ejecutar'] = ejecutarReal, plataforma: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const directo = env.TODOIST_API_TOKEN?.trim()
  if (directo) return directo
  let r: Salida | null = null
  if (plataforma === 'darwin') {
    let usuario = env.USER
    if (!usuario) try { usuario = userInfo().username } catch { /* sin usuario */ }
    if (usuario) r = await ejecutar('/usr/bin/security', ['find-generic-password', '-a', usuario, '-s', 'todoist-api-token', '-w'], MS_LLAVERO)
  } else if (plataforma === 'win32') {
    // La variable «de usuario» del manual: la app pudo abrir antes de que existiera, así que se lee del registro.
    const q = await ejecutar('reg', ['query', 'HKCU\\Environment', '/v', 'TODOIST_API_TOKEN'], MS_LLAVERO)
    const m = q.codigo === 0 ? /TODOIST_API_TOKEN\s+REG_(?:EXPAND_)?SZ\s+(\S+)/.exec(q.salida) : null
    return m ? m[1] : null
  } else {
    r = await ejecutar('secret-tool', ['lookup', 'servicio', 'todoist'], MS_LLAVERO)
  }
  const t = r?.codigo === 0 ? r.salida.trim() : ''
  return t && !/\s/.test(t) ? t : null
}

export const DEPENDENCIAS_REALES: Dependencias = {
  ejecutar: ejecutarReal,
  pedir: pedirReal,
  binarioGog: () => binarioGog(),
  tokenTodoist: () => leerTokenTodoist(),
}

// ── Google por gog ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Argumentos de solo lectura: `--readonly` y la orden exacta habilitada (ignora un `GOG_ENABLE_COMMANDS` más amplio). */
const soloLectura = (orden: string) => ['--readonly', `--enable-commands-exact=${orden}`, '--no-input', '--json', '--color=never']

type Resultado<T> = { ok: true; datos: T } | { ok: false; fallo: Motivo }
const falloDe = (s: Salida): Motivo => s.agotado ? 'tiempo agotado' : 'no respondió'

/** Cuentas de `gog` con calendario (lista vacía = `gog` instalado pero sin cuentas: no conectado). */
async function cuentasGoogle(d: Dependencias, bin: string): Promise<Resultado<{ correo: string; cliente: string | null }[]>> {
  const s = await d.ejecutar(bin, [...soloLectura('auth.list'), 'auth', 'list'], MS_GOG_CUENTAS)
  if (s.codigo !== 0) return { ok: false, fallo: falloDe(s) }
  try {
    const j = JSON.parse(s.salida)
    const lista = (Array.isArray(j) ? j : j?.accounts) as unknown
    if (!Array.isArray(lista)) return { ok: false, fallo: 'respuesta ilegible' }
    return {
      ok: true,
      datos: lista.filter(a => a && typeof a.email === 'string' && (!Array.isArray(a.services) || a.services.includes('calendar')))
        .map(a => ({ correo: a.email as string, cliente: typeof a.client === 'string' && a.client && a.client !== 'default' ? a.client : null })),
    }
  } catch { return { ok: false, fallo: 'respuesta ilegible' } }
}

/** Eventos de todos los calendarios de una cuenta entre dos instantes. Sin descripciones, enlaces ni invitados. */
async function eventosGoogle(d: Dependencias, bin: string, cuenta: { correo: string; cliente: string | null }, desde: string, hasta: string): Promise<Resultado<EventoExterno[]>> {
  const s = await d.ejecutar(bin, [
    ...soloLectura('calendar.events'), '--account', cuenta.correo, ...(cuenta.cliente ? ['--client', cuenta.cliente] : []),
    'calendar', 'events', '--all', '--from', desde, '--to', hasta, '--max', '250', '--all-pages',
  ], MS_GOG_EVENTOS)
  if (s.codigo !== 0) return { ok: false, fallo: falloDe(s) }
  let lista: unknown
  try { const j = JSON.parse(s.salida); lista = Array.isArray(j) ? j : j?.events } catch { return { ok: false, fallo: 'respuesta ilegible' } }
  if (!Array.isArray(lista)) return { ok: false, fallo: 'respuesta ilegible' }
  const out: EventoExterno[] = []
  for (const e of lista as Record<string, any>[]) {
    if (!e || e.status === 'cancelled' || e.eventType === 'working-location') continue
    if (Array.isArray(e.attendees) && e.attendees.some((a: any) => a?.self && a.responseStatus === 'declined')) continue
    const ini = e.start?.dateTime ?? e.start?.date, fin = e.end?.dateTime ?? e.end?.date
    if (typeof ini !== 'string') continue
    out.push({ titulo: texto(e.summary, 120) || '(sin título)', inicio: ini, ...(typeof fin === 'string' ? { fin } : {}), todoElDia: !e.start?.dateTime })
  }
  return { ok: true, datos: out.slice(0, 500) }
}

// ── Todoist ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function tareasTodoist(d: Dependencias, token: string): Promise<Resultado<TareaExterna[]>> {
  const ctl = new AbortController()
  const reloj = setTimeout(() => ctl.abort(), MS_TODOIST)
  reloj.unref?.()
  const out: TareaExterna[] = []
  try {
    let cursor: string | null = null
    for (let pagina = 0; pagina < 10; pagina++) {
      const r = await d.pedir(`${TD_API}/tasks?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { Authorization: `Bearer ${token}` }, ctl.signal)
      if (r.estado === 401 || r.estado === 403) return { ok: false, fallo: 'llave rechazada' }
      if (r.estado !== 200 || !r.cuerpo || typeof r.cuerpo !== 'object') return { ok: false, fallo: r.estado === 200 ? 'respuesta ilegible' : 'no respondió' }
      const c = r.cuerpo as { results?: unknown; next_cursor?: unknown }
      for (const t of Array.isArray(c.results) ? c.results as Record<string, any>[] : []) {
        const fecha = t?.due?.datetime ?? t?.due?.date
        if (!t || t.checked === true || t.is_deleted === true || typeof fecha !== 'string') continue
        out.push({ titulo: texto(t.content, 120) || '(sin título)', fecha: fecha.trim() })
      }
      cursor = typeof c.next_cursor === 'string' && c.next_cursor ? c.next_cursor : null
      if (!cursor) return { ok: true, datos: out.slice(0, 1000) }
    }
    return { ok: true, datos: out.slice(0, 1000) }
  } catch {
    return { ok: false, fallo: ctl.signal.aborted ? 'tiempo agotado' : 'no respondió' }
  } finally { clearTimeout(reloj) }
}

// ── Sincronizar ────────────────────────────────────────────────────────────────────────────────────────────────────

const conFallo = <T>(previa: Lectura<T> | undefined | null, fallo: Motivo): Lectura<T> => ({ leido: previa?.leido ?? null, datos: previa?.datos ?? [], fallo })

/**
 * Lee Google y Todoist (lo que esté conectado), guarda lo último bueno y lo devuelve. Nunca lanza; nunca escribe en
 * Google ni en Todoist. `desde` es el inicio de hoy en la zona del alumno; se leen 7 días.
 */
export async function sincronizarFuentes(raiz: string, desde: Date, opciones: { ahora?: Date; deps?: Partial<Dependencias> } = {}): Promise<Fuentes> {
  const d: Dependencias = { ...DEPENDENCIAS_REALES, ...opciones.deps }
  const ahora = (opciones.ahora ?? new Date()).toISOString()
  const previa = leerFuentes(raiz)
  const hasta = new Date(desde.getTime() + DIAS * 86_400_000)

  const google = async (): Promise<Fuentes['google']> => {
    let bin: string | null = null
    try { bin = d.binarioGog() } catch { bin = null }
    if (!bin) return {}
    const cuentas = await cuentasGoogle(d, bin)
    if (!cuentas.ok) return Object.fromEntries(Object.entries(previa.google).map(([c, l]) => [c, conFallo(l, cuentas.fallo)]))
    const lecturas = await Promise.all(cuentas.datos.map(async c => [c.correo, await eventosGoogle(d, bin!, c, desde.toISOString(), hasta.toISOString())] as const))
    return Object.fromEntries(lecturas.map(([c, r]) => [c, r.ok ? { leido: ahora, datos: r.datos } : conFallo(previa.google[c], r.fallo)]))
  }
  const todoist = async (): Promise<Fuentes['todoist']> => {
    let token: string | null = null
    try { token = await d.tokenTodoist() } catch { token = null }
    if (!token) return null
    const r = await tareasTodoist(d, token)
    return r.ok ? { leido: ahora, datos: r.datos } : conFallo(previa.todoist, r.fallo)
  }

  const [g, t] = await Promise.all([google().catch(() => previa.google), todoist().catch(() => previa.todoist)])
  const f: Fuentes = { google: g, todoist: t }
  try { guardarFuentes(raiz, f) } catch { /* sin carpeta de configuración: queda en memoria de esta vuelta */ }
  return f
}
