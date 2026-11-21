// Bandera de «Levy vivo» (7-8 nov 2026): la cara oficial con chip Arbrain, boca por atlas de visemas desde la alineación de
// ElevenLabs y el movimiento del 3D. APAGADA por defecto: sin ella Live, la voz y la cara son exactamente las de antes.
//
// Encender en un navegador: abrir cualquier página con `?levyVivo=1` (queda guardado en localStorage); `?levyVivo=0` la
// apaga. O a mano: localStorage.setItem('arbrain-levy-vivo', '1').
export const LEVY_VIVO_CLAVE = 'arbrain-levy-vivo'

export function levyVivoActivo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('levyVivo')
    if (q === '1' || q === '0') window.localStorage.setItem(LEVY_VIVO_CLAVE, q)
    return window.localStorage.getItem(LEVY_VIVO_CLAVE) === '1'
  } catch { return false }
}

// Atlas de cabeza (19 nov 2026, PRUEBA, apagada): la cabeza de la cara de los videos gira e inclina como en LivePortrait, con campos
// horneados (public/levy-face/medio/cabeza/) en vez del parallax de profundidad. Encender: `?levyCabezaLP=1` (queda guardado;
// `?levyCabezaLP=0` la apaga) o localStorage.setItem('arbrain-levy-cabeza-lp', '1'). Sin ella, la cabeza de siempre.
export const CABEZA_LP_CLAVE = 'arbrain-levy-cabeza-lp'
export function cabezaLPActiva(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('levyCabezaLP')
    if (q === '1' || q === '0') window.localStorage.setItem(CABEZA_LP_CLAVE, q)
    return window.localStorage.getItem(CABEZA_LP_CLAVE) === '1'
  } catch { return false }
}

// Levy en Live (13 nov 2026, Daniel: «esto del levy 2D metelo al live de tu foto de perfil»). Desde hoy Live, el que se abre
// desde la foto de perfil, arranca con el Levy 2D de los videos: la cara oficial con chip Arbrain, la boca por el atlas
// horneado con LivePortrait y el movimiento del 3D (lo que antes pedía `?levyVivo=1`). Lo de antes queda en Ajustes ›
// Apariencia › «Levy en Live»: el 3D (lo que Live abría hasta hoy) o el 2D anterior (chip «sf», boca paramétrica).
// Clave nueva a propósito: la vieja `arbrain.live.vista` guardaba «3d» por defecto y taparía el cambio que pidió Daniel.
//
// «Como en YouTube» (18 nov 2026, Daniel: «entiende el levy de mi canal de yt… no es un fondo 100% oscuro»): la misma cara de los
// videos, pero en el plano medio del canal: torso y hombros, el estudio cálido de la rotación y el cuerpo que respira y acompaña
// (levy-medio.ts). Desde el 19 nov es la de por omisión; «De los videos» (primer plano) sigue igual.
export type CaraLive = 'videos' | 'youtube' | '3d' | '2d-anterior'
export const CARA_LIVE_CLAVE = 'arbrain.live.cara'
export const CARA_LIVE_EVENTO = 'arbrain:cara-live'
/** El último 2D elegido: el botón 2D/3D de Live vuelve a ese y no siempre al primer plano. */
export const CARA_LIVE_2D_CLAVE = 'arbrain.live.cara-2d'
export const CARAS_LIVE: ReadonlyArray<{ id: CaraLive; nombre: string; detalle: string }> = [
  { id: 'youtube', nombre: 'Como en YouTube', detalle: 'De cuerpo, en el estudio de tus videos: la misma cara, con torso, fondo y luz del canal' },
  { id: 'videos', nombre: 'De los videos', detalle: 'La cara oficial de cerca, con la boca y el movimiento de los videos' },
  { id: '3d', nombre: '3D', detalle: 'El avatar 3D que Live abría antes' },
  { id: '2d-anterior', nombre: '2D anterior', detalle: 'El retrato 2D de antes (chip «sf»)' },
]
// 19 nov 2026, 07:18 (Daniel, al abrir Live en primer plano): «wtf el nuevo levy esta gigante!». Desde entonces Live abre
// «Como en YouTube» si no hay nada elegido; «De los videos» (primer plano) queda a un clic en Ajustes.
export const CARA_POR_OMISION: CaraLive = 'youtube'
const esCara = (v: unknown): v is CaraLive => v === 'videos' || v === 'youtube' || v === '3d' || v === '2d-anterior'

/** Lo que monta Live. Sin nada guardado (o en el servidor), el Levy de los videos. */
export function caraLive(): CaraLive {
  if (typeof window === 'undefined') return CARA_POR_OMISION
  try {
    const v = window.localStorage.getItem(CARA_LIVE_CLAVE)
    return esCara(v) ? v : CARA_POR_OMISION
  } catch { return CARA_POR_OMISION }
}

/** La cara de los videos con su atlas de bocas (primer plano o como en YouTube): la voz le pide la alineación por carácter. */
export function caraConAtlas(c: CaraLive): boolean {
  return c === 'videos' || c === 'youtube'
}

/** A qué 2D vuelve el botón de Live desde el 3D: el último 2D elegido; sin ninguno, el de los videos. */
export function ultimaCara2d(): CaraLive {
  if (typeof window === 'undefined') return CARA_POR_OMISION
  try {
    const v = window.localStorage.getItem(CARA_LIVE_2D_CLAVE)
    return esCara(v) && v !== '3d' ? v : CARA_POR_OMISION
  } catch { return CARA_POR_OMISION }
}

export function fijarCaraLive(c: CaraLive): void {
  try {
    window.localStorage.setItem(CARA_LIVE_CLAVE, c)
    if (c !== '3d') window.localStorage.setItem(CARA_LIVE_2D_CLAVE, c)
  } catch { /* sin almacenamiento: vale solo esta vez */ }
  try { window.dispatchEvent(new CustomEvent(CARA_LIVE_EVENTO, { detail: c })) } catch { /* sin ventana */ }
}

/** Separa objetos JSON de nivel superior en un flujo de texto (ElevenLabs manda uno por línea; no se depende del salto). */
export class SeparadorJson {
  private resto = ''
  push(texto: string): unknown[] {
    this.resto += texto
    const out: unknown[] = []
    let prof = 0, enCadena = false, escape = false, inicio = -1, corte = 0
    for (let i = 0; i < this.resto.length; i++) {
      const c = this.resto[i]
      if (enCadena) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') enCadena = false; continue }
      if (c === '"') enCadena = true
      else if (c === '{') { if (prof++ === 0) inicio = i }
      else if (c === '}' && prof > 0 && --prof === 0) { out.push(JSON.parse(this.resto.slice(inicio, i + 1))); corte = i + 1 }
    }
    this.resto = this.resto.slice(corte)
    return out
  }
}

export function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64), out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
