'use client'
/**
 * Tu negocio › El pulso › Estrategia (8 nov 2026). La tarjeta que va encima de los seis órganos: la cabeza del negocio y la
 * entrada a la sección Estrategia (features/negocio/SeccionEstrategia.tsx, «como ya lo vemos en contenido»). Dice en tres líneas
 * a quién sirves, contra qué te comparan y a qué precio, y cuatro accesos con su número abren la sección en esa pestaña,
 * en una pestaña del panel. Todo sale de `mercado.json` por /api/negocio/estrategia; cada línea con su fuente y su fecha.
 * En la edición del alumno, sin su investigación, dice «Conecta tu investigación» y no pinta nada más.
 */
import type { ReactNode } from 'react'
import { ChevronRight, Compass, EyeOff } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { esEdicionCliente } from '@/lib/edicion'
import { escalon, mov } from '@/shared/movimiento'
import {
  EVENTO_VISTA_ESTRATEGIA, fechaHumana, LLAVE_VISTA_ESTRATEGIA, pie, sinFirmar, URL_ESTRATEGIA, VISTAS,
  type Mercado, type RespuestaEstrategia, type Vista,
} from './estrategia'
import p from './pulso.module.css'
import e from './estrategia.module.css'

const PREGUNTA = '¿A quién sirves, contra qué te comparan y a qué precio?'

/** Abre la sección Estrategia en una pestaña del panel, en la pestaña pedida (la llave cubre la vista sin montar; el evento, la ya abierta). */
export function abrirEstrategia(vista?: Vista) {
  if (vista) { try { localStorage.setItem(LLAVE_VISTA_ESTRATEGIA, vista) } catch { /* el evento basta si ya está montada */ } }
  abrirSeccion({ vista: 'estrategia' })
  if (vista) window.dispatchEvent(new CustomEvent<string>(EVENTO_VISTA_ESTRATEGIA, { detail: vista }))
}

/** El número de cada acceso: lo que esa pestaña trae. Sin bloque, null (el acceso dice «sin datos»). */
function cuenta(v: Vista, m: Mercado): { n: number; que: string } | null {
  if (v === 'compra') { const q = m.quien_compra; return q ? { n: q.escalones.reduce((s, x) => s + x.segmentos.length, 0), que: 'segmentos' } : null }
  if (v === 'contra') { const c = m.contra_quien; return c ? { n: c.hispanos.length + c.anglos.length, que: 'competidores' } : null }
  if (v === 'rumbo') { const h = m.hacia_donde; return h ? { n: h.tendencias.length, que: 'tendencias' } : null }
  const d = m.lo_que_decides
  return d ? { n: sinFirmar(d), que: 'sin firmar' } : null
}

export function TarjetaEstrategia({ grande }: { grande?: boolean }) {
  const { data, error } = useFuente<RespuestaEstrategia>(URL_ESTRATEGIA)
  if (data && !data.activo) return null
  const on = data?.activo ? data : null
  const cliente = on ? on.cliente : esEdicionCliente()
  const datos = on?.datos ?? null

  let cuerpo: ReactNode
  let estado: 'leyendo' | 'vacia' | 'error' | 'lista'
  if (!data && !error) { estado = 'leyendo'; cuerpo = <span className={e.leyendo} aria-busy="true"><span className={p.esqueleto} /><span className={`${p.esqueleto} ${p.corto}`} /></span> }
  else if ((!on && cliente) || (on && !on.existe)) { estado = 'vacia'; cuerpo = <Vacia /> }
  else if (!on) { estado = 'error'; cuerpo = <span className={p.lectura}><span className={p.sinDatos}>No se pudo leer ahora</span><span className={p.detalle}>{error}</span></span> }
  else if (!datos) {
    estado = 'error'
    cuerpo = <span className={p.lectura}><span className={p.sinDatos}>La investigación no se pudo leer</span>{on.errores?.slice(0, 3).map(x => <span key={x} className={p.detalle}>{x}</span>)}</span>
  } else {
    estado = 'lista'
    cuerpo = <>
      {datos.cabeza && <dl className={e.cabeza}>{datos.cabeza.lineas.map(l => <div key={l.pregunta}>
        <dt>{l.pregunta}</dt>
        <dd>{l.respuesta}<small>{pie(l, datos.actualizado)}</small></dd>
      </div>)}</dl>}
      {on.directo && <p className={e.directo}><EyeOff size={12} aria-hidden />En directo: tus números quedan fuera; lo público se ve.</p>}
      <div className={e.accesos} aria-label="Abrir Estrategia">
        {VISTAS.map(v => {
          const oculto = on.oculto.includes(v.id), c = oculto ? null : cuenta(v.id, datos)
          return <button key={v.id} type="button" data-vista={v.id} data-pendiente={v.id === 'decides' && c && c.n > 0 ? '' : undefined} onClick={() => abrirEstrategia(v.id)} aria-label={`${v.nombre}: abrir en Estrategia`}>
            <span className={e.accesoNombre}>{oculto && <EyeOff size={11} aria-hidden />}{v.nombre}</span>
            {c ? <span className={e.accesoCifra}><b>{c.n}</b><small>{c.que}</small></span>
              : <span className={e.accesoCifra}><small>{oculto ? 'oculto en directo' : 'sin datos'}</small></span>}
          </button>
        })}
      </div>
      {on.errores?.length ? <p className={e.avisoErrores}>{on.errores.length} {on.errores.length === 1 ? 'pieza no se pudo leer' : 'piezas no se pudieron leer'}: {on.errores[0]}</p> : null}
    </>
  }

  const abre = estado === 'lista'
  return <section className={`${e.tarjeta} ${mov.entra}`} style={escalon(2)} data-testid="estrategia" data-estado={estado} aria-label="Estrategia">
    {abre
      ? <button type="button" className={`${p.tarjetaCabeza} ${e.abrir}`} onClick={() => abrirEstrategia()} aria-label="Estrategia: abrir la sección">
        <span className={p.icono} aria-hidden><Compass size={15} strokeWidth={2.1} /></span>
        <span className={p.nombre}>Estrategia</span>
        {datos?.actualizado && <small className={e.fecha}>Investigación del {fechaHumana(datos.actualizado)}</small>}
        <ChevronRight className={p.chevron} size={15} aria-hidden />
      </button>
      : <span className={p.tarjetaCabeza}>
        <span className={p.icono} aria-hidden><Compass size={15} strokeWidth={2.1} /></span>
        <span className={p.nombre}>Estrategia</span>
      </span>}
    <span className={p.pregunta}>{PREGUNTA}</span>
    {cuerpo}
    <span className={p.fuente}>Fuente: {estado === 'lista' ? 'tu investigación de mercado (mercado.json), cada cifra con la suya' : 'mercado.json, cuando exista'}</span>
  </section>
}

function Vacia() {
  return <span className={p.lectura}>
    <span className={p.sinDatos}>Conecta tu investigación</span>
    <span className={p.falta}>Pídele a Levy que investigue tu mercado: quién te compra de verdad, contra quién te comparan, a qué precio y hacia dónde va. Aparece aquí en cuanto exista <code>mercado.json</code> en tu cerebro. Nada se inventa mientras tanto.</span>
  </span>
}
