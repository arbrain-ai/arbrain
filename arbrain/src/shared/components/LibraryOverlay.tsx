'use client'
import { instalacion, NOMBRE_DUENO } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, FolderOpen, ChevronLeft, ScrollText, Waypoints } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useIsMobile, useIsCoarsePointer } from '@/shared/hooks/useMediaQuery'
import { DocsBrowser } from '@/features/library/DocsBrowser'
import { EpubReader } from '@/features/library/EpubReader'
import type { LibFile } from '@/features/library/server'

/**
 * Biblioteca dentro del PWA de Arbrain.
 * - DESKTOP: se monta dentro de <main> como `absolute inset-0` -> el sidebar del Arbrain
 *   queda VISIBLE y colapsable al lado (pedido de Daniel). En MÓVIL usa `fixed inset-0`
 *   para tapar hasta el header y leer sin distracciones.
 * - Respeta el safe-area del notch/status bar en móvil (si no, la X choca con la pila).
 * - Libros publicados (libro-os) -> lector publicado (`instalacion().urlLibros`)/<slug>/ full-screen.
 * - Botón de carpeta (header, arriba a la derecha) -> biblioteca personal: PDFs/EPUB de
 *   personal/libros servidos por /api/biblioteca (solo en la máquina de Daniel / desktop).
 * - Volver: gesto desde el borde izquierdo (doc -> docs -> lista -> cerrar) o Escape.
 */

const LIBROS_BASE = instalacion().urlLibros
/** Edición cliente: sin biblioteca (el manual, los libros y los documentos describen la instalación de Daniel). */
const CLIENTE = esEdicionCliente()

type Book = { slug: string; title: string; subtitle: string; cover: string; url?: string }

// Portadas WebP locales (~12-24 KB) servidas por Arbrain -> carga instantánea en todo aparato.
const BOOKS: Book[] = [
  {
    // Servido por Arbrain mismo (public/manual-dueno/) — NO vive en el lector publicado:
    // así el manual del sistema queda dentro del sistema y sin la trampa del deploy.
    slug: 'manual-dueno',
    title: 'El Manual del Dueño',
    subtitle: 'Cómo funciona tu sistema · el Arbrain órgano por órgano',
    cover: '/library-covers/manual-dueno.webp',
    url: '/manual-dueno/index.html',
  },
  {
    // Servido por Arbrain mismo (public/cuerpo-sistemas/) — como el Manual del Dueño,
    // sin la trampa de deploy del lector publicado. Con Modo Estudio TTS (make-estudio.py).
    slug: 'cuerpo-sistemas',
    title: 'El Cuerpo Humano',
    subtitle: 'Sistema de sistemas · los 11 sistemas como grafos · voz de Huberman',
    cover: '/library-covers/cuerpo-sistemas.webp',
    url: '/cuerpo-sistemas/index.html',
  },
  {
    // Servido por Arbrain mismo (public/outlive/) — como el Manual del Dueño y El Cuerpo Humano,
    // sin la trampa de deploy del lector publicado. Con Modo Estudio TTS (make-estudio.py).
    slug: 'outlive',
    title: 'Outlive',
    subtitle: 'Attia · la ciencia y el arte de la longevidad · los 4 Jinetes · el Decatlón del Centenario',
    cover: '/library-covers/outlive.webp',
    url: '/outlive/index.html',
  },
  {
    slug: 'el-timonel',
    title: 'El Timonel',
    subtitle: 'Cibernética · Wiener · Ashby · Beer',
    cover: '/library-covers/el-timonel.webp',
  },
  {
    slug: 'la-libertad-se-disena',
    title: 'La Libertad se Diseña',
    subtitle: 'Beer · la cibernética como máquina de libertad',
    cover: '/library-covers/la-libertad-se-disena.webp',
  },
  {
    slug: 'cerebro-empresa',
    title: 'El Cerebro de la Empresa',
    subtitle: 'Beer · el VSM desde el sistema nervioso · Cybersyn',
    cover: '/library-covers/cerebro-empresa.webp',
  },
  {
    slug: 'corazon-empresa',
    title: 'El Corazón de la Empresa',
    subtitle: 'Beer · el VSM desde primeros principios · los 4 Principios',
    cover: '/library-covers/corazon-empresa.webp',
  },
  // Rescatados del KVM 2 el 15 jul 2026 (ese VPS expira el 24 ago y no se renueva).
  // Sin Modo Estudio TTS: son atlas/deck, se leen pero no se escuchan.
  {
    slug: 'atlas-mente',
    title: 'Atlas — Cómo se construye una mente',
    subtitle: 'El atlas del libro · neurociencia · cibernética · filosofía de la mente',
    cover: '/library-covers/atlas-mente.webp',
  },
  {
    slug: 'historia-mente',
    title: 'Cómo la humanidad aprendió a construir una mente',
    subtitle: 'De Cajal a Wiener y Ashby · la historia en láminas',
    cover: '/library-covers/historia-mente.webp',
  },
]

