'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, GitFork, Mail, MailOpen, MoreHorizontal, Pencil, Pin, PinOff, Star, StarOff, Trash2, type LucideIcon } from 'lucide-react'
import type { ChatSession } from '../hooks/useChatHistory'
import { hayNoVisto } from '../lib/session-status'
import { textMessageTitle } from '../lib/text-attachments'
import { esTeclaDeAtajo, opcionesMenu, opcionPorTecla, tieneMenu, type AccionId, type OpcionMenu } from '../lib/atajos-conversacion'
import { archivar, bifurcar, eliminar, favorita, fijar, marcarLeida, marcarNoLeida } from '../lib/acciones-conversacion'
import { zoomUI } from '@/shared/lib/zoom-ui'

/**
 * Menú «⋯» de una conversación (1 oct 2026, al estilo de Claude Desktop). UN solo componente para «Recientes»
 * y «Ver todas»: Fijar, Marcar como favorita, Marcar como (no) leído, Cambiar nombre, Bifurcar, Archivar y Eliminar, cada una con su
 * letra de atajo a la derecha. Con el menú abierto la letra ejecuta; con la fila enfocada con el teclado, también.
 * Eliminar pide confirmación en un diálogo de la app (no `window.confirm`).
 */

const ANCHO_MENU = 256 // px de layout (cabe «Marcar como no leído» con su letra)
const SEPARACION = 4 // px visuales entre botón y menú
const MARGEN = 8

const ICONO: Record<AccionId, (o: OpcionMenu, s: ChatSession) => LucideIcon> = {
  fijar: (_o, s) => (s.is_favorite ? PinOff : Pin),
  favorita: (_o, s) => (s.is_starred ? StarOff : Star),
  'no-leida': (_o, s) => (hayNoVisto(s) ? MailOpen : Mail),
  renombrar: () => Pencil,
  bifurcar: () => GitFork,
  archivar: (_o, s) => (s.archived_at ? ArchiveRestore : Archive),
  eliminar: () => Trash2,
}

export interface ControlMenu {
  abierto: boolean
  setAbierto: (v: boolean) => void
  confirmando: boolean
  setConfirmando: (v: boolean) => void
  opciones: OpcionMenu[]
  ejecutar: (id: AccionId) => void
  /** Para el contenedor de la fila: la letra de atajo cuando la fila tiene el foco del teclado. */
  alTeclaFila: (e: ReactKeyboardEvent) => void
  /** Clic derecho sobre la fila (3 oct 2026): el mismo menú, abierto donde está el cursor. */
  alClicDerecho: (e: ReactMouseEvent) => void
  /** Punto del cursor si el menú se abrió con clic derecho; `null` = colgado del botón «⋯». */
  punto: { x: number; y: number } | null
  /** Mantener presionada la fila en el teléfono (4 oct 2026, sin «⋯» permanente): el menú, abierto donde está el dedo. */
  abrirEn: (x: number, y: number) => void
  /** Cuándo se abrió con el dedo: el toque que lo abrió no debe cerrarlo al soltar. */
  abiertoEn: RefObject<number>
}

export function useMenuConversacion(
  sesion: ChatSession,
  { onRenombrar, onAbrir }: { onRenombrar?: () => void; onAbrir: (s: ChatSession) => void },
): ControlMenu {
  const [abierto, setAbiertoCrudo] = useState(false)
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null)
  // Abrir desde el «⋯» (o cerrar) olvida el punto del clic derecho.
  const setAbierto = useCallback((v: boolean) => { setPunto(null); setAbiertoCrudo(v) }, [])
  const [confirmando, setConfirmando] = useState(false)
  // Los atajos viven en listeners que no se vuelven a crear en cada render: leen la última versión.
  const ultima = useRef({ sesion, onRenombrar, onAbrir })
  ultima.current = { sesion, onRenombrar, onAbrir }

  const opciones = tieneMenu(sesion) ? opcionesMenu(sesion).filter((o) => o.id !== 'renombrar' || !!onRenombrar) : []

  const ejecutar = useCallback((id: AccionId) => {
    const { sesion: s, onRenombrar: renombrarEnFila, onAbrir: abrir } = ultima.current
    setPunto(null)
    setAbiertoCrudo(false)
    if (id === 'fijar') void fijar(s)
    else if (id === 'favorita') void favorita(s)
    else if (id === 'no-leida') void (hayNoVisto(s) ? marcarLeida(s) : marcarNoLeida(s))
    else if (id === 'renombrar') renombrarEnFila?.()
    else if (id === 'bifurcar') void bifurcar(s).then((r) => { if (r) abrir(r.sesion) })
    else if (id === 'archivar') void archivar(s, !s.archived_at)
    else if (id === 'eliminar') setConfirmando(true)
  }, [])

  const alTeclaFila = useCallback((e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement
    // Solo con el foco del TECLADO sobre un botón de la fila: tras un clic con el mouse el botón conserva el foco
    // y una «a» escrita después no debe archivar nada.
    const esBoton = t.tagName === 'BUTTON' || t.getAttribute('role') === 'button'
    if (!esBoton || !t.matches(':focus-visible') || !esTeclaDeAtajo(e.nativeEvent)) return
    const op = opcionPorTecla(opciones, e.key)
    if (!op) return
    e.preventDefault()
    e.stopPropagation()
    ejecutar(op.id)
  }, [opciones, ejecutar, setAbierto])

  const alClicDerecho = useCallback((e: ReactMouseEvent) => {
    // Sin opciones (solo-SDK) queda el menú nativo del sistema.
    if (opciones.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    setPunto({ x: e.clientX, y: e.clientY })
    setAbiertoCrudo(true)
  }, [opciones.length])

  const abiertoEn = useRef(0)
  const abrirEn = useCallback((x: number, y: number) => {
    if (opciones.length === 0) return
    abiertoEn.current = Date.now()
    setPunto({ x, y })
    setAbiertoCrudo(true)
  }, [opciones.length])

  return { abierto, setAbierto, confirmando, setConfirmando, opciones, ejecutar, alTeclaFila, alClicDerecho, punto, abrirEn, abiertoEn }
}

