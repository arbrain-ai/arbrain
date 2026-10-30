'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, Loader2, Check, MessageSquarePlus, SlidersHorizontal } from 'lucide-react'
import { useAjustes } from '@/shared/stores/ajustes-store'
import type { ChatAccount, ChatTab, TabOption } from '../stores/account-store'
import { ChatAccountTabs } from './ChatAccountTabs'
import {
  cabeEnConversacion, catalogoDeRespaldo, esModeloActual, modelosDelSelector, precioPorMillon,
  type Catalogo, type ModeloCatalogo,
} from '@/features/modelo/catalogo-modelos'

interface Props {
  onSelect: (modelo: ModeloCatalogo) => void
  onClose: () => void
  /** Espacio de la conversación abierta (Claude, o el de un modelo por OpenRouter). */
  account?: ChatAccount | null
  /** Modelo que corre la conversación abierta (el del encabezado). */
  modeloActual?: string | null
  /** ¿La conversación abierta ya tiene mensajes? Solo entonces cambiar de motor «abre una nueva»: vacía, solo cambia. */
  conversacionConMensajes?: boolean
  /** Cuentas entre las que elegir (Tú, bro-claude, codex, yt): viven aquí, junto al modelo (4 oct 2026). */
  cuentas?: TabOption[]
  onCuenta?: (cuenta: ChatTab) => void
}

