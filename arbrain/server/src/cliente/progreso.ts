/**
 * Conectar con arbrain.ai (puente de seguimiento, 21 oct 2026). Opcional y apagado por defecto.
 *
 * El alumno genera un token en su perfil de arbrain.ai («Conectar mi cerebro») y lo pega en Ajustes. Desde entonces,
 * una vez al día (y con «Enviar ahora») el daemon manda UNA señal mínima de avance:
 *   instalado y versión · meta del mes, la semana y el día (presentes o no; el texto solo si el alumno lo permite) ·
 *   hábitos activos y días cumplidos en 7 días (nombres solo con permiso) · conversaciones con Levy en 7 días (solo el
 *   número) · eventos del calendario · ofertas y conversaciones de venta que el alumno anota a mano.
 * NUNCA sale texto de conversaciones, memoria ni archivos: la señal se arma aquí campo por campo y es lo mismo que se
 * enseña en la vista previa.
 *
 * Solo sale algo con: edición cliente + token guardado (archivo 0600 en su carpeta de datos, puesto por la app con su
 * secreto, nunca por el modelo) + URL. La URL es configurable (código abierto: no queda atado a arbrain.ai).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { esEdicionCliente } from '../edicion.js'
import { diaLocal } from './cohorte.js'
import { adoptarLegado, existeCerebro, sembrarExpediente, urlExpediente, validarRemoto, type Siembra } from './expediente.js'
import { escribirCamino, urlCamino, validarCamino, type Resultado as ResultadoCamino } from './camino.js'

export const URL_POR_OMISION = 'https://arbrain.ai/api/progreso'
const DIA_MS = 86_400_000
/** Un envío automático por día: si el último salió bien hace menos de 20 h, el tic no manda otro. */
const ESPERA_MS = 20 * 60 * 60_000
/** El camino se trae cada mañana: el primer tic del día a partir de esta hora local (y siempre al conectar y al arrancar). */
const HORA_MANANA = 5

export interface ConfigProgreso {
  token: string
  url: string
  compartirTexto: boolean
  manual?: { semana: string; ofertas: number | null; conversaciones_venta: number | null }
  ultimoEnvio?: number
  ultimoIntento?: number
  ultimoResultado?: string
  /** Expediente traído de arbrain.ai (22 oct 2026): cuándo salió bien y qué pasó la última vez. */
  ultimoExpediente?: number
  expedienteResultado?: string
  /** Mi camino traído de arbrain.ai (22 oct 2026): el día local en que llegó y qué pasó la última vez. */
  ultimoCamino?: number
  caminoDia?: string
  caminoResultado?: string
}
export interface Meta { presente: boolean; texto?: string }
export interface Senal {
  v: 1
  instalado: true
  version_app: string | null
  fecha: string
  semana: string
  metas: { mes: Meta; semana: Meta; dia: Meta }
  habitos_activos: number
  habitos: { dias_7: number; nombre?: string }[]
  conversaciones_7d: number | null
  calendario: { eventos_total: number | null; eventos_7d: number | null }
  ventas: { ofertas_7d: number | null; conversaciones_venta_7d: number | null; cierres_7d: number | null }
}

const dirDatos = () => join(process.env.ARBRAIN_DATA_DIR || join(process.env.ARBRAIN_CONFIG_DIR || '.', '..'), 'cohorte')
const raizCerebro = () => process.env.ARBRAIN_HOME || ''

function escribirPrivado(ruta: string, datos: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(datos, null, 1), { mode: 0o600 })
  renameSync(`${ruta}.tmp`, ruta)
}
function leerJson<T>(ruta: string): T | null { try { return JSON.parse(readFileSync(ruta, 'utf8')) as T } catch { return null } }

/** Semana ISO «AAAA-Www» de un día civil (la misma regla que arbrain.ai). */
export function semanaIso(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3)
  const anio = d.getUTCFullYear()
  return `${anio}-W${String(1 + Math.floor((d.getTime() - Date.UTC(anio, 0, 1, 12)) / DIA_MS / 7)).padStart(2, '0')}`
}

/** URL válida para mandar la señal: https (o http solo a la propia máquina, para pruebas). */
export function urlValida(u: unknown): u is string {
  if (typeof u !== 'string') return false
  try {
    const x = new URL(u.trim())
    return x.protocol === 'https:' || (x.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname))
  } catch { return false }
}

