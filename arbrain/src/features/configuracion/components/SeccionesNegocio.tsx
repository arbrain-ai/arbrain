'use client'
/**
 * Ajustes › El negocio (6 oct 2026, Daniel: «una categoría llamada El negocio donde bajemos a tierra las cuestiones
 * estáticas: la misión, la visión, el equipo y organigrama»). Norte lee docs/business-os/norte.md; Equipo reusa el
 * organigrama de la vista «equipo» del panel; Clientes, Oferta y Embudo leen los canónicos del libro del negocio
 * (arbrain/server/src/cabina/negocio.ts). Una línea grande por tema, resumen de dos líneas, su fecha de revisión y
 * «Leer completo», que abre el documento como pestaña del panel. Nada de muros de texto.
 */
import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { VistaEquipo } from '@/features/cabina/vistas/Equipo'
import { urlNegocio, type Datos, type Fuente, type Tarjeta } from '@/features/cabina/vistas/Negocio'
import { urlDocumento } from '@/features/cabina/vistas/Documento'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { completarTitular, fuenteCorta, mayuscula, parseNorte, resumenSinTitular, revisionDe } from '../norte'
import n from '../negocio.module.css'
import { NOMBRE_DUENO } from '@/config'

export const RUTA_NORTE = 'docs/business-os/norte.md'

/** Abre el documento en el panel y cierra Ajustes para que se vea. */
function leerCompleto(ruta: string, titulo: string) {
  abrirSeccion({ vista: 'documento', ruta, titulo })
  useAjustes.getState().cerrar()
}

function LeerCompleto({ ruta, titulo }: { ruta: string; titulo: string }) {
  return <button type="button" className={n.leer} onClick={() => leerCompleto(ruta, titulo)} aria-label={`Leer completo: ${titulo}`}>
    Leer completo <ArrowRight className="size-3.5" aria-hidden />
  </button>
}

const Fuentecita = ({ f }: { f: string | null }) => f ? <p className={n.fuente} title={f}>{fuenteCorta(f)}</p> : null

export function SeccionNorte() {
  const { data, error } = useFuente<{ texto?: string; tipo?: string }>(urlDocumento(RUTA_NORTE))
  const norte = useMemo(() => (data?.texto ? parseNorte(data.texto) : null), [data?.texto])
  if (!data) return <div className={n.cargando} aria-busy="true">{error ? <p className={n.aviso}>{error}</p> : 'Abriendo el norte…'}</div>
  if (!norte || (!norte.vision && !norte.mision.length && !norte.principios.length)) return <p className={n.aviso}>El documento del norte no se pudo leer ({RUTA_NORTE}).</p>
  return (
    <div className={n.pagina} data-negocio="norte">
      <p className={n.ceja}>
        {norte.borrador && <span className={n.etiqueta} data-borrador>Borrador · sin firmar</span>}
        <span>Lo firma {NOMBRE_DUENO()}, en frío</span>
      </p>
      {norte.vision && <section className={n.bloque} aria-label="Visión">
        <p className={n.ceja}>Visión · a 10 años</p>
        <h3 className={n.titular} data-vision>{norte.vision.texto}</h3>
        <Fuentecita f={norte.vision.fuente} />
      </section>}
      {norte.mision.length > 0 && <section className={n.bloque} aria-label="Misión">
        <p className={n.ceja}>Misión</p>
        <div className={n.mision}>
          {norte.mision.map(m => <div key={m.quien}>
            <h3>{m.quien}{m.propuesta && <span className={n.etiqueta} data-quieta>Propuesta de Levy</span>}</h3>
            <p className={n.linea}>{m.texto}</p>
            <Fuentecita f={m.fuente} />
          </div>)}
        </div>
      </section>}
      {norte.principios.length > 0 && <section className={n.bloque} aria-label="Principios">
        <p className={n.ceja}>Principios</p>
        <ol className={n.principios}>
          {norte.principios.map((p, i) => <li key={i}><p>{p.texto}</p><Fuentecita f={p.fuente} /></li>)}
        </ol>
      </section>}
      <div className={n.pie}><LeerCompleto ruta={RUTA_NORTE} titulo="El norte" /></div>
    </div>
  )
}

export function SeccionEquipo() {
  return <div data-negocio="equipo"><VistaEquipo grande /></div>
}

function Tema({ f, etiqueta, ahora }: { f: Fuente; etiqueta?: string; ahora: number }) {
  const rev = revisionDe(f.revisado, ahora)
  const titular = mayuscula(completarTitular(f.titular || f.titulo, f.resumen))
  const resumen = resumenSinTitular(f.resumen, titular)
  return (
    <section className={n.bloque} aria-label={etiqueta ?? f.etiqueta}>
      {etiqueta && <p className={n.ceja}>{etiqueta}</p>}
      {!f.existe ? <p className={n.aviso}>Falta el documento ({f.ruta}).</p> : <>
        <h3 className={n.titular} data-largo={titular.length > 100 || undefined}>{titular}</h3>
        {resumen && <p className={n.resumen}>{resumen}</p>}
        <p className={n.pie}>
          <span>{rev.texto}</span>
          {rev.revisar && <span className={n.revisar} data-revisar>revisar</span>}
          <LeerCompleto ruta={f.ruta} titulo={f.titulo || f.etiqueta} />
        </p>
      </>}
    </section>
  )
}

/** Clientes, Oferta y Embudo: la tarjeta del libro del negocio, en grande y sin ruido. */
function SeccionLibro({ seccion, quienes }: { seccion: Tarjeta['seccion']; quienes: Array<{ indice: number; etiqueta?: string }> }) {
  const { data, error } = useFuente<Datos>(urlNegocio())
  const ahora = useMemo(() => Date.now(), [data?.leidoEn])
  if (!data) return <div className={n.cargando} aria-busy="true">{error ? <p className={n.aviso}>{error}</p> : 'Abriendo el libro del negocio…'}</div>
  const t = data.tarjetas.find(x => x.seccion === seccion)
  if (!t) return <p className={n.aviso}>El libro del negocio no trae esta sección.</p>
  return <div className={n.pagina} data-negocio={seccion}>
    {quienes.map(q => t.fuentes[q.indice] && <Tema key={q.indice} f={t.fuentes[q.indice]} etiqueta={q.etiqueta} ahora={ahora} />)}
  </div>
}

export const SeccionClientes = () => <SeccionLibro seccion="avatar" quienes={[{ indice: 0 }]} />
export const SeccionOferta = () => <SeccionLibro seccion="oferta" quienes={[{ indice: 0, etiqueta: 'Low ticket · la comunidad' }, { indice: 1, etiqueta: 'High ticket · el programa' }]} />
export const SeccionEmbudo = () => <SeccionLibro seccion="embudo" quienes={[{ indice: 0 }]} />
