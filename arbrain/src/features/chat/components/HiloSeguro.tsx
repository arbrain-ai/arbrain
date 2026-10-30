'use client'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportarHilo } from '../lib/hilo-vigia'

/**
 * Error boundary del hilo (12 oct 2026). Si pintar la conversación lanza, el área del chat no queda negra en silencio:
 * dice «No pude mostrar esta conversación» con «Reintentar», y el error va a la bitácora (ver lib/hilo-vigia.ts).
 * Se reinicia solo al cambiar de conversación.
 */
export class HiloSeguro extends Component<{ sessionId: string | null; children: ReactNode }, { error: string | null; intento: number }> {
  state = { error: null as string | null, intento: 0 }

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message || e.name : String(e ?? 'Error desconocido') }
  }

  componentDidCatch(e: unknown, info: ErrorInfo) {
    console.error('[chat] no se pudo pintar la conversación', e)
    reportarHilo({
      tipo: 'render',
      mensaje: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      sesion: this.props.sessionId,
      detalle: { pila: (info.componentStack ?? '').split('\n').slice(0, 8).join('\n') },
    })
  }

  componentDidUpdate(prev: { sessionId: string | null }) {
    if (prev.sessionId !== this.props.sessionId && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return <div key={this.state.intento} className="contents">{this.props.children}</div>
    return (
      <div role="alert" data-hilo-error className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-foreground">No pude mostrar esta conversación</p>
        <p className="max-w-md text-[12px] text-muted">{this.state.error}</p>
        <button
          type="button"
          onClick={() => this.setState((s) => ({ error: null, intento: s.intento + 1 }))}
          className="rounded-full border border-border-subtle bg-card px-3.5 py-1.5 text-[13px] text-foreground hover:bg-card-hover"
        >
          Reintentar
        </button>
      </div>
    )
  }
}
