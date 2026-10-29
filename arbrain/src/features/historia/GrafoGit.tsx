'use client'
/**
 * La capa técnica de Taller › Historia (28 oct 2026): el historial de git como VS Code. Daniel: «poder ver las líneas verdes y
 * rojas de los archivos que se modificaban, el número de archivos, el historial de la línea de tiempo del historial de Git, así
 * como VS Code, con ramas y todo… quisiera empezar a aprender de eso, verlo muy por encima».
 *
 * Un renglón por commit: el grafo de ramas a la izquierda, el título completo y la hora (29 oct 2026: menos data; +/−, archivos y
 * autor al abrirlo). Las piezas de la leyenda son lentes que iluminan en el grafo lo que nombran (grafo.ts, `luz`) y los merges de
 * sincronía con main se esconden de fábrica (`vistaGrafo`). Al abrir un renglón, sus archivos con su barra +/−; al abrir un
 * archivo, su diff. Cada cosa trae su línea «qué significa» (SIGNIFICA). Aquí sí van los nombres de git: es para aprenderlos.
 * Datos: /api/historia?parte=grafo (servidor.ts, leerGrafo) y /api/historia/cambio (los archivos y el diff de uno).
 */
import { useMemo, useState } from 'react'
import { ChevronRight, CircleHelp, FolderGit2, GitBranch, GitMerge, MessageSquarePlus } from 'lucide-react'
import { useFuente } from '@/features/cabina/datos'
import { mov, escalon } from '@/shared/movimiento'
import { barraCambios, cuantosArchivos, luz, significaCommit, SIGNIFICA, vistaGrafo, type CommitGrafo, type CommitVista, type FilaGrafo, type Grafo, type Lente, type RefGrafo } from './grafo'
import { cuandoAbsoluto, cuandoRelativo, type Bloque, type DiffCambio } from './modelo'
import g from './grafo.module.css'
import { Bandeja, Redactor, useAgentesAbiertos, type Objetivo, type Pista } from '@/features/cabina/documento/ComentariosEntregable'
import { lineaNuevaDelDiff, useComentarios, type AgenteAbierto } from '@/features/cabina/documento/comentarios'
import cc from '@/features/cabina/documento/comentarios.module.css'

const SIN_AGENTES: AgenteAbierto[] = []

export const URL_GRAFO = '/api/historia?parte=grafo'
const urlCambio = (sha: string) => `/api/historia/cambio?sha=${sha}`
const urlArchivo = (sha: string, ruta: string) => `/api/historia/cambio?sha=${sha}&ruta=${encodeURIComponent(ruta)}`

const FILA = 30
/** Separación entre carriles: con muchas ramas vivas se aprieta para que el título siga leyéndose a 520 px. */
const pasoDe = (ancho: number) => ancho > 6 ? 10 : 14

/**
 * El dibujo de una fila: los tramos de cada carril y el punto del commit. El renglón crece con su título (hasta dos líneas), así
 * que las líneas se estiran a su alto (`preserveAspectRatio="none"` con trazo que no se deforma) y el punto va aparte, al centro.
 * La lente ilumina o atenúa cada pieza (`luz`).
 */
