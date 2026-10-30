import { capital, DUENO, instalacion, NOMBRE_DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'
/**
 * Equipo (5 oct 2026, el dueño: «ya somos dos perfiles; quiero un panel para monitorear el negocio desde arriba, un
 * organigrama (pienso contratar en el futuro), con mi foto y la de la socia»).
 *
 * Lógica pura del organigrama, sin React, para probarla sola (tests/cabina/equipo-modelo.test.ts). Quién es quién y qué
 * le llega sale de las fuentes que ya existen: el reporte de las 09:00 de cada uno (arbrain/server/scripts/analytics/
 * reportes_matutinos.py), la campana (`avisos` por usuario) y el gabinete firmado el 28 ago (features/live/agents.ts).
 * Es la vista de administrador del dueño para ver el negocio desde arriba (5 oct 07:50: La socia ve lo mismo que él; sin
 * modos ni permisos por persona). Los puestos describen quién lleva qué, no dan ni quitan acceso.
 */

export const DUENO_ID = instalacion().idPerfilDueno
export const SEGUNDA_ID = instalacion().idPerfilSecundario

/** Lo que devuelve /api/equipo por cada persona con cuenta en Arbrain. Ausente = sin dato, nunca cero. */
export interface PersonaVivo {
  id: string
  nombre: string
  avatar: string | null
  /** Último inicio de sesión (auth). */
  entro: string | null
  /** Última conversación tocada en Arbrain (chat_sessions.updated_at). */
  conversacion: string | null
  /** Avisos de su campana sin leer; null = no se pudo leer. */
  sinLeer: number | null
  ultimoAviso: { titulo: string; en: string } | null
  /** ¿Tiene el teléfono suscrito al push? null = no se pudo leer. */
  push: boolean | null
}
export interface AgenteVivo { id: 'levy' | 'trinity' | 'sensei'; ultima: string | null }
export interface FotoEquipo { personas: PersonaVivo[]; agentes: AgenteVivo[]; leidoEn: string; errores: string[] }

export interface Puesto {
  clave: string
  nombre: string
  rol: string
  /** Lo que le llega cada día (reporte y avisos). */
  recibe: string[]
  responsabilidades: string[]
}

/** Las dos personas del organigrama: `dueno` y `segunda` (nombres y claves de config/instalacion.ts › personas). */
export const PUESTOS: Record<'dueno' | 'segunda', Puesto & { id: string }> = {
  dueno: {
    clave: DUENO(), id: DUENO_ID, nombre: capital(NOMBRE_DUENO()), rol: 'Dueño',
    recibe: ['Reporte de las 09:00: dinero de ayer, embudo del lanzamiento, tu día y la decisión pendiente', 'Avisos de la campana: rutinas, servidores y lo que pide tu firma'],
    responsabilidades: ['Decide y firma: oferta, precio y estrategia', 'Contenido en cámara', 'Dirección de los agentes'],
  },
  segunda: {
    clave: SEGUNDA(), id: SEGUNDA_ID, nombre: capital(NOMBRE_SEGUNDA()), rol: 'Administración y Comunidad',
    recibe: ['Reporte de las 09:00 a su teléfono: comunidad sin respuesta, miembros nuevos, quién dejó de entrar y comentarios de YouTube por aprobar', 'Avisos de su campana'],
    responsabilidades: ['Opera la comunidad: bienvenidas, respuestas y seguimiento', 'Soporte y correo', 'Aprueba comentarios y publica contenido ya firmado'],
  },
}

export const AGENTES_EQUIPO: Record<AgenteVivo['id'], { nombre: string; rol: string; recibe: string; responsabilidades: string[] }> = {
  levy: { nombre: 'Levy', rol: 'Estrategia y YouTube', recibe: 'Tus mensajes del chat y las rutinas del Studio', responsabilidades: ['Arma los reportes de las 09:00', 'Estrategia, guiones y plan del mes', 'Corre los crons y avisa lo que falla'] },
  trinity: { nombre: 'Trinity', rol: 'Gmail, Calendario, Drive y Casa', recibe: 'Lo que le pidas al cambiar de agente en el chat', responsabilidades: ['Agenda y calendario', 'Correo y archivos', 'Lo doméstico'] },
  sensei: { nombre: 'Sensei', rol: 'Código', recibe: 'Lo que le pidas al cambiar de agente en el chat', responsabilidades: ['Arbrain y las apps', 'Builds y despliegues por Git'] },
}

/** El último movimiento de alguien: lo más reciente entre entrar y tocar una conversación. */
export function ultimoMovimiento(p: Pick<PersonaVivo, 'entro' | 'conversacion'>): { en: string; que: 'entro' | 'conversacion' } | null {
  const a = p.entro ? Date.parse(p.entro) : NaN, b = p.conversacion ? Date.parse(p.conversacion) : NaN
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null
  if (!Number.isFinite(b) || (Number.isFinite(a) && a >= b)) return { en: p.entro!, que: 'entro' }
  return { en: p.conversacion!, que: 'conversacion' }
}

/** «hace 5 min», «hace 3 h», «ayer 21:40», «2 oct». Hora y día civiles de Ciudad de México. */
export function hace(iso: string, ahora = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'sin dato'
  const min = Math.max(0, Math.round((ahora - t) / 60_000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (min < 12 * 60) return `hace ${Math.round(min / 60)} h`
  const dia = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(ms)
  const hora = new Date(t).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false })
  if (dia(t) === dia(ahora)) return `hoy ${hora}`
  if (dia(t) === dia(ahora - 86_400_000)) return `ayer ${hora}`
  return new Date(t).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' }).replace('.', '')
}

/** La persona viva de un puesto, o null si no llegó en la lectura. */
export const personaDe = (foto: FotoEquipo | undefined, id: string) => foto?.personas.find(p => p.id === id) ?? null

/** Una línea para el resumen del hilo: quién se movió último. */
export function resumenEquipo(foto: FotoEquipo | undefined): string | null {
  if (!foto) return null
  const partes = (['dueno', 'segunda'] as const).map(k => {
    const p = personaDe(foto, PUESTOS[k].id), m = p && ultimoMovimiento(p)
    return `${PUESTOS[k].nombre} ${m ? hace(m.en) : 'sin dato'}`
  })
  return `Equipo · ${partes.join(' · ')}`
}
