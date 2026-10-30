'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Interruptor } from '@/features/configuracion/components/Interruptor'
import { precioPorMillon, type Catalogo, type ModeloCatalogo } from './catalogo-modelos'

/**
 * Configuración → Modelos (2 oct 2026, pedido de Daniel): qué modelos aparecen en el selector del chat. Entra el top
 * 10 del Artificial Analysis Intelligence Index más Sonnet 5.5 y GPT-6 Luna. Claude va por la suscripción; el resto
 * por OpenRouter con Codex como arnés. Existencia y precio salen del catálogo real de OpenRouter (el daemon lo
 * consulta); lo que no existe ahí se ve apagado con su motivo y no se puede encender.
 */
export function CatalogoModelos() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'viejo' | 'error'>('cargando')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/chat/modelos-catalogo', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (r.status === 404) { setEstado('viejo'); return }
        if (!r.ok || !Array.isArray(data.modelos)) { setEstado('error'); setError(data.error ?? `No se pudo leer el catálogo (${r.status}).`); return }
        setCatalogo(data as Catalogo); setEstado('ok')
      })
      .catch(() => { if (vivo) { setEstado('error'); setError('Sin conexión con el servidor del chat.') } })
    return () => { vivo = false }
  }, [])

  async function cambiar(m: ModeloCatalogo, habilitado: boolean) {
    if (!catalogo) return
    const antes = catalogo
    setGuardando(m.id); setError(null)
    setCatalogo({ ...catalogo, modelos: catalogo.modelos.map((x) => x.id === m.id ? { ...x, habilitado } : x) })
    try {
      const r = await fetch('/api/chat/modelos-catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, habilitado }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !Array.isArray(data.modelos)) throw new Error(data.error ?? `No se pudo guardar (${r.status}).`)
      setCatalogo(data as Catalogo)
    } catch (e) {
      setCatalogo(antes)
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally { setGuardando(null) }
  }

  const encendidos = catalogo?.modelos.filter((m) => m.habilitado).length ?? 0
  const hora = catalogo?.consultadoEn ? new Date(catalogo.consultadoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null

  return (
    <section aria-labelledby="catalogo-titulo" className="solid-card overflow-hidden" data-catalogo-modelos>
      <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <h3 id="catalogo-titulo" className="text-sm font-semibold text-foreground/90">Modelos del selector</h3>
          {catalogo && <span className="text-[11px] text-muted">{encendidos} encendidos</span>}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted">Lo que enciendas sale en la barra del chat. Claude va por tu suscripción; los demás, por OpenRouter. Precio en USD por millón de tokens, entrada / salida.</p>
      </div>

      {estado === 'cargando' && (
        <p className="flex items-center gap-2 px-4 py-4 text-xs text-muted sm:px-5"><Loader2 size={13} className="animate-spin" aria-hidden /> Verificando modelos en Claude y OpenRouter…</p>
      )}
      {estado === 'viejo' && (
        <p role="status" className="m-4 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-snug text-foreground/85">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
          <span>El servidor del chat corre la versión anterior y todavía no conoce el catálogo. Aparece al reiniciarlo, que hace Levy. Mientras, el selector muestra Opus y Sonnet.</span>
        </p>
      )}
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-400/85 sm:px-5">{error}</p>}

      {catalogo && (
        <ul className="divide-y divide-border-subtle">
          {catalogo.modelos.map((m) => {
            const precio = precioPorMillon(m)
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5" data-modelo={m.id} data-disponible={m.disponible}>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums ${m.puesto ? 'bg-card-active text-foreground/75' : 'text-muted/50'}`} title={m.puesto ? `Puesto ${m.puesto} en el Artificial Analysis Intelligence Index` : 'Fuera del top 10'}>
                  {m.puesto ?? '·'}
                </span>
                <div className={`min-w-0 flex-1 ${m.disponible ? '' : 'opacity-70'}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold text-foreground">{m.nombre}</span>
                    <span className="text-[11px] text-muted">{m.laboratorio} · {m.via === 'suscripcion' ? 'suscripción' : 'OpenRouter'}</span>
                  </div>
                  {m.disponible ? (
                    <p className="mt-0.5 text-xs leading-snug text-muted">
                      {m.descripcion}
                      {precio && <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted/80">{precio}{m.via === 'suscripcion' ? ' (referencia)' : ''}</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs leading-snug text-gold" data-motivo>{m.motivo}</p>
                  )}
                </div>
                {guardando === m.id && <Loader2 size={13} className="animate-spin text-muted" aria-hidden />}
                <Interruptor
                  activo={m.habilitado}
                  disabled={!m.disponible || guardando !== null}
                  etiqueta={`${m.habilitado ? 'Ocultar' : 'Mostrar'} ${m.nombre} en el selector`}
                  onCambio={(v) => void cambiar(m, v)}
                />
              </li>
            )
          })}
        </ul>
      )}

      {catalogo && (
        <p className="border-t border-border-subtle px-4 py-2.5 text-[11px] leading-snug text-muted sm:px-5">
          {catalogo.errorOpenRouter
            ? `OpenRouter no respondió (${catalogo.errorOpenRouter}): sus modelos quedan apagados hasta verificarlos.`
            : `Verificado contra el catálogo de OpenRouter${hora ? ` a las ${hora}` : ''}. Cambiar de motor en el chat abre una conversación nueva.`}
        </p>
      )}
    </section>
  )
}
