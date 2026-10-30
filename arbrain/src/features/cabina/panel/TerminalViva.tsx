'use client'
/**
 * La terminal VIVA de un agente dentro de Arbrain (panel-claridad, 1 oct 2026).
 *
 * Daniel: «al abrir un subagente me manda a SFTerm; debería poder abrirlo aquí dentro».
 * Arbrain se engancha al motor como un cliente más (ruta `/api/cabina/terminal/[id]`):
 * replay + salida en vivo por SSE, lo que se teclea va al PTY y la terminal toma el
 * ancho del panel. Al cerrarla, la PTY vuelve al tamaño que tenía. SFTerm queda como
 * vista secundaria del mismo motor.
 */
import { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import s from './panel.module.css'

type Estado = { fase: 'conectando' | 'viva' | 'fin' | 'error'; msg?: string; soloLectura?: boolean }

const TEMA = {
  background: '#0d0d12', foreground: '#d4d4d8', cursor: '#a78bfa', cursorAccent: '#0d0d12', selectionBackground: 'rgba(167,139,250,0.3)',
  black: '#18181b', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#d4d4d8',
  brightBlack: '#52525b', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa',
}

const b64 = (t: string) => Uint8Array.from(atob(t), c => c.charCodeAt(0))

export function TerminalViva({ id, onEstado }: { id: number; onEstado?: (e: Estado) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<Estado>({ fase: 'conectando' })
  const [intento, setIntento] = useState(0)
  const avisar = useRef(onEstado); avisar.current = onEstado

  useEffect(() => {
    let vivo = true, es: EventSource | null = null, ro: ResizeObserver | null = null
    let original: { cols: number; rows: number } | null = null, ultimoTam = ''
    let timerTam: ReturnType<typeof setTimeout> | undefined
    let conectado = false
    const cambiar = (e: Estado) => { if (!vivo) return; if (e.fase !== 'conectando') conectado = true; setEstado(e); avisar.current?.(e) }
    // Nunca «Conectando…» para siempre (5 oct 2026, desde la MacBook por el Funnel): a los 25 s se dice y se ofrece reintentar.
    const plazo = setTimeout(() => { if (!conectado) { es?.close(); cambiar({ fase: 'error', msg: 'El Studio no terminó de mandar la terminal en 25 s (¿conexión lenta?).' }) } }, 25_000)
    const url = `/api/cabina/terminal/${id}`
    const post = (cuerpo: Record<string, unknown>, keepalive = false) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), keepalive })
    let limpiar = () => {}

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      if (!vivo || !caja.current) return
      const term = new Terminal({ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 12, lineHeight: 1.2, theme: TEMA, cursorBlink: true, scrollback: 5000, allowProposedApi: false, convertEol: false })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(caja.current)

      // Escritura en orden: una petición a la vez, juntando lo que se teclee mientras tanto.
      let cola = '', enviando = false, soloLectura = false, reproduciendo = true
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
      const entrada = term.onData(d => { if (soloLectura || reproduciendo) return; cola += d; void vaciar() })

      const ajustar = () => {
        if (!original || soloLectura) return
        try { fit.fit() } catch { return }
        const tam = `${term.cols}x${term.rows}`
        if (tam === ultimoTam) return
        ultimoTam = tam
        clearTimeout(timerTam)
        timerTam = setTimeout(() => { void post({ cols: term.cols, rows: term.rows }).catch(() => {}) }, 180)
      }

      let replay: Uint8Array[] = []
      es = new EventSource(url)
      es.onmessage = ev => {
        let m: { t: string; b64?: string; cols?: number; rows?: number; soloLectura?: boolean; msg?: string; codigo?: number | null }
        try { m = JSON.parse(ev.data) } catch { return }
        if (m.t === 'inicio') {
          // Una reconexión vuelve a traer el replay completo: se empieza en limpio.
          term.reset(); replay = []; reproduciendo = true; soloLectura = !!m.soloLectura
        } else if (m.t === 'datos' && m.b64) {
          const bytes = b64(m.b64)
          if (reproduciendo) replay.push(bytes); else term.write(bytes)
        } else if (m.t === 'tamano') {
          // El replay se pinta al tamaño con que se escribió; luego la PTY toma el ancho del panel
          // y el agente se redibuja solo.
          if (!original && m.cols && m.rows) original = { cols: m.cols, rows: m.rows }
          if (m.cols && m.rows) term.resize(m.cols, m.rows)
          for (const b of replay) term.write(b)
          replay = []
          term.write('', () => { reproduciendo = false; ultimoTam = ''; ajustar(); if (!soloLectura) term.focus() })
          cambiar({ fase: 'viva', soloLectura })
        } else if (m.t === 'fin') {
          term.write('\r\n\x1b[2m[la terminal terminó]\x1b[0m\r\n'); es?.close(); original = null; cambiar({ fase: 'fin' })
        } else if (m.t === 'error') {
          es?.close(); cambiar({ fase: 'error', msg: m.msg })
        }
      }
      es.onerror = () => { if (es?.readyState === EventSource.CLOSED) cambiar({ fase: 'error', msg: 'Se perdió la conexión con el Studio.' }) }

      ro = new ResizeObserver(() => ajustar())
      ro.observe(caja.current)
      limpiar = () => {
        entrada.dispose(); term.dispose()
        // La PTY vuelve al tamaño que tenía antes de verla aquí (SFTerm o el lector no se enteran).
        if (original && ultimoTam && ultimoTam !== `${original.cols}x${original.rows}`) void post({ cols: original.cols, rows: original.rows }, true).catch(() => {})
      }
    })()

    return () => { vivo = false; clearTimeout(timerTam); clearTimeout(plazo); es?.close(); ro?.disconnect(); limpiar() }
  }, [id, intento])

  return <div className={s.vivaMarco}>
    <div ref={caja} className={s.viva} aria-label="Terminal en vivo" data-fase={estado.fase} />
    {estado.fase === 'conectando' && <p className={s.vivaVelo}>Conectando con el motor…</p>}
    {estado.fase === 'error' && <div className={s.vivaVelo}>
      <span>{estado.msg ?? 'El motor no respondió.'}</span>
      <button className={s.enlace} onClick={() => { setEstado({ fase: 'conectando' }); setIntento(n => n + 1) }}>Reintentar</button>
    </div>}
  </div>
}
