/**
 * La Cabina — modelo compartido del cliente.
 *
 * Una vista viva es una INVOCACIÓN persistida (herramienta `mostrar` de Levy
 * con sus parámetros) que el cliente convierte en un componente real. Nada de
 * HTML guardado: el dato se lee de la fuente cada vez que la vista se monta.
 * Contrato del servidor: arbrain/server/src/cabina/tools.ts.
 */
import type { ChatMessage } from '@/features/chat/hooks/useChat'
import { DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'

export type Vista = 'calendario' | 'objetivos' | 'centro' | 'lienzo' | 'reporte' | 'negocio' | 'trabajos' | 'finanzas' | 'contenido' | 'rutinas' | 'servidores' | 'memoria' | 'equipo' | 'documento' | 'diario' | 'salud' | 'masterclass' | 'explorador' | 'cohorte' | 'casa' | 'perro' | 'historia'
export type SeccionNegocio = 'avatar' | 'oferta' | 'embudo' | 'sistema'
export type Destino = 'calendario' | 'objetivos' | 'hoy' | 'centro' | 'contenido' | 'lienzo' | 'rutinas' | 'finanzas' | 'sfcal' | 'sfmap' | 'reporte' | 'negocio' | 'trabajos'
export type Alcance = 'dia' | 'semana' | 'mes'
/** De quién es el reporte de la mañana (vista diario). */
/** Persona de la vista diario: `DUENO()` o `SEGUNDA()` (config/instalacion.ts › personas). */
export type Quien = string

/** `zona` (2 oct 2026, solo lienzo): lo que la cámara encuadra para que se lea a ancho de panel —
 *  id de un elemento o marco, prefijo de ids (`ht:op`), rectángulo `x,y,ancho,alto` o una frase del lienzo. */
export interface MostrarInput { vista: Vista; alcance?: Alcance; fecha?: string; paginaId?: string; titulo?: string; enfoque?: string; seccion?: SeccionNegocio; agenteId?: number; fijar?: boolean; zona?: string
  /** Vista documento (3 oct 2026): el archivo, y contra qué versión marcar cambios ("HEAD" o otra ruta). */
  ruta?: string; compararCon?: string
  /** Visor único (8 oct 2026): más versiones de un video o imagen, y el segundo en que abre un video o audio. */
  versiones?: string[]; tiempo?: number
  /** Abierto desde el explorador de archivos (8 oct 2026): el código se enseña en solo lectura (lo que muestra Levy no lo lleva).
   *  'previa' = la pestaña de vista previa que el siguiente clic reemplaza (como VS Code); 'fija' = se queda (doble clic). */
  explorador?: 'previa' | 'fija'
  /** Levy quita del panel la pestaña de esta vista. */
  soltar?: boolean
  /** Con `soltar`: el id de la pestaña (el que devuelve `panel listar`); cierra solo esa. */
  pestana?: string
  /** Levy la guardó en el archivero (3 oct 2026): con fijar, la pestaña queda marcada como guardada y no se cierra sola. */
  guardar?: boolean
  /** Vista diario (5 oct 2026): el reporte del dueño (por defecto) o el de la socia. */
  quien?: Quien
  /** Vista casa (27 oct 2026): «tu-casa» abre la casa 3D en «Tu casa» dentro de la pestaña; con `repetir`, la repetición del recorrido. */
  modo?: 'tu-casa'; repetir?: boolean }
export interface AbrirInput { destino: Destino; alcance?: Alcance; fecha?: string; paginaId?: string; zona?: string; motivo?: string }

export type Invocacion =
  | { toolId: string; verbo: 'mostrar'; input: MostrarInput | null; status: 'running' | 'done'; error?: string }
  | { toolId: string; verbo: 'abrir'; input: AbrirInput | null; status: 'running' | 'done'; error?: string }

const VISTAS: readonly Vista[] = ['calendario', 'objetivos', 'centro', 'lienzo', 'reporte', 'negocio', 'trabajos', 'finanzas', 'contenido', 'rutinas', 'servidores', 'memoria', 'equipo', 'documento', 'diario', 'salud', 'masterclass', 'explorador', 'cohorte', 'casa', 'perro', 'historia']
/**
 * ¿Este build sabe pintar esa vista? (27 oct 2026) Una pestaña fijada con `vista: 'historia'` (nacida en una rama en obra y
 * sincronizada a todos los dispositivos) tumbó la app entera: ICONO['historia'] era undefined (React #130). Lo que entra al
 * panel desde fuera (almacén, otras ventanas, el servidor, el bus) pasa por aquí; lo desconocido se ignora, no truena.
 */
export const esVistaConocida = (v: unknown): v is Vista => (VISTAS as readonly unknown[]).includes(v)
const SECCIONES: readonly SeccionNegocio[] = ['avatar', 'oferta', 'embudo', 'sistema']
const DESTINOS: readonly Destino[] = ['calendario', 'objetivos', 'hoy', 'centro', 'contenido', 'lienzo', 'rutinas', 'finanzas', 'sfcal', 'sfmap', 'reporte', 'negocio', 'trabajos']
const ALCANCES: readonly Alcance[] = ['dia', 'semana', 'mes']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE = /^[A-Za-z0-9_-]{1,100}$/

/** `mcp__cabina__mostrar` (Claude) o `cabina_mostrar` (Codex). */
export function verboDe(toolName: string): 'mostrar' | 'abrir' | null {
  const m = /(?:^|__|_)cabina(?:__|_)(mostrar|abrir)$/.exec(toolName)
  return m ? (m[1] as 'mostrar' | 'abrir') : null
}
export const esHerramientaCabina = (toolName: string) => verboDe(toolName) !== null

function parseJson(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null } catch { return null }
}
const str = (v: unknown, max = 280) => typeof v === 'string' && v ? v.slice(0, max) : undefined
const fecha = (v: unknown) => typeof v === 'string' && DATE.test(v) ? v : undefined
const pagina = (v: unknown) => typeof v === 'string' && PAGE.test(v) ? v : undefined
const alcance = (v: unknown) => (ALCANCES as readonly unknown[]).includes(v) ? v as Alcance : undefined

