/**
 * EL SISTEMA NERVIOSO DEL LIENZO (14 oct 2026).
 *
 * Daniel: «no quiero que solo sea un mapa. Quiero que sea el sistema nervioso, de modo que yo al darle clic a una
 * parte… me pueda enviar al VSL2. O dado que corre en mi computadora, incluso poderlo reproducir en el propio
 * frontend. Con la menor latencia posible.»
 *
 * Un nodo del lienzo puede estar CONECTADO a la cosa real que representa. El contrato es declarativo y vive en el
 * propio elemento, junto al `link` de siempre (que sigue siendo el destino de «ir»):
 *
 *   nervio: {
 *     medio?:  { src: 'medio:vsl2/*\/vsl2.mp4' | 'env:HT_VSL2_URL' | 'https://…' | [candidatos en orden], titulo? }
 *     previa?: true          → el `link` (https) se abre en el visor del lienzo, no en el navegador
 *     estado?: { tipo: 'launchd', label: 'com.arbrain.ht-pipeline', resumen? }
 *            | { tipo: 'json', url: 'https://ejemplo.mx/api/ht/huecos', valor: 'quedan', total?: 'tope', formato? }
 *     rotulo?: 'VSL2'        → lo que dice la pastilla
 *     gen?: true             → lo escribió un generador (marca.py lo sigue poseyendo aunque la mano mueva la tarjeta)
 *   }
 *
 * El agente declara QUÉ (la fuente), nunca CÓMO se consulta: el lienzo la pide en lote, con caché del servidor y sin
 * sondeos agresivos (`useNervio`). Lo que no se puede medir se pinta gris, «sin dato», jamás verde ni cero.
 *
 * Puro: sin React, sin DOM y sin red (tests/canvas/nervio.test.ts).
 */

export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'gris'

export type FuenteEstado =
  /** `atraso` (s): silencio máximo del log antes de ámbar. Solo para tareas que escriben en CADA corrida; sin él no se
   *  juzga el atraso (una tarea que solo escribe cuando hay algo que hacer no está atrasada por callar). */
  | { tipo: 'launchd'; label: string; resumen?: string; atraso?: number }
  | { tipo: 'json'; url: string; valor: string; total?: string; formato?: string }

export interface NervioMedio { src: string[]; titulo?: string }

export interface Nervio {
  medio?: NervioMedio
  previa?: boolean
  estado?: FuenteEstado
  rotulo?: string
  gen?: boolean
}

/** Lo que el servidor contesta de una fuente de estado. `texto` es corto (va en la pastilla); `detalle`, el último evento. */
export interface EstadoVivo { semaforo: Semaforo; texto: string; detalle?: string | null; medidoEn: string }

/** Un medio ya resuelto: la URL que el reproductor pide (archivo local servido con Range, o una pública). */
export interface MedioResuelto {
  ok: boolean
  /** `archivo` = del Studio por /api/canvas/nervio/medio/flujo · `url` = video público directo · `embed` = página (SFCast) en iframe. */
  tipo?: 'archivo' | 'url' | 'embed'
  url?: string
  /** El candidato que ganó (para decir de dónde salió). */
  origen?: string
  clase?: 'video' | 'audio'
  duracion?: number | null
  ancho?: number | null
  alto?: number | null
  bytes?: number
  error?: string
}

export interface VivoNervio { estados: ReadonlyMap<string, EstadoVivo>; medios: ReadonlyMap<string, MedioResuelto> }

// ── Validación del contrato (lo que llega de la nube puede venir de cualquier mano o versión) ──

/** Alias de raíz de medios: `medio:<alias>/<ruta>`. El servidor decide a qué carpeta apunta cada alias. */
const ALIAS = /^[a-z0-9][a-z0-9-]{0,40}$/
const LABEL = /^com\.arbrain\.[a-z0-9][a-z0-9.-]{0,80}$/
const ENV = /^[A-Z][A-Z0-9_]{0,60}_URL$/
const RUTA_JSON = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,5}$/

/** Un candidato de medio válido, o null. `medio:` no puede subir con `..` ni traer barras dobles ni nulos. */
export function candidatoMedio(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const v = s.trim()
  if (!v || v.length > 500 || v.includes('\0')) return null
  if (v.startsWith('env:')) return ENV.test(v.slice(4)) ? v : null
  if (v.startsWith('https://')) { try { return new URL(v).protocol === 'https:' ? v : null } catch { return null } }
  if (v.startsWith('medio:')) {
    const partes = v.slice(6).split('/')
    if (partes.length < 2 || !ALIAS.test(partes[0])) return null
    if (partes.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) return null
    // Un solo comodín por segmento y solo `*` («el más reciente»): nada de expresiones.
    if (partes.slice(1).some(p => p.includes('*') && p !== '*')) return null
    return v
  }
  return null
}

