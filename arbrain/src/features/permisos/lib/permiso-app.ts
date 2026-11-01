/**
 * Permiso por app (1 nov 2026, opción 1 firmada por Daniel; docs/builds/manos-permiso-por-app-2026-11-01). Lo puro de
 * la tarjeta «Siempre / Solo esta conversación / No»: tipos, cuerpo de la decisión y qué hace el teclado.
 *
 * Teclado (patrón de Cloudroom, v133 «A stray key press can no longer approve»): una tecla suelta nunca aprueba
 * (Enter o Espacio sobre «Siempre» no cuentan: solo un clic real), y Escape es «No», salvo que la persona esté
 * escribiendo en otro campo (el Escape del chat no le niega nada a Levy).
 */
export type DecisionApp = 'siempre' | 'conversacion' | 'no'

/** Lo que manda el daemon (`cliente/permisos-app.ts › PedidoApp`). */
export interface PedidoApp {
  id: string
  app: { clave: string; nombre: string }
  para: string
  conversacion: string | null
  estado: 'pendiente' | 'resuelta' | 'vencida'
  decision?: DecisionApp
  creada: number
}

export interface AppSiempre { clave: string; nombre: string; desde: number }

export const ID_PEDIDO_APP = /^pa_[0-9a-f]{12}$/

export const cuerpoResolverApp = (id: string, decision: DecisionApp) => ({ id, decision })

/** ¿Una decisión que llega de la web es válida? */
export const esDecisionApp = (v: unknown): v is DecisionApp => v === 'siempre' || v === 'conversacion' || v === 'no'

/** Lo que hace una tecla con la tarjeta delante: «no» con Escape (fuera de otro campo de texto), nada con lo demás. */
export function decisionPorTecla(e: { key: string; enCampoAjeno: boolean; repetida?: boolean }): 'no' | null {
  if (e.key !== 'Escape' || e.repetida) return null
  return e.enCampoAjeno ? null : 'no'
}

/** ¿El foco está en un campo de texto que no es de la tarjeta? (El Escape de ahí es de ese campo.) */
export function campoAjeno(objetivo: EventTarget | null, tarjeta: Element | null): boolean {
  const el = objetivo as (Element & { isContentEditable?: boolean }) | null
  if (!el || typeof el.tagName !== 'string') return false
  if (tarjeta && tarjeta.contains(el)) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.isContentEditable
}

/** Frase del para qué: el agente la declara; si no dijo nada, se dice así. */
export const frasePara = (p: Pick<PedidoApp, 'para'>) => p.para ? p.para : 'Levy no dijo para qué.'
