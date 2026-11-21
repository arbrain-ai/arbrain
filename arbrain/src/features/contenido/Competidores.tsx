'use client'
/**
 * «Competidores» en Contenido (19 nov 2026, Daniel 14:07). Arriba, qué modelo de negocio predomina en la competencia
 * (canales por modelo, filtro hispano/anglo; tocar una barra filtra la lista). Abajo, quién vende qué: foto, nombre,
 * suscriptores, su oferta con precio y sus etiquetas. Tocar uno abre su ficha con «Su embudo». Sin texto largo.
 * Datos: `GET /api/contenido/competidores` (embudos.json) + foto y suscriptores del universo que ya trae la pantalla.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Swords } from 'lucide-react'
import { useCuartel, Vacio } from './piezas'
import { compacto } from './modelo'
import { conteoModelos, diaCorto, nombreModelo, type Competidor, type ModeloId } from './embudo'
import type { LecturaCuartel } from './tipos'
import s from './cuartel.module.css'

type Grupo = 'todos' | 'es' | 'en'
const GRUPOS: [Grupo, string][] = [['todos', 'Todos'], ['es', 'Hispanos'], ['en', 'Anglos']]

export function Competidores({ lectura }: { lectura: LecturaCuartel }) {
  const { irCanal } = useCuartel()
  const [datos, setDatos] = useState<{ corte: string | null; competidores: Competidor[] } | null>(null)
  const [error, setError] = useState(false)
  const [grupo, setGrupo] = useState<Grupo>('todos')
  const [modelo, setModelo] = useState<ModeloId | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/contenido/competidores', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => { if (vivo) setDatos(j) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [])
  const universo = useMemo(() => new Map((lectura.universo?.canales ?? []).map(c => [c.channel_id, c])), [lectura.universo])
  const delGrupo = useMemo(() => (datos?.competidores ?? []).filter(c => grupo === 'todos' || c.idioma === grupo), [datos, grupo])
  const barras = useMemo(() => conteoModelos(delGrupo), [delGrupo])
  const lista = useMemo(() => delGrupo.filter(c => !modelo || c.modelos.includes(modelo))
    .map(c => ({ c, u: universo.get(c.channel_id) }))
    .sort((a, b) => (b.u?.suscriptores ?? 0) - (a.u?.suscriptores ?? 0)), [delGrupo, modelo, universo])
  const max = barras[0]?.canales ?? 1

  if (error) return <section className={s.bloque}><Vacio>No pude leer los competidores.</Vacio></section>
  if (!datos) return <p className={s.pensando}><Loader2 size={13} className={s.gira} /> Leyendo competidores…</p>
  return <div className={s.competidores} data-testid="competidores">
    <section className={s.bloque}>
      <header className={s.bloqueCabeza}>
        <h3><Swords size={14} /> Qué modelo predomina <b className={s.cuenta}>{delGrupo.length} canales</b></h3>
        <div className={s.segmento} role="tablist" aria-label="Grupo">
          {GRUPOS.map(([g, t]) => <button key={g} role="tab" aria-selected={grupo === g} data-activo={grupo === g || undefined} onClick={() => { setGrupo(g); setModelo(null) }}>{t}</button>)}
        </div>
      </header>
      <ul className={s.barras} data-testid="barras-modelo">
        {barras.map(b => <li key={b.id}>
          <button onClick={() => setModelo(modelo === b.id ? null : b.id)} data-activo={modelo === b.id || undefined} data-apagado={(modelo && modelo !== b.id) || undefined}
            title={modelo === b.id ? 'Quitar el filtro' : `Ver solo ${b.nombre.toLowerCase()}`}>
            <span className={s.barraNombre}>{b.nombre}</span>
            <span className={s.barraPista}><i style={{ width: `${(b.canales / max) * 100}%` }} /></span>
            <b className={s.barraCifra}>{b.canales}<small> · {Math.round((b.canales / Math.max(delGrupo.length, 1)) * 100)} %</small></b>
          </button>
        </li>)}
      </ul>
    </section>
    <section className={s.bloque}>
      <header className={s.bloqueCabeza}>
        <h3>{modelo ? nombreModelo(modelo) : 'Todos'} <b className={s.cuenta}>{lista.length}</b></h3>
        <small>{modelo ? <button className={s.enlace} onClick={() => setModelo(null)}>quitar filtro</button> : null}{datos.corte ? ` dato del ${diaCorto(datos.corte)}` : ''}</small>
      </header>
      {lista.length ? <ul className={s.compLista}>
        {lista.map(({ c, u }) => <li key={c.channel_id}>
          <button onClick={() => irCanal(c.channel_id)} data-capa={u?.capa} title={`Ver el embudo de ${c.nombre}`}>
            {u?.miniatura_url ? <img src={u.miniatura_url} alt="" loading="lazy" /> : <i aria-hidden>{c.nombre.slice(0, 1)}</i>}
            <span className={s.compNombre}><strong>{c.nombre}</strong><small>{compacto(u?.suscriptores)} subs · {c.idioma === 'es' ? 'hispano' : c.idioma === 'en' ? 'anglo' : c.idioma}</small></span>
            <span className={s.compOferta} title={c.oferta ?? ''}>{c.oferta ?? <em>sin dato</em>}</span>
            <b className={s.compPrecio}>{c.precio ?? <em>—</em>}</b>
            <span className={s.compEtiquetas}>{c.modelos.slice(0, 4).map(m => <span key={m} data-activo={m === modelo || undefined}>{nombreModelo(m)}</span>)}</span>
          </button>
        </li>)}
      </ul> : <Vacio>Nadie con ese modelo en este grupo.</Vacio>}
    </section>
  </div>
}
