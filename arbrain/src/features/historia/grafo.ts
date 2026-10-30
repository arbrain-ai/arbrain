/**
 * El grafo de commits de Taller › Historia (28 oct 2026). Daniel: «yo me imaginaba poder ver las líneas verdes y rojas de los
 * archivos que se modificaban, el número de archivos, el historial de la línea de tiempo del historial de Git, así como VS Code,
 * con ramas y todo… quisiera empezar a aprender de eso, verlo muy por encima».
 *
 * Lógica pura, sin React ni node:* (tests/historia/taller.test.ts, tests/historia/simple.test.ts). La capa técnica dice las cosas
 * por su nombre (commit, rama, merge, worktree, diff) porque es para aprender git; cada término trae su línea «qué significa»
 * (`SIGNIFICA`).
 *
 * Carriles: el algoritmo de los visores de git (VS Code Git Graph, gitk). Cada carril «espera» un commit; al llegar, el commit
 * toma el carril (o el primero libre), deja en él a su primer padre y abre un carril por cada padre extra (un merge).
 *
 * Historia simple (29 oct 2026). Daniel: «¿por qué no veo cambiar aquí donde dice worktree, merge, rama y commit? No cambia en
 * lo absoluto. Además no me interesa ver tanta data». Las piezas de la leyenda son lentes (`luz`): al elegir una se ilumina en el
 * grafo lo que nombra y se atenúa lo demás; para eso cada carril sabe de qué línea es (main, un agente o una rama). Y los merges
 * de sincronía («Merge remote-tracking branch 'origin/main' into X») se esconden de fábrica (`vistaGrafo`): son ruido.
 */
import type { Quien } from './modelo'

export interface RefGrafo {
  nombre: string
  /** main = tu cerebro principal · worktree = una rama abierta en su propia carpeta (la copia de un agente) · rama = sin carpeta. */
  tipo: 'main' | 'worktree' | 'rama'
  /** La carpeta del worktree, si tiene. */
  carpeta?: string
}

export interface CommitGrafo {
  sha: string
  corto: string
  padres: string[]
  /** El mensaje del commit tal cual (primera línea). */
  asunto: string
  quien: Quien
  quienNombre: string
  cuando: string
  archivos: number
  mas: number
  menos: number
  refs: RefGrafo[]
}

/** De qué línea es un commit o un tramo: la de main (su primer padre, uno tras otro), la de un agente (worktree) u otra rama. */
export type Linea = 'main' | 'agente' | 'rama'

/** Un tramo de línea dentro de la fila de un commit: de un carril a otro, entre arriba, el punto y abajo. */
export interface Tramo { de: number; a: number; desde: 'arriba' | 'punto'; hasta: 'punto' | 'abajo'; color: number; linea: Linea }
export interface FilaGrafo { col: number; color: number; tramos: Tramo[]; merge: boolean; linea: Linea }

export interface Grafo {
  commits: CommitGrafo[]
  filas: FilaGrafo[]
  /** Cuántos carriles a lo ancho, como mucho. */
  ancho: number
  ramas: number
  worktrees: number
  leidoEn: string
  avisos: string[]
}

/** Colores de carril: cuántos hay en la paleta (el CSS los nombra `--g0` … `--g7`). */
export const COLORES = 8

/** Lo que pide `carriles`: los padres con los que se dibuja y, si difiere de «más de un padre», si es merge. */
export interface NodoCarril { sha: string; padres: readonly string[]; merge?: boolean }

/**
 * Los carriles de una lista de commits en orden (lo más nuevo arriba). Cada carril lleva el color con el que nació, así una rama
 * conserva su color aunque los carriles de al lado se liberen. `lineaDe` dice de qué línea es cada commit: el carril que deja
 * hacia su primer padre es de esa línea; el que abre hacia un padre extra es de la línea de ese padre (salvo main: traer main a
 * una rama no es la línea de main).
 */
