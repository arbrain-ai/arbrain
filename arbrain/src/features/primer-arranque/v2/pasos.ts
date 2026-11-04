/**
 * Pasos del onboarding v2 (3 nov 2026, SPEC en docs/builds/onboarding-v2-2026-11-03). Módulo puro: sin React ni red.
 *
 * Cuatro pasos con lenguaje de negocio, en el orden de Cloudroom v140 (Sign in → Connect an agent → Connect GitHub →
 * Import your work), adaptados a un agente estratega: entra, conecta tu agente, conecta tus herramientas y trae tu
 * negocio. Nada de lo que decide el primer arranque de hoy se pierde: `DESTINO_V1` dice dónde vive cada paso viejo y
 * la prueba lo exige. Lo legal y la autonomía siguen siendo clickwrap (casillas que nacen vacías).
 */
import type { Paso } from '../lib/pasos'

export const PASOS_V2 = ['entra', 'agente', 'herramientas', 'negocio'] as const
export type PasoV2 = typeof PASOS_V2[number]

export const TITULO_V2: Record<PasoV2, string> = {
  entra: 'Entra a Arbrain',
  agente: 'Conecta tu agente',
  herramientas: 'Conecta tus herramientas',
  negocio: 'Trae tu negocio',
}

/** Lo que dice el riel izquierdo de cada paso que aún no llega (en Cloudroom: «Your Cloudroom account», «Last step»…). */
export const RIEL_V2: Record<PasoV2, string> = {
  entra: 'Tu cuenta, con Google',
  agente: 'Claude Code o Codex',
  herramientas: 'Calendario y correo',
  negocio: 'El último paso',
}

/** Dónde vive en v2 cada paso del primer arranque de hoy. Si un paso viejo no tiene destino, la prueba falla. */
export const DESTINO_V1: Record<Paso, { en: PasoV2 | 'inicio' | 'ajustes'; como: string }> = {
  bienvenida: { en: 'entra', como: 'El nombre sale de tu cuenta de Google y se puede corregir ahí mismo.' },
  legal: { en: 'entra', como: 'Casilla bajo el botón de entrar, con la misma versión de los textos (clickwrap).' },
  llaves: { en: 'agente', como: 'Tu suscripción por el login propio de Claude Code; OpenRouter y la llave quedan en «Otras formas».' },
  autonomia: { en: 'agente', como: '«Cómo trabaja tu socio»: Autónomo recomendado con sus dos casillas vacías, y que use tu pantalla.' },
  monitoreo: { en: 'negocio', como: 'Solo si el build tiene a dónde enviar; viene apagado.' },
  donde: { en: 'inicio', como: 'La casilla «Tu socio en tu teléfono» de «Empieza aquí»; los tres caminos siguen en Ajustes.' },
  listo: { en: 'inicio', como: 'La pantalla «Tu socio estratega» reemplaza a «Todo listo».' },
}

export interface EstadoAgente { instalado: boolean; conectado: boolean; plan?: string | null }

export interface EstadoV2 {
  cuenta: { email: string; nombre: string | null } | null
  legal: boolean
  agentes: { claude: EstadoAgente; codex: EstadoAgente }
  /** Autonomía lista: un nivel que no es Autónomo, o Autónomo con sus dos casillas (o ya aceptado). */
  autonomia: boolean
  herramientas: { calendario: boolean; correo: boolean; github: boolean }
  /** Lo que la persona eligió traer: conversaciones, carpetas y lo que contó con sus palabras. */
  negocio: { chats: number; carpetas: number; contado: boolean }
}

export const ESTADO_V2_VACIO: EstadoV2 = {
  cuenta: null,
  legal: false,
  agentes: { claude: { instalado: false, conectado: false }, codex: { instalado: false, conectado: false } },
  autonomia: false,
  herramientas: { calendario: false, correo: false, github: false },
  negocio: { chats: 0, carpetas: 0, contado: false },
}

/** El botón de cada paso: su texto, si se puede pulsar y si es lo recomendado (tecla ámbar) o la salida discreta. */
export interface Accion { texto: string; habilitada: boolean; discreta: boolean; porque?: string }

export const algunAgente = (e: EstadoV2) => e.agentes.claude.conectado || e.agentes.codex.conectado

/** El agente por defecto: Claude si está conectado (el chat de Arbrain corre sobre Claude Code), si no Codex. */
export function agentePorDefecto(e: EstadoV2): 'claude' | 'codex' | null {
  return e.agentes.claude.conectado ? 'claude' : e.agentes.codex.conectado ? 'codex' : null
}

export function accionDe(paso: PasoV2, e: EstadoV2): Accion {
  switch (paso) {
    case 'entra':
      if (!e.cuenta) return { texto: 'Continuar', habilitada: false, discreta: false, porque: 'Entra con Google para seguir' }
      return e.legal
        ? { texto: 'Continuar', habilitada: true, discreta: false }
        : { texto: 'Continuar', habilitada: false, discreta: false, porque: 'Marca la casilla de los textos para seguir' }
    case 'agente':
      if (!algunAgente(e)) return { texto: 'Lo conecto después', habilitada: true, discreta: true, porque: 'Sin agente, tu socio no podrá responder' }
      return e.autonomia
        ? { texto: 'Continuar', habilitada: true, discreta: false }
        : { texto: 'Continuar', habilitada: false, discreta: false, porque: 'Marca las dos casillas o elige otro nivel' }
    case 'herramientas': {
      const alguna = e.herramientas.calendario || e.herramientas.correo || e.herramientas.github
      return alguna ? { texto: 'Continuar', habilitada: true, discreta: false } : { texto: 'Lo hago después', habilitada: true, discreta: true }
    }
    case 'negocio': {
      const algo = e.negocio.chats > 0 || e.negocio.carpetas > 0 || e.negocio.contado
      return algo ? { texto: 'Armar mi expediente', habilitada: true, discreta: false } : { texto: 'Empezar en blanco', habilitada: true, discreta: true }
    }
  }
}

/** Hasta qué paso se puede saltar desde el riel: los ya pasados y el siguiente al último que se pudo continuar. */
export function alcanzables(e: EstadoV2): PasoV2[] {
  const fuera: PasoV2[] = []
  for (const p of PASOS_V2) {
    fuera.push(p)
    const a = accionDe(p, e)
    if (!a.habilitada) break
  }
  return fuera
}
