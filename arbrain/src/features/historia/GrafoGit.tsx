'use client'
/**
 * La capa técnica de Taller › Historia (28 oct 2026): el historial de git como VS Code. Daniel: «poder ver las líneas verdes y
 * rojas de los archivos que se modificaban, el número de archivos, el historial de la línea de tiempo del historial de Git, así
 * como VS Code, con ramas y todo… quisiera empezar a aprender de eso, verlo muy por encima».
 *
 * Un renglón por commit: el grafo de ramas a la izquierda (cada color una rama, los worktrees de agentes con su etiqueta), el
 * mensaje, +/− en verde y rojo y cuántos archivos. Al abrirlo, sus archivos con su barra +/−; al abrir un archivo, su diff. Cada
 * cosa trae su línea «qué significa» (grafo.ts, SIGNIFICA). Aquí sí van los nombres de git: es para aprenderlos.
 * Datos: /api/historia?parte=grafo (servidor.ts, leerGrafo) y /api/historia/cambio (los archivos y el diff de uno).
 */
import { useState } from 'react'
import { ChevronRight, CircleHelp, FolderGit2, GitBranch, GitMerge } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { mov, escalon } from '@/shared/movimiento'
import { barraCambios, cuantosArchivos, significaCommit, SIGNIFICA, type CommitGrafo, type FilaGrafo, type Grafo, type RefGrafo } from './grafo'
import { cuandoAbsoluto, cuandoRelativo, type Bloque, type DiffCambio } from './modelo'
import g from './grafo.module.css'

export const URL_GRAFO = '/api/historia?parte=grafo'
const urlCambio = (sha: string) => `/api/historia/cambio?sha=${sha}`
const urlArchivo = (sha: string, ruta: string) => `/api/historia/cambio?sha=${sha}&ruta=${encodeURIComponent(ruta)}`

const FILA = 30, PUNTO = 4
/** Separación entre carriles: con muchas ramas vivas se aprieta para que el mensaje siga leyéndose a 520 px. */
const pasoDe = (ancho: number) => ancho > 6 ? 10 : 14

/** El dibujo de una fila: los tramos de cada carril y el punto del commit. */
function Carriles({ f, ancho }: { f: FilaGrafo; ancho: number }) {
  const PASO = pasoDe(ancho)
  const x = (i: number) => PASO / 2 + i * PASO + 2
  const yDe = (p: 'arriba' | 'punto' | 'abajo') => p === 'arriba' ? 0 : p === 'punto' ? FILA / 2 : FILA
  const w = Math.max(1, ancho) * PASO + 4
  return <svg className={g.carriles} width={w} height={FILA} viewBox={`0 0 ${w} ${FILA}`} aria-hidden>
    {f.tramos.map((t, k) => {
      const x1 = x(t.de), y1 = yDe(t.desde), x2 = x(t.a), y2 = yDe(t.hasta)
      const d = x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
      return <path key={k} d={d} data-g={t.color} />
    })}
    {f.merge
      ? <circle cx={x(f.col)} cy={FILA / 2} r={PUNTO + 0.5} data-g={f.color} data-merge />
      : <circle cx={x(f.col)} cy={FILA / 2} r={PUNTO} data-g={f.color} />}
  </svg>
}

function Ref({ r }: { r: RefGrafo }) {
  const titulo = r.tipo === 'main' ? SIGNIFICA.main : r.tipo === 'worktree' ? `${SIGNIFICA.worktree} Carpeta: ${r.carpeta}.` : SIGNIFICA.rama
  return <span className={g.ref} data-tipo={r.tipo} title={titulo}>
    {r.tipo === 'worktree' ? <FolderGit2 size={10} aria-hidden /> : <GitBranch size={10} aria-hidden />}{r.nombre}
  </span>
}

function Cifras({ mas, menos, archivos }: { mas: number; menos: number; archivos?: number }) {
  return <span className={g.cifras} title={SIGNIFICA.cifras}>
    <ins>+{mas}</ins><del>−{menos}</del>{archivos != null && <small>{cuantosArchivos(archivos)}</small>}
  </span>
}

