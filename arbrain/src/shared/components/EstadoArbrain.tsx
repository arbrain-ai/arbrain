'use client'
// Estado visible de la app del alumno (resiliencia, 12 oct 2026): verde (nada que mostrar), «reparando» o «necesito
// ayuda» con «Reintentar». Lo pinta la ventana leyendo la app nativa por IPC (`salud_app`, src-tauri/src/lib.rs), así
// funciona aunque el servidor web o el motor estén caídos. En la instalación original el comando no existe: no pinta.
import { useEffect, useState } from 'react'

type SaludApp = { estado: 'ok' | 'reparando' | 'ayuda'; mensaje: string | null; accion: 'reintentar' | null }

const CADA_MS = 3_000

async function invocar<T>(cmd: string): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd)
}

export function EstadoArbrain() {
  const [salud, setSalud] = useState<SaludApp | null>(null)
  const [reintentando, setReintentando] = useState(false)
  useEffect(() => {
    // Marca para el supervisor nativo: con la app viva no hace falta recargar la ventana tras relanzar el web.
    document.documentElement.dataset.arbrainVivo = '1'
    if (!('__TAURI_INTERNALS__' in window)) return
    let vivo = true
    let timer: ReturnType<typeof setTimeout>
    const mirar = async () => {
      try { const s = await invocar<SaludApp>('salud_app'); if (vivo) setSalud(s) } catch { if (vivo) { setSalud(null); return } }
      if (vivo) timer = setTimeout(() => { void mirar() }, CADA_MS)
    }
    void mirar()
    return () => { vivo = false; clearTimeout(timer) }
  }, [])
  if (!salud || salud.estado === 'ok' || !salud.mensaje) return null
  const ayuda = salud.estado === 'ayuda'
  return <div role={ayuda ? 'alert' : 'status'} data-estado-arbrain={salud.estado}
    className={`fixed left-1/2 top-3 z-[100] flex max-w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-lg backdrop-blur-xl ${ayuda ? 'border-red-400/40 bg-red-950/70 text-red-100' : 'border-border-subtle bg-[var(--glass-bg)] text-foreground'}`}>
    {!ayuda && <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border-2 border-brand/30 border-t-brand motion-safe:animate-spin" />}
    <span>{salud.mensaje}</span>
    {salud.accion === 'reintentar' && <button type="button" disabled={reintentando}
      className="min-h-9 shrink-0 rounded-lg border border-current/40 px-3 disabled:opacity-50"
      onClick={() => { setReintentando(true); void invocar('salud_reintentar').catch(() => {}).finally(() => setTimeout(() => setReintentando(false), 3_000)) }}>
      {reintentando ? 'Reintentando…' : 'Reintentar'}
    </button>}
  </div>
}
