'use client'
/**
 * Una terminal real (PTY del motor de Arbrain) dentro del panel inferior (⌘J, 2 oct 2026).
 *
 * Mismo cable que `TerminalViva` (ruta `/api/cabina/terminal/[id]`: replay + salida en vivo por SSE,
 * entrada y tamaño por POST) pero pensada para vivir montada aunque el panel esté oculto: mientras no
 * se ve no ajusta el tamaño (la caja mide 0) y al volver a verse se reajusta. A diferencia del visor
 * de agentes, aquí la PTY es del panel: no se le devuelve un "tamaño original" al desmontar.
 */
import { useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import s from './terminal.module.css'
import { conEnlaces } from './enlaces'

export const TEMA_TERMINAL = {
  background: '#0d0d12', foreground: '#d4d4d8', cursor: '#a78bfa', cursorAccent: '#0d0d12', selectionBackground: 'rgba(167,139,250,0.3)',
  black: '#18181b', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#d4d4d8',
  brightBlack: '#52525b', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa',
}
export const FUENTE = { family: "ui-monospace, 'SF Mono', Menlo, monospace", size: 12, lineHeight: 1.2 }

/** Las terminales montadas, para dar el foco desde fuera (⌘J, cambiar de pestaña). */
const montadas = new Map<number, Terminal>()
export const enfocarTerminal = (id: number | null) => { if (id != null) montadas.get(id)?.focus() }
export const hayFocoEnTerminal = () => !!document.activeElement?.closest?.('[data-terminal-panel]')

type Fase = 'conectando' | 'viva' | 'error'
const b64 = (t: string) => Uint8Array.from(atob(t), c => c.charCodeAt(0))

export function PtyPanel({ id, visible, activa, onFin, onTitulo }: {
  id: number
  /** El panel está abierto. */
  visible: boolean
  /** Esta es la pestaña en primer plano. */
  activa: boolean
  onFin: (id: number) => void
  onTitulo: (id: number, titulo: string) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const [fase, setFase] = useState<{ f: Fase; msg?: string }>({ f: 'conectando' })
  const [intento, setIntento] = useState(0)
  const ajustarRef = useRef<() => void>(() => {})
  const visibleRef = useRef(visible && activa); visibleRef.current = visible && activa
  const cb = useRef({ onFin, onTitulo }); cb.current = { onFin, onTitulo }

  useEffect(() => {
    let vivo = true, es: EventSource | null = null, ro: ResizeObserver | null = null
    let ultimoTam = '', timerTam: ReturnType<typeof setTimeout> | undefined
    const url = `/api/cabina/terminal/${id}`
    const post = (cuerpo: Record<string, unknown>) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    let limpiar = () => {}

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      if (!vivo || !caja.current) return
      const term = new Terminal({ fontFamily: FUENTE.family, fontSize: FUENTE.size, lineHeight: FUENTE.lineHeight, theme: TEMA_TERMINAL, cursorBlink: true, scrollback: 5000, allowProposedApi: false, macOptionIsMeta: false })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(caja.current)
      const enlaces = conEnlaces(term)
      montadas.set(id, term)
      // ⌘J lo atiende la app (alternar el panel): xterm no lo procesa, el evento sigue burbujeando.
      term.attachCustomKeyEventHandler(e => !(e.metaKey && e.code === 'KeyJ'))
      const titulo = term.onTitleChange(t => cb.current.onTitulo(id, t))

      // Escritura en orden: una petición a la vez, juntando lo que se teclee mientras tanto.
      let cola = '', enviando = false, reproduciendo = true
      const vaciar = async () => {
        if (enviando || !cola) return
        enviando = true
        const datos = cola; cola = ''
        try {
          const r = await post({ datos })
          if (!r.ok) { const j = await r.json().catch(() => ({})); term.write(`\r\n\x1b[33m[${j.error ?? 'el motor no aceptó la entrada'}]\x1b[0m\r\n`) }
        } catch { term.write('\r\n\x1b[33m[sin conexión con el Studio]\x1b[0m\r\n') }
        enviando = false
        if (cola) void vaciar()
      }
      // Durante el replay xterm contesta preguntas viejas de la terminal: esas respuestas no se mandan.
      const entrada = term.onData(d => { if (reproduciendo) return; cola += d; void vaciar() })

      const ajustar = () => {
        const el = caja.current
        if (!el || !visibleRef.current || el.clientWidth < 40 || el.clientHeight < 24) return
        try { fit.fit() } catch { return }
        const tam = `${term.cols}x${term.rows}`
        if (tam === ultimoTam) return
        ultimoTam = tam
        clearTimeout(timerTam)
        timerTam = setTimeout(() => { void post({ cols: term.cols, rows: term.rows }).catch(() => {}) }, 120)
      }
      ajustarRef.current = ajustar

      let replay: Uint8Array[] = []
      es = new EventSource(url)
      es.onmessage = ev => {
        let m: { t: string; b64?: string; cols?: number; rows?: number; msg?: string }
        try { m = JSON.parse(ev.data) } catch { return }
        if (m.t === 'inicio') {
          term.reset(); replay = []; reproduciendo = true
        } else if (m.t === 'datos' && m.b64) {
          const bytes = b64(m.b64)
          if (reproduciendo) replay.push(bytes); else term.write(bytes)
        } else if (m.t === 'tamano') {
          // El replay se pinta al tamaño con que se escribió; luego la PTY toma el del panel.
          if (m.cols && m.rows) term.resize(m.cols, m.rows)
          for (const b of replay) term.write(b)
          replay = []
          term.write('', () => { reproduciendo = false; ultimoTam = ''; ajustar(); setFase({ f: 'viva' }); if (visibleRef.current) term.focus() })
        } else if (m.t === 'fin') {
          es?.close(); cb.current.onFin(id)
        } else if (m.t === 'error') {
          es?.close(); setFase({ f: 'error', msg: m.msg })
        }
      }
      es.onerror = () => { if (es?.readyState === EventSource.CLOSED) setFase({ f: 'error', msg: 'Se perdió la conexión con el Studio.' }) }

      ro = new ResizeObserver(() => ajustar())
      ro.observe(caja.current)
      limpiar = () => { entrada.dispose(); titulo.dispose(); enlaces.dispose(); if (montadas.get(id) === term) montadas.delete(id); ajustarRef.current = () => {}; term.dispose() }
    })()

    return () => { vivo = false; clearTimeout(timerTam); es?.close(); ro?.disconnect(); limpiar() }
  }, [id, intento])

  // Al verse (abrir el panel o cambiar de pestaña) se reajusta: mientras estuvo oculta medía 0.
  useEffect(() => {
    if (!visible || !activa) return
    const r = requestAnimationFrame(() => { ajustarRef.current(); enfocarTerminal(id) })
    return () => cancelAnimationFrame(r)
  }, [visible, activa, id])

  return <div className={s.cuerpoPty} hidden={!activa} data-fase={fase.f}>
    <div ref={caja} className={s.xterm} aria-label="Terminal" />
    {fase.f === 'conectando' && <p className={s.velo}>Conectando con el motor…</p>}
    {fase.f === 'error' && <div className={s.velo}>
      <span>{fase.msg ?? 'El motor no respondió.'}</span>
      <button className={s.enlace} onClick={() => { setFase({ f: 'conectando' }); setIntento(n => n + 1) }}>Reintentar</button>
    </div>}
  </div>
}
