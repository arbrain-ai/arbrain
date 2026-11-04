'use client'
/**
 * «Tu socio estratega»: la pantalla con la que abre Arbrain al terminar el onboarding v2 (3 nov 2026). PROTOTIPO
 * detrás de `ARBRAIN_ONBOARDING_V2` (apagado); lo pinta `/inicio-v2` dentro del shell real. En la versión final es el
 * estado vacío del chat (SPEC › «Tu socio estratega»).
 *
 * De Cloudroom v140 copia la forma: caja grande para pedir, pedidos de un clic debajo (el clic ENVÍA) y la tarjeta
 * «Empieza aquí N de 5» a la derecha (tocar una casilla llena la caja sin enviar; «Ocultar» 8 horas). Funciona con los
 * puentes que ya existen: `pedirALevy` (envía en el chat) y `cabina:redactar` (deja el texto en la caja del chat).
 * Las señales salen de datos de ejemplo; con `?vivo=1`, de `/api/progreso` y `/api/telefono` (edición cliente).
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUp, Check, EyeOff } from 'lucide-react'
import { Retrato } from '@/shared/components/Retrato'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { CASILLAS, DATOS_CASILLA, guardar, hechas as unir, ocultar, progreso, visible, type Casilla, type Guardado, type Senales } from '../empieza-aqui'
import { PEDIDOS_SOCIO, PISTA_SOCIO, PLACEHOLDER_SOCIO } from '../prompts'
import { CUENTA_DEMO, META_DEMO, SENALES_DEMO } from '../demo'

const CLAVE = 'arbrain-empieza-aqui-v2'
const VACIO: Guardado = { hechas: [], ocultaHasta: null }

function saludo(h = new Date().getHours()) { return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }

/** Señales reales (edición cliente): lo que hoy se puede medir. Lo que no, llega `false` (nunca hecho por defecto). */
async function senalesVivas(): Promise<Senales> {
  const json = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
  const [p, t] = await Promise.all([json('/api/progreso'), json('/api/telefono')]) as [
    { camino?: { ultimo?: number | null }; vista_previa?: { metas?: Record<'mes' | 'dia', { presente?: boolean }> } } | null,
    { estado?: string } | null,
  ]
  return {
    camino: !!p?.camino?.ultimo,
    meta: p?.vista_previa?.metas?.mes?.presente === true,
    ritual: p?.vista_previa?.metas?.dia?.presente === true,
    telefono: t?.estado === 'encendido',
    loop: false,
  }
}