function Carriles({ f, ancho, lente }: { f: FilaGrafo; ancho: number; lente: Lente | null }) {
  const PASO = pasoDe(ancho)
  const x = (i: number) => PASO / 2 + i * PASO + 2
  const yDe = (p: 'arriba' | 'punto' | 'abajo') => p === 'arriba' ? 0 : p === 'punto' ? FILA / 2 : FILA
  const w = Math.max(1, ancho) * PASO + 4
  return <span className={g.carriles} style={{ width: w }} aria-hidden>
    <svg width={w} height="100%" viewBox={`0 0 ${w} ${FILA}`} preserveAspectRatio="none">
      {f.tramos.map((t, k) => {
        const x1 = x(t.de), y1 = yDe(t.desde), x2 = x(t.a), y2 = yDe(t.hasta)
        const d = x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
        return <path key={k} d={d} data-g={t.color} data-luz={luz(lente, { tipo: 'tramo', linea: t.linea })} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
    <i className={g.punto} style={{ left: x(f.col) }} data-g={f.color} data-merge={f.merge || undefined} data-luz={luz(lente, { tipo: 'punto', linea: f.linea, merge: f.merge })} />
  </span>
}

function Ref({ r, lente }: { r: RefGrafo; lente: Lente | null }) {
  const titulo = r.tipo === 'main' ? SIGNIFICA.main : r.tipo === 'worktree' ? `${SIGNIFICA.worktree} Carpeta: ${r.carpeta}.` : SIGNIFICA.rama
  return <span className={g.ref} data-tipo={r.tipo} data-luz={luz(lente, { tipo: 'ref', ref: r.tipo })} title={`${r.nombre} · ${titulo}`}>
    {r.tipo === 'worktree' ? <FolderGit2 size={10} aria-hidden /> : <GitBranch size={10} aria-hidden />}<span className={g.refNombre}>{r.nombre}</span>
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

/** El diff de un archivo, como en VS Code: rojo salió, verde entró, gris es contexto. «Comentar líneas» (29 oct 2026): cada
 *  línea se toca para comentarla con su número en el archivo nuevo, y el lote se manda junto al agente de esa rama. */
function DiffArchivo({ sha, ruta, pista }: { sha: string; ruta: string; pista?: Pista }) {
  const d = useFuente<{ bloques: Bloque[]; resumen: string }>(urlArchivo(sha, ruta))
  const [comentando, setComentando] = useState(false)
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const pendientes = useComentarios().filter(x => x.ruta === ruta).length
  const agentes = useAgentesAbiertos(comentando || pendientes ? undefined : SIN_AGENTES)
  if (d.error) return <p className={g.hueco}>{d.error}</p>
  if (!d.data) return <p className={g.hueco}>Leyendo el diff…</p>
  if (!d.data.bloques.length) return <p className={g.hueco}>{d.data.resumen}</p>
  const linea = (signo: string, texto: string, n: number | undefined, clave: string, tipo: string) =>
    <span key={clave} data-l={tipo} data-linea={n ?? undefined} onClick={comentando ? () => setObjetivo({ ruta, cita: texto, ...(n ? { linea: n } : {}) }) : undefined}>{signo}{texto}</span>
  return <div className={g.diff} data-diff-tecnico>
    <p className={g.significa}><CircleHelp size={11} aria-hidden />{SIGNIFICA.diff}
      <button type="button" className={g.comentar} aria-pressed={comentando} data-comentar-lineas onClick={() => { setComentando(!comentando); setObjetivo(null) }}>
        <MessageSquarePlus size={11} aria-hidden />{comentando ? 'Listo' : 'Comentar líneas'}</button></p>
    <pre className={comentando ? cc.comentable : undefined}>{d.data.bloques.flatMap((b, bi) => {
      const tipos = b.lineas.map(l => l.tipo)
      return [
        <span key={`h${bi}`} data-l="salto">@@ renglón {b.desde} @@</span>,
        ...b.lineas.flatMap((l, li) => {
          const n = lineaNuevaDelDiff(b.desde, tipos, li)
          return l.tipo === 'cambio'
            ? [linea('-', l.antes, undefined, `${bi}-${li}a`, 'menos'), linea('+', l.despues, n, `${bi}-${li}b`, 'mas')]
            : [linea(l.tipo === 'mas' ? '+' : l.tipo === 'menos' ? '-' : ' ', l.texto, n, `${bi}-${li}`, l.tipo)]
        }),
      ]
    })}</pre>
    {objetivo && <Redactor objetivo={objetivo} pista={pista} agentes={agentes} onCerrar={() => setObjetivo(null)} />}
    <Bandeja agentes={agentes} solo={x => x.ruta === ruta} />
  </div>
}

/** La rama de un agente a la que pertenece el commit (su worktree), para saber a quién van los comentarios. */
const pistaDe = (c: CommitGrafo): Pista | undefined => { const r = c.refs.find(x => x.tipo === 'worktree') ?? c.refs.find(x => x.tipo === 'rama'); return r ? { rama: r.nombre, ...(r.carpeta ? { carpeta: r.carpeta } : {}) } : undefined }

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
        {es && <DiffArchivo sha={c.sha} ruta={a.ruta} pista={pistaDe(c)} />}
      </li>
    })}
    {d.data.recortado && <li className={g.nota}>Es un commit muy grande: los textos se leen hasta los primeros 30.</li>}
  </ul>
}

