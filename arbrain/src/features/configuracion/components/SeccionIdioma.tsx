'use client'
/**
 * Ajustes › Idioma (13 nov 2026). Español o English para toda la instalación: la interfaz, las fechas, el agente (sus
 * respuestas nuevas) y la voz. Se guarda en el servidor local (`/api/idioma`) y la página se recarga para que todo
 * nazca en el idioma nuevo. Los nombres de cada opción van en su propio idioma, para que siempre se encuentren.
 */
import { useState } from 'react'
import { Check, Languages, Loader2 } from 'lucide-react'
import { IDIOMAS, type Idioma } from '@/shared/i18n/idioma'
import { idiomaActual, tr } from '@/shared/i18n/tr'

/** Guarda el idioma y recarga. El shell guardado por el service worker se borra: la recarga trae el HTML del idioma nuevo. */
export async function cambiarIdioma(idioma: Idioma): Promise<string | null> {
  try {
    const r = await fetch('/api/idioma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idioma }) })
    if (!r.ok) {
      const j = await r.json().catch(() => null) as { error?: string } | null
      return j?.error ?? tr('No se pudo guardar el idioma ({estado}).', { estado: r.status })
    }
  } catch {
    return tr('No se pudo guardar el idioma: el servidor local no respondió.')
  }
  try {
    if ('caches' in window) for (const k of await caches.keys()) if (k.includes('pages')) await caches.delete(k)
  } catch { /* sin caché de páginas */ }
  window.location.reload()
  return null
}

/** Las dos opciones, una al lado de la otra. `compacto` es la versión de la bienvenida. */
export function SelectorIdioma({ compacto = false }: { compacto?: boolean }) {
  const actual = idiomaActual()
  const [guardando, setGuardando] = useState<Idioma | null>(null)
  const [error, setError] = useState<string | null>(null)

  const elegir = async (id: Idioma) => {
    if (id === actual || guardando) return
    setGuardando(id); setError(null)
    const fallo = await cambiarIdioma(id)
    if (fallo) { setError(fallo); setGuardando(null) }
  }

  return (
    <div>
      <div role="radiogroup" aria-label={tr('Idioma')} className={`grid grid-cols-2 gap-2 ${compacto ? 'w-56' : ''}`}>
        {IDIOMAS.map((o) => {
          const activo = o.id === actual
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={activo}
              lang={o.id}
              disabled={!!guardando}
              onClick={() => void elegir(o.id)}
              className={`nav-item w-full justify-center ${activo ? 'nav-item-active' : ''} disabled:cursor-wait`}
              data-idioma={o.id}
            >
              {guardando === o.id ? <Loader2 className="size-[15px] animate-spin" aria-hidden /> : activo ? <Check className="size-[15px]" aria-hidden /> : <Languages className="size-[15px] opacity-60" aria-hidden />}
              <span>{o.nombre}</span>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
    </div>
  )
}

export function SeccionIdioma() {
  return (
    <section className="solid-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground/90">{tr('Idioma de Arbrain')}</h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">{tr('La interfaz, las fechas, las respuestas de Levy y su voz. Language · Idioma.')}</p>
        </div>
        <div className="w-full shrink-0 sm:w-64"><SelectorIdioma /></div>
      </div>
      <div className="space-y-1.5 px-4 py-4 text-xs leading-relaxed text-muted sm:px-5">
        <p>{tr('Al cambiarlo, la app se recarga en el idioma nuevo. Las conversaciones nuevas con Levy nacen en ese idioma; en una conversación que ya existe, pídele que cambie si hace falta.')}</p>
        <p>{tr('Lo que tú escribiste (tus notas, tu calendario, tus archivos) no se traduce: queda como lo dejaste.')}</p>
      </div>
    </section>
  )
}
