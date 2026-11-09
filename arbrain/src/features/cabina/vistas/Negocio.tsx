'use client'
import dynamic from 'next/dynamic'
import { useFuente } from '../datos'
import type { SeccionNegocio } from '../model'
import { rutaDe } from '../model'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { escucharPedido, EVENTO_ETAPA_NEGOCIO, LLAVE_ETAPA_NEGOCIO } from '@/shared/navigation/ir-a'
import { PanelEmbudo } from '@/features/negocio/PanelEmbudo'
import { ElPulso } from '@/features/negocio/ElPulso'
import { esEdicionCliente } from '@/lib/edicion'
import pv from '@/features/negocio/pulso.module.css'
import { ArrowLeft } from 'lucide-react'
import { URL_EMBUDO, type RespuestaEmbudo } from '@/features/negocio/embudo'
import s from '../cabina.module.css'
import l from '@/features/rutinas/loops.module.css'

const MarkdownMessage = dynamic(() => import('@/features/chat/components/MarkdownMessage').then(m => m.MarkdownMessage), { loading: () => <p className={s.vacio}>…</p> })

export interface Fuente { etiqueta: string; ruta: string; titulo: string; titular: string; resumen: string; revisado: string | null; origenFecha: 'git' | 'local' | null; viejo: boolean; existe: boolean; texto?: string }
export interface Tarjeta { seccion: SeccionNegocio; titulo: string; fuentes: Fuente[]; lienzo?: { paginaId: string; nombre: string } }
export interface Datos { tarjetas: Tarjeta[]; indice: string; leidoEn: string }

export const urlNegocio = (texto?: boolean) => `/api/cabina/negocio${texto ? '?texto=1' : ''}`

function revision(f: Fuente) {
  if (!f.revisado) return 'sin fecha de revisión'
  const d = new Date(f.revisado), dias = Math.floor((Date.now() - d.getTime()) / 86400_000)
  const fecha = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' })
  return `revisado ${fecha}${dias > 0 ? ` · hace ${dias} ${dias === 1 ? 'día' : 'días'}` : ' · hoy'}${f.origenFecha === 'local' ? ' (sin commit)' : ''}`
}

/**
 * Tu negocio. Con ARBRAIN_PANEL_NEGOCIO=1 (prototipo del 4 nov 2026) la vista es «El pulso» (7 nov, features/negocio/ElPulso):
 * seis órganos con su número vivo, la Mente del comprador como órgano y el botón al lienzo del sistema nervioso. El libro ya
 * no se le muestra al dueño (Daniel, 7 nov: «el libro no debería verlo… luce aburrido»): su texto sigue en /api/cabina/negocio
 * para Levy. Las etapas y skills del embudo (PanelEmbudo) se abren desde el pie del pulso o cuando Habilidades pide una etapa.
 * Apagado, la API responde { activo: false } y la vista es el libro, igual que siempre.
 */
export function VistaNegocio({ seccion, grande }: { seccion?: SeccionNegocio; grande?: boolean }) {
  const lectura = useFuente<RespuestaEmbudo>(URL_EMBUDO), sistema = lectura.data
  const [parte, setParte] = useState<'pulso' | 'etapas'>(seccion === 'embudo' ? 'etapas' : 'pulso')
  // Habilidades › «Ver en tu negocio» pide una etapa: se ve en las etapas (PanelEmbudo toma el pedido y enfoca).
  useEffect(() => {
    try { if (localStorage.getItem(LLAVE_ETAPA_NEGOCIO)) setParte('etapas') } catch { /* sin almacenamiento */ }
    return escucharPedido(EVENTO_ETAPA_NEGOCIO, () => setParte('etapas'))
  }, [])
  // Mientras llega el interruptor no se asoma el libro (antes parpadeaba un instante antes del panel).
  if (!sistema && !lectura.error) return <div className={s.cargando} aria-busy="true">Abriendo tu negocio…</div>
  // En la edición del alumno no existe el libro del autor: apagado (ARBRAIN_PANEL_NEGOCIO=0), lo dice y ya.
  if (!sistema?.activo) return esEdicionCliente() ? <p className={s.aviso}>Tu negocio está apagado en esta instalación (ARBRAIN_PANEL_NEGOCIO=0).</p> : <LibroNegocio seccion={seccion} grande={grande} />
  if (parte === 'pulso') return <ElPulso embudo={sistema.embudo} grande={grande} inicio={seccion === 'avatar' ? 'comprador' : undefined} verEtapas={() => setParte('etapas')} />
  return <div className={l.loops}>
    <button type="button" className={pv.volver} onClick={() => setParte('pulso')} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} aria-hidden />El pulso</button>
    <PanelEmbudo datos={sistema} grande={grande} />
  </div>
}

/** El libro del negocio: avatar, oferta, embudo y sistema, cada uno con su canónico y su fecha. */
function LibroNegocio({ seccion, grande }: { seccion?: SeccionNegocio; grande?: boolean }) {
  const { data, error } = useFuente<Datos>(urlNegocio(grande))
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Abriendo el libro del negocio…'}</div>
  const orden = seccion ? [...data.tarjetas].sort((a, b) => Number(b.seccion === seccion) - Number(a.seccion === seccion)) : data.tarjetas
  return <div className={`${s.negocio} ${grande ? s.negocioGrande : ''}`}>
    {orden.map(t => <section key={t.seccion} className={`${s.tarjetaNegocio} ${t.seccion === seccion ? s.enfocada : ''}`} aria-label={t.titulo}>
      <h4>{t.titulo}</h4>
      {t.fuentes.map(f => <div key={f.ruta} className={s.fuenteNegocio}>
        {t.fuentes.length > 1 && <span className={s.etiquetaFuente}>{f.etiqueta}</span>}
        {!f.existe ? <p className={s.aviso}>Falta el documento ({f.ruta}).</p> : <>
          {f.titular && <p className={s.titularNegocio}>{f.titular}</p>}
          <p className={s.resumenNegocio}>{f.resumen || f.titulo}</p>
          <p className={s.revision}>
            <span className={f.viejo ? s.viejo : ''}>{f.viejo ? 'Por revisar · ' : ''}{revision(f)}</span>
            <code title={f.ruta}>{f.ruta.split('/').pop()}</code>
          </p>
          {grande && f.texto && <details className={s.canonico}><summary>Leer completo</summary><MarkdownMessage content={f.texto} /></details>}
        </>}
      </div>)}
      {t.lienzo && <p className={s.revision}>
        <Link className={s.accionSec} href={rutaDe({ destino: 'lienzo', paginaId: t.lienzo.paginaId })}>Mapa «{t.lienzo.nombre}»</Link>
      </p>}
    </section>)}
    <p className={s.fuente}>Índice: {data.indice}. Cada tarjeta lee su documento al abrirse; «por revisar» = más de 21 días sin cambios.</p>
  </div>
}

export function resumenNegocio(d: Datos | undefined) {
  if (!d) return null
  const viejos = d.tarjetas.flatMap(t => t.fuentes).filter(f => f.viejo).length
  return viejos ? `${viejos} ${viejos === 1 ? 'documento' : 'documentos'} por revisar` : 'todo revisado'
}