/**
 * Un renglón (29 oct 2026, Daniel: «no me interesa ver tanta data. No veo el título completo; quitaría la columna de cuál
 * subagente lo hizo»): grafo, título completo hasta dos líneas y hora. Las etiquetas de rama solo donde hay trabajo que aún no
 * está en main (main siempre); archivos, +/−, autor y el mensaje de git tal cual, al abrirlo. +/− vuelve como columna con su lente.
 */
function FilaCommit({ c, f, ancho, i, ahora, abierto, onAbrir, lente }: { c: CommitVista; f: FilaGrafo; ancho: number; i: number; ahora: number; abierto: boolean; onAbrir: () => void; lente: Lente | null }) {
  const refs = c.refs.filter(r => r.tipo === 'main' || c.linea !== 'main')
  return <li className={`${g.commit} ${mov.entra}`} style={escalon(Math.min(i, 12))} data-commit data-abierto={abierto || undefined} data-merge={c.merge || undefined}
    data-luz={luz(lente, { tipo: 'fila', linea: c.linea, merge: c.merge })}>
    <button className={g.fila} data-abrir-commit aria-expanded={abierto} onClick={onAbrir}>
      <Carriles f={f} ancho={ancho} lente={lente} />
      <span className={g.mensaje} title={c.titulo === c.asunto ? undefined : c.asunto}><span>
        {refs.slice(0, 2).map(r => <Ref key={r.nombre} r={r} lente={lente} />)}
        {refs.length > 2 && <span className={g.ref} data-tipo="mas" title={refs.slice(2).map(r => r.nombre).join(', ')}>+{refs.length - 2}</span>}
        {c.merge && <GitMerge size={11} aria-label="merge" className={g.iconoMerge} />}
        {c.titulo}
      </span></span>
      {lente === 'cifras' && <Cifras mas={c.mas} menos={c.menos} archivos={c.archivos} />}
      <time className={g.cuando} dateTime={c.cuando} title={cuandoAbsoluto(c.cuando)}>{cuandoRelativo(c.cuando, ahora)}</time>
    </button>
    {abierto && <div className={g.detalle}>
      <p className={g.significa}><CircleHelp size={11} aria-hidden />{significaCommit(c)}</p>
      {c.titulo !== c.asunto && <p className={g.original}><code>{c.asunto}</code></p>}
      <p className={g.huella}><Cifras mas={c.mas} menos={c.menos} archivos={c.archivos} /> · <code>{c.corto}</code> · {cuandoAbsoluto(c.cuando)} · {c.quienNombre}
        {c.refs.length > 0 && <> · {c.refs.map(r => r.nombre).join(', ')}</>}
        {c.padres.length > 0 && <> · padre{c.padres.length > 1 ? 's' : ''} {c.padres.map(p => <code key={p}>{p.slice(0, 7)}</code>)}</>}</p>
      <Archivos c={c} />
    </div>}
  </li>
}

