/**
 * Partir las respuestas largas para que empiecen a sonar en segundos.
 *
 * La voz se fabrica entera antes de sonar: una frase de ~1000 letras puede tardar casi un minuto en empezar. Partida por
 * oraciones, el primer pedazo (corto) suena en unos segundos y los demás se preparan mientras tanto. Lo que se dice no
 * cambia: solo cuándo empieza a sonar.
 */

/** El primer pedazo, corto: es el que se espera. */
const PRIMERO_MAX = 160
/** Los siguientes, más largos: se fabrican mientras suena el anterior. */
const RESTO_MAX = 320

/** Oraciones del texto (con su puntuación). Una oración larguísima se corta en sus comas o, si no hay, por palabras. */
function oraciones(texto: string, max: number): string[] {
  const salida: string[] = []
  for (const m of texto.matchAll(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g)) {
    const o = m[0].trim()
    if (!o) continue
    if (o.length <= max) { salida.push(o); continue }
    let actual = ''
    for (const parte of o.split(/(?<=[,;:])\s+/)) {
      if (parte.length > max) {
        if (actual) { salida.push(actual); actual = '' }
        let resto = parte
        while (resto.length > max) {
          const corte = resto.lastIndexOf(' ', max)
          const i = corte > max / 2 ? corte : max
          salida.push(resto.slice(0, i).trim())
          resto = resto.slice(i).trim()
        }
        actual = resto
        continue
      }
      if (actual && (actual + ' ' + parte).length > max) { salida.push(actual); actual = parte }
      else actual = actual ? `${actual} ${parte}` : parte
    }
    if (actual) salida.push(actual)
  }
  return salida
}

/** El texto en pedazos para la voz: el primero hasta ~160 letras, los demás hasta ~320, siempre en oraciones enteras. */
export function partirParaVoz(texto: string): string[] {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (!t) return []
  if (t.length <= PRIMERO_MAX) return [t]
  const os = oraciones(t, RESTO_MAX)
  if (os[0].length > PRIMERO_MAX) os.splice(0, 1, ...oraciones(os[0], PRIMERO_MAX)) // la primera, corta aunque sea en comas
  const pedazos: string[] = []
  let actual = ''
  for (const o of os) {
    const max = pedazos.length ? RESTO_MAX : PRIMERO_MAX
    if (actual && (actual + ' ' + o).length > max) { pedazos.push(actual); actual = o }
    else actual = actual ? `${actual} ${o}` : o
  }
  if (actual) pedazos.push(actual)
  return pedazos
}
