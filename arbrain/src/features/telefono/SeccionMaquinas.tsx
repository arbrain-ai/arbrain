'use client'
/**
 * Ajustes › Máquinas (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md): dónde corre tu Levy. Las máquinas
 * de tu cuenta en el relay de Arbrain (esta computadora, tu servidor…), si están listas, y «Abrir» para entrar a otra
 * con un enlace de un solo uso. «Agregar otra máquina» da un código de 10 minutos; la otra lo escribe aquí mismo.
 */
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Laptop, Loader2, Monitor, Plus, RefreshCw, Server, Trash2 } from 'lucide-react'
import { Aviso } from '@/features/primer-arranque/components/PanelLlaves'
import { estadoDeMaquina, horaCorta, tipoDeMaquina, type Maquina } from './conectar-ui'

async function pedir<T>(metodo: 'GET' | 'POST', cuerpo?: Record<string, string>): Promise<T> {
  const r = await fetch(metodo === 'GET' ? '/api/conectar?ver=maquinas' : '/api/conectar', metodo === 'GET'
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `Arbrain respondió ${r.status}.`)
  return j
}

const Icono = ({ tipo }: { tipo: string }) => (tipo === 'servidor' || tipo === 'linux' ? <Server className="size-4" aria-hidden /> : tipo === 'windows' ? <Monitor className="size-4" aria-hidden /> : <Laptop className="size-4" aria-hidden />)

export function SeccionMaquinas() {
  const [maquinas, setMaquinas] = useState<Maquina[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<{ codigo: string; vence: string } | null>(null)
  const [unir, setUnir] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [quitar, setQuitar] = useState<string | null>(null)

  const leer = useCallback(async () => {
    try { setMaquinas((await pedir<{ maquinas: Maquina[] }>('GET')).maquinas ?? []); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'No pude leer tus máquinas.') }
  }, [])
  useEffect(() => { void leer(); const t = setInterval(() => void leer(), 15_000); return () => clearInterval(t) }, [leer])

  const accion = async (nombre: string, f: () => Promise<void>) => {
    setOcupado(nombre); setError(null)
    try { await f() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.') } finally { setOcupado(null) }
  }

  const abrir = (m: Maquina) => accion(`abrir:${m.handle}`, async () => {
    const v = window.open('about:blank', '_blank')
    try {
      const j = await pedir<{ url: string }>('POST', { accion: 'abrir', handle: m.handle })
      if (v) { v.opener = null; v.location.href = j.url } else window.location.href = j.url
    } catch (e) { v?.close(); throw e }
  })

  return (
    <div className="space-y-4" data-seccion="maquinas">
      <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Dónde corre tu Levy">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-foreground">Dónde corre tu Levy</h3>
          <button type="button" className="btn-secondary !px-2 !py-1 text-[12px]" aria-label="Revisar de nuevo" onClick={() => void leer()}><RefreshCw className="size-3.5" aria-hidden /></button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">Cada computadora o servidor donde vive tu Arbrain, con su dirección privada. Desde cualquiera puedes abrir las demás.</p>

        {maquinas === null && !error && <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Revisando…</p>}
        {maquinas && maquinas.length === 0 && <Aviso tono="info" className="mt-3">Enciende «Tu Levy en el teléfono» en Ajustes › Teléfono y esta máquina aparece aquí.</Aviso>}
        {maquinas && maquinas.length > 0 && (
          <ul className="mt-3 divide-y divide-border-subtle rounded-xl border border-border-subtle" data-lista-maquinas>
            {maquinas.map((m) => (
              <li key={m.handle} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-maquina={m.handle}>
                <span className={`grid size-8 place-items-center rounded-lg ${m.conectada ? 'bg-success/12 text-success' : 'bg-surface text-muted'}`}><Icono tipo={m.tipo} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                    {m.esta ? (m.tipo === 'servidor' ? 'Este servidor' : 'Esta computadora') : tipoDeMaquina(m.tipo)}
                    <span className="font-normal text-muted">· {m.nombre}</span>
                    {m.esta && <span className="rounded-full bg-brand/12 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-ink">Aquí estás</span>}
                  </p>
                  <p className="text-[12px] text-muted"><span className={`mr-1 inline-block size-1.5 rounded-full align-middle ${m.conectada ? 'bg-success' : 'bg-muted'}`} aria-hidden />{estadoDeMaquina(m)}</p>
                </div>
                {!m.esta && (
                  <>
                    <button type="button" className="btn-secondary !px-2.5 !py-1 text-[12px]" disabled={!m.conectada || !!ocupado} onClick={() => void abrir(m)} title={m.conectada ? 'Entrar a esa máquina desde aquí' : 'Está sin conexión'}>
                      {ocupado === `abrir:${m.handle}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />} Abrir
                    </button>
                    <button type="button" className="btn-secondary !px-2 !py-1 text-[12px]" aria-label={`Quitar ${m.nombre} de tu cuenta`} disabled={!!ocupado}
                      onClick={() => (quitar === m.handle ? void accion(`quitar:${m.handle}`, async () => { await pedir('POST', { accion: 'quitar', handle: m.handle }); setQuitar(null); await leer() }) : setQuitar(m.handle))}>
                      <Trash2 className="size-3.5" aria-hidden />{quitar === m.handle ? ' ¿Quitarla?' : ''}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Agregar otra máquina">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Plus className="size-4" aria-hidden /> Agregar otra máquina</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">¿Tienes Arbrain también en tu servidor o en otra computadora? Pide aquí un código y escríbelo allá, en Ajustes › Máquinas. Sirve una vez y 10 minutos.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void accion('codigo', async () => setCodigo(await pedir<{ codigo: string; vence: string }>('POST', { accion: 'codigo-maquina' })))}>
            {ocupado === 'codigo' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} Código para otra máquina
          </button>
          {codigo && <span className="text-[13px] text-foreground" role="status">Escribe <strong className="font-mono text-[15px] tracking-wider" data-codigo-maquina>{codigo.codigo}</strong> en la otra, antes de las {horaCorta(codigo.vence)}.</span>}
        </div>
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); void accion('unir', async () => { await pedir('POST', { accion: 'unir', codigo: unir }); setUnir(''); await leer() }) }}>
          <label htmlFor="codigo-unir" className="text-[13px] text-muted">¿Te dieron un código en otra máquina?</label>
          <input id="codigo-unir" value={unir} onChange={(e) => setUnir(e.target.value)} placeholder="abcd-efgh" maxLength={9} className="w-32 rounded-lg border border-border-subtle bg-background px-2 py-1 font-mono text-[13px]" autoComplete="off" />
          <button type="submit" className="btn-primary !px-3 !py-1.5 text-[13px]" disabled={!unir.trim() || !!ocupado}>{ocupado === 'unir' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null} Unir a mi cuenta</button>
        </form>
      </section>

      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}
