// Lenguaje unificado (27 oct 2026): cada color de las hojas quedó como respaldo de su token (`var(--l-…, valor)`). Las pruebas
// que leen una hoja como texto comparan el estilo ACTUAL: esta función quita las envolturas y deja el valor de hoy.
export function sinLenguaje(css: string): string {
  let out = css, prev
  do {
    prev = out
    const m = out.match(/var\(--l-[\w-]+,\s*/)
    if (!m || m.index === undefined) break
    let prof = 0, fin = -1
    for (let k = m.index + 3; k < out.length; k++) {
      if (out[k] === '(') prof++
      else if (out[k] === ')') { prof--; if (prof === 0) { fin = k; break } }
    }
    if (fin < 0) break
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length, fin).trim() + out.slice(fin + 1)
  } while (out !== prev)
  return out
}