export function parseMostrar(raw: string | undefined): MostrarInput | null {
  const o = parseJson(raw); if (!o || !(VISTAS as readonly unknown[]).includes(o.vista)) return null
  const input: MostrarInput = { vista: o.vista as Vista, alcance: alcance(o.alcance), fecha: fecha(o.fecha), paginaId: pagina(o.paginaId), titulo: str(o.titulo, 120), enfoque: str(o.enfoque),
    seccion: (SECCIONES as readonly unknown[]).includes(o.seccion) ? o.seccion as SeccionNegocio : undefined, agenteId: Number.isInteger(o.agenteId) ? o.agenteId as number : undefined, fijar: o.fijar === true || undefined,
    zona: o.vista === 'lienzo' ? str(o.zona, 120) : undefined,
    ruta: o.vista === 'documento' ? str(o.ruta, 1000)?.trim() : undefined, compararCon: o.vista === 'documento' ? str(o.compararCon, 1000)?.trim() : undefined,
    versiones: o.vista === 'documento' && Array.isArray(o.versiones) ? (o.versiones.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 6).map(x => x.trim().slice(0, 1000))) : undefined,
    tiempo: o.vista === 'documento' && typeof o.tiempo === 'number' && Number.isFinite(o.tiempo) && o.tiempo >= 0 ? o.tiempo : undefined,
    quien: o.vista === 'diario' && (o.quien === DUENO() || o.quien === SEGUNDA()) ? o.quien : undefined,
    modo: o.vista === 'casa' && o.modo === 'tu-casa' ? 'tu-casa' : undefined, repetir: o.vista === 'casa' && o.repetir === true || undefined,
    soltar: o.soltar === true || undefined, pestana: o.soltar === true ? str(o.pestana, 120)?.trim() || undefined : undefined, guardar: o.guardar === true || undefined }
  if (input.vista === 'documento' && !input.ruta) return null
  return input.vista === 'lienzo' && !input.paginaId ? null : input
}
export function parseAbrir(raw: string | undefined): AbrirInput | null {
  const o = parseJson(raw); if (!o || !(DESTINOS as readonly unknown[]).includes(o.destino)) return null
  return { destino: o.destino as Destino, alcance: alcance(o.alcance), fecha: fecha(o.fecha), paginaId: pagina(o.paginaId), zona: str(o.zona, 120), motivo: str(o.motivo, 200) }
}