// Selector único de modelos (2 oct 2026, pedido de Daniel): los modelos encendidos en Configuración → Modelos,
// Claude (suscripción) arriba y OpenRouter abajo, con su precio por millón. Claude cambia de modelo dentro de la
// conversación; un modelo de otro motor abre una conversación nueva en su espacio, y la fila lo dice antes de tocarla.
export function ModelPicker({ onSelect, onClose, account, modeloActual, conversacionConMensajes = false, cuentas, onCuenta }: Props) {
  const espacio = account ?? 'default'
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetch('/api/chat/modelos-catalogo', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (r.ok && Array.isArray(data.modelos)) return { catalogo: data as Catalogo, aviso: null }
        // 404: el servidor del chat corre la versión anterior. El selector sigue con Claude mientras se reinicia.
        if (r.status !== 404) throw new Error(data.error ?? `No se pudo cargar el catálogo (${r.status})`)
        const viejo = await fetch('/api/chat/models', { cache: 'no-store', signal: controller.signal }).then((x) => x.json()).catch(() => ({}))
        return { catalogo: catalogoDeRespaldo(Array.isArray(viejo.models) ? viejo.models : []), aviso: 'Los modelos por OpenRouter llegan cuando se reinicie el servidor del chat.' }
      })
      .then(({ catalogo, aviso }) => {
        if (!active) return
        setCatalogo(catalogo); setAviso(aviso); setLoading(false)
      })
      .catch((e) => {
        if (!active || controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'No hubo respuesta del servidor'); setLoading(false)
      })
    return () => { active = false; controller.abort() }
  }, [])

  const grupos = useMemo(() => modelosDelSelector(catalogo), [catalogo])
  const filas = useMemo(() => [...grupos.claude, ...grupos.openrouter], [grupos])

  // El teclado arranca en el modelo activo.
  useEffect(() => {
    const i = filas.findIndex((m) => esModeloActual(m, espacio, modeloActual))
    if (i >= 0) setSelectedIndex(i)
  }, [filas, espacio, modeloActual])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (loading || !filas.length) return
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(0, i - 1)); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(filas.length - 1, i + 1)); return }
      if (e.key === 'Enter') { e.preventDefault(); const m = filas[selectedIndex]; if (m) onSelect(m) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filas, selectedIndex, onSelect, onClose, loading])

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>('[data-model]')[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const fila = (m: ModeloCatalogo, i: number) => {
    const activa = i === selectedIndex
    const actual = esModeloActual(m, espacio, modeloActual)
    const nueva = conversacionConMensajes && !cabeEnConversacion(m, espacio)
    const precio = precioPorMillon(m)
    return (
      <li key={m.id} data-model={m.id}>
        <button
          type="button"
          aria-pressed={actual}
          onFocus={() => setSelectedIndex(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(m)}
          className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${activa ? 'bg-brand/[0.08]' : 'hover:bg-card-hover'}`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${actual ? 'bg-brand/20 text-brand-ink' : 'bg-card-active text-muted'}`}>
            <Cpu size={15} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="flex items-baseline gap-2">
              <span className={`text-[13px] font-semibold ${activa || actual ? 'text-foreground' : 'text-foreground/80'}`}>{m.nombre}</span>
              {m.via === 'openrouter' && precio && <span className="text-[10px] font-mono text-muted/70 tabular-nums" title="USD por millón de tokens: entrada / salida (OpenRouter)">{precio}</span>}
            </span>
            {nueva ? (
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-ink">
                <MessageSquarePlus size={11} aria-hidden /> Otro motor: abre una conversación nueva
              </span>
            ) : (
              <span className={`block text-[11px] truncate mt-0.5 ${activa ? 'text-muted' : 'text-muted/80'}`}>{m.descripcion}</span>
            )}
          </div>
          {actual && <Check size={14} className="shrink-0 text-brand-ink" aria-label="Modelo activo" />}
        </button>
      </li>
    )
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Elegir modelo"
      aria-busy={loading}
      data-selector-modelos
      className="absolute bottom-full left-0 mb-2 w-full bg-card/96 backdrop-blur-xl border border-border rounded-2xl shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.35),0_-16px_48px_rgba(0,0,0,0.75)] overflow-hidden z-50"
    >
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border-subtle bg-card/40">
        <div className="w-4 h-4 rounded-md bg-brand/15 flex items-center justify-center">
          <Cpu size={9} className="text-brand-ink" />
        </div>
        <span className="text-[10px] text-muted uppercase tracking-widest font-semibold">Modelo</span>
        <span className="ml-auto text-[9px] text-muted/60 hidden sm:block font-mono">↑↓ · Enter · Esc</span>
      </div>

      {/* Con una sola cuenta (edición cliente) no hay selector que mostrar. */}
      {cuentas && cuentas.length > 1 && onCuenta && (
        <div className="px-2.5 py-2 border-b border-border-subtle" data-selector-cuentas>
          <span className="block px-1 pb-1 text-[10px] uppercase tracking-widest text-muted/60">Cuenta</span>
          <ChatAccountTabs options={cuentas} active={espacio} onSelect={onCuenta} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-muted/80">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Cargando modelos…</span>
        </div>
      ) : !filas.length ? (
        <div className="py-4 px-3.5 text-center">
          <p className="text-xs text-muted/80">{error ? 'No se pudieron cargar los modelos' : 'No hay modelos encendidos'}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted/60">{error ?? 'Enciéndelos en Configuración → Modelos.'}</p>
        </div>
      ) : (
        <ul ref={listRef} className="py-1 max-h-[22rem] overflow-y-auto overscroll-contain">
          {grupos.claude.length > 0 && <li aria-hidden className="px-3.5 pt-1.5 pb-0.5 text-[10px] uppercase tracking-widest text-muted/60">Claude · tu suscripción</li>}
          {grupos.claude.map((m, i) => fila(m, i))}
          {grupos.openrouter.length > 0 && <li aria-hidden className="px-3.5 pt-2.5 pb-0.5 text-[10px] uppercase tracking-widest text-muted/60 border-t border-border-subtle mt-1">OpenRouter · pagas por uso, $ por millón</li>}
          {grupos.openrouter.map((m, i) => fila(m, grupos.claude.length + i))}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-border-subtle px-3.5 py-2 text-[11px] text-muted">
        {aviso ? <span className="flex-1 leading-snug">{aviso}</span> : <span className="flex-1" />}
        <button type="button" onClick={() => { onClose(); useAjustes.getState().abrir('modelo') }} className="flex min-h-9 items-center gap-1 font-medium hover:text-foreground/85">
          <SlidersHorizontal size={11} aria-hidden /> Más modelos
        </button>
      </div>
    </div>
  )
}
