'use client'
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Download, FileText } from 'lucide-react'
import { urlDescarga, urlFirmarArchivo, type ArchivoFirmado } from '@/lib/archivos-chat'
import { abrirEnNavegador } from '@/lib/navegador'
import { isDesktopRuntime } from '@/lib/local-first/runtime'

// Un archivo local que Levy menciona en el chat (29 oct 2026, T6): enlace firmado que abre en el navegador lo que se
// puede ver (PDF, imagen, texto, HTML aislado) y un botón «Descargar» al lado. Funciona igual en la app de escritorio
// (abre en el navegador del sistema), en el navegador y en el teléfono. Si el archivo no se puede compartir (fuera del
// cerebro, secreto, ya no existe), queda como texto con el motivo al pasar el dedo o el ratón.

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; archivo: ArchivoFirmado } | { tipo: 'error'; motivo: string }

/** El enlace firmado dura 12 h; se pide de nuevo a las 4 h para que nunca se toque uno vencido. */
const REFRESCO_MS = 4 * 3600_000
const cache = new Map<string, { en: number; p: Promise<Estado> }>()

function pedir(ruta: string): Promise<Estado> {
  const hit = cache.get(ruta)
  if (hit && Date.now() - hit.en < REFRESCO_MS) return hit.p
  const p = fetch(urlFirmarArchivo(ruta), { cache: 'no-store' })
    .then(async (r) => {
      const j = await r.json().catch(() => ({})) as Partial<ArchivoFirmado> & { error?: string }
      if (r.ok && typeof j.url === 'string') return { tipo: 'listo', archivo: j as ArchivoFirmado } as Estado
      // Un error de red o de sesión no se queda en caché: el siguiente pintado lo reintenta.
      if (r.status >= 500 || r.status === 401) cache.delete(ruta)
      return { tipo: 'error', motivo: j.error || 'No se pudo abrir este archivo.' } as Estado
    })
    .catch(() => { cache.delete(ruta); return { tipo: 'error', motivo: 'Sin conexión con tu Arbrain.' } as Estado })
  cache.set(ruta, { en: Date.now(), p })
  return p
}

function useArchivo(ruta: string): Estado {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  useEffect(() => {
    let vivo = true
    const cargar = () => { pedir(ruta).then((e) => { if (vivo) setEstado(e) }) }
    cargar()
    const t = setInterval(cargar, REFRESCO_MS + 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [ruta])
  return estado
}

/** En la app de escritorio el WebView no abre pestañas: va al navegador del sistema con la URL completa. */
function abrirFuera(e: MouseEvent, url: string) {
  if (!isDesktopRuntime()) return
  e.preventDefault()
  void abrirEnNavegador(new URL(url, window.location.origin).href)
}

const CLASE_ENLACE = 'text-brand-ink hover:opacity-80 underline underline-offset-2 transition-opacity'

export function EnlaceArchivo({ ruta, children, codigo = false }: { ruta: string; children: ReactNode; codigo?: boolean }) {
  const estado = useArchivo(ruta)
  const cuerpo = codigo
    ? <code className="bg-card-active border border-border px-1.5 py-0.5 rounded text-[0.8em] font-mono break-all">{children}</code>
    : children

  if (estado.tipo !== 'listo') {
    const titulo = estado.tipo === 'error' ? estado.motivo : 'Preparando el archivo…'
    return <span title={titulo} className={codigo ? 'text-foreground/85' : 'text-foreground/85 underline decoration-dotted underline-offset-2'}>{cuerpo}</span>
  }

  const { url, nombre, ver } = estado.archivo
  const descarga = urlDescarga(url)
  return (
    <span className="inline-flex items-baseline gap-1 max-w-full align-baseline">
      <a
        href={ver ? url : descarga}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => abrirFuera(e, ver ? url : descarga)}
        title={ver ? `Abrir ${nombre}` : `Descargar ${nombre}`}
        className={`${CLASE_ENLACE} ${codigo ? 'no-underline' : ''} min-w-0`}
      >
        {codigo ? <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden className="shrink-0 self-center" />{cuerpo}</span> : cuerpo}
      </a>
      {ver && (
        <a
          href={descarga}
          download={nombre}
          rel="noopener noreferrer"
          onClick={(e) => abrirFuera(e, descarga)}
          aria-label={`Descargar ${nombre}`}
          title={`Descargar ${nombre}`}
          className="inline-flex items-center self-center rounded-md p-0.5 text-muted/80 hover:text-foreground hover:bg-card-active transition-colors"
        >
          <Download size={13} aria-hidden />
        </a>
      )}
    </span>
  )
}
