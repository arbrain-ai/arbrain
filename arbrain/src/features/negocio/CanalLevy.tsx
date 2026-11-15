'use client'
/**
 * Tu negocio › Marketing › Canal de Levy: el marcador por video (9 nov 2026). La vara es la de Business Intelligence: arriba
 * habla el canal (una línea), debajo la semana y después una placa por video, con los mismos siete números y en el orden del
 * embudo. Cada número lleva su fuente y su fecha; lo que aún no llega se lee «aún sin dato», apagado. Sin metas ni semáforos.
 * Datos y reglas: features/negocio/marcador-levy.ts.
 */
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { escalon, mov } from '@/shared/movimiento'
import { dm } from './marketing'
import { METRICAS, URL_MARCADOR, type Celda, type FilaVideo, type RespuestaMarcador } from './marcador-levy'
import c from './canal-levy.module.css'

const CDMX: Intl.DateTimeFormatOptions = { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
const foto = (iso: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleString('es-MX', CDMX) }

export function CanalLevy({ grande, volver }: { grande?: boolean; volver: () => void }) {
  const { data, error } = useFuente<RespuestaMarcador>(URL_MARCADOR)
  const on = data?.activo ? data : null
  const cuando = foto(on?.generado ?? null)
  return <div className={`${c.canal} ${grande ? c.grande : ''}`} data-testid="canal-levy">
    <div className={c.luna} aria-hidden />
    <div className={`${c.barra} ${mov.entra}`} style={escalon(0)}>
      <button type="button" className={c.volver} onClick={volver}><ArrowLeft size={14} aria-hidden />El pulso</button>
      {cuando && <span className={c.sello}>Sensor del {cuando}</span>}
    </div>

    <header className={`${c.cabeza} ${mov.entra}`} style={escalon(1)}>
      <p className={c.ceja}>Marketing · <b>canal de Levy</b></p>
      <h3 className={c.palabra}>El marcador por video</h3>
      {on ? <p className={c.lectura}><span>Levy</span>{on.lectura}</p> : <p className={c.lectura}>{error ? `No se pudo leer: ${error}` : 'Leyendo el marcador…'}</p>}
      {on?.falta && <p className={c.aviso}>{on.falta}</p>}
      {on?.error && <p className={c.aviso}>Última lectura con error, los números son de la foto anterior: {on.error}</p>}
    </header>

    {on && <>
      <section className={`${c.placa} ${c.semana} ${mov.entra}`} style={escalon(2)} aria-label="Total de la semana" data-testid="canal-semana">
        <p className={c.etiqueta}>La semana{on.semana.rango ? <small>{on.semana.rango}</small> : null}</p>
        <Celdas celdas={on.semana.celdas} grande />
      </section>

      <section aria-label="Por video">
        <p className={`${c.etiqueta} ${c.etiquetaSuelta} ${mov.entra}`} style={escalon(3)}>Por video{on.videos.length ? <small>acumulado desde que salió</small> : null}</p>
        {on.videos.length
          ? <ul className={c.videos}>{on.videos.map((v, i) => <li key={v.id} className={mov.entra} style={escalon(4 + i)}><Video v={v} /></li>)}</ul>
          : <div className={c.vacio} data-testid="canal-sin-videos">
              <p><b>Todavía no hay videos en el canal.</b> Cada uno tendrá aquí su fila con estas cifras, en este orden:</p>
              <ol className={c.orden}>{METRICAS.map(m => <li key={m.id}>{m.etiqueta}</li>)}</ol>
            </div>}
      </section>

      <p className={c.pie}>Los números son espejo, no objetivo. YouTube entrega con 1 a 3 días de retraso y las miniaturas hasta 48 h después; el sensor corre cada mañana.</p>
    </>}
  </div>
}

function Celdas({ celdas, grande }: { celdas: Celda[]; grande?: boolean }) {
  return <dl className={c.celdas} data-grande={grande || undefined}>
    {celdas.map((x, i) => <div key={x.id} className={c.celda} data-metrica={x.id} data-espera={x.valor === null || undefined} title={x.motivo}>
      <dt>{x.etiqueta}{i < celdas.length - 1 && <ChevronRight className={c.flecha} size={11} aria-hidden />}</dt>
      <dd className={c.valor}>{x.valor ?? x.espera}</dd>
      <dd className={c.fuente}>{x.valor !== null ? `${x.fuente} · ${x.fecha}` : `${x.fuente}${x.motivo ? ` · ${x.motivo}` : ''}`}</dd>
    </div>)}
  </dl>
}

function Video({ v }: { v: FilaVideo }) {
  return <article className={c.placa} data-estado={v.estado} data-testid="canal-video">
    <header className={c.videoCabeza}>
      {v.url ? <a className={c.titulo} href={v.url} target="_blank" rel="noreferrer">{v.titulo}<ExternalLink size={12} aria-hidden /></a> : <span className={c.titulo}>{v.titulo}</span>}
      <span className={c.meta}>{v.tipo ? `${v.tipo === 'largo' ? 'Largo' : 'Corto'} · ` : ''}{v.estado === 'programado' ? `sale el ${dm(v.publicado)}` : `salió el ${dm(v.publicado)}`}</span>
    </header>
    <Celdas celdas={v.celdas} />
  </article>
}