function Barra({ mas, menos }: { mas: number; menos: number }) {
  const { verdes, rojas } = barraCambios(mas, menos)
  return <span className={g.barra} aria-hidden>{Array.from({ length: 5 }, (_, i) => <i key={i} data-c={i < verdes ? 'mas' : i < verdes + rojas ? 'menos' : 'nada'} />)}</span>
}

/** El diff de un archivo, como en VS Code: rojo salió, verde entró, gris es contexto. */
function DiffArchivo({ sha, ruta }: { sha: string; ruta: string }) {
  const d = useFuente<{ bloques: Bloque[]; resumen: string }>(urlArchivo(sha, ruta))
  if (d.error) return <p className={g.hueco}>{d.error}</p>
  if (!d.data) return <p className={g.hueco}>Leyendo el diff…</p>
  if (!d.data.bloques.length) return <p className={g.hueco}>{d.data.resumen}</p>
  return <div className={g.diff} data-diff-tecnico>
    <p className={g.significa}><CircleHelp size={11} aria-hidden />{SIGNIFICA.diff}</p>
    <pre>{d.data.bloques.flatMap((b, bi) => [
      <span key={`h${bi}`} data-l="salto">@@ renglón {b.desde} @@</span>,
      ...b.lineas.flatMap((l, li) => l.tipo === 'cambio'
        ? [<span key={`${bi}-${li}a`} data-l="menos">-{l.antes}</span>, <span key={`${bi}-${li}b`} data-l="mas">+{l.despues}</span>]
        : [<span key={`${bi}-${li}`} data-l={l.tipo}>{l.tipo === 'mas' ? '+' : l.tipo === 'menos' ? '-' : ' '}{l.texto}</span>]),
    ])}</pre>
  </div>
}

const LETRA = { nuevo: 'A', borrado: 'D', cambiado: 'M' } as const
const NOMBRE_LETRA = { nuevo: 'A: archivo nuevo (added)', borrado: 'D: archivo borrado (deleted)', cambiado: 'M: archivo modificado (modified)' } as const

/** Los archivos de un commit, cada uno con su letra (A/M/D como VS Code), su barra y su diff a un clic. */
function Archivos({ c }: { c: CommitGrafo }) {
  const d = useFuente<DiffCambio>(urlCambio(c.sha))
  const [abierto, setAbierto] = useState<string | null>(null)
  if (d.error) return <p className={g.hueco}>{d.error}</p>
  if (!d.data) return <p className={g.hueco}>Leyendo sus archivos…</p>
  const lista = [...d.data.archivos].sort((a, b) => (b.mas + b.menos) - (a.mas + a.menos))
  return <ul className={g.archivos} data-archivos>
    {lista.map(a => {
      const es = abierto === a.ruta
      const partes = a.ruta.split('/'), nombre = partes.pop(), carpeta = partes.join('/')
      return <li key={a.ruta} data-abierto={es || undefined}>
        <button className={g.archivo} data-archivo aria-expanded={es} disabled={a.protegido} onClick={() => setAbierto(es ? null : a.ruta)} title={a.ruta}>
          <span className={g.letra} data-estado={a.estado} title={NOMBRE_LETRA[a.estado]}>{LETRA[a.estado]}</span>
          <span className={g.ruta}><b>{nombre}</b>{carpeta && <small>{carpeta}</small>}</span>
          <Cifras mas={a.mas} menos={a.menos} /><Barra mas={a.mas} menos={a.menos} />
        </button>
        {es && <DiffArchivo sha={c.sha} ruta={a.ruta} />}
      </li>
    })}
    {d.data.recortado && <li className={g.nota}>Es un commit muy grande: los textos se leen hasta los primeros 30.</li>}
  </ul>
}