/** Invocaciones de la cabina de un mensaje, en el orden en que Levy las hizo. */
export function invocacionesDe(msg: Pick<ChatMessage, 'toolCalls' | 'toolInputs' | 'toolOutputs'>): Invocacion[] {
  const out: Invocacion[] = []
  for (const t of msg.toolCalls ?? []) {
    const verbo = verboDe(t.toolName); if (!verbo) continue
    const output = msg.toolOutputs?.[t.toolId]
    const error = output?.isError ? output.content.slice(0, 240) : undefined
    const raw = msg.toolInputs?.[t.toolId]
    if (verbo === 'mostrar') out.push({ toolId: t.toolId, verbo, input: parseMostrar(raw), status: t.status, error })
    else out.push({ toolId: t.toolId, verbo, input: parseAbrir(raw), status: t.status, error })
  }
  return out
}

/**
 * La tarjeta de Trabajos en el chat es para cuando el dueño la pide, no el eco de una delegación (27 oct 2026, captura de
 * las 18:17: «demasiado texto… eso se ve en prima de tool usage»). Si el turno delegó, la delegación ya es una línea del
 * razonamiento con clic al Taller; `mostrar trabajos` en ese turno no pinta tarjeta (fijada en el panel sí se respeta).
 */
export function sinEcoDeDelegar(msg: Pick<ChatMessage, 'toolCalls'>, invs: Invocacion[]): Invocacion[] {
  const delego = (msg.toolCalls ?? []).some(t => /(?:^|__|_)cabina(?:__|_)delegar$|^(Agent|Task)$/.test(t.toolName))
  return delego ? invs.filter(i => !(i.verbo === 'mostrar' && i.input?.vista === 'trabajos' && !i.input.fijar)) : invs
}