/** Versión de la app: la pasa quien lanza el daemon; si no, el package.json de `arbrain/`. */
function versionApp(): string | null {
  const v = (process.env.ARBRAIN_VERSION ?? '').trim()
  if (/^[0-9A-Za-z.+-]{1,32}$/.test(v)) return v
  for (const rel of ['../../../package.json', '../../../../package.json']) {
    const p = leerJson<{ name?: string; version?: string }>(join(dirname(fileURLToPath(import.meta.url)), rel))
    if (p?.name === 'arbrain' && typeof p.version === 'string') return p.version
  }
  return null
}

// ── Lectura de su cerebro (solo conteos y, con permiso, títulos de metas y nombres de hábitos) ──────────────────────

const MARCA = /<!-- arbrain-objectives-v1\s*\n([\s\S]*?)\n-->/
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const sumarDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
const lunes = (dia: string) => sumarDia(dia, -((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7))

/** Título de la meta vigente de cada período: primero el registro de la app, luego lo escrito a mano (mismo formato que objetivos.md). */
export function metasVigentes(contenido: string, hoy: string): Record<'mes' | 'semana' | 'dia', string | null> {
  const out: Record<'mes' | 'semana' | 'dia', string | null> = { mes: null, semana: null, dia: null }
  const clave = { month: 'mes', week: 'semana', day: 'dia' } as const
  try {
    const m = MARCA.exec(contenido)
    const goals = m ? (JSON.parse(m[1]).goals as Array<{ scope: keyof typeof clave; start: string; end: string; title?: string; status?: string }>) : []
    for (const g of goals ?? []) {
      const k = clave[g.scope]
      if (k && !out[k] && g.start <= hoy && hoy < g.end && g.status !== 'dropped' && typeof g.title === 'string' && g.title.trim()) out[k] = g.title.trim()
    }
  } catch { /* registro ilegible: queda lo escrito a mano */ }
  // Formato a mano: «## octubre 2026» › «**Mes:**», «### Semana 19-25» › «**Foco:**», «#### miércoles 21» › «- [ ] …».
  let mes: string | null = null, semana: string | null = null, dia: string | null = null
  for (const linea of contenido.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    if (linea.startsWith('## ')) {
      mes = semana = dia = null
      const x = /^##\s+(\S+)\s+(\d{4})$/.exec(linea.trim())
      if (x && MESES.includes(x[1].toLowerCase())) mes = `${x[2]}-${String(MESES.indexOf(x[1].toLowerCase()) + 1).padStart(2, '0')}`
    } else if (linea.startsWith('### ')) {
      semana = dia = null
      const x = /^###\s+Semana\s+(\d{1,2})/.exec(linea)
      if (mes && x) semana = lunes(`${mes}-${x[1].padStart(2, '0')}`)
    } else if (linea.startsWith('#### ')) {
      const x = /^####\s+\S+\s+(\d{1,2})\b/.exec(linea)
      dia = mes && x ? `${mes}-${x[1].padStart(2, '0')}` : null
    }
    if (mes === hoy.slice(0, 7) && !out.mes && linea.startsWith('**Mes:**')) out.mes = linea.split('**Mes:**')[1].trim() || null
    else if (semana === lunes(hoy) && !out.semana && linea.startsWith('**Foco:**')) out.semana = linea.split('**Foco:**')[1].trim() || null
    else if (dia === hoy && !out.dia && /^- \[[ xX]\]/.test(linea)) out.dia = linea.replace(/^- \[[ xX]\]\s*/, '').trim() || null
  }
  return out
}

interface Habitos { habitos?: Array<{ clave?: string; nombre?: string; activo?: boolean }>; registro?: Record<string, Record<string, { hecho?: boolean | null }>> }
interface Calendario { eventos?: Array<{ actualizado?: string; creado?: string }> }

export class Progreso {
  constructor(
    private readonly db: Database.Database,
    private readonly dir: string = dirDatos(),
    private readonly raiz: () => string = raizCerebro,
    private readonly ahora: () => number = Date.now,
  ) {}

  private get ruta() { return join(this.dir, 'progreso.json') }
  config(): ConfigProgreso | null {
    const c = leerJson<ConfigProgreso>(this.ruta)
    return c && typeof c.token === 'string' && c.token && urlValida(c.url) ? c : null
  }
  private guardar(c: ConfigProgreso) { escribirPrivado(this.ruta, c) }

  conectar(token: unknown, url?: unknown, compartirTexto?: unknown): { ok: true } | { ok: false; error: string } {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,120}$/.test(token.trim())) return { ok: false, error: 'Pega el token tal cual lo copiaste de tu perfil (empieza con arb_).' }
    const u = url === undefined || url === null || url === '' ? URL_POR_OMISION : url
    if (!urlValida(u)) return { ok: false, error: 'La dirección debe empezar con https://.' }
    this.guardar({ token: token.trim(), url: String(u).trim(), compartirTexto: compartirTexto === true })
    return { ok: true }
  }

  ajustes(c: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
    const actual = this.config()
    if (!actual) return { ok: false, error: 'Primero conecta tu token.' }
    if (c.url !== undefined) { if (!urlValida(c.url)) return { ok: false, error: 'La dirección debe empezar con https://.' }; actual.url = String(c.url).trim() }
    if (c.compartir_texto !== undefined) actual.compartirTexto = c.compartir_texto === true
    if (c.manual !== undefined) {
      const m = (c.manual && typeof c.manual === 'object' ? c.manual : {}) as Record<string, unknown>
      const n = (v: unknown) => v === null || v === '' || v === undefined ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10_000 ? Number(v) : NaN
      const ofertas = n(m.ofertas), conversaciones = n(m.conversaciones_venta)
      if (Number.isNaN(ofertas) || Number.isNaN(conversaciones)) return { ok: false, error: 'Ofertas y conversaciones de venta: números enteros.' }
      actual.manual = { semana: semanaIso(diaLocal(this.ahora())), ofertas, conversaciones_venta: conversaciones }
    }
    this.guardar(actual)
    return { ok: true }
  }

  desconectar(): void { if (existsSync(this.ruta)) rmSync(this.ruta) }

  /** La señal exacta que se enviaría ahora. Pura lectura. */
  senal(): Senal {
    const ahora = this.ahora(), hoy = diaLocal(ahora), desde = ahora - 7 * DIA_MS
    const cfg = this.config()
    const texto = cfg?.compartirTexto === true
    const raiz = this.raiz()
    const leer = (rel: string) => { if (!raiz) return null; try { return readFileSync(join(raiz, rel), 'utf8') } catch { return null } }

    const metas = metasVigentes(leer('.claude/plan/objetivos.md') ?? '', hoy)
    const meta = (t: string | null): Meta => (t ? { presente: true, ...(texto ? { texto: t.slice(0, 280) } : {}) } : { presente: false })

    let h: Habitos = {}
    try { h = JSON.parse(leer('.claude/plan/habitos.json') ?? '{}') } catch { /* ilegible: sin hábitos */ }
    const dias7 = Array.from({ length: 7 }, (_, i) => sumarDia(hoy, -i))
    const activos = (h.habitos ?? []).filter(x => x && typeof x.clave === 'string' && x.activo !== false)
    const habitos = activos.slice(0, 20).map(x => ({
      dias_7: dias7.filter(d => h.registro?.[d]?.[x.clave!]?.hecho === true).length,
      ...(texto ? { nombre: String(x.nombre || x.clave).slice(0, 80) } : {}),
    }))

    let conversaciones: number | null = null
    try { conversaciones = (this.db.prepare('SELECT COUNT(DISTINCT conversation_id) AS n FROM chat_runtime_turns WHERE created_at >= ?').get(desde) as { n: number }).n } catch { /* sin journal todavía */ }

    let cal: Calendario | null = null
    try { const t = leer('.claude/plan/calendario.json'); cal = t ? JSON.parse(t) : { eventos: [] } } catch { cal = null }
    const eventos = Array.isArray(cal?.eventos) ? cal!.eventos : null
    const reciente = (s?: string) => typeof s === 'string' && Date.parse(s) >= desde

    let cierres: number | null = null
    try {
      const r = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN tipo = 'cierre' AND creado >= ? THEN 1 ELSE 0 END) AS c FROM cohorte_eventos").get(desde) as { total: number; c: number | null }
      cierres = r.total > 0 ? r.c ?? 0 : null // nunca registró ventas: «sin dato», no cero
    } catch { /* sin tabla */ }
    const manual = cfg?.manual && cfg.manual.semana === semanaIso(hoy) ? cfg.manual : null

    return {
      v: 1, instalado: true, version_app: versionApp(), fecha: hoy, semana: semanaIso(hoy),
      metas: { mes: meta(metas.mes), semana: meta(metas.semana), dia: meta(metas.dia) },
      habitos_activos: activos.length, habitos,
      conversaciones_7d: conversaciones,
      calendario: { eventos_total: eventos ? eventos.length : null, eventos_7d: eventos ? eventos.filter(e => reciente(e?.creado) || reciente(e?.actualizado)).length : null },
      ventas: { ofertas_7d: manual?.ofertas ?? null, conversaciones_venta_7d: manual?.conversaciones_venta ?? null, cierres_7d: cierres },
    }
  }

  /** Lo que ve Ajustes: nunca el token completo. */
  resumen() {
    const c = this.config()
    return {
      conectado: !!c,
      url: c?.url ?? URL_POR_OMISION,
      pista: c ? c.token.slice(0, 8) : null,
      compartir_texto: c?.compartirTexto ?? false,
      manual: c?.manual && c.manual.semana === semanaIso(diaLocal(this.ahora())) ? c.manual : null,
      ultimo_envio: c?.ultimoEnvio ?? null,
      ultimo_resultado: c?.ultimoResultado ?? null,
      expediente: { ultimo: c?.ultimoExpediente ?? null, resultado: c?.expedienteResultado ?? null },
      camino: { ultimo: c?.ultimoCamino ?? null, resultado: c?.caminoResultado ?? null },
      vista_previa: this.senal(),
    }
  }

  /** Envía si: edición cliente + token + URL. `forzar` = «Enviar ahora»; si no, una vez al día. Nunca lanza. */
  async enviar(forzar = false, fetcher: typeof fetch = fetch): Promise<{ resultado: 'no_cliente' | 'sin_conexion' | 'pronto' | 'enviado' | 'rechazado' | 'fallo'; detalle?: string }> {
    if (!esEdicionCliente()) return { resultado: 'no_cliente' }
    const c = this.config()
    if (!c) return { resultado: 'sin_conexion' }
    if (!forzar && c.ultimoEnvio && this.ahora() - c.ultimoEnvio < ESPERA_MS) return { resultado: 'pronto' }
    const senal = this.senal()
    let resultado: 'enviado' | 'rechazado' | 'fallo' = 'fallo', detalle: string | undefined
    try {
      const r = await fetcher(c.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` }, body: JSON.stringify(senal), signal: AbortSignal.timeout(15_000) })
      const j = await r.json().catch(() => ({})) as { error?: unknown }
      if (r.ok) resultado = 'enviado'
      else { resultado = r.status === 401 || r.status === 403 ? 'rechazado' : 'fallo'; detalle = typeof j.error === 'string' ? j.error.slice(0, 200) : `HTTP ${r.status}` }
    } catch (e) { detalle = e instanceof Error ? e.message.slice(0, 200) : 'sin red' }
    const fresca = this.config() // pudo desconectarse mientras se enviaba
    if (fresca) this.guardar({ ...fresca, ultimoIntento: this.ahora(), ultimoResultado: resultado === 'enviado' ? 'enviado' : `${resultado}: ${detalle ?? ''}`.trim(), ...(resultado === 'enviado' ? { ultimoEnvio: this.ahora() } : {}) })
    return detalle ? { resultado, detalle } : { resultado }
  }

  /**
   * Trae el expediente del alumno desde arbrain.ai y lo siembra en su memoria (expediente.ts). Mismas condiciones que
   * enviar: edición cliente + token. Una vez al día salvo `forzar` (al conectar y al arrancar). Nunca lanza.
   * Un 404 (arbrain.ai sin la ruta, o sin expediente) no es error: se anota y se reintenta al día siguiente.
   */
  async traerExpediente(forzar = false, fetcher: typeof fetch = fetch): Promise<{ resultado: 'no_cliente' | 'sin_conexion' | 'sin_cerebro' | 'pronto' | 'sembrado' | 'sin_expediente' | 'rechazado' | 'fallo'; detalle?: string; siembra?: Siembra }> {
    if (!esEdicionCliente()) return { resultado: 'no_cliente' }
    const raiz = this.raiz()
    if (!existeCerebro(raiz)) return { resultado: 'sin_cerebro' }
    const c = this.config()
    if (!c) return { resultado: 'sin_conexion' }
    if (!forzar && c.ultimoExpediente && this.ahora() - c.ultimoExpediente < ESPERA_MS) return { resultado: 'pronto' }
    let out: Awaited<ReturnType<Progreso['traerExpediente']>> = { resultado: 'fallo' }
    try {
      const r = await fetcher(urlExpediente(c.url), { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      const j = await r.json().catch(() => null) as Record<string, unknown> | null
      if (r.status === 401 || r.status === 403) out = { resultado: 'rechazado', detalle: typeof j?.error === 'string' ? j.error.slice(0, 200) : `HTTP ${r.status}` }
      else if (r.status === 404) out = { resultado: 'sin_expediente' }
      else if (!r.ok) out = { resultado: 'fallo', detalle: `HTTP ${r.status}` }
      else {
        const e = validarRemoto(j)
        out = e ? { resultado: 'sembrado', siembra: sembrarExpediente(raiz, e) } : { resultado: 'sin_expediente' }
      }
    } catch (e) { out = { resultado: 'fallo', detalle: e instanceof Error ? e.message.slice(0, 200) : 'sin red' } }
    const fresca = this.config()
    if (fresca) {
      const bien = out.resultado === 'sembrado' || out.resultado === 'sin_expediente'
      const texto = out.siembra ? `sembrado: expediente ${out.siembra.expediente}, meta ${out.siembra.norte}` : `${out.resultado}${out.detalle ? `: ${out.detalle}` : ''}`
      this.guardar({ ...fresca, expedienteResultado: texto, ...(bien ? { ultimoExpediente: this.ahora() } : {}) })
    }
    return out
  }

  /**
   * Trae «mi camino» de arbrain.ai y lo escribe en `project/mi-camino.md` (camino.ts). Mismas condiciones que el
   * expediente. Al conectar y al arrancar va forzado; si no, una vez por mañana (el primer tic del día desde las 5:00
   * locales). Cualquier falla deja el archivo como estaba (lo último guardado); un 404 (arbrain.ai todavía sin la ruta)
   * cuenta como intento del día para no insistir cada hora. Nunca lanza.
   */
  async traerCamino(forzar = false, fetcher: typeof fetch = fetch): Promise<{ resultado: 'no_cliente' | 'sin_conexion' | 'sin_cerebro' | 'pronto' | 'escrito' | 'sin_camino' | 'rechazado' | 'fallo'; detalle?: string; camino?: ResultadoCamino }> {
    if (!esEdicionCliente()) return { resultado: 'no_cliente' }
    const raiz = this.raiz()
    if (!existeCerebro(raiz)) return { resultado: 'sin_cerebro' }
    const c = this.config()
    if (!c) return { resultado: 'sin_conexion' }
    const ahora = this.ahora(), hoy = diaLocal(ahora)
    if (!forzar && (c.caminoDia === hoy || new Date(ahora).getHours() < HORA_MANANA)) return { resultado: 'pronto' }
    let out: Awaited<ReturnType<Progreso['traerCamino']>> = { resultado: 'fallo' }
    try {
      const r = await fetcher(urlCamino(c.url), { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      const j = await r.json().catch(() => null) as Record<string, unknown> | null
      if (r.status === 401 || r.status === 403) out = { resultado: 'rechazado', detalle: typeof j?.error === 'string' ? j.error.slice(0, 200) : `HTTP ${r.status}` }
      else if (r.status === 404) out = { resultado: 'sin_camino' }
      else if (!r.ok) out = { resultado: 'fallo', detalle: `HTTP ${r.status}` }
      else {
        const camino = validarCamino(j, new URL(c.url).origin)
        out = camino ? { resultado: 'escrito', camino: escribirCamino(raiz, camino, hoy).camino } : { resultado: 'fallo', detalle: 'respuesta sin el contrato v1' }
      }
    } catch (e) { out = { resultado: 'fallo', detalle: e instanceof Error ? e.message.slice(0, 200) : 'sin red' } }
    const fresca = this.config()
    if (fresca) {
      const bien = out.resultado === 'escrito'
      const texto = bien ? `escrito: ${out.camino}` : `${out.resultado}${out.detalle ? `: ${out.detalle}` : ''}`
      this.guardar({ ...fresca, caminoResultado: texto, ...(bien || out.resultado === 'sin_camino' ? { caminoDia: hoy } : {}), ...(bien ? { ultimoCamino: ahora } : {}) })
    }
    return out
  }

  /** Al arrancar: adopta lo sembrado a mano con el prompt viejo (archivos fechados). Solo edición cliente. */
  adoptar(): string[] {
    if (!esEdicionCliente() || !existeCerebro(this.raiz())) return []
    try { return adoptarLegado(this.raiz()) } catch { return [] }
  }
}

let instancia: Progreso | null = null
export function iniciarProgreso(db: Database.Database): Progreso { instancia = new Progreso(db); return instancia }
export const progresoDelDaemon = () => instancia
