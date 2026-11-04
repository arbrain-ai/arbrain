'use client'
import { useCallback, useRef, useState } from 'react'
import { History, Infinity as IconoLoops, Shapes, SquarePen, Wand2, type LucideIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { MenuArtefactos } from '@/features/cabina/panel/Secciones'
import { irA } from '@/shared/navigation/ir-a'
import { RecientesNav } from '@/features/chat/components/RecientesNav'
import { useNuevoChat } from '@/shared/hooks/useNuevoChat'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { AccionesBarra } from '@/shared/components/AccionesBarra'

interface Props {
  /** Se llama al elegir algo (conversación, «Nuevo chat», «Ver todas»): el cajón del teléfono se cierra con esto. */
  onElegir?: () => void
  /** Teléfono: blancos táctiles de 44 px, texto de 15 px y filas de dos líneas con su hora. */
  tactil?: boolean
}

/**
 * La barra lateral única (4 oct 2026: las secciones viven como pestañas del panel derecho): arriba «Nuevo chat» y
 * «Ver todas»; debajo Rutinas, Fijadas y los días (RecientesNav); al pie el perfil (lleva a ajustes) con Manual,
 * avisos y tema. Es la columna del escritorio y el cajón del teléfono: un solo componente para los dos.
 * Rediseño premium del 4 oct 2026, 21:08 (Daniel: «nota cómo luce barata la interfaz»): sin «Recientes» como
 * rótulo suelto, encabezados discretos, filas legibles y el pie integrado.
 */
export function ColumnaConversaciones({ onElegir, tactil = false }: Props) {
  const nuevoChat = useNuevoChat()
  const pathname = usePathname()
  const router = useRouter()
  const alto = tactil ? 'min-h-11 text-[15px]' : 'min-h-9 text-[13px]'

  const verTodas = () => {
    onElegir?.()
    useLayoutStore.setState({ chatSessionsPanelOpen: true })
    if (pathname !== '/chat') router.push('/chat')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 px-3 ${tactil ? 'pb-2 pt-3' : 'pb-1.5 pt-3'}`}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { onElegir?.(); nuevoChat() }}
            className={`${alto} flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 font-medium text-foreground transition-colors hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand`}
            title="Nuevo chat con Levy"
            aria-label="Nuevo chat"
          >
            <span className={`grid shrink-0 place-items-center rounded-lg bg-brand/12 text-brand-ink ${tactil ? 'size-7' : 'size-6'}`} aria-hidden>
              <SquarePen className={tactil ? 'size-4' : 'size-3.5'} />
            </span>
            <span className="truncate">Nuevo chat</span>
          </button>
          <button
            type="button"
            onClick={verTodas}
            className={`grid shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand ${tactil ? 'size-11' : 'size-9'}`}
            title="Ver todas las conversaciones"
            aria-label="Ver todas las conversaciones"
          >
            <History className={tactil ? 'size-[18px]' : 'size-4'} aria-hidden />
          </button>
        </div>
        <AccesosBarra onElegir={onElegir} alto={alto} tactil={tactil} />
        {/* Perro y Casa viven en «Entorno físico», al pie del «+» del panel (27 oct 2026): un solo lugar, sin duplicar. */}
        {/* Buscar se quitó (2 oct 2026, el dueño: «ni la uso; si ocupo buscar algo te pregunto a ti por el chat»). */}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <RecientesNav onElegir={onElegir ?? (() => {})} tactil={tactil} />
      </div>

      <div
        className={`shrink-0 border-t border-border-subtle px-3 ${tactil ? 'columna-pie-tactil' : ''}`}
        style={tactil ? undefined : { paddingBottom: '0.375rem' }}
      >
        <AccionesBarra onNavegar={onElegir} tactil={tactil} />
      </div>
    </div>
  )
}

/**
 * Loops · Habilidades · Artefactos (3 nov 2026, Daniel viendo Claude y Cloudroom: «necesitamos a la izquierda algo como
 * artefactos… loops… skills, poder verlo desde acá»). Tres accesos a lo que ya existe, sin pantalla nueva:
 * Loops abre Taller › Rutinas en su vista Loops (en la instalación original, Rutinas viva); Habilidades abre Taller ›
 * Memoria › Habilidades; Artefactos despliega lo Guardado del panel (el archivero de «+ › Guardadas»).
 */
function AccesosBarra({ onElegir, alto, tactil }: { onElegir?: () => void; alto: string; tactil: boolean }) {
  const [artefactos, setArtefactos] = useState(false)
  const filaArtefactos = useRef<HTMLButtonElement>(null)
  const cerrarArtefactos = useCallback(() => setArtefactos(false), [])
  const ir = (d: 'loops' | 'habilidades') => { onElegir?.(); irA(d) }
  const fila = `${alto} flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:bg-foreground/[0.08] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand aria-expanded:bg-foreground/[0.06] aria-expanded:text-foreground`
  const Icono = ({ I }: { I: LucideIcon }) => <span className={`grid shrink-0 place-items-center ${tactil ? 'size-7' : 'size-6'}`} aria-hidden><I className={tactil ? 'size-[18px]' : 'size-4'} strokeWidth={1.75} /></span>
  return (
    <nav aria-label="Tu cerebro" className="mt-1 flex flex-col">
      <button type="button" className={fila} onClick={() => ir('loops')} title="Loops: revisiones de tu negocio que corren solas y te suben solo lo que necesita tu decisión">
        <Icono I={IconoLoops} /><span className="truncate">Loops</span>
      </button>
      <button type="button" className={fila} onClick={() => ir('habilidades')} title="Habilidades (skills): lo que tu cerebro sabe hacer y cuándo lo usa">
        <Icono I={Wand2} /><span className="truncate">Habilidades</span>
      </button>
      <button ref={filaArtefactos} type="button" className={fila} aria-haspopup="menu" aria-expanded={artefactos}
        onClick={() => setArtefactos(v => !v)} title="Artefactos: lo que Levy te hizo y guardaste (lienzos, documentos, pestañas)">
        <Icono I={Shapes} /><span className="truncate">Artefactos</span>
      </button>
      {artefactos && <MenuArtefactos ancla={filaArtefactos.current} onCerrar={cerrarArtefactos} onElegido={onElegir} />}
    </nav>
  )
}
