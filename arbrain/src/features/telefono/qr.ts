/**
 * Código QR mínimo para Ajustes › Tu cerebro en el teléfono (23 oct 2026): la dirección `https://<maquina>.ts.net` que la
 * persona escanea con la cámara del celular. Sin dependencias nuevas (la web no trae librería de QR). Modo byte,
 * corrección M, versiones 1 a 10 (hasta 213 bytes: sobra para una dirección). Sigue la norma ISO/IEC 18004 como la
 * implementación de referencia de Nayuki (MIT). Puro: lo prueba tests/servidor/telefono.test.ts decodificándolo.
 */

const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOQUES_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]

function modulosDatos(v: number): number {
  let r = (16 * v + 128) * v + 64
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (v >= 7) r -= 36
  }
  return r
}
const palabrasDatos = (v: number) => Math.floor(modulosDatos(v) / 8) - ECC_M[v]! * BLOQUES_M[v]!

function mul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}
function divisor(grado: number): number[] {
  const r = new Array<number>(grado).fill(0)
  r[grado - 1] = 1
  let raiz = 1
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j]!, raiz)
      if (j + 1 < r.length) r[j]! ^= r[j + 1]!
    }
    raiz = mul(raiz, 0x02)
  }
  return r
}
function residuo(datos: number[], div: number[]): number[] {
  const r = new Array<number>(div.length).fill(0)
  for (const b of datos) {
    const f = b ^ r.shift()!
    r.push(0)
    div.forEach((c, i) => { r[i]! ^= mul(c, f) })
  }
  return r
}

function posicionesAlineacion(v: number, tam: number): number[] {
  if (v === 1) return []
  const n = Math.floor(v / 7) + 2
  const paso = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
  const r = [6]
  for (let p = tam - 7; r.length < n; p -= paso) r.splice(1, 0, p)
  return r
}

/** Matriz del QR (true = módulo oscuro) para `texto` en UTF-8, o error si no cabe en la versión 10. */
export function codigoQR(texto: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto))
  let v = 1
  for (; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= palabrasDatos(v) * 8) break
  if (v > 10) throw new Error('El texto no cabe en el código QR')
  const tam = v * 4 + 17

  // Bits de datos: modo byte (0100), longitud, bytes, terminador y relleno.
  const bits: number[] = []
  const poner = (valor: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1) }
  poner(0b0100, 4)
  poner(bytes.length, v < 10 ? 8 : 16)
  for (const b of bytes) poner(b, 8)
  const capacidad = palabrasDatos(v) * 8
  poner(0, Math.min(4, capacidad - bits.length))
  poner(0, (8 - (bits.length % 8)) % 8)
  for (let rel = 0xec; bits.length < capacidad; rel ^= 0xec ^ 0x11) poner(rel, 8)
  const datos: number[] = []
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // Bloques con Reed-Solomon, intercalados.
  const nBloques = BLOQUES_M[v]!, eccLen = ECC_M[v]!
  const crudas = Math.floor(modulosDatos(v) / 8)
  const cortos = nBloques - (crudas % nBloques)
  const largoCorto = Math.floor(crudas / nBloques)
  const div = divisor(eccLen)
  const bloques: number[][] = []
  for (let i = 0, k = 0; i < nBloques; i++) {
    const d = datos.slice(k, k + largoCorto - eccLen + (i < cortos ? 0 : 1))
    k += d.length
    const ecc = residuo(d, div)
    if (i < cortos) d.push(0)
    bloques.push(d.concat(ecc))
  }
  const final: number[] = []
  for (let i = 0; i < bloques[0]!.length; i++) bloques.forEach((b, j) => { if (i !== largoCorto - eccLen || j >= cortos) final.push(b[i]!) })

  // Patrones fijos.
  const m: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false))
  const fijo: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false))
  const fijar = (x: number, y: number, o: boolean) => { m[y]![x] = o; fijo[y]![x] = true }
  for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [tam - 4, 3], [3, tam - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy
      if (x >= 0 && x < tam && y >= 0 && y < tam) fijar(x, y, d !== 2 && d !== 4)
    }
  }
  const al = posicionesAlineacion(v, tam)
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(al[i]! + dx, al[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  const formato = (mascara: number) => {
    const dato = (0 << 3) | mascara // corrección M = 00
    let r = dato
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    const b = ((dato << 10) | r) ^ 0x5412
    const bit = (i: number) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) fijar(8, i, bit(i))
    fijar(8, 7, bit(6)); fijar(8, 8, bit(7)); fijar(7, 8, bit(8))
    for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, bit(i))
    fijar(8, tam - 8, true)
  }
  formato(0)
  if (v >= 7) {
    let r = v
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const b = (v << 12) | r
    for (let i = 0; i < 18; i++) {
      const o = ((b >>> i) & 1) !== 0, a = tam - 11 + (i % 3), c = Math.floor(i / 3)
      fijar(a, c, o); fijar(c, a, o)
    }
  }

  // Datos en zigzag.
  let i = 0
  for (let der = tam - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5
    for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
      const x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? tam - 1 - vert : vert
      if (!fijo[y]![x] && i < final.length * 8) { m[y]![x] = ((final[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0; i++ }
    }
  }

  // Máscara con menor penalización (reglas 1, 2 y 4 de la norma; la 3 no cambia la validez).
  const aplicar = (k: number) => {
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
      if (fijo[y]![x]) continue
      const inv = [
        (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
        (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0,
        (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
      ][k]
      if (inv) m[y]![x] = !m[y]![x]
    }
  }
  const penal = () => {
    let p = 0, oscuros = 0
    for (let y = 0; y < tam; y++) for (const eje of [0, 1]) {
      let run = 1
      for (let x = 1; x < tam; x++) {
        const a = eje ? m[x]![y] : m[y]![x], b = eje ? m[x - 1]![y] : m[y]![x - 1]
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
      }
    }
    for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) {
      const c = m[y]![x]
      if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) p += 3
    }
    for (const fila of m) for (const c of fila) if (c) oscuros++
    p += Math.floor(Math.abs(oscuros * 20 - tam * tam * 10) / (tam * tam)) * 10
    return p
  }
  let mejor = 0, minimo = Infinity
  for (let k = 0; k < 8; k++) {
    aplicar(k); formato(k)
    const p = penal()
    if (p < minimo) { minimo = p; mejor = k }
    aplicar(k)
  }
  aplicar(mejor); formato(mejor)
  return m
}

/** El QR como `d` de un path SVG (un cuadro de 1×1 por módulo oscuro), con margen de 4 módulos. */
export function caminoQR(matriz: boolean[][], margen = 4): { d: string; lado: number } {
  let d = ''
  matriz.forEach((fila, y) => fila.forEach((o, x) => { if (o) d += `M${x + margen} ${y + margen}h1v1h-1z` }))
  return { d, lado: matriz.length + margen * 2 }
}
