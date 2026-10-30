/**
 * MARCAS EXACTAS DEL LECTOR (29 oct 2026). Daniel: «si solo es preciso 95% del tiempo hay desfases que me cortan la
 * concentración».
 *
 * La voz `levy` sale de AVSpeechSynthesizer, que en la MISMA síntesis que produce el audio entrega dónde empieza cada
 * palabra (arbrain/server: sayd.swift → synthesizeLector). El servidor manda esa tabla en la cabecera `X-Marcas`:
 * `{"v":1,"n":<largo del texto>,"m":[[desde, largo, ms], …]}`, con `desde`/`largo` en unidades UTF-16 del texto pedido
 * (las de un string de JS) y `ms` en el audio ENTREGADO (ya acelerado). Aquí no se estima nada: se traduce la tabla a
 * «segundo en que empieza cada palabra» con las mismas palabras que el resaltado (`/\S+/`).
 *
 * La voz no marca lo que no pronuncia («—»; «SaaS» lo parte en dos marcas): una palabra sin marca propia toma el tiempo
 * de la siguiente que sí tiene (el resaltado la salta), y de varias marcas dentro de una palabra manda la primera.
 */

/** `[desde, largo, ms]` de una palabra hablada. */
export type MarcaPalabra = [number, number, number]

/** La tabla de `X-Marcas`, o `null` si no viene, no es de este texto o no se entiende (la voz no da marcas). */
export function leerMarcas(cabecera: string | null, texto: string): MarcaPalabra[] | null {
  if (!cabecera) return null
  try {
    const j = JSON.parse(cabecera) as { v?: unknown; n?: unknown; m?: unknown }
    if (j.v !== 1 || j.n !== texto.length || !Array.isArray(j.m) || !j.m.length) return null
    const ok = j.m.every((x) => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0))
    return ok ? (j.m as MarcaPalabra[]) : null
  } catch {
    return null
  }
}

/**
 * Segundo (del audio entregado) en que empieza cada palabra `/\S+/` de `texto`. `null` si ninguna palabra quedó con
 * marca. Siempre no decreciente. Pura, para el test.
 */
export function tiemposDeMarcas(texto: string, marcas: MarcaPalabra[]): number[] | null {
  const palabras = [...texto.matchAll(/\S+/g)].map((m) => ({ a: m.index!, b: m.index! + m[0].length }))
  if (!palabras.length) return null
  const t: Array<number | null> = palabras.map(() => null)
  const ordenadas = [...marcas].sort((x, y) => x[0] - y[0])
  let k = 0
  for (const [desde, largo, ms] of ordenadas) {
    // Palabra donde cae la marca: la que la contiene o, si arranca en un espacio, la siguiente que toca su rango.
    while (k < palabras.length && palabras[k].b <= desde) k++
    if (k >= palabras.length) break
    if (palabras[k].a >= desde + Math.max(1, largo)) continue
    if (t[k] == null) t[k] = ms / 1000
  }
  if (t.every((x) => x == null)) return null
  const out = new Array<number>(t.length)
  let siguiente: number | null = null
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] != null) siguiente = t[i]
    out[i] = siguiente ?? Infinity
  }
  // Cola sin marcas (no debería pasar): se queda en la última marcada, nunca en «infinito».
  let ultimo = 0
  for (let i = 0; i < out.length; i++) {
    if (out[i] === Infinity) out[i] = ultimo
    out[i] = Math.max(out[i], ultimo)
    ultimo = out[i]
  }
  return out
}

/** Índice de la palabra que suena en el segundo `t`: la última que ya empezó (empates: la última de ellas). */
export function palabraEn(tiempos: number[], t: number): number {
  let lo = 0
  let hi = tiempos.length - 1
  if (hi < 0) return -1
  if (t < tiempos[0]) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tiempos[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}