function FilaCommit({ c, f, ancho, i, ahora, abierto, onAbrir }: { c: CommitGrafo; f: FilaGrafo; ancho: number; i: number; ahora: number; abierto: boolean; onAbrir: () => void }) {
  return <li className={`${g.commit} ${mov.entra}`} style={escalon(Math.min(i, 12))} data-commit data-abierto={abierto || undefined} data-merge={f.merge || undefined}>
    <button className={g.fila} data-abrir-commit aria-expanded={abierto} onClick={onAbrir}>
      <Carriles f={f} ancho={ancho} />
      <span className={g.mensaje}>
        {/* Dos etiquetas como mucho: varias ramas en el mismo commit no deben tapar el mensaje. */}
        {c.refs.slice(0, 2).map(r => <Ref key={r.nombre} r={r} />)}
        {c.refs.length > 2 && <span className={g.ref} data-tipo="mas" title={c.refs.slice(2).map(r => r.nombre).join(', ')}>+{c.refs.length - 2}</span>}
        {f.merge && <GitMerge size={11} aria-label="merge" className={g.iconoMerge} />}
        <span className={g.asunto}>{c.asunto}</span>
      </span>
      <Cifras mas={c.mas} menos={c.menos} archivos={c.archivos} />
      <span className={g.autor}>{c.quienNombre}</span>
      <time className={g.cuando} dateTime={c.cuando} title={cuandoAbsoluto(c.cuando)}>{cuandoRelativo(c.cuando, ahora)}</time>
    </button>
    {abierto && <div className={g.detalle}>
      <p className={g.significa}><CircleHelp size={11} aria-hidden />{significaCommit(c)}</p>
      <p className={g.huella}><code>{c.corto}</code> · {cuandoAbsoluto(c.cuando)} · {c.quienNombre}{c.padres.length > 0 && <> · padre{c.padres.length > 1 ? 's' : ''} {c.padres.map(p => <code key={p}>{p.slice(0, 7)}</code>)}</>}</p>
      <Archivos c={c} />
    </div>}
  </li>
}

const LEYENDA: { clave: keyof typeof SIGNIFICA; nombre: string }[] = [
  { clave: 'commit', nombre: 'commit' }, { clave: 'rama', nombre: 'rama' }, { clave: 'main', nombre: 'main' },
  { clave: 'worktree', nombre: 'worktree' }, { clave: 'merge', nombre: 'merge' }, { clave: 'cifras', nombre: '+ / −' },
]

/** Arriba del grafo: qué significa cada pieza, en una línea cada una. Se elige una y se lee; nace con «commit» abierto. */
function Leyenda() {
  const [cual, setCual] = useState<keyof typeof SIGNIFICA>('commit')
  return <div className={g.leyenda} data-leyenda>
    <div className={g.leyendaChips} role="group" aria-label="Qué significa">
      {LEYENDA.map(l => <button key={l.clave} className={g.chip} data-clave={l.clave} aria-pressed={cual === l.clave} onClick={() => setCual(l.clave)}>{l.nombre}</button>)}
    </div>
    <p className={g.significa} aria-live="polite"><CircleHelp size={11} aria-hidden />{SIGNIFICA[cual]}</p>
  </div>
}

const VISIBLES = 40

export function GrafoGit({ ahora }: { ahora: number }) {
  const lect = useFuente<Grafo>(URL_GRAFO, 90_000)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const x = lect.data
  return <section className={g.grafo} data-grafo aria-labelledby="historia-grafo">
    <header className={g.cab}>
      <h3 id="historia-grafo" className={g.titulo}>Como en VS Code · <span>el historial de git</span></h3>
      {x && <p className={g.cuenta}>{x.commits.length} commits · {x.ramas} {x.ramas === 1 ? 'rama' : 'ramas'} · {x.worktrees} {x.worktrees === 1 ? 'worktree' : 'worktrees'} de agentes</p>}
    </header>
    <Leyenda />
    {!x ? (lect.error ? <p className={g.hueco}>{lect.error}</p> : <p className={g.hueco}>Leyendo el historial…</p>) : <>
      <ol className={g.lista}>
        {(todos ? x.commits : x.commits.slice(0, VISIBLES)).map((c, i) => <FilaCommit key={c.sha} c={c} f={x.filas[i]} ancho={x.ancho} i={i} ahora={ahora}
          abierto={abierto === c.sha} onAbrir={() => setAbierto(abierto === c.sha ? null : c.sha)} />)}
      </ol>
      {x.commits.length > VISIBLES && <button className={g.mas} onClick={() => setTodos(v => !v)} aria-expanded={todos}>
        {todos ? 'Ver menos' : `Ver los ${x.commits.length - VISIBLES} commits anteriores`}<ChevronRight size={13} aria-hidden data-girado={todos || undefined} /></button>}
    </>}
  </section>
}