export function fuenteValida(f: unknown): FuenteEstado | null {
  if (!f || typeof f !== 'object') return null
  const o = f as Record<string, unknown>
  if (o.tipo === 'launchd') {
    if (typeof o.label !== 'string' || !LABEL.test(o.label)) return null
    const r: FuenteEstado = { tipo: 'launchd', label: o.label }
    if (typeof o.resumen === 'string' && o.resumen.trim() && o.resumen.length <= 80) r.resumen = o.resumen.trim()
    if (typeof o.atraso === 'number' && o.atraso >= 60 && o.atraso <= 30 * 86400) r.atraso = Math.round(o.atraso)
    return r
  }
  if (o.tipo === 'json') {
    if (typeof o.url !== 'string' || typeof o.valor !== 'string' || !RUTA_JSON.test(o.valor)) return null
    let u: URL
    try { u = new URL(o.url) } catch { return null }
    if (u.protocol !== 'https:') return null
    const r: FuenteEstado = { tipo: 'json', url: u.href, valor: o.valor }
    if (typeof o.total === 'string' && RUTA_JSON.test(o.total)) r.total = o.total
    if (typeof o.formato === 'string' && o.formato.length <= 80) r.formato = o.formato
    return r
  }
  return null
}

/** El `nervio` de un elemento, saneado. Nunca lanza: lo inválido se descarta por partes (un nodo a medias sigue vivo). */
export function leerNervio(raw: unknown): Nervio | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const n: Nervio = {}
  const m = o.medio as Record<string, unknown> | undefined
  if (m && typeof m === 'object') {
    const lista = (Array.isArray(m.src) ? m.src : [m.src]).map(candidatoMedio).filter((s): s is string => !!s).slice(0, 6)
    if (lista.length) {
      n.medio = { src: lista }
      if (typeof m.titulo === 'string' && m.titulo.trim()) n.medio.titulo = m.titulo.trim().slice(0, 80)
    }
  }
  if (o.previa === true) n.previa = true
  const e = fuenteValida(o.estado)
  if (e) n.estado = e
  if (typeof o.rotulo === 'string' && o.rotulo.trim()) n.rotulo = o.rotulo.trim().slice(0, 48)
  if (o.gen === true) n.gen = true
  return n.medio || n.previa || n.estado || n.rotulo ? n : null
}

/** Llave estable de una fuente (el mismo objeto declarado en dos nodos se consulta UNA vez). */
export function claveFuente(f: FuenteEstado): string {
  return f.tipo === 'launchd'
    ? `launchd|${f.label}|${f.resumen ?? ''}|${f.atraso ?? ''}`
    : `json|${f.url}|${f.valor}|${f.total ?? ''}|${f.formato ?? ''}`
}
export const claveMedio = (m: NervioMedio) => m.src.join('|')

/** Las fuentes y medios únicos de una página (lo que el lienzo pide en lote). */
export function necesidades(elements: readonly { nervio?: unknown }[]): { fuentes: FuenteEstado[]; medios: NervioMedio[] } {
  const f = new Map<string, FuenteEstado>(), m = new Map<string, NervioMedio>()
  for (const e of elements) {
    const n = leerNervio(e.nervio)
    if (!n) continue
    if (n.estado) f.set(claveFuente(n.estado), n.estado)
    if (n.medio) m.set(claveMedio(n.medio), n.medio)
  }
  return { fuentes: [...f.values()], medios: [...m.values()] }
}

// ── Lo que dice la pastilla ──

export type AccionNervio = 'medio' | 'previa' | 'enlace' | 'estado'

/** ¿Qué hace un clic? El medio manda (es lo más directo), luego la vista previa del enlace, luego ir; si solo hay estado, enseña su detalle. */
export function accionDe(n: Nervio | null, link: string | undefined): AccionNervio | null {
  const conLink = !!link?.trim()
  if (n?.medio) return 'medio'
  if (n?.previa && conLink && /^https:\/\//i.test(link!.trim())) return 'previa'
  if (conLink) return 'enlace'
  if (n?.estado) return 'estado'
  return null
}

/** 717.1 → «11:57»; 3725 → «1:02:05». */
export function duracionTexto(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s) || s <= 0) return null
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

/** «hace 2 min», «hace 3 h», «hace 2 días»; null si no hay fecha. */
export function haceTexto(ms: number | null | undefined, ahora: number): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  const s = Math.max(0, Math.round((ahora - ms) / 1000))
  if (s < 45) return 'hace segundos'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 36) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

export interface RotuloNervio {
  /** Texto completo de la pastilla (sin glifos: el motor los dibuja aparte). */
  completo: string
  /** Lo mínimo cuando no cabe: el rótulo corto o nada (queda el punto y el glifo). */
  corto: string
  glifo: 'play' | 'previa' | null
  semaforo: Semaforo | null
}

const FLECHA = ' ↗'

/**
 * La pastilla de un nodo con nervio. `etiquetaEnlace` es la del destino normal (model/enlace.ts) para no inventar
 * otra frase cuando el nodo solo «va». El estado (si lo hay) va primero: es lo que cambia y lo que se lee de lejos.
 */