export function carriles(commits: readonly NodoCarril[], lineaDe: (sha: string) => Linea = () => 'rama'): { filas: FilaGrafo[]; ancho: number } {
  const espera: (string | null)[] = []
  const color: number[] = []
  const linea: Linea[] = []
  let siguienteColor = 0
  let ancho = 0
  const libre = (evitar = -1) => { const i = espera.findIndex((x, k) => x === null && k !== evitar); return i === -1 ? espera.length : i }
  const ocupar = (i: number, sha: string, l: Linea) => { espera[i] = sha; color[i] = siguienteColor++ % COLORES; linea[i] = l }
  const filas: FilaGrafo[] = []
  for (const c of commits) {
    const propia = lineaDe(c.sha)
    let col = espera.indexOf(c.sha)
    const nuevo = col === -1
    if (nuevo) { col = libre(); ocupar(col, c.sha, propia) }
    const antes = espera.slice()
    const colorAntes = color.slice()
    const lineaAntes = linea.slice()
    const tramos: Tramo[] = []
    // Arriba: todo carril que esperaba a este commit baja al punto; los demás siguen derecho.
    antes.forEach((x, i) => {
      if (x === null || (nuevo && i === col)) return
      if (x === c.sha) tramos.push({ de: i, a: col, desde: 'arriba', hasta: 'punto', color: colorAntes[i], linea: lineaAntes[i] })
    })
    for (let i = 0; i < antes.length; i++) if (antes[i] === c.sha && i !== col) espera[i] = null
    // Abajo: el primer padre sigue en el carril del commit; cada padre extra va a su carril (uno que ya lo espere o uno nuevo).
    const [primero, ...extra] = c.padres
    espera[col] = primero ?? null
    linea[col] = propia
    if (primero) tramos.push({ de: col, a: col, desde: 'punto', hasta: 'abajo', color: color[col], linea: propia })
    for (const p of extra) {
      const suya = lineaDe(p) === 'main' ? propia : lineaDe(p)
      let j = espera.indexOf(p)
      if (j === -1) { j = libre(col); ocupar(j, p, suya) }
      tramos.push({ de: col, a: j, desde: 'punto', hasta: 'abajo', color: color[j], linea: suya })
    }
    // Los que solo pasan: esperaban a otro commit antes y después.
    antes.forEach((x, i) => {
      if (x !== null && x !== c.sha && espera[i] === x) {
        tramos.push({ de: i, a: i, desde: 'arriba', hasta: 'punto', color: colorAntes[i], linea: lineaAntes[i] }, { de: i, a: i, desde: 'punto', hasta: 'abajo', color: colorAntes[i], linea: lineaAntes[i] })
      }
    })
    while (espera.length && espera[espera.length - 1] === null) { espera.pop(); color.pop(); linea.pop() }
    ancho = Math.max(ancho, col + 1, antes.length, espera.length)
    filas.push({ col, color: colorAntes[col] ?? color[col] ?? 0, tramos, merge: c.merge ?? c.padres.length > 1, linea: propia })
  }
  return { filas, ancho }
}

/** «12 archivos», «1 archivo». */
export const cuantosArchivos = (n: number) => n === 1 ? '1 archivo' : `${n} archivos`

/**
 * «Qué significa» cada cosa de la capa técnica, en una línea, para aprender git por encima (28 oct 2026). Las claves son las que
 * pinta la vista: la leyenda arriba del grafo (cada una es una lente) y la línea bajo cada commit y cada diff abierto.
 */
export const SIGNIFICA = {
  commit: 'Commit: una foto guardada de tu cerebro. Cada punto del grafo es uno, con su mensaje y su hora.',
  rama: 'Rama: una línea de trabajo en paralelo. Cada color es una; avanzan sin pisarse hasta juntarse.',
  main: 'main: la rama principal, la que corre en tu cerebro. Lo demás nace de aquí y vuelve aquí.',
  worktree: 'Worktree: una rama abierta en su propia carpeta. Así cada agente trabaja en su copia sin tocar la tuya.',
  merge: 'Merge: el punto donde una rama se junta con otra. Trae todos sus commits de golpe.',
  cifras: 'Verde (+) son renglones que se agregaron; rojo (−) los que se quitaron. Al lado, cuántos archivos tocó.',
  diff: 'Diff: el archivo antes y después, renglón por renglón. Rojo salió, verde entró; lo gris es contexto que no cambió.',
} as const

/** Las lentes de la leyenda: cada pieza de git que se puede iluminar en el grafo. */
export type Lente = 'commit' | 'rama' | 'main' | 'worktree' | 'merge' | 'cifras'

/** Lo que la vista pinta y una lente puede iluminar o atenuar. */
export type Pieza =
  | { tipo: 'punto'; linea: Linea; merge: boolean }
  | { tipo: 'tramo'; linea: Linea }
  | { tipo: 'fila'; linea: Linea; merge: boolean }
  | { tipo: 'ref'; ref: RefGrafo['tipo'] }

/**
 * La lente sobre una pieza (29 oct 2026): `si` se ilumina, `no` se atenúa, `undefined` queda como está. commit = los puntos;
 * rama = los carriles en paralelo y sus etiquetas; main = su línea; worktree = los carriles de los agentes; merge = los puntos de
 * unión; +/− no atenúa nada (muestra su columna).
 */
