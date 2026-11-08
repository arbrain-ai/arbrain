'use client'
/**
 * Modo directo (7 nov 2026) en la app: el velo, la insignia «EN DIRECTO», la sección de Ajustes y el aviso con que se
 * niegan las vistas vetadas. Reglas: lib/modo-directo/reglas.ts; velo del DOM: lib/modo-directo/velo-dom.ts; estado:
 * shared/stores/modo-directo-store.ts (la verdad, en el daemon).
 */
import { useEffect } from 'react'
import { EyeOff, Radio } from 'lucide-react'
import { instalarVelo, type VeloDom } from '@/lib/modo-directo/velo-dom'
import { OCULTO_POR_DIRECTO } from '@/lib/modo-directo/reglas'
import { descubrir } from '@/lib/modo-directo/cubrir'
import { esAtajoDirecto } from '@/lib/modo-directo/atajo'
import { useDirecto, useModoDirecto } from '@/shared/stores/modo-directo-store'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { Interruptor } from '@/features/configuracion/components/Interruptor'

/** Monta el velo sobre toda la app mientras el modo está prendido, el atajo y la insignia. Va una vez en el shell. */
export function ModoDirecto() {
  const prendido = useDirecto()

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!esAtajoDirecto(e) || e.repeat) return
      e.preventDefault()
      e.stopImmediatePropagation()
      void useModoDirecto.getState().alternar()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])

  // Apagado (lo dice el estado VIVO, no el de este render: iniciar() pudo prenderlo en este mismo ciclo): nada que cubrir.
  const confirmado = useModoDirecto(s => s.confirmado)
  useEffect(() => { if (!useModoDirecto.getState().prendido) descubrir() }, [prendido, confirmado])

  useEffect(() => {
    if (!prendido) return
    const raiz = document.documentElement
    raiz.setAttribute('data-modo-directo', '')
    const v: VeloDom = instalarVelo(document.body, () => useModoDirecto.getState().velo)
    descubrir()
    // El diccionario de nombres llega después que el interruptor: cuando cambia, se vuelve a tapar todo.
    const soltar = useModoDirecto.subscribe((s, a) => { if (s.velo !== a.velo) v.refrescar() })
    return () => { soltar(); v.quitar(); raiz.removeAttribute('data-modo-directo') }
  }, [prendido])

  return prendido ? <InsigniaDirecto /> : null
}

function InsigniaDirecto() {
  const error = useModoDirecto(s => s.error)
  return (
    <button
      type="button"
      data-directo-ignorar
      data-insignia-directo
      onClick={() => useAjustes.getState().abrir('directo')}
      title={error ?? 'Modo directo prendido: nombres, dinero y secretos tapados. ⌘⇧D para apagar.'}
      className="fixed left-1/2 top-1 z-[80] flex -translate-x-1/2 items-center md:left-auto md:right-[118px] md:top-[19px] md:translate-x-0 gap-1.5 rounded-full border border-red-500/50 bg-red-600/90 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-white shadow-lg backdrop-blur"
    >
      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex size-2 rounded-full bg-white" /></span>
      EN DIRECTO
      {error && <span aria-hidden className="ml-1 rounded bg-black/30 px-1 tracking-normal">!</span>}
    </button>
  )
}

/** Lo que se pinta en lugar de una vista, sección o documento vetado. */
export function OcultoPorDirecto({ que, compacto }: { que: string; compacto?: boolean }) {
  return (
    <div data-oculto-por-directo className={`flex flex-col items-center justify-center gap-2 text-center text-muted ${compacto ? 'px-3 py-4' : 'h-full min-h-48 px-6 py-10'}`}>
      <EyeOff className="size-5 opacity-70" aria-hidden />
      <p className="text-sm font-semibold text-foreground/80">{OCULTO_POR_DIRECTO}</p>
      <p className="max-w-sm text-xs leading-relaxed">{que} no se abre mientras transmites. Apaga el modo directo (⌘⇧D) para verlo.</p>
    </div>
  )
}

const TAPA = [
  'Nombres, correos y teléfonos de fundadores y clientes: se ven como iniciales.',
  'Cifras de dinero en toda la app.',
  'Finanzas, Cohorte, Casa y Perro no se abren, tampoco si Levy las pide.',
  'El visor no abre .env, llaves ni rutas sensibles (~/.ssh, ~/.aws, credenciales, fichas de clientes).',
  'Llaves, tokens y contraseñas en el chat, en los textos de herramientas y en la terminal.',
]
const NO_TAPA = 'No tapa lo que no es texto (imágenes, PDF, video, lienzos dibujados, otras apps: comparte solo la ventana de Arbrain) ni nombres que no estén en las fichas de clientes, como prospectos o tu equipo: agrégalos, uno por línea, en ~/.config/arbrain/modo-directo-nombres.txt.'

export function SeccionDirecto() {
  const prendido = useDirecto()
  const { ocupado, error, desde } = useModoDirecto()
  return (
    <div className="space-y-3" data-directo-ignorar>
      <section className="solid-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground/90"><Radio className="size-4 text-red-500" aria-hidden />Modo directo</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted">Préndelo antes de grabar o transmitir. También con ⌘⇧D. {prendido && desde ? `Prendido desde las ${new Date(desde).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
          </div>
          <Interruptor activo={prendido} disabled={ocupado} etiqueta={prendido ? 'Apagar el modo directo' : 'Prender el modo directo'} onCambio={v => void useModoDirecto.getState().poner(v)} />
        </div>
        <div className="space-y-2 px-4 py-4 text-xs leading-relaxed text-muted sm:px-5">
          <p className="font-semibold text-foreground/80">Mientras está prendido</p>
          <ul className="list-disc space-y-1 pl-4">{TAPA.map(t => <li key={t}>{t}</li>)}</ul>
          <p>Levy lo sabe en cada turno y sus herramientas responden «{OCULTO_POR_DIRECTO}».</p>
          <p className="text-foreground/70">{NO_TAPA}</p>
          {error && <p role="alert" className="text-red-500">{error}</p>}
        </div>
      </section>
    </div>
  )
}
