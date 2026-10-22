/**
 * SHA-256 y HMAC-SHA256 en TypeScript puro y síncrono (seguridad noche 21→22 oct 2026, M2 del reporte v0.2.1).
 *
 * `desktop-auth.ts` lo usan a la vez el proxy, las rutas y un contexto del navegador, así que no puede importar
 * `node:crypto` y la verificación de la cookie tiene que ser síncrona (Web Crypto es asíncrona). Solo deriva el token de
 * sesión del modo servidor a partir de la contraseña: entradas cortas, una vez por arranque (se guarda en caché).
 * Probado contra `node:crypto` en tests/seguridad/sesion-servidor.test.ts.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

export function sha256(datos: Uint8Array): Uint8Array {
  const largo = datos.length
  const bloques = Math.ceil((largo + 9) / 64)
  const m = new Uint8Array(bloques * 64)
  m.set(datos)
  m[largo] = 0x80
  const bits = largo * 8
  const vista = new DataView(m.buffer)
  vista.setUint32(m.length - 8, Math.floor(bits / 0x100000000))
  vista.setUint32(m.length - 4, bits >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let b = 0; b < bloques; b++) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(b * 64 + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, bb, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & bb) ^ (a & c) ^ (bb & c)
      const t2 = (S0 + maj) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + bb) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  const fuera = new Uint8Array(32)
  const vf = new DataView(fuera.buffer)
  for (let i = 0; i < 8; i++) vf.setUint32(i * 4, h[i])
  return fuera
}

const utf8 = (s: string) => new TextEncoder().encode(s)
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

/** HMAC-SHA256 (RFC 2104) en hex. */
export function hmacSha256Hex(llave: string, mensaje: string): string {
  let k: Uint8Array = utf8(llave)
  if (k.length > 64) k = sha256(k)
  const bloque = new Uint8Array(64)
  bloque.set(k)
  const ipad = bloque.map(x => x ^ 0x36), opad = bloque.map(x => x ^ 0x5c)
  const m = utf8(mensaje)
  const interior = new Uint8Array(64 + m.length); interior.set(ipad); interior.set(m, 64)
  const ih = sha256(interior)
  const exterior = new Uint8Array(64 + 32); exterior.set(opad); exterior.set(ih, 64)
  return hex(sha256(exterior))
}
