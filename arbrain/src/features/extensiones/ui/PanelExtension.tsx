'use client'
/**
 * El panel de una extensión instalada (21 nov 2026, SPEC §2). Arbrain es el anfitrión:
 *   - pinta `panel/index.html` en un iframe `sandbox="allow-scripts"` por URL firmada (origen opaco, CSP sin red);
 *   - contesta sus `pedir` con la fuente `ext:` (solo lo declarado en su arbrain.json; lo demás `negado`) y re-lee cada 3 s:
 *     si cambió la fecha del archivo, vuelve a mandar `datos` (un censo nuevo se ve sin recargar);
 *   - le manda el `tema` (claro u oscuro y los colores de la marca del dueño);
 *   - una acción `chat:<id>` NO va sola a Levy: aparece arriba el texto declarado y el dueño lo manda con un clic (un
 *     panel no puede hablarle a Levy por su cuenta). `url:https://…` se abre en su navegador.
 * Lo que manda el iframe es dato no confiable: se valida con `leerMensajePanel` y solo se escucha a SU ventana.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquareText, X } from 'lucide-react'
import { leerMensajePanel, textoDeAccion, urlDeAccion, type Accion, type LecturaExt } from '../modelo'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { abrirEnNavegador } from '@/lib/navegador'
import { tr } from '@/shared/i18n'
import s from './extensiones.module.css'

interface InfoPanel { ok: boolean; url?: string; titulo?: string; acciones?: Accion[]; error?: string }

const RELECTURA_MS = 3_000
const COLORES: Record<string, string> = { acento: '--primary', fondo: '--background', tarjeta: '--card', tinta: '--foreground', tenue: '--muted' }

function temaDeLaApp() {
  const raiz = document.documentElement
  const estilo = getComputedStyle(raiz)
  const colores: Record<string, string> = {}
  for (const [k, v] of Object.entries(COLORES)) { const c = estilo.getPropertyValue(v).trim(); if (/^#[0-9a-f]{3,8}$/i.test(c)) colores[k] = c }
  return { tipo: 'tema' as const, modo: raiz.classList.contains('dark') ? 'oscuro' as const : 'claro' as const, colores }
}

export function PanelExtension({ id, nombre, onVolver }: { id: string; nombre: string; onVolver?: () => void }) {
  const [info, setInfo] = useState<InfoPanel | null>(null)
  const [pendiente, setPendiente] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const fuentes = useRef(new Map<string, string | null>())
  const ultimaUrl = useRef(0)

  useEffect(() => {
    let vivo = true
    setInfo(null)
    fetch(`/api/extensiones/${encodeURIComponent(id)}/panel`, { cache: 'no-store' })
      .then(r => r.json() as Promise<InfoPanel>)
      .catch(() => ({ ok: false, error: tr('sin conexión') }))
      .then(r => { if (vivo) setInfo(r) })
    return () => { vivo = false }
  }, [id])

  const mandar = useCallback((m: unknown) => { frame.current?.contentWindow?.postMessage(m, '*') }, [])

  const leer = useCallback(async (fuente: string, siempre: boolean) => {
    let r: LecturaExt
    try {
      r = await fetch(`/api/extensiones/${encodeURIComponent(id)}/fuente?f=${encodeURIComponent(fuente)}`, { cache: 'no-store' }).then(x => x.json() as Promise<LecturaExt>)
    } catch { return }
    if (!fuentes.current.has(fuente)) return
    if (!siempre && fuentes.current.get(fuente) === (r.fecha ?? null)) return
    fuentes.current.set(fuente, r.fecha ?? null)
    mandar({ tipo: 'datos', fuente, valor: r.valor ?? null, fecha: r.fecha ?? null, estado: r.estado, ...(r.error ? { error: r.error } : {}) })
  }, [id, mandar])

  useEffect(() => {
    if (!info?.ok) return
    const alMensaje = (ev: MessageEvent) => {
      if (!frame.current || ev.source !== frame.current.contentWindow) return
      const m = leerMensajePanel(ev.data)
      if (!m) return
      if (m.tipo === 'hola') mandar(temaDeLaApp())
      else if (m.tipo === 'pedir') { fuentes.current.set(m.fuente, null); void leer(m.fuente, true) }
      else if (m.tipo === 'soltar') fuentes.current.delete(m.fuente)
      else if (m.tipo === 'accion') {
        const texto = textoDeAccion(m.destino, { panel: { titulo: '', entrada: '', datos: [], acciones: info.acciones ?? [] } })
        if (texto) { setPendiente(texto); return }
        const url = urlDeAccion(m.destino)
        // Una URL por segundo como máximo: un panel no puede abrir pestañas en ráfaga.
        if (url && Date.now() - ultimaUrl.current > 1000) { ultimaUrl.current = Date.now(); void abrirEnNavegador(url) }
      }
    }
    window.addEventListener('message', alMensaje)
    const reloj = setInterval(() => { for (const f of fuentes.current.keys()) void leer(f, false) }, RELECTURA_MS)
    // El tema de la app cambia (claro/oscuro): el panel cambia con ella.
    const obs = new MutationObserver(() => mandar(temaDeLaApp()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const mapa = fuentes.current
    return () => { window.removeEventListener('message', alMensaje); clearInterval(reloj); obs.disconnect(); mapa.clear() }
  }, [info, leer, mandar])

  return (
    <section className={s.panel} data-prueba="panel-extension" data-extension={id}>
      <header className={s.panelCabeza}>
        {onVolver && <button type="button" className="pg-boton" onClick={onVolver}><ArrowLeft size={14} aria-hidden />{tr('Extensiones')}</button>}
        <h2 className={s.panelTitulo}>{info?.titulo ?? nombre}</h2>
        <span className={s.panelNota}>{tr('Vista aislada: el panel solo ve lo que su extensión declara.')}</span>
      </header>
      {pendiente && (
        <div className={s.pendiente} role="status" data-prueba="accion-pendiente">
          <MessageSquareText size={16} aria-hidden />
          <p><b>{tr('Levy recibirá:')}</b> «{pendiente}»</p>
          <button type="button" className={`pg-boton ${s.primario}`} onClick={() => { const t = pendiente; setPendiente(null); pedirALevy(t) }}>{tr('Mandar a Levy')}</button>
          <button type="button" className="pg-icono" aria-label={tr('Descartar')} onClick={() => setPendiente(null)}><X size={15} aria-hidden /></button>
        </div>
      )}
      {!info ? <p className={s.vacio}>{tr('Abriendo el panel…')}</p>
        : !info.ok || !info.url ? <p className="pg-aviso">{info.error ? tr(info.error) : tr('No se pudo abrir el panel.')}</p>
        : <iframe ref={frame} key={info.url} className={s.iframe} title={info.titulo ?? nombre} sandbox="allow-scripts" src={info.url} referrerPolicy="no-referrer" />}
    </section>
  )
}
