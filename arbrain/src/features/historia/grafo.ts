/**
 * El grafo de commits de Taller › Historia (28 oct 2026). Daniel: «yo me imaginaba poder ver las líneas verdes y rojas de los
 * archivos que se modificaban, el número de archivos, el historial de la línea de tiempo del historial de Git, así como VS Code,
 * con ramas y todo… quisiera empezar a aprender de eso, verlo muy por encima».
 *
 * Lógica pura, sin React ni node:* (tests/historia/grafo.test.ts). La capa técnica dice las cosas por su nombre (commit, rama,
 * merge, worktree, diff) porque es para aprender git; cada término trae su línea «qué significa» (`SIGNIFICA`).
 *
 * Carriles: el algoritmo de los visores de git (VS Code Git Graph, gitk). Cada carril «espera» un commit; al llegar, el commit
 * toma el carril (o el primero libre), deja en él a su primer padre y abre un carril por cada padre extra (un merge).
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

/** Un tramo de línea dentro de la fila de un commit: de un carril a otro, entre arriba, el punto y abajo. */
export interface Tramo { de: number; a: number; desde: 'arriba' | 'punto'; hasta: 'punto' | 'abajo'; color: number }
export interface FilaGrafo { col: number; color: number; tramos: Tramo[]; merge: boolean }

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

/**
 * Los carriles de una lista de commits en orden (lo más nuevo arriba). Cada carril lleva el color con el que nació, así una rama
 * conserva su color aunque los carriles de al lado se liberen.
 */
export function carriles(commits: readonly Pick<CommitGrafo, 'sha' | 'padres'>[]): { filas: FilaGrafo[]; ancho: number } {
  const espera: (string | null)[] = []
  const color: number[] = []
  let siguienteColor = 0
  let ancho = 0
  const libre = (evitar = -1) => { const i = espera.findIndex((x, k) => x === null && k !== evitar); return i === -1 ? espera.length : i }
  const ocupar = (i: number, sha: string) => { espera[i] = sha; color[i] = siguienteColor++ % COLORES }
  const filas: FilaGrafo[] = []
  for (const c of commits) {
    let col = espera.indexOf(c.sha)
    const nuevo = col === -1
    if (nuevo) { col = libre(); ocupar(col, c.sha) }
    const antes = espera.slice()
    const colorAntes = color.slice()
    const tramos: Tramo[] = []
    // Arriba: todo carril que esperaba a este commit baja al punto; los demás siguen derecho.
    antes.forEach((x, i) => {
      if (x === null || (nuevo && i === col)) return
      if (x === c.sha) tramos.push({ de: i, a: col, desde: 'arriba', hasta: 'punto', color: colorAntes[i] })
    })
    for (let i = 0; i < antes.length; i++) if (antes[i] === c.sha && i !== col) espera[i] = null
    // Abajo: el primer padre sigue en el carril del commit; cada padre extra va a su carril (uno que ya lo espere o uno nuevo).
    const [primero, ...extra] = c.padres
    espera[col] = primero ?? null
    if (primero) tramos.push({ de: col, a: col, desde: 'punto', hasta: 'abajo', color: color[col] })
    for (const p of extra) {
      let j = espera.indexOf(p)
      if (j === -1) { j = libre(col); ocupar(j, p) }
      tramos.push({ de: col, a: j, desde: 'punto', hasta: 'abajo', color: color[j] })
    }
    // Los que solo pasan: esperaban a otro commit antes y después.
    antes.forEach((x, i) => {
      if (x !== null && x !== c.sha && espera[i] === x) {
        tramos.push({ de: i, a: i, desde: 'arriba', hasta: 'punto', color: colorAntes[i] }, { de: i, a: i, desde: 'punto', hasta: 'abajo', color: colorAntes[i] })
      }
    })
    while (espera.length && espera[espera.length - 1] === null) { espera.pop(); color.pop() }
    ancho = Math.max(ancho, col + 1, antes.length, espera.length)
    filas.push({ col, color: colorAntes[col] ?? color[col] ?? 0, tramos, merge: c.padres.length > 1 })
  }
  return { filas, ancho }
}

/** «12 archivos», «1 archivo». */
export const cuantosArchivos = (n: number) => n === 1 ? '1 archivo' : `${n} archivos`

/**
 * «Qué significa» cada cosa de la capa técnica, en una línea, para aprender git por encima (28 oct 2026). Las claves son las que
 * pinta la vista: la leyenda arriba del grafo y la línea bajo cada commit y cada diff abierto.
 */
export const SIGNIFICA = {
  commit: 'Commit: una foto guardada de tu cerebro. Cada punto del grafo es uno, con su mensaje, su autor y su hora.',
  rama: 'Rama: una línea de trabajo en paralelo. Cada color es una; avanzan sin pisarse hasta juntarse.',
  main: 'main: la rama principal, la que corre en tu cerebro. Lo demás nace de aquí y vuelve aquí.',
  worktree: 'Worktree: una rama abierta en su propia carpeta. Así cada agente trabaja en su copia sin tocar la tuya.',
  merge: 'Merge: el punto donde una rama se junta con otra. Trae todos sus commits de golpe.',
  cifras: 'Verde (+) son renglones que se agregaron; rojo (−) los que se quitaron. Al lado, cuántos archivos tocó.',
  diff: 'Diff: el archivo antes y después, renglón por renglón. Rojo salió, verde entró; lo gris es contexto que no cambió.',
} as const

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
