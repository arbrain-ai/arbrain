'use client'
/**
 * Rastro de un error de pantalla (27 oct 2026). Next no entrega el `componentStack` a `error.tsx`, y en producción React
 * #130 no dice qué componente llegó undefined. Este boundary lo atrapa primero, manda el componentStack al log del
 * Studio (~/Library/Logs/Arbrain/errores-pantalla.jsonl) y vuelve a lanzar el error para que la pantalla de siempre lo
 * muestre. No cambia lo que ve Daniel; solo deja de diagnosticarse a ciegas.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportarErrorDePantalla } from '@/lib/desfase-version'

export class RastroDeError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportarErrorDePantalla(error, 'rastro', info.componentStack ?? null)
  }

  render() {
    // Se lanza una sola vez: si se guardara, «Ir al inicio» (navegación suave, el layout sigue montado) volvería a caer aquí.
    const error = this.state.error
    if (error) { this.state = { error: null }; throw error }
    return this.props.children
  }
}
