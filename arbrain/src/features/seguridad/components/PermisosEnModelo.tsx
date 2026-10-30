'use client'
/**
 * Modo de permisos y «Pausar todo» dentro del menú del modelo del chat (30 oct 2026). Daniel, viendo su Arbrain en el
 * teléfono: «quita los botones de "autonomo" vuelve a preguntar y el boton de pausa… deja la ui limpia… el modo autonomo
 * deberia poder cambiarlo dando clic al modelo button». Edición cliente (las rutas `/api/seguridad/*` solo existen ahí).
 *
 *   PermisosEnModelo   la sección del menú: Autónomo / Preguntar y «Pausar todo» (o «Reanudar» si ya está en pausa).
 *   PuntoAutonomo      el punto discreto en el botón del modelo mientras está en Autónomo.
 *
 * Mismo camino que la píldora de antes y la franja: `POST /api/seguridad/permisos` y `POST /api/seguridad/pausa`.
 * Autónomo sin consentimiento vigente abre Ajustes › Permisos y seguridad, donde se lee y acepta su texto.
 */
import { Loader2, OctagonPause, Play } from 'lucide-react'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { accionAlElegirLado, avisoAutonomo, ladoDelModo, LINEA_MODO, RED_MINIMA, type LadoPermisos } from '../lib/seguridad'
import { useModoGlobal, usePausa } from './estado-seguridad'

const LADOS: { lado: LadoPermisos; nombre: string }[] = [
  { lado: 'autonomo', nombre: 'Autónomo' },
  { lado: 'preguntar', nombre: 'Preguntar' },
]

export function PermisosEnModelo({ onClose }: { onClose: () => void }) {
  const modo = useModoGlobal(0)
  const { pausa, ocupado: pausando, error: errorPausa, fijar } = usePausa(0)
  const estado = modo.estado
  const lado = estado ? ladoDelModo(estado.modo) : null
  const elegir = async (l: LadoPermisos) => {
    if (!estado || modo.ocupado) return
    const a = accionAlElegirLado(l, estado)
    if (a.tipo === 'ajustes') { onClose(); useAjustes.getState().abrir('seguridad'); return }
    if (a.tipo === 'mandar') await modo.mandar(a.cuerpo)
  }
  const pausar = async () => { if (await fijar(true)) onClose() }
  const error = modo.error ?? errorPausa
  return (
    <div data-permisos-modelo className="border-t border-border-subtle px-3.5 py-2.5">
      <span className="block pb-1.5 text-[10px] uppercase tracking-widest text-muted/60">Cuánto te pregunta</span>
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Cuánto te pregunta Levy" className="flex min-w-0 flex-1 rounded-full border border-border-subtle bg-card-active/60 p-0.5">
          {LADOS.map(({ lado: l, nombre }) => {
            const activo = lado === l
            return (
              <button key={l} type="button" role="radio" aria-checked={activo} data-lado={l}
                disabled={!estado || modo.ocupado}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void elegir(l)}
                title={l === 'autonomo' ? `${estado?.modo === 'autonomo' ? avisoAutonomo(modo.desde) : 'Hace lo que le pides sin pedirte un clic en cada paso.'} ${RED_MINIMA}` : 'Te pregunta antes de lo que sale de tu computadora (Automático en mi carpeta).'}
                className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors md:min-h-8 ${activo ? (l === 'autonomo' ? 'bg-brand/20 text-brand-ink' : 'bg-card text-foreground shadow-sm') : 'text-muted hover:text-foreground'}`}>
                {l === 'autonomo' && <span aria-hidden className={`size-1.5 rounded-full ${activo ? 'bg-brand' : 'bg-muted/50'}`} />}
                {nombre}
                {modo.ocupado && !activo && <Loader2 className="size-3 animate-spin" aria-hidden />}
              </button>
            )
          })}
        </div>
        {pausa?.pausado ? (
          <button type="button" data-pausa-modelo="reanudar" onMouseDown={(e) => e.preventDefault()} onClick={() => void fijar(false)} disabled={pausando}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/40 px-3 text-[12.5px] font-medium text-amber-700 hover:bg-amber-400/10 dark:text-amber-200 md:min-h-8">
            {pausando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} Reanudar
          </button>
        ) : (
          <button type="button" data-pausa-modelo="pausar" onMouseDown={(e) => e.preventDefault()} onClick={() => void pausar()} disabled={pausando || !pausa}
            title="Pausar todo: detiene todo lo que Levy está haciendo y no deja empezar nada hasta que reanudes"
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-3 text-[12.5px] font-medium text-foreground/80 hover:border-red-400/50 hover:text-red-500 dark:hover:text-red-300 md:min-h-8">
            {pausando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <OctagonPause className="size-3.5" aria-hidden />} Pausar todo
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted" role="status">
        {error ?? (pausa?.pausado ? 'Levy está en pausa: no corre ningún turno, rutina ni herramienta.' : estado ? LINEA_MODO[estado.modo] : 'Consultando…')}
      </p>
    </div>
  )
}

/** Punto en el botón del modelo mientras Levy está en Autónomo (sin fila extra). */
export function PuntoAutonomo() {
  const { autonomo, desde } = useModoGlobal()
  if (!autonomo) return null
  return (
    <span data-punto-autonomo title={avisoAutonomo(desde)} className="flex shrink-0 items-center">
      <span aria-hidden className="size-1.5 rounded-full bg-brand ring-2 ring-brand/25" />
      <span className="sr-only">Modo Autónomo</span>
    </span>
  )
}