export function SocioEstratega() {
  const vivo = useMemo(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vivo') === '1', [])
  const [texto, setTexto] = useState('')
  const [guardado, setGuardado] = useState<Guardado>(VACIO)
  const [senales, setSenales] = useState<Senales>(vivo ? {} : SENALES_DEMO)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); if (g && Array.isArray(g.hechas)) setGuardado(g) } catch { /* sin almacenamiento */ }
    setListo(true)
    if (!vivo) return
    void senalesVivas().then(setSenales)
    const t = window.setInterval(() => void senalesVivas().then(setSenales), 30_000) // como Cloudroom: cada 30 s
    return () => window.clearInterval(t)
  }, [vivo])

  const h = useMemo(() => unir(guardado, senales), [guardado, senales])
  const pr = progreso(h)
  // Lo hecho se guarda (solo crece): si mañana la señal se pierde, la casilla sigue marcada.
  useEffect(() => {
    if (!listo) return
    const g = guardar(guardado, h)
    if (g.hechas.length !== guardado.hechas.length) { setGuardado(g); try { localStorage.setItem(CLAVE, JSON.stringify(g)) } catch { /* sin almacenamiento */ } }
  }, [h, guardado, listo])

  const enviar = (t: string) => { if (t.trim()) pedirALevy(t.trim()) }
  const tocarCasilla = (c: Casilla) => {
    const d = DATOS_CASILLA[c]
    if (d.abre) { window.location.assign(d.abre); return }
    try { sessionStorage.setItem('cabina:redactar', d.pedido ?? '') } catch { /* sin almacenamiento */ }
    window.location.assign('/chat')
  }
  const esconder = () => { const g = ocultar(guardado); setGuardado(g); try { localStorage.setItem(CLAVE, JSON.stringify(g)) } catch { /* nada */ } }
  const nombre = vivo ? '' : CUENTA_DEMO.nombre

  return (
    // El corte de dos columnas mide el área útil (container query), no la ventana: con la barra lateral y zoom 1.4 una laptop
    // de 1280 deja ~670 px CSS y las dos columnas no caben (medido en las capturas del 3 nov).
    <div data-socio-estratega className="@container relative h-full w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col gap-8 px-5 py-8 @[70rem]:flex-row @[70rem]:items-center @[70rem]:gap-10 @[70rem]:py-12">
        <section className="flex min-w-0 flex-1 flex-col items-center">
          <p className="mb-3 rounded-full border border-brand/25 bg-brand/[0.06] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-ink">Tu socio estratega</p>
          <div className="chat-vacio-titular flex items-center gap-3">
            <Retrato agente="levy" size={44} prioridad className="size-11 shrink-0 rounded-full border border-brand/25 object-cover" alt="" />
            <h1 className="chat-vacio-saludo" suppressHydrationWarning>{saludo()}{nombre ? `, ${nombre}` : ''}</h1>
          </div>
          {!vivo && <p className="mt-3 text-center text-[14px] text-muted">Tu meta: <b className="font-semibold text-foreground/90">{META_DEMO.texto}</b> para {META_DEMO.para}. Hoy te ayudo a acercarte.</p>}

          <form className="mt-6 w-full max-w-[720px]" onSubmit={x => { x.preventDefault(); enviar(texto) }}>
            <div className="glass-panel-strong rounded-[22px] p-3 focus-within:ring-2 focus-within:ring-brand/40">
              <textarea value={texto} onChange={x => setTexto(x.target.value)} rows={3} placeholder={PLACEHOLDER_SOCIO} aria-label="Pídele algo a tu socio"
                onKeyDown={x => { if (x.key === 'Enter' && !x.shiftKey) { x.preventDefault(); enviar(texto) } }}
                className="block w-full resize-none bg-transparent px-2 py-1.5 text-[15.5px] leading-relaxed text-foreground outline-none placeholder:text-muted/80" />
              <div className="flex items-center justify-between gap-3 px-1 pt-1">
                <span className="text-[12px] text-muted">{PISTA_SOCIO}</span>
                <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="btn-primary grid size-10 place-items-center rounded-full p-0 disabled:opacity-40"><ArrowUp className="size-4" aria-hidden /></button>
              </div>
            </div>
          </form>

          <div className="mt-7 flex w-full max-w-[720px] items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted" aria-hidden>
            <span className="h-px flex-1 bg-foreground/10" /> Pedidos de un clic <span className="h-px flex-1 bg-foreground/10" />
          </div>
          <ul className="mt-3 grid w-full max-w-[720px] gap-2.5 sm:grid-cols-2" aria-label="Pedidos de un clic">
            {PEDIDOS_SOCIO.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => enviar(p.pedido)} title={p.pedido} data-pedido={p.id}
                  className="group flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.05] focus-visible:outline-2 focus-visible:outline-brand">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-snug text-foreground">{p.etiqueta}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">{p.como}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-ink" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {listo && visible(guardado, h) && (
          <aside data-empieza-aqui aria-label="Empieza aquí" className="glass-panel-strong w-full max-w-[720px] shrink-0 self-center rounded-[14px] p-4 @[70rem]:w-[320px]">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[14.5px] font-semibold">Empieza aquí</p>
              <span className="text-[12.5px] font-medium tabular-nums text-muted">{pr.hechas} de {pr.total}</span>
              <button type="button" onClick={esconder} title="Se oculta 8 horas. Desaparece para siempre cuando completes las cinco." className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-muted hover:bg-foreground/[0.06]"><EyeOff className="size-3.5" aria-hidden /> Ocultar</button>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden><span className="block h-full rounded-full bg-brand-ink transition-all" style={{ width: `${(pr.hechas / pr.total) * 100}%` }} /></div>
            <ol className="mt-3 grid gap-1">
              {CASILLAS.map(c => {
                const d = DATOS_CASILLA[c]
                const hecha = h.has(c)
                const siguiente = pr.siguiente === c
                return (
                  <li key={c}>
                    <button type="button" onClick={() => tocarCasilla(c)} disabled={hecha} data-casilla={c} data-hecha={hecha || undefined}
                      className={`group flex min-h-12 w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left ${hecha ? '' : 'hover:bg-foreground/[0.05]'} ${siguiente ? 'bg-brand/[0.06]' : ''}`}>
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${hecha ? 'border-transparent bg-success/20 text-success' : siguiente ? 'border-brand-ink' : 'border-foreground/25'}`} aria-hidden>
                        {hecha ? <Check className="size-3" /> : siguiente ? <span className="size-1.5 rounded-full bg-brand-ink" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13.5px] font-semibold leading-snug ${hecha ? 'text-muted line-through' : 'text-foreground'}`}>{d.titulo}</span>
                        {!hecha && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{d.para}</span>}
                      </span>
                      {!hecha && <span className={`mt-0.5 shrink-0 text-[12px] font-semibold text-brand-ink ${siguiente ? '' : 'opacity-0 group-hover:opacity-100'}`}>Empezar →</span>}
                      <span className="sr-only">{hecha ? 'hecha' : `pendiente: ${d.hechaCuando}`}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-muted">Se marcan solas cuando lo haces.</p>
          </aside>
        )}
      </div>
    </div>
  )
}