// PERGAMINOS: el formato hermano del libro. No se lee capítulo a capítulo — se DESCIENDE,
// y sus mecanismos se tocan. Mismo host (lector publicado/<slug>/), mismo lector por iframe.
const PERGAMINOS: Book[] = [
  {
    slug: 'mapa-vivo',
    title: 'El Mapa Vivo',
    subtitle: 'Tu negocio como sistema viable · 10 mecanismos que se tocan',
    cover: '/library-covers/mapa-vivo.webp',
  },
  {
    slug: 'barbell-ventana',
    title: 'El Barbell y la Ventana',
    subtitle: 'Coase · preferential attachment · la tríada del imperio de uno',
    cover: '/library-covers/barbell-ventana.webp',
  },
]

// CONECTOMAS: la topología de cada sistema como grafo navegable (nodos = artefactos,
// aristas = transformaciones, lazos = comparadores; morado = la dinámica lo cubre,
// gris = hueco). Renderer estándar en public/conectoma/ — un renderer, N grafos.
// El grafo se edita hablándole a Levy; aquí solo se contempla (AI-first).
const CONECTOMAS: Book[] = [
  {
    slug: 'conectoma-arbrain',
    title: 'Arbrain — el grafo de grafos',
    subtitle: 'El sistema completo: dominios, superficies y el mundo · los nodos ⊞ abren su propio conectoma',
    cover: '/library-covers/conectoma-arbrain.webp',
    url: '/conectoma/index.html?g=arbrain',
  },
  {
    slug: 'conectoma-vsm',
    title: 'El VSM del Business OS — el mapa de gobierno',
    subtitle: 'Los órganos reales por función (S1-S5 de Beer) · las 6 variables vitales firmadas el 2 ago como lazos ↻',
    cover: '/library-covers/conectoma-vsm.webp',
    url: '/conectoma/index.html?g=vsm',
  },
  {
    slug: 'conectoma-edicion-de-video',
    title: 'Edición de Video E2E',
    subtitle: 'El pipeline como grafo · morado = cubierto · gris = hueco (la agenda de fase 2, visible)',
    cover: '/library-covers/conectoma-edicion-video.webp',
    url: '/conectoma/index.html?g=edicion-de-video',
  },
  {
    slug: 'conectoma-goal-compiler',
    title: 'Goal Compiler — el metagrafo',
    subtitle: 'La skill que compila grafos, mapeada como grafo · la Fase 1.5 en ámbar hasta su estreno',
    cover: '/library-covers/conectoma-goal-compiler.webp',
    url: '/conectoma/index.html?g=goal-compiler',
  },
  {
    slug: 'conectoma-comunidades',
    title: 'Research de Comunidades — la fábrica de intel',
    subtitle: 'Scraper E2E de comunidades de pago → matriz de mecánicas → la v2 de la comunidad · los grises son la agenda',
    cover: '/library-covers/conectoma-comunidades.webp',
    url: '/conectoma/index.html?g=comunidades',
  },
  {
    slug: 'conectoma-datos',
    title: 'Datos del negocio — el dominio sensor',
    subtitle: 'De Polar y el funnel a la BD nocturna y los reportes · el eslabón ML congelado a la vista',
    cover: '/library-covers/conectoma-datos.webp',
    url: '/conectoma/index.html?g=datos',
  },
  {
    slug: 'conectoma-canal-marca',
    title: 'Canal + marca — el dominio que decide QUÉ se dice',
    subtitle: 'Del avatar a la idea al guion al taller · y el eco de vuelta: comments, leads, comunidad',
    cover: '/library-covers/conectoma-canal-marca.webp',
    url: '/conectoma/index.html?g=canal-marca',
  },
  {
    slug: 'conectoma-vida',
    title: `La vida de ${NOMBRE_DUENO()} — el reloj, el ritual y el cuerpo`,
    subtitle: 'Tiempo + tareas + hábitos + cuerpo bajo un mismo techo · los ámbar de la semana de instalación',
    cover: '/library-covers/conectoma-vida.webp',
    url: '/conectoma/index.html?g=vida',
  },
  {
    slug: 'conectoma-classroom-v2',
    title: 'Classroom v2 — la lección como artefacto generado',
    subtitle: 'El pipeline de lecciones del producto SFC · cuelga del nodo Producto en el grafo VSM',
    cover: '/library-covers/conectoma-classroom-v2.webp',
    url: '/conectoma/index.html?g=classroom-v2',
  },
]

