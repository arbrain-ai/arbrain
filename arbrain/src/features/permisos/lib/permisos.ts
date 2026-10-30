// Centro de permisos de macOS: puente con src-tauri/src/permisos.rs.
// Consultar nunca muestra diálogos; pedir solo ocurre por un clic o cuando una función lo
// necesita en ese momento (`asegurarPermiso`), y solo si macOS aún no decidió.
import { isDesktopRuntime } from '@/lib/local-first/runtime'

export type PermisoId =
  | 'microfono' | 'voz' | 'accesibilidad' | 'pantalla' | 'automatizacion'
  | 'entrada' | 'notificaciones' | 'disco' | 'camara'

export type EstadoPermiso = 'concedido' | 'denegado' | 'pendiente' | 'restringido' | 'sin_dato'

export interface Permiso {
  id: PermisoId
  estado: EstadoPermiso
  detalle: string | null
  sePuedePedir: boolean
}

export interface Identidad {
  ruta: string | null
  identificador: string | null
  autoridad: string | null
  firma: 'estable' | 'cambia' | 'desconocida'
  requisito: string | null
}

export interface EstadoPermisos {
  soportado: boolean
  bundleId: string | null
  permisos: Permiso[]
  app: Identidad
  motor: Identidad | null
}

export interface FichaPermiso {
  titulo: string
  para: string
  grupo: 'voz' | 'operar' | 'avisos' | 'sin_uso'
}

/** Qué es y para qué lo usa Arbrain, en una línea. El orden de aquí es el de la pantalla. */
export const FICHAS: Record<PermisoId, FichaPermiso> = {
  microfono: { titulo: 'Micrófono', para: 'Hablarle a Levy y dictar notas de voz en el chat.', grupo: 'voz' },
  voz: { titulo: 'Reconocimiento de voz', para: 'Escuchar «Oye Levy» y transcribir lo que dices.', grupo: 'voz' },
  accesibilidad: { titulo: 'Accesibilidad', para: 'Que Levy opere otras apps por ti: clics, teclas y ventanas.', grupo: 'operar' },
  pantalla: { titulo: 'Grabación de pantalla', para: 'Que Levy vea lo que tienes abierto cuando le pides ayuda con ello.', grupo: 'operar' },
  automatizacion: { titulo: 'Automatización', para: 'Controlar System Events y Chrome con AppleScript para tareas repetidas.', grupo: 'operar' },
  entrada: { titulo: 'Monitoreo de entrada', para: 'Atajos de teclado globales aunque Arbrain no esté al frente.', grupo: 'operar' },
  notificaciones: { titulo: 'Notificaciones', para: 'Avisarte cuando un agente termina o un cron necesita tu decisión.', grupo: 'avisos' },
  disco: { titulo: 'Acceso total al disco', para: 'Leer tus carpetas (Documentos, Escritorio, Descargas) sin preguntar una por una.', grupo: 'avisos' },
  camara: { titulo: 'Cámara', para: 'Sin uso hoy: Arbrain no la pide.', grupo: 'sin_uso' },
}

/**
 * Ficha tal como se muestra en esta edición. En la edición cliente estos permisos son de la app Arbrain y la app no
 * opera la Mac con ellos: computer use (0.1.2) corre en una pieza aparte, «ArbrainManos», que pide Accesibilidad y
 * Grabación de pantalla a su nombre la primera vez que lo enciendes. Por eso para Arbrain van a «Sin uso» y no se
 * ofrece «Permitir» (darlos aquí no enciende nada). La instalación original los ve como siempre.
 */
export const PARA_OPERAR_EN_CLIENTE = 'Arbrain no lo usa: computer use lo pide a nombre de «ArbrainManos» la primera vez que lo enciendes.'

export function fichaEnEdicion(id: PermisoId, cliente: boolean): FichaPermiso {
  const f = FICHAS[id]
  if (cliente && f.grupo === 'operar') return { ...f, para: PARA_OPERAR_EN_CLIENTE, grupo: 'sin_uso' }
  return f
}

export const GRUPOS: Array<{ id: FichaPermiso['grupo']; titulo: string }> = [
  { id: 'voz', titulo: 'Para hablar con Levy' },
  { id: 'operar', titulo: 'Para que Levy opere tu Mac' },
  { id: 'avisos', titulo: 'Avisos y archivos' },
  { id: 'sin_uso', titulo: 'Sin uso' },
]

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core')
  return api.invoke<T>(command, args)
}

export function permisosDisponibles() {
  return isDesktopRuntime()
}

export function leerPermisos() {
  return invoke<EstadoPermisos>('permisos_estado')
}

export function abrirPanel(id: PermisoId | 'gestion_apps') {
  return invoke<void>('permisos_abrir', { id })
}

export function pedirPermiso(id: PermisoId) {
  return invoke<Permiso>('permisos_pedir', { id })
}

/**
 * Justo a tiempo: la función que necesita un permiso la llama en el momento de usarlo.
 * Sin decidir → un solo diálogo de macOS. Negado → abre su panel exacto en Ajustes del
 * Sistema (macOS no vuelve a preguntar). Fuera del escritorio no hace nada.
 */
export async function asegurarPermiso(id: PermisoId): Promise<boolean> {
  if (!permisosDisponibles()) return true
  try {
    const estado = await leerPermisos()
    const actual = estado.permisos.find((p) => p.id === id)
    if (!actual || actual.estado === 'concedido' || actual.estado === 'sin_dato') return true
    if (actual.sePuedePedir) return (await pedirPermiso(id)).estado === 'concedido'
    if (actual.estado === 'denegado') await abrirPanel(id)
    return false
  } catch {
    // Un puente caído no debe bloquear la función: el diálogo propio del sistema decide.
    return true
  }
}
