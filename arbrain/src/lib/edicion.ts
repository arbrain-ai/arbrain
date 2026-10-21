/**
 * Edición de Arbrain (empaquetado para alumnos, 11 oct 2026; docs/builds/empaquetado-2026-10-11/MAPA-WEB.md).
 *
 * Una sola llave: `ARBRAIN_EDICION=cliente`.
 *   - Servidor: la app de escritorio la fija al lanzar Next (se lee en tiempo de ejecución).
 *   - Navegador: `next.config.ts` la hornea como `NEXT_PUBLIC_ARBRAIN_EDICION` al construir.
 * Basta cualquiera de las dos para estar en cliente (falla del lado seguro). Sin ninguna (la instalación de Daniel),
 * todo funciona como siempre.
 *
 * Marcador del repo (carril O, red team A3, 11 oct 2026): la copia del alumno trae `arbrain/EDICION` con `cliente`
 * (lo escribe el generador; el repo de Daniel no lo tiene). En Node, al cargar este módulo, si no hay `ARBRAIN_EDICION`
 * explícita y el marcador existe en la carpeta de trabajo (`EDICION` o `arbrain/EDICION`), se fija
 * `process.env.ARBRAIN_EDICION=cliente`: `npm run dev`, `next start` o un script sobre esta copia nacen cliente sin
 * variables. `next.config.ts` hace lo mismo al construir y hornea el resultado. Un `env` sintético (pruebas) no se toca.
 * Prioridad: variable explícita > marcador > Daniel.
 *
 * Módulo puro (sin imports de node:*): lo importan el proxy, rutas, componentes y tests. El disco se consulta solo
 * con `process.getBuiltinModule` (Node); en el navegador o un runtime sin él, no hace nada.
 */

/** Valor de un marcador de edición: la primera línea que no es comentario (`#`) ni vacía, en minúsculas. */
export function valorMarcador(texto: string): string {
  const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  return (linea ?? '').toLowerCase()
}

/** Rutas del marcador, relativas a la carpeta de trabajo de Next (`arbrain/`) o a la raíz de la copia. */
export const RUTAS_MARCADOR = ['EDICION', 'arbrain/EDICION'] as const

type FsMinimo = { readFileSync(ruta: string, cod: 'utf8'): string }

/** ¿El marcador de la copia dice `cliente`? Solo en Node; en otro runtime, false. `dir` y `fs` son para pruebas. */
export function marcadorCliente(dir?: string, fs?: FsMinimo): boolean {
  try {
    const p = typeof process === 'undefined' ? undefined : process
    const disco = fs ?? (p?.getBuiltinModule?.('node:fs') as FsMinimo | undefined)
    const base = dir ?? (typeof p?.cwd === 'function' ? p.cwd() : '')
    if (!disco || !base) return false
    return RUTAS_MARCADOR.some((r) => {
      try { return valorMarcador(disco.readFileSync(`${base}/${r}`, 'utf8')) === 'cliente' } catch { return false }
    })
  } catch {
    return false
  }
}

/** Sin `ARBRAIN_EDICION` explícita y con marcador `cliente`, la fija en `env`. Devuelve si la fijó. */
export function aplicarMarcador(env: Record<string, string | undefined> = process.env, dir?: string, fs?: FsMinimo): boolean {
  if ((env.ARBRAIN_EDICION ?? '').trim()) return false
  if (!marcadorCliente(dir, fs)) return false
  env.ARBRAIN_EDICION = 'cliente'
  return true
}