// URL del lector: los items con `url` propia se sirven desde Arbrain mismo (same-origin);
// el resto vive en el lector publicado (<urlLibros>/<slug>/).
const readerUrl = (slug: string) => {
  const item = [...BOOKS, ...PERGAMINOS, ...CONECTOMAS].find((b) => b.slug === slug)
  return item?.url ?? `${LIBROS_BASE}/${slug}/`
}

export function LibraryOverlay() {
  const open = useLayoutStore((s) => s.libraryOpen)
  const closeLibrary = useLayoutStore((s) => s.closeLibrary)
  const isMobile = useIsMobile()
  const isTouch = useIsCoarsePointer() // teléfono + tablet: hay gesto de volver → sobra el botón
  const [reading, setReading] = useState<string | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [pergOpen, setPergOpen] = useState(false)
  const [conOpen, setConOpen] = useState(false)
  const [doc, setDoc] = useState<LibFile | null>(null)

  const [dragX, setDragX] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)

  const goBack = useCallback(() => {
    if (doc) setDoc(null)
    else if (docsOpen) setDocsOpen(false)
    else if (reading) setReading(null)
    else if (pergOpen) setPergOpen(false)
    else if (conOpen) setConOpen(false)
    else closeLibrary()
  }, [doc, docsOpen, reading, pergOpen, conOpen, closeLibrary])

  // Superficie persistente (14 jul 2026): cerrar la biblioteca ya NO borra el estado.
  // Antes un `if (!open) reset()` tiraba el libro que estabas leyendo al cerrar —
  // ahora la biblioteca se OCULTA (no se desmonta) y conserva libro + vista + posición,
  // igual que dejar Chat o Calendar y volver. Solo `goBack` desanda la pila a mano.
  // Al recargar/reiniciar la app restauramos el último libro publicado que leías.
  useEffect(() => {
    try {
      const last = localStorage.getItem('mc_lastBook')
      if (last) setReading(last)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (reading) localStorage.setItem('mc_lastBook', reading)
      else localStorage.removeItem('mc_lastBook')
    } catch {}
  }, [reading])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, goBack])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Lector ESTÁTICO (revert 14 jul 2026): NO tocar el viewport del PWA. Relajar
  // maximum-scale para permitir pinch en iOS afloja el viewport visual y el contenido
  // deriva de lado (franja blanca + título cortado). El viewport queda clavado en el shell
  // (maximum-scale=1) y punto. Zoom de láminas = trabajo futuro con lightbox DENTRO del
  // libro (pinch propio con la página clavada), no un hack de viewport global.
  const inReader = !!reading || !!doc // libro/doc a full-screen: botón de volver solo en desktop

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return
    const t = e.touches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) setDragX(Math.min(dx, 140))
  }
  const onTouchEnd = () => {
    if (dragX > 70) goBack()
    setDragX(0)
    start.current = null
  }

  return (
    <div
      className={`${
        isMobile
          ? 'fixed inset-0 z-[200] bg-background flex flex-col'
          : 'absolute inset-0 z-50 bg-background flex flex-col'
      } ${open ? '' : 'hidden'}`}
      style={isMobile ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      aria-hidden={!open}
    >
      {reading ? (
        <ReaderFrame src={readerUrl(reading)} />
      ) : doc ? (
        <DocView file={doc} />
      ) : docsOpen ? (
        <DocsView onOpen={setDoc} onBack={() => setDocsOpen(false)} />
      ) : pergOpen ? (
        <ColeccionList
          titulo="Pergaminos"
          intro="Se descienden, no se pasan. Cada mecanismo se toca."
          items={PERGAMINOS}
          onOpen={setReading}
          onBack={() => setPergOpen(false)}
        />
      ) : conOpen ? (
        <ColeccionList
          titulo="Conectomas"
          intro="La topología de cada sistema: nodos, aristas y lazos. Morado = la dinámica lo cubre · gris = hueco."
          items={CONECTOMAS}
          onOpen={setReading}
          onBack={() => setConOpen(false)}
        />
      ) : (
        <ColeccionList
          titulo="Biblioteca"
          intro="Leer · Escuchar · desde cualquier aparato."
          items={CLIENTE ? [] : BOOKS}
          onOpen={setReading}
          onDocs={CLIENTE ? undefined : () => setDocsOpen(true)}
          onPergaminos={CLIENTE ? undefined : () => setPergOpen(true)}
          onConectomas={CLIENTE ? undefined : () => setConOpen(true)}
          onClose={closeLibrary}
        />
      )}

      {/* Botón flotante de volver — SOLO desktop (fine pointer). En móvil y tablet
          (táctil) sobra: ya se vuelve arrastrando desde el borde izquierdo, y el botón
          robaba espacio/distraía (pedido del dueño, 14 jul 2026). */}
      {inReader && !isTouch && (
        <button
          onClick={goBack}
          className="absolute z-[80] left-3 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md text-white/90 pl-2 pr-3 py-1.5 text-[12px] font-medium active:scale-95"
          style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
          aria-label="Volver"
        >
          <ChevronLeft size={16} />
          Biblioteca
        </button>
      )}

      {/* Zona de gesto en el borde izquierdo (por encima de todo, incluso del iframe) */}
      <div
        className="absolute left-0 top-0 h-full z-[60]"
        style={{ width: 24, touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      {dragX > 0 && (
        <div className="absolute left-0 top-0 h-full z-[70] pointer-events-none" style={{ width: dragX }}>
          <div className="h-full w-full bg-gradient-to-r from-primary/30 to-transparent" />
        </div>
      )}
    </div>
  )
}

/* ---------------- Header reutilizable ---------------- */
function LibHeader({
  title,
  onClose,
  onDocs,
  onBack,
  onPergaminos,
  onConectomas,
}: {
  title: string
  onClose?: () => void
  onDocs?: () => void
  onBack?: () => void
  onPergaminos?: () => void
  onConectomas?: () => void
}) {
  return (
    <div className="titanium-header h-14 shrink-0 border-b border-border-subtle flex items-center justify-between px-3">
      <span className="specular-rim" />
      <div className="flex items-center gap-2 pl-1">
        {onBack && (
          <button onClick={onBack} className="icon-btn size-9" title="Volver" aria-label="Volver">
            <ChevronLeft size={18} />
          </button>
        )}
        <span className="font-sans text-[11px] font-semibold tracking-[0.18em] uppercase text-foreground">
          {title}
        </span>
        <span className="block w-1 h-1 rounded-full bg-gold shadow-glow-gold" />
      </div>
      <div className="flex items-center gap-1">
        {onConectomas && (
          <button
            onClick={onConectomas}
            className="icon-btn size-9"
            title="Conectomas (los sistemas como grafo)"
            aria-label="Conectomas"
          >
            <Waypoints size={18} />
          </button>
        )}
        {onPergaminos && (
          <button
            onClick={onPergaminos}
            className="icon-btn size-9"
            title="Pergaminos (mapas que se descienden)"
            aria-label="Pergaminos"
          >
            <ScrollText size={18} />
          </button>
        )}
        {onDocs && (
          <button onClick={onDocs} className="icon-btn size-9" title="Documentos (PDF · EPUB)" aria-label="Documentos">
            <FolderOpen size={18} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="icon-btn size-9" title="Cerrar" aria-label="Cerrar biblioteca">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------------- Lista de una colección (libros o pergaminos) ---------------- */
function ColeccionList({
  titulo,
  intro,
  items,
  onOpen,
  onDocs,
  onPergaminos,
  onConectomas,
  onBack,
  onClose,
}: {
  titulo: string
  intro: string
  items: Book[]
  onOpen: (slug: string) => void
  onDocs?: () => void
  onPergaminos?: () => void
  onConectomas?: () => void
  onBack?: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <LibHeader
        title={titulo}
        onDocs={onDocs}
        onPergaminos={onPergaminos}
        onConectomas={onConectomas}
        onBack={onBack}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        <p className="text-sm text-muted mb-5">{intro}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl">
          {items.map((b) => (
            <button
              key={b.slug}
              onClick={() => onOpen(b.slug)}
              className="group text-left rounded-2xl overflow-hidden titanium-panel border border-border-subtle transition-transform active:scale-[0.97] hover:border-primary/50"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/40">
                <img
                  src={b.cover}
                  alt={b.title}
                  loading="lazy"
                  width={640}
                  height={358}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>
              <div className="px-3 py-3">
                <p className="text-sm font-semibold text-foreground leading-tight">{b.title}</p>
                <p className="text-[11px] text-muted mt-1 leading-snug">{b.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Biblioteca personal (PDFs/EPUB) ---------------- */
function DocsView({ onOpen, onBack }: { onOpen: (f: LibFile) => void; onBack: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <LibHeader title="Documentos" onBack={onBack} />
      <DocsBrowser onOpen={onOpen} />
    </div>
  )
}

/* ---------------- Lectores full-screen ---------------- */
function ReaderFrame({ src }: { src: string }) {
  return (
    <div className="relative flex-1 min-h-0">
      <iframe src={src} title="Lector" className="absolute inset-0 w-full h-full border-0" allow="autoplay" />
    </div>
  )
}

function DocView({ file }: { file: LibFile }) {
  const url = `/api/biblioteca/file?path=${encodeURIComponent(file.rel)}`
  return (
    <div className="relative flex-1 min-h-0 bg-[#14111a]">
      {file.ext === 'epub' ? (
        <EpubReader url={url} />
      ) : (
        <iframe src={url} title={file.title} className="absolute inset-0 w-full h-full border-0" />
      )}
    </div>
  )
}