/** El botón «⋯» y, abierto, el menú y el diálogo de eliminar. Quien lo usa decide dónde y cuándo se ve el botón (`clase`). */
export function MenuConversacion({ sesion, control, clase }: { sesion: ChatSession; control: ControlMenu; clase: string }) {
  const { abierto, setAbierto, opciones, ejecutar, confirmando, setConfirmando, punto, abiertoEn } = control
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ left: number; top: number; arriba: boolean } | null>(null)
  const titulo = textMessageTitle(sesion.title) || 'Conversación'

  // El UI tiene CSS `zoom` en <html> (--ui-zoom): getBoundingClientRect da coordenadas de pantalla y un `left/top`
  // fijo se reinterpreta con zoom. Mismo ajuste que la campana de avisos (NotificationBell).
  const reposicionar = useCallback(() => {
    const b = boton.current
    if (!b && !punto) return
    const z = zoomUI()
    // Clic derecho: un rectángulo de cero en el cursor, y el menú nace hacia la derecha como en macOS.
    const r = punto ? { top: punto.y, bottom: punto.y, right: punto.x } : b!.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const ancho = Math.min(ANCHO_MENU * z, vw - 2 * MARGEN)
    const alto = menu.current?.getBoundingClientRect().height ?? 300 * z
    const deseado = punto ? punto.x : r.right - ancho
    const left = Math.max(MARGEN, Math.min(deseado, vw - ancho - MARGEN))
    const abajo = r.bottom + SEPARACION
    const arriba = abajo + alto > vh - MARGEN && r.top - SEPARACION - alto >= MARGEN
    setCoords({ left: left / z, top: (arriba ? r.top - SEPARACION : abajo) / z, arriba })
  }, [punto])

  useLayoutEffect(() => {
    if (!abierto) { setCoords(null); return }
    reposicionar()
    // Segunda pasada con el menú ya medido (decide si cabe abajo o va hacia arriba).
    const raf = requestAnimationFrame(reposicionar)
    return () => cancelAnimationFrame(raf)
  }, [abierto, reposicionar])

  // Foco al primer elemento al abrir, para poder moverse con las flechas.
  useEffect(() => {
    if (!abierto || !coords) return
    const primero = menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    if (document.activeElement === document.body || !menu.current?.contains(document.activeElement)) primero?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, coords === null])

  // Cierre: clic afuera, scroll de cualquier contenedor, redimensionar y teclado (flechas, Escape, atajos).
  useEffect(() => {
    if (!abierto) return
    const cerrar = () => setAbierto(false)
    const alClic = (e: MouseEvent) => {
      // El mousedown de compatibilidad que llega al soltar el dedo tras mantener presionado no es «clic afuera».
      if (Date.now() - abiertoEn.current < 700) return
      const t = e.target as Node
      if (boton.current?.contains(t) || menu.current?.contains(t)) return
      cerrar()
    }
    const alScroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) cerrar() }
    const alTeclado = (e: KeyboardEvent) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
      const dentro = items.indexOf(document.activeElement as HTMLElement)
      const parar = () => { e.preventDefault(); e.stopPropagation() }
      if (e.key === 'Escape') { parar(); cerrar(); boton.current?.focus(); return }
      if (e.key === 'Tab') { cerrar(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        parar()
        if (items.length === 0) return
        const paso = e.key === 'ArrowDown' ? 1 : -1
        items[(dentro + paso + items.length) % items.length]?.focus()
        return
      }
      if (e.key === 'Home' || e.key === 'End') { parar(); items[e.key === 'Home' ? 0 : items.length - 1]?.focus(); return }
      if (!esTeclaDeAtajo(e)) return
      // Menú abierto = modal: una letra suelta no llega a los atajos globales; la que corresponde, ejecuta.
      parar()
      const op = opcionPorTecla(opciones, e.key)
      if (op) ejecutar(op.id)
    }
    document.addEventListener('mousedown', alClic)
    window.addEventListener('scroll', alScroll, true)
    window.addEventListener('resize', cerrar)
    window.addEventListener('keydown', alTeclado, true)
    return () => {
      document.removeEventListener('mousedown', alClic)
      window.removeEventListener('scroll', alScroll, true)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('keydown', alTeclado, true)
    }
  }, [abierto, setAbierto, opciones, ejecutar, abiertoEn])

  if (!tieneMenu(sesion)) return null

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={(e) => { e.stopPropagation(); setAbierto(!abierto) }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !abierto) { e.preventDefault(); setAbierto(true) } }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Más opciones de ${titulo}`}
        title="Más opciones"
        className={clase}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {abierto && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label={`Opciones de ${titulo}`}
          className="titanium-panel overflow-hidden p-1"
          // position/zIndex inline: `.titanium-panel` define position:relative sin @layer y le ganaría a las utilidades.
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            width: `min(${ANCHO_MENU / 16}rem, calc(100vw - 1rem))`,
            transform: coords.arriba ? 'translateY(-100%)' : undefined,
            boxShadow: 'var(--depth-hover)',
            zIndex: 70,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {opciones.map((o) => {
            const Icono = ICONO[o.id](o, sesion)
            return (
              <div key={o.id}>
                {o.separador && <div className="my-1 h-px bg-border-subtle" role="separator" />}
                <button
                  type="button"
                  role="menuitem"
                  aria-disabled={o.deshabilitada || undefined}
                  aria-keyshortcuts={o.letra}
                  title={o.motivo}
                  onClick={() => { if (!o.deshabilitada) ejecutar(o.id) }}
                  className={`titanium-menu-item w-full max-md:!min-h-11 ${o.peligro ? 'titanium-menu-item-danger !text-error' : ''} ${o.deshabilitada ? 'cursor-not-allowed opacity-45 hover:!bg-transparent hover:!text-muted' : ''}`}
                >
                  <Icono className="size-4 shrink-0 md:size-3.5" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{o.etiqueta}</span>
                  <kbd className="ml-2 shrink-0 rounded border border-border-subtle bg-card-hover px-1.5 py-px font-mono text-[10px] leading-4 text-muted" aria-hidden>{o.letra}</kbd>
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}

      {confirmando && typeof document !== 'undefined' && createPortal(
        <DialogoEliminar
          titulo={titulo}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() => { setConfirmando(false); void eliminar(sesion) }}
        />,
        document.body,
      )}
    </>
  )
}

/** Confirmación de eliminar, de la app (1 oct 2026): el foco arranca en «Cancelar» para que un Enter distraído no borre. */
function DialogoEliminar({ titulo, onCancelar, onConfirmar }: { titulo: string; onCancelar: () => void; onConfirmar: () => void }) {
  const cancelar = useRef<HTMLButtonElement>(null)
  const confirmar = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelar.current?.focus() }, [])

  const alTeclado = (e: ReactKeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return }
    if (e.key === 'Tab') {
      // Foco atrapado entre los dos botones.
      const [a, b] = [cancelar.current, confirmar.current]
      if (!a || !b) return
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 md:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar() }}
      // El diálogo vive en un portal pero React propaga sus eventos a la fila que lo abrió: que un clic aquí no la abra.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={alTeclado}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="eliminar-titulo" aria-describedby="eliminar-detalle" className="titanium-panel w-full max-w-sm p-5" style={{ position: 'relative' }}>
        <h2 id="eliminar-titulo" className="text-base font-semibold text-foreground">¿Eliminar esta conversación?</h2>
        <p className="mt-2 line-clamp-2 break-words text-sm text-foreground/80">«{titulo}»</p>
        <p id="eliminar-detalle" className="mt-1 text-sm text-error">Se borra con todos sus mensajes y no se puede deshacer.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelar} type="button" onClick={onCancelar} className="min-h-11 rounded-lg border border-border-subtle bg-card px-4 text-sm text-foreground transition-colors hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:min-h-9">
            Cancelar
          </button>
          <button ref={confirmar} type="button" onClick={onConfirmar} className="btn-danger min-h-11 px-4 text-sm md:min-h-9">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