// ── Fechas civiles en America/Mexico_City (sin horario de verano desde 2022) ──
export const TZ = 'America/Mexico_City'
export function hoyCivil(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function sumarDias(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function diaSemana(day: string): number { return (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7 } // 0 = lunes
export function inicioMes(day: string) { return day.slice(0, 8) + '01' }
export function finMes(day: string) { const d = new Date(inicioMes(day) + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10) }

/** Rango [desde, hasta) de días civiles que pinta una vista de calendario. */
export function rangoCalendario(a: Alcance, anchor: string): { desde: string; hasta: string } {
  if (a === 'dia') return { desde: anchor, hasta: sumarDias(anchor, 1) }
  if (a === 'semana') { const desde = sumarDias(anchor, -diaSemana(anchor)); return { desde, hasta: sumarDias(desde, 7) } }
  const primero = inicioMes(anchor), desde = sumarDias(primero, -diaSemana(primero))
  const ultimo = sumarDias(finMes(anchor), -1), hasta = sumarDias(ultimo, 7 - diaSemana(ultimo))
  return { desde, hasta }
}
/** La fecha ancla un periodo antes o después (el mes salta por mes civil, no por 30 días). */
export function moverPeriodo(alcance: Alcance, fecha: string, n: -1 | 1): string {
  if (alcance === 'dia') return sumarDias(fecha, n)
  if (alcance === 'semana') return sumarDias(fecha, 7 * n)
  const [a, m] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1 + n, 1))
  return t.toISOString().slice(0, 10)
}

export const isoMx = (day: string) => `${day}T00:00:00-06:00`

export function etiquetaDia(day: string, o: Intl.DateTimeFormatOptions) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('es-MX', { ...o, timeZone: 'UTC' })
}
export function tituloPeriodo(a: Alcance, anchor: string) {
  if (a === 'mes') return etiquetaDia(inicioMes(anchor), { month: 'long', year: 'numeric' })
  if (a === 'dia') return etiquetaDia(anchor, { weekday: 'long', day: 'numeric', month: 'long' })
  const { desde, hasta } = rangoCalendario('semana', anchor)
  return `${etiquetaDia(desde, { day: 'numeric', month: 'short' })} – ${etiquetaDia(sumarDias(hasta, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
}

const HORIZON: Record<Alcance, 'day' | 'week' | 'month'> = { dia: 'day', semana: 'week', mes: 'month' }

/** Ruta web de la superficie completa. Las apps nativas caen a su sección web. */
export function rutaDe(d: { destino: Destino | Vista; alcance?: Alcance; fecha?: string; paginaId?: string; zona?: string; modo?: string; repetir?: boolean }): string {
  const q = (p: Record<string, string | undefined>) => { const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString(); return s ? `?${s}` : '' }
  switch (d.destino) {
    case 'calendario': case 'sfcal': return '/calendar' + q({ date: d.fecha, mode: d.alcance ? HORIZON[d.alcance] : undefined })
    // Objetivos es alias de Calendario (4 oct 2026): la vista unificada, en la escala pedida. «hoy» sigue siendo el tablero de hábitos y reporte de las 08:50.
    case 'objetivos': return '/calendar' + q({ date: d.fecha, mode: HORIZON[d.alcance ?? 'mes'] })
    case 'hoy': return '/calendar' + q({ date: d.fecha, mode: HORIZON[d.alcance ?? 'dia'] })
    case 'centro': return '/finanzas'
    case 'contenido': return '/youtube'
    case 'lienzo': case 'sfmap': return '/lienzo' + q({ p: d.paginaId, z: d.zona })
    case 'rutinas': case 'trabajos': return '/rutinas'
    // Rutinas, Servidores y Memoria viven en el Taller (5 oct 2026): sus rutas redirigen al chat con esa pestaña abierta.
    case 'servidores': return '/servidores'
    case 'memoria': return '/memoria'
    case 'equipo': return '/equipo'
    case 'salud': return '/salud'
    case 'masterclass': return '/masterclass'
    case 'cohorte': return '/cohorte'
    case 'casa': return '/casa' + q({ modo: d.modo, repetir: d.repetir ? '1' : undefined })
    case 'perro': return '/perro'
    // La historia de tu cerebro (27 oct 2026) vive en Taller › Historia desde el 28 oct: /historia redirige ahí.
    case 'historia': return '/chat?panel=taller&taller=historia'
    case 'finanzas': return '/finanzas'
    case 'reporte': return '/api/cabina/reporte/abrir'
    case 'negocio': return '/segundo-cerebro'
    case 'documento': return '/segundo-cerebro'
    case 'diario': return '/chat'
    // El explorador de archivos (8 oct 2026) vive solo en el panel.
    case 'explorador': return '/chat'
  }
}

/**
 * A qué sección de la barra izquierda lleva «expandir» una vista, en la misma fecha, página o zona
 * (3 oct 2026, «Arbrain, una sola app»: el panel acompaña, expandir va a la sección y nada saca de Arbrain).
 * null = no tiene sección propia: el documento ya está completo en su pestaña y los trabajos viven en el Taller.
 */
export function seccionDe(i: Pick<MostrarInput, 'vista' | 'alcance' | 'fecha' | 'paginaId' | 'zona'>): string | null {
  // Rutinas, Memoria y Servidores viven en el Taller (5 oct 2026): no tienen sección propia a la cual expandir.
  if (i.vista === 'documento' || i.vista === 'trabajos' || i.vista === 'servidores' || i.vista === 'rutinas' || i.vista === 'memoria' || i.vista === 'historia' || i.vista === 'diario' || i.vista === 'explorador') return null
  return rutaDe({ destino: i.vista, alcance: i.alcance, fecha: i.fecha, paginaId: i.paginaId, zona: i.zona })
}

export const NOMBRE: Record<Destino | Vista, string> = {
  calendario: 'Calendario', objetivos: 'Objetivos', hoy: 'Hoy', centro: 'Command Center', contenido: 'Contenido',
  lienzo: 'Lienzo', rutinas: 'Rutinas', finanzas: 'Finanzas', sfcal: 'Calendario', sfmap: 'Lienzo',
  reporte: 'Lo que llegó', negocio: 'Tu negocio', trabajos: 'Trabajos en el Studio', servidores: 'Servidores', memoria: 'Memoria', equipo: 'Equipo', documento: 'Documento', diario: 'Reporte diario', salud: 'Salud', masterclass: 'Masterclass', explorador: 'Archivos', cohorte: 'Cohorte', casa: 'Casa', perro: 'Perro', historia: 'Historia',
}

/** Nombre de un documento: el título que le dio Levy o el nombre del archivo. */
export const nombreDocumento = (i: MostrarInput) => i.titulo || (i.ruta ?? '').split('/').pop() || 'Documento'

/** Resumen estático de una invocación (lo que se ve cuando la vista está colapsada). */
export function resumen(i: MostrarInput): string {
  const a = i.alcance ?? (i.vista === 'calendario' ? 'semana' : 'mes'), f = i.fecha ?? hoyCivil()
  if (i.vista === 'calendario' || i.vista === 'objetivos') return `${NOMBRE[i.vista]} · ${tituloPeriodo(a, f)}`
  if (i.vista === 'lienzo') return `Lienzo${i.titulo ? ` · ${i.titulo}` : ''}`
  if (i.vista === 'reporte') return i.titulo ?? 'Lo que llegó'
  if (i.vista === 'negocio') return i.titulo ?? `Tu negocio${i.seccion ? ` · ${i.seccion}` : ''}`
  if (i.vista === 'trabajos') return i.titulo ?? 'Trabajos en el Studio'
  if (i.vista === 'finanzas') return i.titulo ?? 'Finanzas · últimos 30 días'
  if (i.vista === 'contenido') return i.titulo ?? 'Contenido · YouTube'
  if (i.vista === 'rutinas') return i.titulo ?? 'Rutinas · lo que corre solo'
  if (i.vista === 'servidores') return i.titulo ?? 'Computadora · ¿está todo prendido?'
  if (i.vista === 'memoria') return i.titulo ?? 'Memoria · lo que tu cerebro sabe de ti'
  if (i.vista === 'equipo') return i.titulo ?? 'Equipo · quién lleva qué'
  if (i.vista === 'salud') return i.titulo ?? 'Salud · cómo está tu cuerpo hoy'
  if (i.vista === 'masterclass') return i.titulo ?? 'Masterclass · sábado 17 de octubre'
  if (i.vista === 'cohorte') return i.titulo ?? 'Cohorte · la venta y la entrega en vivo'
  if (i.vista === 'casa') return i.titulo ?? 'Casa · el perro y los dispositivos'
  if (i.vista === 'perro') return i.titulo ?? 'Perro · cámara, mapa y STOP'
  if (i.vista === 'historia') return i.titulo ?? 'Historia · lo que cambió en tu cerebro'
  if (i.vista === 'documento') return nombreDocumento(i)
  if (i.vista === 'explorador') return i.titulo ?? 'Archivos · el árbol del repo'
  if (i.vista === 'diario') return i.titulo ?? `${i.quien === SEGUNDA() ? `Reporte de ${NOMBRE_SEGUNDA()}` : 'Reporte diario'} · ${tituloPeriodo('dia', f)}`
  return 'Command Center · el negocio hoy'
}

// ── Navegación dirigida por Levy: solo en el turno vivo de esta pestaña ──
const vivas = new Set<string>()
const ejecutadas = new Set<string>()
/** useChat marca aquí cada `abrir` que nace en streaming. Un historial recargado nunca navega solo. */
export function marcarAbrirVivo(toolId: string) { vivas.add(toolId) }
export function abrirEsVivo(toolId: string) { return vivas.has(toolId) && !ejecutadas.has(toolId) }
export function abrirEjecutado(toolId: string) { ejecutadas.add(toolId) }
