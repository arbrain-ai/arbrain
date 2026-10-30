'use client'
/**
 * «Siempre este patrón» (botón Play, 27 oct 2026): las reglas que la persona guardó desde la tarjeta del hilo. Visibles
 * y revocables con un clic. Crearlas solo pasa por la tarjeta; ni esta pantalla ni un agente las inventan.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Repeat, X } from 'lucide-react'

interface Regla { id: string; patron: string; creada: number; ejemplo: string; herramienta?: string; frase?: string }

const fecha = (ms: number) => ms ? new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : ''

export function ReglasSiempre() {
  const [reglas, setReglas] = useState<Regla[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => {
    try {
      const r = await fetch('/api/permisos/reglas', { cache: 'no-store' })
      const j = await r.json().catch(() => ({})) as { reglas?: Regla[]; error?: string }
      if (!r.ok) throw new Error(j.error ?? 'No se pudo leer.')
      setReglas(Array.isArray(j.reglas) ? j.reglas : [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer.') }
  }, [])
  useEffect(() => { void leer() }, [leer])
  const quitar = async (id: string) => {
    setOcupado(id); setError(null)
    try {
      const r = await fetch('/api/permisos/reglas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quitar: id }) })
      const j = await r.json().catch(() => ({})) as { reglas?: Regla[]; error?: string }
      if (!r.ok) throw new Error(j.error ?? 'No se pudo quitar.')
      setReglas(Array.isArray(j.reglas) ? j.reglas : [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar.') }
    finally { setOcupado(null) }
  }
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <header className="mb-2 flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><Repeat className="size-4 text-brand-ink" aria-hidden /> Lo que ya no te pregunta</h3>
      </header>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Cuando en una tarjeta eliges «Permitir siempre», se guarda aquí: un comando, una herramienta conectada, una carpeta donde escribe o un sitio
        web. Lo que case corre sin preguntarte. Nunca aplica a borrar, enviar, publicar ni pagar, ni en tus rutinas, ni cuando Levy acaba de leer algo
        de afuera (salvo guardar en tu memoria, que elegiste en esa misma tarjeta).
      </p>
      {reglas === null && !error && <p className="mt-3 text-[12.5px] text-muted"><Loader2 className="mr-1 inline size-3.5 animate-spin" aria-hidden />Leyendo…</p>}
      {reglas && reglas.length === 0 && <p className="mt-3 text-[12.5px] text-muted">Todavía no guardas ninguno.</p>}
      {reglas && reglas.length > 0 && (
        <ul className="mt-3 divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {reglas.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1" title={r.ejemplo ? `Nació de: ${r.ejemplo}` : undefined}>
                {r.frase && <span className="block truncate text-[12.5px] text-foreground">{r.frase}</span>}
                <code className={`block truncate font-mono ${r.frase ? 'text-[11.5px] text-muted' : 'text-[12.5px] text-foreground'}`}>{r.patron}</code>
              </span>
              <span className="shrink-0 text-[11px] text-muted">{fecha(r.creada)}</span>
              <button type="button" onClick={() => void quitar(r.id)} disabled={!!ocupado} className="btn-secondary shrink-0 !px-2.5 !py-1 text-[12px]" aria-label={`Quitar ${r.frase ?? r.patron}`}>
                {ocupado === r.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />} Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
    </section>
  )
}
