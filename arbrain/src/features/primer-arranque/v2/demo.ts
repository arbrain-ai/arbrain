/**
 * Datos de la vista previa del onboarding v2 (3 nov 2026). Son de EJEMPLO y lo dicen: una persona inventada («Fulano»),
 * cifras inventadas. Sirven para recorrer el flujo y para las capturas sin daemon ni cuentas. Lo que el prototipo sí
 * lee de verdad con `?vivo=1` (la sesión de Claude Code y cuántas conversaciones hay) no pasa por aquí.
 */
import type { EstadoAgente } from './pasos'
import type { Senales } from './empieza-aqui'

export const CUENTA_DEMO = { email: 'fulano@ejemplo.com', nombre: 'Fulano' } as const

export const AGENTES_DEMO: { claude: EstadoAgente; codex: EstadoAgente } = {
  claude: { instalado: true, conectado: false, plan: 'max' },
  codex: { instalado: true, conectado: false, plan: null },
}

export interface Hallazgos {
  chats: { claude: number; codex: number; proyectos: number; dias: number }
  carpetas: { nombre: string; hace: string }[]
}

export const HALLAZGOS_DEMO: Hallazgos = {
  chats: { claude: 37, codex: 12, proyectos: 6, dias: 30 },
  carpetas: [
    { nombre: 'Propuestas clientes', hace: 'hace 2 días' },
    { nombre: 'Mi oferta 2026', hace: 'hace 5 días' },
  ],
}

/** Señales de «Empieza aquí» de ejemplo: el expediente ya se armó (la casilla de tu camino espera tu confirmación). */
export const SENALES_DEMO: Senales = { camino: true }

/** Lo que el expediente de ejemplo sabe para saludar en «Tu socio estratega». */
export const META_DEMO = { texto: '3,000 USD al mes', para: 'el 24 de enero' } as const

export const esDemo = (q: URLSearchParams) => q.get('vivo') !== '1'