if (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') aplicarMarcador()

/** Horneado al construir. Referencia literal para que Next la reemplace en el bundle del navegador. */
const EDICION_HORNEADA = (process.env.NEXT_PUBLIC_ARBRAIN_EDICION ?? '').trim().toLowerCase()

export function esEdicionCliente(env: Record<string, string | undefined> = process.env): boolean {
  if (EDICION_HORNEADA === 'cliente') return true
  return (env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'
}

/** Identidad de la persona en su propia instalación: no es Daniel ni nadie con datos reales. */
export const CORREO_LOCAL_CLIENTE = 'tu@arbrain.local'
export const NOMBRE_LOCAL_CLIENTE = 'Tú'

// ── Lista blanca de la edición cliente ────────────────────────────────────────────────────────────────────────────

/** Páginas que existen en cliente. Lo demás de la app redirige a `/chat`. */
export const PAGINAS_CLIENTE = ['/chat', '/lienzo', '/calendar', '/panel', '/settings', '/bienvenida', '/sin-sesion'] as const

/**
 * APIs que existen en cliente (prefijos exactos de segmento). Lo demás responde 404 desde el proxy: el negocio de
 * Daniel (finanzas, salud, Polar, comunidad, contenido…) y todo lo que solo tiene sentido en su Studio.
 */
export const APIS_CLIENTE = [
  // Chat con su Levy (daemon local + base local).
  '/api/chat/stream', '/api/chat/live', '/api/chat/turn', '/api/chat/interrupt', '/api/chat/answer', '/api/chat/ack',
  '/api/chat/active', '/api/chat/sessions', '/api/chat/complete', '/api/chat/commands', '/api/chat/model',
  '/api/chat/models', '/api/chat/modelos', '/api/chat/modelos-catalogo', '/api/chat/selection', '/api/chat/efforts',
  '/api/chat/limits', '/api/chat/title', '/api/chat/preferencia-motor', '/api/chat/despertadores',
  // Dictado (21 oct 2026): con la llave de Groq del alumno, que vive solo en su daemon. La voz del servidor de Daniel
  // (`/api/chat/tts`) no existe en cliente: «Escuchar» usa la voz del dispositivo.
  '/api/chat/transcribe',
  // Panel y Taller sobre su daemon y su workspace.
  '/api/cabina/memoria', '/api/cabina/contexto', '/api/cabina/archivos', '/api/cabina/explorador',
  '/api/cabina/documento', '/api/cabina/archivero', '/api/cabina/panel', '/api/cabina/panel-ajustes',
  '/api/cabina/panel-terminal', '/api/cabina/terminal',
  // Lienzo local.
  '/api/canvas',
  // Calendario local (21 oct 2026): objetivos, eventos y tareas sobre archivos de su cerebro (lib/planning/local.ts).
  // `/api/planning/crons` queda fuera (APIS_CLIENTE_EXCLUIDAS): es el scheduler de la instalación original.
  '/api/planning',
  // Hábitos locales (21 oct 2026): Calendario › Día, sobre .claude/plan/habitos.json (lib/sistema/habitos-local.ts).
  // `/api/sistema/inteligencia` queda fuera (APIS_CLIENTE_EXCLUIDAS).
  '/api/sistema',
  // Seguridad y primer arranque.
  '/api/manos', '/api/desktop', '/api/local-first/desktop-session', '/api/version', '/api/primer-arranque',
  '/api/confirmaciones', '/api/monitoreo', '/api/local-image', '/api/llaves',
  // Conectar con arbrain.ai (puente de seguimiento, 21 oct 2026): opcional, con token del alumno.
  '/api/progreso',
  // Seguridad del alumno (12 oct 2026): «Lo que hizo Levy», «Pausar todo», carpetas abiertas y tope de gasto.
  '/api/seguridad',
  // Resiliencia (12 oct 2026): «Preparando respuesta» consulta la salud del chat para explicar una espera larga.
  '/api/salud/chat',
] as const

function coincidePrefijo(ruta: string, prefijo: string) {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`)
}

/** Subrutas de un prefijo permitido que aun así no existen en cliente. */
export const APIS_CLIENTE_EXCLUIDAS = ['/api/planning/crons', '/api/sistema/inteligencia'] as const

export function apiPermitidaEnCliente(ruta: string): boolean {
  if (APIS_CLIENTE_EXCLUIDAS.some((p) => coincidePrefijo(ruta, p))) return false
  return APIS_CLIENTE.some((p) => coincidePrefijo(ruta, p))
}

export function paginaPermitidaEnCliente(ruta: string): boolean {
  if (ruta === '/') return true
  return PAGINAS_CLIENTE.some((p) => coincidePrefijo(ruta, p))
}

/**
 * Secciones del «+» del panel que existen en cliente. Calendario (21 oct 2026) lee su pluma local
 * (lib/planning/local.ts); Google Calendar se conecta después como otra fuente. Tareas pide Todoist (conectar después);
 * negocio, finanzas, salud, contenido, equipo, reporte y centro son de Daniel.
 */
export const SECCIONES_PANEL_CLIENTE = ['calendario', 'lienzo', 'explorador', 'taller'] as const

export function seccionPanelPermitida(id: string, cliente = esEdicionCliente()): boolean {
  return !cliente || (SECCIONES_PANEL_CLIENTE as readonly string[]).includes(id)
}

/** Vistas del panel (las que Levy puede abrir con `mostrar`) que existen en cliente. */
export const VISTAS_CLIENTE = ['calendario', 'objetivos', 'lienzo', 'explorador', 'documento', 'memoria'] as const

export function vistaPermitidaEnCliente(vista: string, cliente = esEdicionCliente()): boolean {
  return !cliente || (VISTAS_CLIENTE as readonly string[]).includes(vista)
}
