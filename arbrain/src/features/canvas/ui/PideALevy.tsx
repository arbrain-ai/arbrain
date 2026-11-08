'use client'

/**
 * «Pídele a Levy» dentro del lienzo (7 nov 2026). Una píldora en la esquina; al tocarla se abre una caja: lo que escribas va
 * al chat con el nombre y el id de este lienzo (`state/pide-a-levy.ts`), por el mismo cable que el visor (`cabina:enviar`).
 * En el chat (el lienzo en el panel) se manda ahí mismo; desde la sección Lienzo se vacía el autoguardado y el router lleva al
 * chat, que manda el pedido pendiente al montar (`cabina:pendiente`, como el Taller). Una navegación completa no sirve: el
 * `replaceState` del lienzo la cancela en WebKit. Enter manda, Mayús+Enter salta
 * de renglón, Esc cierra. Se oculta desde «Mostrar en el lienzo» (para grabar).
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Sparkles } from 'lucide-react'
import type { Theme } from '../theme/tokens'
import { mensajeLienzo } from '../state/pide-a-levy'
import { useRouter } from 'next/navigation'

export function PideALevy({ theme: t, paginaId, nombre, abajo, angosto, antesDeIr }: {
  theme: Theme; paginaId: string; nombre: string; abajo: number; angosto: boolean
  /** Lo que el lienzo debe guardar antes de dejar la sección (el autoguardado pendiente). */
  antesDeIr?: () => Promise<unknown>
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const caja = useRef<HTMLTextAreaElement>(null)
  const oscuro = t.name === 'oscuro'

  useEffect(() => { if (abierto) caja.current?.focus() }, [abierto])
  useEffect(() => { if (!aviso) return; const r = setTimeout(() => setAviso(null), 2600); return () => clearTimeout(r) }, [aviso])
  // Otro lienzo, otra conversación: lo escrito para el anterior no se arrastra.
  useEffect(() => { setTexto(''); setAbierto(false) }, [paginaId])

  const enviar = async () => {
    const m = mensajeLienzo({ texto, paginaId, nombre })
    if (!m) return
    setTexto(''); setAbierto(false)
    if (window.location.pathname.startsWith('/chat')) {
      window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: m } }))
      setAviso('Va al chat con este lienzo')
      return
    }
    try { sessionStorage.setItem('cabina:pendiente', m) } catch { /* sin almacenamiento */ }
    await antesDeIr?.().catch(() => {})
    router.push('/chat')
  }

  const sombra = oscuro ? '0 12px 32px rgba(0,0,0,.55)' : '0 12px 32px rgba(15,15,25,.14)'
  const base: React.CSSProperties = {
    position: 'absolute', right: angosto ? 10 : 14, bottom: abajo, zIndex: 35,
    background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`, boxShadow: sombra,
    font: '600 12.5px CanvasSans, system-ui', color: t.text.body,
  }
  const parar = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onWheel: (e: React.WheelEvent) => e.stopPropagation() }

  if (!abierto) return <div style={{ ...base, display: 'flex', alignItems: 'center', borderRadius: 999, padding: 3 }} {...parar}>
    {aviso && <span role="status" style={{ padding: '0 6px 0 10px', color: t.text.caption, font: '500 12px CanvasSans, system-ui' }}>{aviso}</span>}
    <button type="button" data-pide-a-levy onClick={() => setAbierto(true)} title="Pídele a Levy algo sobre este lienzo"
      style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px 0 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: 'transparent', color: t.text.title, font: '650 12.5px CanvasSans, system-ui' }}>
      <Sparkles size={14} color={t.accent} aria-hidden /> Pídele a Levy
    </button>
  </div>

  return <form role="dialog" aria-label="Pídele a Levy" {...parar}
    onSubmit={e => { e.preventDefault(); void enviar() }}
    style={{ ...base, width: angosto ? 'calc(100% - 20px)' : 'min(440px, calc(100% - 28px))', borderRadius: 14, padding: 10, borderColor: t.accent }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 2px 8px', color: t.text.caption, font: '600 11px CanvasSans, system-ui', letterSpacing: '.06em', textTransform: 'uppercase' }}>
      <Sparkles size={12} color={t.accent} aria-hidden /> Pídele a Levy
      {nombre && <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={nombre}>{nombre}</span>}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <textarea ref={caja} value={texto} rows={2} aria-label="Lo que quieres que Levy haga en este lienzo"
        placeholder="Arma la clase del lunes con estos tres bloques…"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar() }
        }}
        style={{ flex: 1, minWidth: 0, resize: 'none', maxHeight: 120, border: 'none', outline: 'none', background: 'transparent', color: t.text.body, font: '500 14px CanvasSans, system-ui', lineHeight: 1.4 }} />
      <button type="submit" disabled={!texto.trim()} aria-label="Mandar a Levy" title="Mandar (Enter)"
        style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: 'none', display: 'grid', placeItems: 'center',
          cursor: texto.trim() ? 'pointer' : 'default', background: texto.trim() ? t.accent : t.roles.sticky.fill, color: texto.trim() ? '#fff' : t.text.caption }}>
        <ArrowUp size={16} aria-hidden />
      </button>
    </div>
  </form>
}