const LEYENDA: { clave: Lente; nombre: string }[] = [
  { clave: 'commit', nombre: 'commit' }, { clave: 'rama', nombre: 'rama' }, { clave: 'main', nombre: 'main' },
  { clave: 'worktree', nombre: 'worktree' }, { clave: 'merge', nombre: 'merge' }, { clave: 'cifras', nombre: '+ / −' },
]

/** Arriba del grafo, las piezas de git como lentes: al elegir una se ilumina en el grafo y se lee qué significa; otra vez, se apaga. */
function Leyenda({ lente, onLente }: { lente: Lente | null; onLente: (l: Lente | null) => void }) {
  return <div className={g.leyenda} data-leyenda>
    <div className={g.leyendaChips} role="group" aria-label="Iluminar en el grafo">
      {LEYENDA.map(l => <button key={l.clave} className={g.chip} data-clave={l.clave} aria-pressed={lente === l.clave} onClick={() => onLente(lente === l.clave ? null : l.clave)}>{l.nombre}</button>)}
    </div>
    <p className={g.significa} aria-live="polite"><CircleHelp size={11} aria-hidden />{lente ? SIGNIFICA[lente] : 'Toca una pieza y se ilumina en el grafo.'}</p>
  </div>
}

const VISIBLES = 40

export function GrafoGit({ ahora }: { ahora: number }) {
  const lect = useFuente<Grafo>(URL_GRAFO, 90_000)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const [lente, setLente] = useState<Lente | null>(null)
  const [sincronias, setSincronias] = useState(false)
  const x = lect.data
  const v = useMemo(() => x ? vistaGrafo(x.commits, { sincronias }) : null, [x, sincronias])
  const n = v ? (todos ? v.commits.length : Math.min(VISIBLES, v.commits.length)) : 0
  // El ancho del grafo es el de los renglones a la vista: los carriles de más abajo no le roban espacio al título.
  const ancho = v ? Math.max(1, ...v.filas.slice(0, n).flatMap(f => [f.col + 1, ...f.tramos.map(t => Math.max(t.de, t.a) + 1)])) : 1
  return <section className={g.grafo} data-grafo data-lente={lente ?? undefined} aria-labelledby="historia-grafo">
    <header className={g.cab}>
      <h3 id="historia-grafo" className={g.titulo}>Historial de git</h3>
      {x && v && <p className={g.cuenta}>{v.commits.length} commits · {x.worktrees} {x.worktrees === 1 ? 'worktree' : 'worktrees'}</p>}
    </header>
    <Leyenda lente={lente} onLente={setLente} />
    {!v ? (lect.error ? <p className={g.hueco}>{lect.error}</p> : <p className={g.hueco}>Leyendo el historial…</p>) : <>
      <ol className={g.lista}>
        {v.commits.slice(0, n).map((c, i) => <FilaCommit key={c.sha} c={c} f={v.filas[i]} ancho={ancho} i={i} ahora={ahora} lente={lente}
          abierto={abierto === c.sha} onAbrir={() => setAbierto(abierto === c.sha ? null : c.sha)} />)}
      </ol>
      <div className={g.pie}>
        {v.commits.length > VISIBLES && <button className={g.mas} onClick={() => setTodos(t => !t)} aria-expanded={todos}>
          {todos ? 'Ver menos' : `Ver los ${v.commits.length - VISIBLES} anteriores`}<ChevronRight size={13} aria-hidden data-girado={todos || undefined} /></button>}
        {(v.ocultos > 0 || sincronias) && <button className={g.sincronias} data-sincronias aria-pressed={sincronias} onClick={() => setSincronias(s => !s)}
          title="Un merge de sincronía trae lo nuevo de main a la rama de un agente antes de unirse. No cambia nada por sí mismo.">
          {sincronias ? 'Esconder los merges de sincronía' : `${v.ocultos} ${v.ocultos === 1 ? 'merge de sincronía escondido' : 'merges de sincronía escondidos'} · ver`}</button>}
      </div>
    </>}
  </section>
}
