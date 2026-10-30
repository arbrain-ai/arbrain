'use client'
/**
 * Equipo (5 oct 2026, el dueño: «ya somos dos perfiles; quiero un panel para monitorear el negocio desde arriba, un
 * organigrama (pienso contratar en el futuro), con mi foto y la de la socia»).
 *
 * El organigrama vivo: El dueño arriba, debajo la socia y el lugar de la próxima contratación, y los agentes (Levy, Trinity,
 * Sensei) con su cara. Cada uno dice qué le llega, de qué se encarga y su último movimiento en Arbrain. Solo lectura.
 * Es la vista de administrador del dueño (5 oct 07:50): La socia ve lo mismo que él, sin modos ni permisos por persona.
 * Un solo componente: pestaña del «+» del panel (560 px) y sección /equipo (ancha).
 */
import { useAhora } from '../useAhora'
import { useFuente } from '../datos'
import { escalon } from '../movimiento'
import { Retrato } from '@/shared/components/Retrato'
import { AGENTES_EQUIPO, hace, personaDe, PUESTOS, ultimoMovimiento, type FotoEquipo, type PersonaVivo, type Puesto } from './equipo-modelo'
import s from '../cabina.module.css'
import l from '../luz.module.css'
import e from './equipo.module.css'

export const URL_EQUIPO = '/api/equipo'

function Foto({ src, nombre, grande }: { src: string | null; nombre: string; grande?: boolean }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={e.foto} data-grande={grande || undefined} src={src} alt={`Foto de ${nombre}`} loading="lazy" />
    : <span className={e.foto} data-grande={grande || undefined} data-vacia aria-hidden>{nombre.charAt(0)}</span>
}

function Movimiento({ p, ahora }: { p: PersonaVivo | null; ahora: number }) {
  const m = p && ultimoMovimiento(p)
  if (!m) return <p className={e.movimiento} data-sin>Último movimiento: sin dato</p>
  const reciente = ahora - Date.parse(m.en) < 15 * 60_000
  return <p className={e.movimiento} data-vivo={reciente || undefined}>
    <i aria-hidden />{m.que === 'entro' ? 'Entró a Arbrain' : 'En Arbrain'} {hace(m.en, ahora)}
  </p>
}

function Persona({ puesto, p, ahora, i, arriba }: { puesto: Puesto; p: PersonaVivo | null; ahora: number; i: number; arriba?: boolean }) {
  return <article className={`${e.nodo} ${l.entra}`} style={escalon(i)} data-arriba={arriba || undefined} aria-label={`${puesto.nombre}, ${puesto.rol}`}>
    <header className={e.cabeza}>
      <Foto src={p?.avatar ?? null} nombre={puesto.nombre} grande={arriba} />
      <div className={e.quien}>
        <h3>{puesto.nombre}</h3>
        <p className={e.rol}>{puesto.rol}</p>
        <Movimiento p={p} ahora={ahora} />
      </div>
    </header>
    <div className={e.bloques}>
      <section>
        <h4>Le llega</h4>
        <ul>{puesto.recibe.map(r => <li key={r}>{r}</li>)}</ul>
        {p && <p className={e.campana}>
          {p.sinLeer == null ? 'Campana: sin dato' : p.sinLeer ? `${p.sinLeer} aviso${p.sinLeer === 1 ? '' : 's'} sin leer` : 'Campana al día'}
          {p.ultimoAviso && <> · último {hace(p.ultimoAviso.en, ahora)}</>}
          {p.push === false && <> · <b>sin push en el teléfono</b></>}
        </p>}
      </section>
      <section>
        <h4>Se encarga de</h4>
        <ul>{puesto.responsabilidades.map(r => <li key={r}>{r}</li>)}</ul>
      </section>
    </div>
  </article>
}

function Vacante({ i }: { i: number }) {
  return <article className={`${e.nodo} ${l.entra}`} style={escalon(i)} data-vacante aria-label="Próxima contratación">
    <header className={e.cabeza}>
      <span className={e.foto} data-vacia aria-hidden>+</span>
      <div className={e.quien}><h3>Próxima contratación</h3><p className={e.rol}>Puesto por definir</p></div>
    </header>
    <p className={e.nota}>Cuando contrates, su cuenta de Arbrain aparece aquí con su reporte, sus avisos y su último movimiento.</p>
  </article>
}

function Agente({ id, ultima, ahora, i }: { id: keyof typeof AGENTES_EQUIPO; ultima: string | null; ahora: number; i: number }) {
  const a = AGENTES_EQUIPO[id]
  return <article className={`${e.agente} ${l.entra}`} style={escalon(i)} aria-label={`${a.nombre}, ${a.rol}`}>
    <Retrato agente={id} size={46} className={e.foto} alt={`Foto de ${a.nombre}`} />
    <div className={e.quien}>
      <h3>{a.nombre}</h3>
      <p className={e.rol}>{a.rol}</p>
      <p className={e.movimiento} data-sin={!ultima || undefined}>{ultima ? <><i aria-hidden />Última rutina {hace(ultima, ahora)}</> : 'Mismo motor que Levy'}</p>
      <p className={e.recibe}><b>Le llega:</b> {a.recibe}</p>
      <ul>{a.responsabilidades.map(r => <li key={r}>{r}</li>)}</ul>
    </div>
  </article>
}

export function VistaEquipo({ grande }: { grande?: boolean }) {
  const { data, error } = useFuente<FotoEquipo>(URL_EQUIPO, 60_000)
  const ahora = useAhora(!!data)
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Leyendo tu equipo…'}</div>
  const dueno = personaDe(data, PUESTOS.dueno.id), segunda = personaDe(data, PUESTOS.segunda.id)
  return <div className={e.vista} data-grande={grande || undefined}>
    {!grande && <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>Equipo · <b>quién lleva qué</b></p>}
    {data.errores.length > 0 && <p className={s.aviso}>{data.errores.join(' ')}</p>}
    <div className={e.organigrama}>
      <div className={e.nivel} data-nivel="1"><Persona puesto={PUESTOS.dueno} p={dueno} ahora={ahora} i={1} arriba /></div>
      <div className={e.rama} aria-hidden />
      <div className={e.nivel} data-nivel="2">
        <Persona puesto={PUESTOS.segunda} p={segunda} ahora={ahora} i={2} />
        <Vacante i={3} />
      </div>
    </div>
    <p className={`${l.ceja} ${e.cejaAgentes}`}>Agentes · <b>tres caras del mismo cerebro</b></p>
    <div className={e.agentes}>
      {data.agentes.map((a, i) => <Agente key={a.id} id={a.id} ultima={a.ultima} ahora={ahora} i={4 + i} />)}
    </div>
    <p className={l.fuente}>Leído {hace(data.leidoEn, ahora)} · se relee cada minuto</p>
  </div>
}
