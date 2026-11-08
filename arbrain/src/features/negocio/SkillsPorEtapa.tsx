'use client'
/**
 * Tu negocio › El sistema › Skills por etapa (5 nov 2026). Daniel: «las skills conllevan parte del sistema del embudo…
 * deberíamos categorizarlas». Cada embudo con sus etapas y las skills que cuelgan de cada una; abajo, las que no cuelgan
 * de ninguna: las que sostienen todo el sistema, las que viven fuera del negocio (las dos con su porqué, escrito en el
 * embudo) y, marcadas, las que nadie ha ubicado todavía. La etapa de cada skill vive en el embudo, no en su SKILL.md.
 */
import { CircleDashed, Wand2 } from 'lucide-react'
import { abrirHabilidad } from '@/shared/navigation/ir-a'
import { rutaSkill, skillsPorEtapa, type Embudo, type SkillSinEtapa } from './embudo'
import e from './panel-embudo.module.css'

export function SkillsPorEtapa({ embudo, inventario, alElegirEtapa, pedirALevy }: {
  embudo: Embudo
  /** Las carpetas reales de `.claude/skills/`; sin él no se puede saber cuáles faltan por ubicar. */
  inventario?: string[] | null
  alElegirEtapa: (id: string) => void
  pedirALevy: (cita: string) => void
}) {
  const s = skillsPorEtapa(embudo, inventario)
  const fuera = s.sistema.length + s.personal.length
  return <div className={e.skillsVista} data-testid="skills-por-etapa">
    <p className={e.skillsResumen}>
      <b>{s.enEtapas}</b> {s.enEtapas === 1 ? 'skill cuelga' : 'skills cuelgan'} de alguna etapa · <b>{fuera}</b> fuera a propósito
      {s.sinRevisar && <> · <b data-alerta={s.sinRevisar.length > 0 || undefined}>{s.sinRevisar.length}</b> sin revisar</>}
    </p>

    {s.grupos.map(g => <section key={g.info.id} className={e.skillsEmbudo} data-por-construir={g.info.estado === 'por construir' || undefined} aria-label={`Skills de ${g.info.nombre}`}>
      <header>
        {g.info.kicker && <p className={e.kicker}>{g.info.kicker}</p>}
        <h5 className={e.skillsEmbudoNombre}>{g.info.nombre}</h5>
      </header>
      <ul className={e.skillsEtapas}>
        {g.etapas.map(({ etapa, skills }) => <li key={etapa.id} data-hoy={etapa.opera_hoy || undefined} data-etapa-skills={etapa.id}>
          <button type="button" className={e.skillsEtapa} onClick={() => alElegirEtapa(etapa.id)} title="Ver la etapa en el grafo">
            <span className={e.skillsEtapaCeja}>{etapa.orden} · {etapa.etapa}</span>
            <span className={e.skillsEtapaNombre}>{etapa.nombre}{etapa.cuello.es && <i className={e.luz} aria-label="cuello de botella" />}</span>
          </button>
          {skills.length
            ? <ul className={e.chips}>{skills.map(n => <li key={n}><Chip nombre={n} /></li>)}</ul>
            : <p className={e.nada}>Ninguna skill todavía.</p>}
        </li>)}
      </ul>
    </section>)}

    <section className={e.skillsFuera} aria-label="No cuelgan de ninguna etapa">
      <h5 className={e.skillsEmbudoNombre}>No cuelgan de ninguna etapa</h5>
      {s.sinRevisar === null
        ? <p className={e.nada}>No pude leer la carpeta de skills: aquí solo salen las que el embudo nombra.</p>
        : s.sinRevisar.length > 0 && <div className={e.sinRevisar} data-testid="skills-sin-revisar">
          <p className={e.etiqueta}><CircleDashed size={12} aria-hidden />Sin revisar · nadie las ha ubicado</p>
          <ul className={e.chips}>{s.sinRevisar.map(n => <li key={n}><Chip nombre={n} marcada /></li>)}</ul>
          <button type="button" className={e.accion} onClick={() => pedirALevy(`Ubica en mi embudo estas skills (de qué etapa cuelgan o por qué quedan fuera): ${s.sinRevisar!.join(', ')}.`)}>Pedirle a Levy que las ubique</button>
        </div>}
      {s.sistema.length > 0 && <Fuera titulo="Sostienen todo el sistema" skills={s.sistema} />}
      {s.personal.length > 0 && <Fuera titulo="Fuera del negocio" skills={s.personal} />}
      {s.noExisten.length > 0 && <p className={e.aviso} role="note">El embudo nombra skills que ya no existen: {s.noExisten.join(', ')}.</p>}
    </section>
  </div>
}

function Chip({ nombre, marcada }: { nombre: string; marcada?: boolean }) {
  return <button type="button" className={e.skill} data-marcada={marcada || undefined} onClick={() => abrirHabilidad(rutaSkill(nombre))} title="Abrir en Habilidades">
    <Wand2 size={12} aria-hidden />{nombre}
  </button>
}

function Fuera({ titulo, skills }: { titulo: string; skills: SkillSinEtapa[] }) {
  return <div className={e.fueraGrupo}>
    <p className={e.etiqueta}>{titulo}</p>
    <ul className={e.fueraLista}>{skills.map(x => <li key={x.nombre}><Chip nombre={x.nombre} /><span className={e.porQue}>{x.por_que}</span></li>)}</ul>
  </div>
}
