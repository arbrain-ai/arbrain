/**
 * Lo puro de Ajustes › Teléfono y Ajustes › Máquinas sin Tailscale (3 nov 2026): textos del estado, horas, nombres de
 * máquina y los pasos de la hoja de instalación. Sin React (lo prueba tests/servidor/conectar-ui.test.ts).
 */

export interface TelefonoConSesion { id: string; maquina: string; nombreMaquina?: string; agente: string; creada: number; vista: number }

export interface EstadoConectar {
  estado: 'listo' | 'conectando' | 'apagado' | 'revocada' | 'sin-modo-servidor' | 'servidor-viejo' | 'error' | string
  url?: string | null
  desde?: string | null
  ultimoError?: string | null
  reintentoEn?: string | null
  relay?: string | null
  telefonos?: TelefonoConSesion[]
  maquina?: { nombre: string; tipo: string }
  desdeTelefono?: boolean
  porRelay?: boolean
  error?: string
}

export interface Maquina { handle: string; nombre: string; tipo: string; url: string; esta: boolean; conectada: boolean; desde: number | null; vista: number | null }

/** «9:14» (hoy) o «2 nov, 9:14» (otro día). */
export function horaCorta(cuando: string | number | null | undefined, conDia = false, ahora = new Date()): string {
  if (cuando === null || cuando === undefined) return ''
  const d = new Date(cuando)
  if (Number.isNaN(d.getTime())) return ''
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
  const mismoDia = d.toDateString() === ahora.toDateString()
  if (mismoDia || !conDia) return hora
  return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${hora}`
}

export function textoEstadoConectar(e: EstadoConectar, ahora = new Date()): { titulo: string; detalle: string | null; tono: 'ok' | 'alerta' | 'neutro' } {
  switch (e.estado) {
    case 'listo': return { titulo: e.desde ? `Listo desde las ${horaCorta(e.desde, true, ahora)}` : 'Listo', detalle: null, tono: 'ok' }
    case 'conectando': return { titulo: 'Conectando…', detalle: e.ultimoError ?? null, tono: 'alerta' }
    case 'revocada': return { titulo: 'Esta máquina salió de tu cuenta', detalle: e.ultimoError ?? 'Vuelve a encenderlo para darla de alta.', tono: 'alerta' }
    case 'apagado': return { titulo: 'Apagado', detalle: 'Enciéndelo y aparece el QR para tu teléfono.', tono: 'neutro' }
    case 'sin-modo-servidor': return { titulo: 'Solo con Arbrain en modo servidor', detalle: null, tono: 'neutro' }
    case 'servidor-viejo': return { titulo: 'Actualiza Arbrain', detalle: null, tono: 'alerta' }
    default: return { titulo: e.error ?? 'No disponible', detalle: null, tono: 'alerta' }
  }
}

export function tipoDeMaquina(tipo: string): string {
  return tipo === 'mac' ? 'Mac' : tipo === 'windows' ? 'PC con Windows' : tipo === 'servidor' ? 'Tu servidor' : 'Linux'
}

export function estadoDeMaquina(m: Maquina, ahora = new Date()): string {
  if (m.conectada) return m.desde ? `Lista desde las ${horaCorta(m.desde, true, ahora)}` : 'Lista'
  return m.vista ? `Sin conexión · se vio ${horaCorta(m.vista, true, ahora)}` : 'Sin conexión todavía'
}

export type Plataforma = 'ios' | 'android' | 'otro'

export function plataformaDe(ua: string): Plataforma {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'otro'
}

/** La hoja de instalación: los pasos para dejar tu Levy como app en la pantalla de inicio. */
export function pasosInstalar(p: Plataforma): string[] {
  if (p === 'ios') return [
    'Toca el botón Compartir (el cuadro con la flecha hacia arriba), abajo en Safari.',
    'Baja y elige «Agregar a pantalla de inicio».',
    'Toca «Agregar». Queda como «Tu Arbrain», con tu sesión adentro.',
  ]
  if (p === 'android') return [
    'Toca el menú ⋮ de Chrome, arriba a la derecha.',
    'Elige «Instalar app» (o «Agregar a la pantalla principal»).',
    'Confirma. Queda como «Tu Arbrain», con tu sesión adentro.',
  ]
  return ['En el menú de tu navegador, elige «Instalar» o «Agregar a la pantalla de inicio».']
}
