/**
 * Cambios marcados por palabras (3 oct 2026): Levy peina un guion dictado y Daniel ve solo lo tocado.
 * LCS sobre palabras con recorte de prefijo y sufijo comunes; si el texto es enorme, por líneas.
 */
export type Pieza = { tipo: 'igual' | 'quitado' | 'agregado'; texto: string }

const PALABRAS = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu
const tokens = (t: string): string[] => t.match(PALABRAS) ?? []
const MAX_CELDAS = 6_000_000

function lcs(a: string[], b: string[]): Pieza[] {
  const n = a.length, m = b.length
  // dp[i][j] = LCS de a[i:] y b[j:], en una sola tabla plana.
  const dp = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * (m + 1) + j] = a[i] === b[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
  const out: Pieza[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ tipo: 'igual', texto: a[i] }); i++; j++ }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) out.push({ tipo: 'quitado', texto: a[i++] })
    else out.push({ tipo: 'agregado', texto: b[j++] })
  }
  while (i < n) out.push({ tipo: 'quitado', texto: a[i++] })
  while (j < m) out.push({ tipo: 'agregado', texto: b[j++] })
  return out
}

function unir(piezas: Pieza[]): Pieza[] {
  const out: Pieza[] = []
  for (const p of piezas) {
    const u = out[out.length - 1]
    if (u && u.tipo === p.tipo) u.texto += p.texto
    else out.push({ ...p })
  }
  // Un espacio suelto entre dos cambios se lee mejor dentro del cambio: «quitado agregado» en bloque.
  for (let k = 1; k < out.length - 1; k++) {
    const p = out[k]
    if (p.tipo === 'igual' && /^[ \t]+$/.test(p.texto) && out[k - 1].tipo !== 'igual' && out[k + 1].tipo !== 'igual') {
      const quit = out.slice(k - 1, k + 2).filter(x => x.tipo !== 'agregado').map(x => x.texto).join('')
      const agr = out.slice(k - 1, k + 2).filter(x => x.tipo !== 'quitado').map(x => x.texto).join('')
      out.splice(k - 1, 3, { tipo: 'quitado', texto: quit }, { tipo: 'agregado', texto: agr })
    }
  }
  return out.filter(p => p.texto)
}

export function diffPalabras(antes: string, despues: string): Pieza[] {
  let a = tokens(antes), b = tokens(despues)
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fin = 0
  while (fin < a.length - ini && fin < b.length - ini && a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++
  const pre = a.slice(0, ini).join(''), post = fin ? a.slice(a.length - fin).join('') : ''
  a = a.slice(ini, a.length - fin); b = b.slice(ini, b.length - fin)
  let medio: Pieza[]
  if ((a.length + 1) * (b.length + 1) <= MAX_CELDAS) medio = lcs(a, b)
  else {
    const la = a.join('').split(/(?<=\n)/), lb = b.join('').split(/(?<=\n)/)
    medio = (la.length + 1) * (lb.length + 1) <= MAX_CELDAS ? lcs(la, lb) : [{ tipo: 'quitado', texto: la.join('') }, { tipo: 'agregado', texto: lb.join('') }]
  }
  return unir([{ tipo: 'igual', texto: pre }, ...medio, { tipo: 'igual', texto: post }])
}

/** Cuántos cambios hay (un quitado seguido de su agregado cuenta como uno). */
export function contarCambios(piezas: Pieza[]): number {
  let n = 0
  piezas.forEach((p, k) => { if (p.tipo !== 'igual' && !(p.tipo === 'agregado' && piezas[k - 1]?.tipo === 'quitado')) n++ })
  return n
}

/** Lo igual muy largo se pliega a sus orillas para que se vea solo lo tocado. */
export type Plegada = Pieza | { tipo: 'pliegue'; omitido: number }
export function plegar(piezas: Pieza[], orilla = 140): Plegada[] {
  return piezas.flatMap((p, k): Plegada[] => {
    if (p.tipo !== 'igual' || p.texto.length <= orilla * 2 + 60) return [p]
    const primero = k === 0, ultimo = k === piezas.length - 1
    const ini = primero ? '' : p.texto.slice(0, orilla), fin = ultimo ? '' : p.texto.slice(-orilla)
    const omitido = p.texto.length - ini.length - fin.length
    return [...(ini ? [{ tipo: 'igual' as const, texto: ini }] : []), { tipo: 'pliegue' as const, omitido }, ...(fin ? [{ tipo: 'igual' as const, texto: fin }] : [])]
  })
}