export function luz(lente: Lente | null, p: Pieza): 'si' | 'no' | undefined {
  if (!lente || lente === 'cifras') return undefined
  const es = (b: boolean) => b ? 'si' as const : 'no' as const
  switch (lente) {
    case 'commit': return p.tipo === 'punto' ? 'si' : p.tipo === 'fila' ? undefined : 'no'
    case 'rama': return p.tipo === 'tramo' ? es(p.linea !== 'main') : p.tipo === 'ref' ? es(p.ref !== 'main') : p.tipo === 'fila' ? undefined : 'no'
    case 'main': return p.tipo === 'ref' ? es(p.ref === 'main') : es(p.linea === 'main')
    case 'worktree': return p.tipo === 'ref' ? es(p.ref === 'worktree') : es(p.linea === 'agente')
    case 'merge': return p.tipo === 'punto' || p.tipo === 'fila' ? es(p.merge) : 'no'
  }
}

/** Un merge leído de su mensaje: `sincronia` trae main a una rama (ruido); `union` mete una rama en otra. */
export type MergeLeido = { tipo: 'sincronia' } | { tipo: 'union'; rama: string; destino?: string }

const DE_MERGE = /^Merge\s+(?:remote-tracking\s+)?(?:branch\s+)?'?([\w./-]+)'?(?:\s+of\s+\S+)?/
const A_MERGE = /\s(?:into|en)\s+'?([\w./-]+)'?/

/**
 * Lee el mensaje de un merge como lo escribe git o un agente: «Merge branch 'x' into y», «Merge remote-tracking branch
 * 'origin/main' into x», «Merge origin/main en x (…)», «Merge branch 'main' of https://…». Los de otro formato («unificado:
 * fusiona…») no se leen y conservan su mensaje.
 */