export function rotuloDe(n: Nervio, accion: AccionNervio, vivo: VivoNervio | undefined, etiquetaEnlace: string | null): RotuloNervio {
  const est = n.estado ? vivo?.estados.get(claveFuente(n.estado)) : undefined
  const semaforo: Semaforo | null = n.estado ? (est?.semaforo ?? 'gris') : null
  const estadoTxt = n.estado ? (est?.texto ?? 'midiendo…') : null
  let accionTxt: string
  let glifo: RotuloNervio['glifo'] = null
  if (accion === 'medio') {
    const m = n.medio ? vivo?.medios.get(claveMedio(n.medio)) : undefined
    const dur = m?.ok ? duracionTexto(m.duracion) : null
    accionTxt = [n.rotulo ?? n.medio?.titulo ?? 'Reproducir', m && !m.ok ? 'sin archivo' : dur].filter(Boolean).join(' · ')
    glifo = 'play'
  } else if (accion === 'previa') {
    accionTxt = (n.rotulo ?? 'Vista previa')
    glifo = 'previa'
  } else if (accion === 'enlace') {
    accionTxt = n.rotulo ? n.rotulo + FLECHA : (etiquetaEnlace ?? 'Abrir' + FLECHA)
  } else {
    accionTxt = n.rotulo ?? ''
  }
  const completo = [accion === 'estado' ? accionTxt : null, estadoTxt, accion === 'estado' ? null : accionTxt].filter(Boolean).join(' · ')
  return { completo, corto: n.rotulo ? n.rotulo + (accion === 'enlace' ? FLECHA : '') : '', glifo, semaforo }
}

/** Colores del semáforo: los mismos tintes verde/ámbar/rojo del estándar, legibles en claro y oscuro. */
export const COLOR_SEMAFORO: Record<Semaforo, string> = { verde: '#2FA36B', ambar: '#D99A2B', rojo: '#E5483B', gris: '#9A93A8' }

/** Formato del valor de una fuente json: «{valor} de {total} libres». Sin formato: «30 de 40» o «30». */
export function formatear(f: Extract<FuenteEstado, { tipo: 'json' }>, valor: unknown, total: unknown): string | null {
  const v = typeof valor === 'number' || typeof valor === 'string' ? String(valor) : null
  if (v == null) return null
  const t = typeof total === 'number' || typeof total === 'string' ? String(total) : null
  if (f.formato) return f.formato.replace('{valor}', v).replace('{total}', t ?? '?')
  return t != null ? `${v} de ${t}` : v
}

/** Lee `a.b.c` de un objeto. */
export function leerRuta(obj: unknown, ruta: string): unknown {
  let cur: unknown = obj
  for (const k of ruta.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

// ── launchd: el semáforo honesto de una tarea programada ──

export interface LecturaLaunchd {
  cargado: boolean
  codigo: number | null
  corriendo: boolean
  /** Silencio máximo declarado (s); null = no se juzga el atraso. */
  atrasoS: number | null
  /** mtime del log de salida (última corrida que escribió) y del de errores. */
  ultima: number | null
  error: number | null
  bytesError: number
  linea: string | null
}

/**
 * Rojo: no está cargada o su última salida no fue 0. Ámbar: lleva más del silencio declarado (`atraso`) sin escribir
 * o escribió errores después de su última salida buena. Verde: cargada y sana; el texto dice cuándo fue su último evento.
 * El atraso solo se juzga si se declara: hay tareas que solo escriben cuando tienen algo que hacer (medido el 14 oct:
 * ht-agenda-confirmar corre cada 2 min y su log callaba desde hacía 2 días sin estar rota).
 * Gris: no hay forma de saberlo (sin log). Un proceso cargado no prueba que produzca: por eso manda el log.
 */
export function evaluarLaunchd(l: LecturaLaunchd, ahora: number): Omit<EstadoVivo, 'medidoEn'> {
  if (!l.cargado) return { semaforo: 'rojo', texto: 'no está cargada', detalle: 'launchctl no la conoce: no corre.' }
  if (l.codigo != null && l.codigo !== 0 && !l.corriendo) return { semaforo: 'rojo', texto: `falló (código ${l.codigo})`, detalle: l.linea }
  if (l.ultima == null) return { semaforo: 'gris', texto: 'sin corridas registradas', detalle: null }
  const limite = l.atrasoS ? l.atrasoS * 1000 : null
  const hace = haceTexto(l.ultima, ahora)!
  if (limite != null && ahora - l.ultima > limite) return { semaforo: 'ambar', texto: `sin correr ${hace.replace('hace ', 'desde hace ')}`, detalle: l.linea }
  if (l.error != null && l.bytesError > 0 && l.error > l.ultima + 1000 && (limite == null || ahora - l.error < limite)) {
    return { semaforo: 'ambar', texto: `errores ${haceTexto(l.error, ahora)}`, detalle: l.linea }
  }
  return { semaforo: 'verde', texto: l.corriendo ? 'corriendo ahora' : hace, detalle: l.linea }
}

/** `launchctl list <label>` → lo que importa. Sin la línea de PID, no corre ahora. */
export function leerLaunchctl(salida: string): { codigo: number | null; pid: number | null } {
  const c = /"LastExitStatus"\s*=\s*(-?\d+);/.exec(salida)
  const p = /"PID"\s*=\s*(\d+);/.exec(salida)
  return { codigo: c ? Number(c[1]) : null, pid: p ? Number(p[1]) : null }
}
