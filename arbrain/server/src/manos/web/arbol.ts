/**
 * Índices y diffs del árbol web.
 *
 * La extensión manda la página compacta (`arbrain/extension/lib/arbol.js`):
 * nodos con `b`, el id estable del nodo en el DOM. Aquí cada `b` recibe un
 * índice que no cambia mientras el nodo exista, así que:
 *   - el modelo actúa por índice (`[12]`) y un índice viejo nunca apunta a otra
 *     cosa: si el nodo murió, la acción falla con «vuelve a observar»;
 *   - tras una acción se devuelve solo lo que cambió (+ agregado, − quitado,
 *     ~ modificado), que es mucho menos que el árbol completo.
 */

export interface NodoWeb { b: number; rol: string; nombre: string; valor?: string; f?: string; url?: string; prof: number; texto?: boolean; nivel?: number }

export interface Vista { url: string; titulo?: string; lineas: Map<string, string>; orden: string[] }

export interface Diff { agregados: string[]; quitados: string[]; cambiados: string[]; texto: string; lineas: number; chars: number }

const MAX_PROF = 8

export class IndiceTab {
  private porB = new Map<number, number>()
  private porIndice = new Map<number, NodoWeb>()
  private siguiente = 1
  ultima: Vista | null = null
  /** Texto de la última lectura completa: una «confirmación» que salga de ahí no es de Daniel. */
  textoVisto = ''

  indiceDe(b: number): number {
    let i = this.porB.get(b)
    if (i === undefined) { i = this.siguiente++; this.porB.set(b, i) }
    return i
  }

  nodo(indice: number): NodoWeb | undefined { return this.porIndice.get(indice) }

  /** Registra una lectura nueva y devuelve su vista. Los índices de nodos que siguen vivos no cambian. */
  registrar(nodos: NodoWeb[], url: string, titulo?: string): Vista {
    this.porIndice.clear()
    const lineas = new Map<string, string>()
    const orden: string[] = []
    for (const n of nodos) {
      const clave = n.texto ? `t${n.b}` : `n${n.b}`
      if (lineas.has(clave)) continue
      let linea: string
      if (n.texto) linea = linea_texto(n)
      else {
        const i = this.indiceDe(n.b)
        this.porIndice.set(i, n)
        linea = lineaNodo(i, n)
      }
      lineas.set(clave, linea)
      orden.push(clave)
    }
    const v = { url, titulo, lineas, orden }
    this.textoVisto = orden.map(k => lineas.get(k)).join('\n')
    return v
  }
}

const sangria = (prof: number) => '  '.repeat(Math.min(prof, MAX_PROF))
function linea_texto(n: NodoWeb): string { return `${sangria(n.prof)}· ${n.nombre}` }

export function lineaNodo(i: number, n: NodoWeb): string {
  const partes = [`${sangria(n.prof)}[${i}] ${n.rol}${n.nivel ? n.nivel : ''}`]
  if (n.nombre) partes.push(`«${n.nombre}»`)
  else if (n.rol !== 'form' && n.rol !== 'search') partes.push('(sin nombre)')
  if (n.valor) partes.push(`valor=«${n.valor}»`)
  if (n.f) partes.push(`{${n.f}}`)
  if (n.url) partes.push(`→ ${n.url}`)
  return partes.join(' ')
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Texto completo, opcionalmente filtrado por `consulta` (coincidencias y sus ancestros) y con tope de líneas. */
export function renderizar(v: Vista, op: { consulta?: string; max?: number } = {}): { texto: string; mostradas: number; total: number; truncado: boolean } {
  let claves = v.orden
  if (op.consulta) {
    const terminos = sinAcentos(op.consulta).split(/\s*\|\s*/).filter(Boolean)
    const keep = new Set<number>()
    const lineas = claves.map(k => v.lineas.get(k)!)
    const prof = lineas.map(l => (l.match(/^ */)?.[0].length ?? 0) / 2)
    lineas.forEach((l, i) => {
      if (!terminos.some(t => sinAcentos(l).includes(t))) return
      keep.add(i)
      // ancestros: hacia atrás, cada línea con menos sangría
      let p = prof[i]
      for (let j = i - 1; j >= 0 && p > 0; j--) if (prof[j] < p) { keep.add(j); p = prof[j] }
    })
    claves = claves.filter((_, i) => keep.has(i))
  }
  const max = op.max ?? 300
  const truncado = claves.length > max
  const mostradas = claves.slice(0, max)
  const cuerpo = mostradas.map(k => v.lineas.get(k)).join('\n')
  return { texto: truncado ? `${cuerpo}\n… ${claves.length - max} líneas más: usa consulta o max` : cuerpo, mostradas: mostradas.length, total: claves.length, truncado }
}

/** Lo que cambió entre dos vistas de la misma pestaña. */
export function diferencia(antes: Vista, despues: Vista): Diff {
  const agregados: string[] = [], quitados: string[] = [], cambiados: string[] = []
  for (const k of despues.orden) {
    const prev = antes.lineas.get(k)
    const ahora = despues.lineas.get(k)!
    if (prev === undefined) agregados.push(`+ ${ahora.trimStart()}`)
    else if (prev.trimStart() !== ahora.trimStart()) cambiados.push(`~ ${ahora.trimStart()}`)
  }
  for (const k of antes.orden) if (!despues.lineas.has(k)) quitados.push(`- ${antes.lineas.get(k)!.trimStart()}`)
  const cab: string[] = []
  if (antes.url !== despues.url) cab.push(`url: ${antes.url} → ${despues.url}`)
  if ((antes.titulo ?? '') !== (despues.titulo ?? '')) cab.push(`título: «${despues.titulo ?? ''}»`)
  // Los quitados se resumen: el modelo necesita saber que ya no están, no releerlos enteros.
  const q = quitados.length > 12 ? [...quitados.slice(0, 12), `- … y ${quitados.length - 12} más`] : quitados
  const texto = [...cab, ...cambiados, ...agregados, ...q].join('\n') || '(sin cambios en el árbol)'
  return { agregados, quitados, cambiados, texto, lineas: texto.split('\n').length, chars: texto.length }
}