export function leerMerge(asunto: string, principal = 'main'): MergeLeido | null {
  const m = DE_MERGE.exec(asunto.trim())
  if (!m) return null
  const limpio = (r: string) => r.replace(/^(?:origin|refs\/remotes\/origin|refs\/heads)\//, '')
  const rama = limpio(m[1])
  if (rama === principal) return { tipo: 'sincronia' }
  const a = A_MERGE.exec(asunto.slice(m[0].length))
  const destino = a ? limpio(a[1]) : undefined
  return destino && destino !== principal ? { tipo: 'union', rama, destino } : { tipo: 'union', rama }
}

/** Un commit como lo pinta la vista: su título en humano, su línea y los padres con los que se dibuja. */
export interface CommitVista extends CommitGrafo {
  /** El renglón: el mensaje tal cual, o «Se unió x» / «Se puso al día con main» si es un merge que se lee. */
  titulo: string
  linea: Linea
  merge: boolean
  /** Los padres que se dibujan: los de git, con cada merge escondido reemplazado por los suyos. */
  enlaces: string[]
}

export interface VistaGrafo { commits: CommitVista[]; filas: FilaGrafo[]; ancho: number; ocultos: number }

/** El renglón de un commit: los merges que se leen, en humano («Se unió x»); lo demás, su mensaje. */
export function tituloDe(c: Pick<CommitGrafo, 'asunto' | 'padres'>, principal = 'main'): string {
  if (c.padres.length < 2) return c.asunto
  const m = leerMerge(c.asunto, principal)
  if (!m) return c.asunto
  if (m.tipo === 'sincronia') return `Se puso al día con ${principal}`
  return m.destino ? `Se unió ${m.rama} a ${m.destino}` : `Se unió ${m.rama}`
}

/**
 * Lo que pinta la vista (29 oct 2026). Esconde los merges de sincronía (traer main a una rama), salvo que `sincronias` pida verlos
 * o que el merge sea la punta de main o de una rama que aún no llega a main (lleva su etiqueta y no puede desaparecer). Esconder no rompe el dibujo: quien apuntaba
 * al merge escondido apunta a sus padres. Luego cada commit recibe su línea (main: el primer padre desde la punta de main; agente:
 * desde la punta de un worktree, lo que aún no está en main; lo demás, rama) y se calculan los carriles.
 */
export function vistaGrafo(commits: readonly CommitGrafo[], o: { sincronias?: boolean } = {}): VistaGrafo {
  const principal = commits.find(c => c.refs.some(r => r.tipo === 'main'))?.refs.find(r => r.tipo === 'main')?.nombre ?? 'main'
  const porSha = new Map(commits.map(c => [c.sha, c]))
  // Lo que ya está en main (todo lo que alcanza su punta): ahí la etiqueta de una rama ya unida no detiene el esconder.
  const yaEnMain = new Set<string>()
  for (const pila = commits.filter(c => c.refs.some(r => r.tipo === 'main')).map(c => c.sha); pila.length;) {
    const s = pila.pop()!; if (yaEnMain.has(s) || !porSha.has(s)) continue; yaEnMain.add(s); pila.push(...porSha.get(s)!.padres)
  }
  const esconder = new Set(o.sincronias ? [] : commits
    .filter(c => c.padres.length > 1 && leerMerge(c.asunto, principal)?.tipo === 'sincronia' && !c.refs.some(r => r.tipo === 'main') && (!c.refs.length || yaEnMain.has(c.sha)))
    .map(c => c.sha))
  const resueltos = new Map<string, string[]>()
  const resolver = (sha: string, pila = new Set<string>()): string[] => {
    if (!esconder.has(sha)) return [sha]
    const ya = resueltos.get(sha)
    if (ya) return ya
    if (pila.has(sha)) return []
    pila.add(sha)
    const r = [...new Set(porSha.get(sha)!.padres.flatMap(p => resolver(p, pila)))]
    resueltos.set(sha, r)
    return r
  }
  const visibles = commits.filter(c => !esconder.has(c.sha))
  const enlaces = new Map(visibles.map(c => [c.sha, [...new Set(c.padres.flatMap(p => resolver(p)))].filter(p => p !== c.sha)]))
  // Las líneas: main sigue su primer padre; cada worktree, y luego cada rama, el suyo mientras sea trabajo que aún no está en main.
  const punta = visibles.find(c => c.refs.some(r => r.tipo === 'main'))?.sha
  const enMain = new Set<string>()
  for (const pila = punta ? [punta] : []; pila.length;) { const s = pila.pop()!; if (enMain.has(s) || !enlaces.has(s)) continue; enMain.add(s); pila.push(...enlaces.get(s)!) }
  const linea = new Map<string, Linea>()
  for (let s = punta; s && enlaces.has(s) && !linea.has(s); s = enlaces.get(s)![0]) linea.set(s, 'main')
  for (const tipo of ['worktree', 'rama'] as const) for (const c of visibles) if (c.refs.some(r => r.tipo === tipo))
    for (let s: string | undefined = c.sha; s && enlaces.has(s) && !linea.has(s) && !enMain.has(s); s = enlaces.get(s)![0]) linea.set(s, tipo === 'worktree' ? 'agente' : 'rama')
  const lineaDe = (sha: string): Linea => linea.get(sha) ?? 'rama'
  const nodos = visibles.map(c => ({ sha: c.sha, padres: enlaces.get(c.sha)!, merge: c.padres.length > 1 }))
  const { filas, ancho } = carriles(nodos, lineaDe)
  return {
    commits: visibles.map(c => ({ ...c, titulo: tituloDe(c, principal), linea: lineaDe(c.sha), merge: c.padres.length > 1, enlaces: enlaces.get(c.sha)! })),
    filas, ancho, ocultos: esconder.size,
  }
}

/** La línea «qué significa» de un commit abierto, según lo que es. */
export function significaCommit(c: Pick<CommitGrafo, 'padres' | 'archivos' | 'mas' | 'menos' | 'refs'>): string {
  const cifras = `${cuantosArchivos(c.archivos)}, +${c.mas} −${c.menos} renglones`
  if (c.padres.length > 1) return `Es un merge: junta dos líneas de trabajo. Sus cifras (${cifras}) son lo que trajo a la rama de la izquierda.`
  if (!c.padres.length) return `Es el primer commit del repo: de aquí nace todo (${cifras}).`
  const wt = c.refs.find(r => r.tipo === 'worktree')
  if (wt) return `Es la punta de «${wt.nombre}», un worktree: lo último que guardó ese trabajo en su carpeta (${cifras}).`
  return `Es un commit normal: guardó ${cifras} sobre el anterior. Abre un archivo para ver su diff.`
}

/** Las refs (ramas y worktrees) de cada commit, a partir de `for-each-ref` y `worktree list`. main primero. */
export function refsPorCommit(puntas: readonly { rama: string; sha: string }[], principal: string, carpetas: ReadonlyMap<string, string>): Map<string, RefGrafo[]> {
  const out = new Map<string, RefGrafo[]>()
  for (const p of puntas) {
    const carpeta = carpetas.get(p.rama)
    const ref: RefGrafo = p.rama === principal ? { nombre: p.rama, tipo: 'main' } : carpeta ? { nombre: p.rama, tipo: 'worktree', carpeta } : { nombre: p.rama, tipo: 'rama' }
    const lista = out.get(p.sha) ?? []
    lista.push(ref)
    out.set(p.sha, lista)
  }
  for (const l of out.values()) l.sort((a, b) => (a.tipo === 'main' ? 0 : 1) - (b.tipo === 'main' ? 0 : 1) || a.nombre.localeCompare(b.nombre))
  return out
}

/** Barra de proporción +/− (como la de GitHub): cuántas de 5 casillas son verdes y cuántas rojas. */
export function barraCambios(mas: number, menos: number, casillas = 5): { verdes: number; rojas: number } {
  const total = mas + menos
  if (!total) return { verdes: 0, rojas: 0 }
  const verdes = Math.round((mas / total) * casillas)
  return { verdes, rojas: casillas - verdes }
}
