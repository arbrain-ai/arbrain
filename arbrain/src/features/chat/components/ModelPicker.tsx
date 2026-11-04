'use client'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Loader2, Check, MessageSquarePlus, SlidersHorizontal } from 'lucide-react'
import { useAjustes } from '@/shared/stores/ajustes-store'
import type { ChatAccount, ChatTab, TabOption } from '../stores/account-store'
import { CuentasSegmentadas } from './CuentasSegmentadas'
import { PopoverAnclado } from '@/shared/components/PopoverAnclado'
import css from './model-picker.module.css'
import { esEdicionCliente } from '@/lib/edicion'
import { PermisosEnModelo } from '@/features/seguridad/components/PermisosEnModelo'
import {
  cabeEnConversacion, catalogoDeRespaldo, esModeloActual, modelosDelSelector, precioPorMillon,
  type Catalogo, type ModeloCatalogo,
} from '@/features/modelo/catalogo-modelos'

// Edición cliente (30 oct 2026): el menú también trae el modo de permisos y «Pausar todo» (antes, píldora y botón flotantes).
const EDICION_CLIENTE = esEdicionCliente()
/** Ancho del popover y su tope estético (px CSS); la altura real la limita el espacio visible. */
const ANCHO_POPOVER = 392
const ALTO_IDEAL = 520

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
  /** El chip que lo abre: el popover se ancla a él (1 nov 2026). Sin chip, al borde de la ventana. */
  ancla?: RefObject<HTMLElement | null>
}

// Selector único de modelos (2 oct 2026, pedido de Daniel): los modelos encendidos en Configuración → Modelos,
// Claude (suscripción) arriba y OpenRouter abajo, con su precio por millón. Claude cambia de modelo dentro de la
// conversación; un modelo de otro motor abre una conversación nueva en su espacio, y el grupo lo dice antes de tocarla.
// Rediseño (1 nov 2026, «lo siento muy tosco… a veces se sale de pantalla»): popover compacto anclado al chip. La
// colocación (lado, altura, zoom de la app, hoja en móvil) es la de todos los popovers de la barra: PopoverAnclado.
export function ModelPicker({ onSelect, onClose, account, modeloActual, conversacionConMensajes = false, cuentas, onCuenta, ancla }: Props) {
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
  // Sin filtro (3 nov 2026): su fila se ve aun sin llave, deshabilitada con el motivo; el teclado no se detiene en ella.
  const filas = useMemo(() => [...grupos.claude, ...grupos.openrouter, ...grupos.abliterated], [grupos])

  // El teclado arranca en el modelo activo.
  useEffect(() => {
    const i = filas.findIndex((m) => esModeloActual(m, espacio, modeloActual))
    if (i >= 0) setSelectedIndex(i)
  }, [filas, espacio, modeloActual])

  useEffect(() => {
    // El chip que lo abre no cuenta como «fuera»: su clic lo cierra (alterna).
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && !ancla?.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, ancla])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Con el foco en Autónomo/Preguntar o «Pausar todo», Enter es de ese botón, no del modelo marcado.
      if (e.target instanceof Element && e.target.closest('[data-permisos-modelo]')) return
      if (loading || !filas.length) return
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(0, i - 1)); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(filas.length - 1, i + 1)); return }
      if (e.key === 'Enter') { e.preventDefault(); const m = filas[selectedIndex]; if (m?.disponible) onSelect(m) }
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
    const precio = m.via !== 'suscripcion' ? precioPorMillon(m) : null
    const sinFiltro = m.via === 'abliterated'
    return (
      <li key={m.id} data-model={m.id}>
        <button
          type="button"
          aria-pressed={actual}
          data-activa={activa || undefined}
          data-sin-filtro={sinFiltro || undefined}
          disabled={!m.disponible}
          title={!m.disponible ? (m.motivo ?? 'No disponible') : nueva ? 'Otro motor: abre una conversación nueva' : undefined}
          onFocus={() => setSelectedIndex(i)}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => { if (!activa) setSelectedIndex(i) }}
          onClick={() => onSelect(m)}
          className={css.fila}
        >
          <span className="min-w-0 flex-1">
            <span className={css.nombre}>{m.nombre}{sinFiltro && <span className={css.noEsClaude}>no es Claude</span>}</span>
            <span className={css.descripcion}>{m.disponible ? m.descripcion : m.motivo}</span>
          </span>
          {precio && <span className={css.precio} title="USD por millón de tokens: entrada / salida (OpenRouter)">{precio}</span>}
          {nueva && <span className="sr-only">. Abre una conversación nueva</span>}
          <span className={css.marca} aria-hidden={!actual}>{actual && <Check size={14} strokeWidth={2.25} aria-label="Modelo activo" />}</span>
        </button>
      </li>
    )
  }

  // Pista única por grupo (no un enlace por fila): elegir aquí abre una conversación nueva.
  const abreNueva = (lista: ModeloCatalogo[]) => conversacionConMensajes && lista.some((m) => m.disponible && !cabeEnConversacion(m, espacio))
  const grupo = (titulo: string, lista: ModeloCatalogo[], desde: number, columna?: string) => lista.length > 0 && (
    <li className={css.grupo} role="presentation">
      <div className={css.ceja} aria-hidden>
        <span>{titulo}</span>
        {columna && <span className={css.cejaColumna}>{columna}</span>}
      </div>
      {abreNueva(lista) && (
        <p className={css.pista}><MessageSquarePlus size={11} aria-hidden /> Otro motor: abre una conversación nueva</p>
      )}
      <ul>{lista.map((m, i) => fila(m, desde + i))}</ul>
    </li>
  )

  return (
    <PopoverAnclado
      ancla={ancla}
      panelRef={ref}
      ancho={ANCHO_POPOVER}
      altoMax={ALTO_IDEAL}
      role="dialog"
      aria-label="Elegir modelo"
      aria-busy={loading}
      data-selector-modelos
      className={css.panel}
    >
      {/* Con una sola cuenta (edición cliente) no hay selector que mostrar. */}
      {cuentas && cuentas.length > 1 && onCuenta && (
        <div className={css.cabeza} data-selector-cuentas>
          <CuentasSegmentadas options={cuentas} active={espacio} onSelect={onCuenta} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted/80">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Cargando modelos…</span>
        </div>
      ) : !filas.length ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-muted/80">{error ? 'No se pudieron cargar los modelos' : 'No hay modelos encendidos'}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted/60">{error ?? 'Enciéndelos en Configuración → Modelos.'}</p>
        </div>
      ) : (
        <ul ref={listRef} className={css.lista} data-popover-scroll>
          {grupo('Claude · tu suscripción', grupos.claude, 0)}
          {grupo('OpenRouter · pagas por uso', grupos.openrouter, grupos.claude.length, '$ / millón')}
          {grupo('Sin filtro · abliteration.ai', grupos.abliterated, grupos.claude.length + grupos.openrouter.length, '$ / millón')}
        </ul>
      )}

      {EDICION_CLIENTE && <PermisosEnModelo onClose={onClose} />}

      <div className={css.pie}>
        {aviso ? <span className="flex-1 leading-snug">{aviso}</span> : (
          <span className={css.teclas} aria-hidden><kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> · <kbd>Esc</kbd></span>
        )}
        <button type="button" onClick={() => { onClose(); useAjustes.getState().abrir('modelo') }} className={css.mas}>
          <SlidersHorizontal size={11} aria-hidden /> Más modelos
        </button>
      </div>
    </PopoverAnclado>
  )
}
