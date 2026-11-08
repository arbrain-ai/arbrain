/**
 * Subir un archivo a una web sin el panel «Abrir» de macOS (5 nov 2026, canal «Levy Arbrain»). Cuatro encargos
 * fallaron porque la extensión no sabía elegir archivos: «Subir» abría el panel nativo, el cerebro tecleaba rutas a
 * ciegas (una equivocada) y se acababa los turnos. Ahora la extensión intercepta el selector y llena el
 * `<input type=file>` con `DOM.setFileInputFiles`. Subir un archivo local a internet es sensible, así que antes de que la
 * extensión toque nada la ruta pasa estas guardas, que no apaga ni el freno apagado:
 *
 *   1. La ruta aparece textual en el pedido o en la cita (el modelo no elige qué archivo sale de la Mac). Vale igual
 *      escrita con `~/` o completa; un prefijo no cuenta (`/x/a.png` no queda autorizada por `/x/a.png.bak`).
 *   2. La pestaña está en el sitio del encargo: el pedido o la cita nombra su dominio (en una URL o suelto) o su marca
 *      («YouTube Studio» → studio.youtube.com).
 *   3. Nunca carpetas de llaves (~/.ssh, ~/.gnupg, ~/.aws, ~/.kube, ~/.docker y afines) ni archivos de llaves
 *      (.pem, .key, id_rsa, .env…), tampoco a través de un enlace simbólico: se juzga la ruta y su destino real.
 *   4. Es un archivo normal que existe.
 */
import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'

/** Carpetas que nunca salen, estén donde estén (también en un disco externo o un respaldo). */
export const CARPETAS_DE_LLAVES = ['.ssh', '.gnupg', '.aws', '.kube', '.docker', '.azure', '.password-store', 'Keychains', 'gcloud']

/** Archivos de llaves o secretos por su nombre. */
const ARCHIVO_DE_LLAVE = /^(id_(rsa|dsa|ecdsa|ed25519)(_sk)?(\.pub)?|.*\.(pem|key|p12|pfx|jks|keystore|ppk|gpg|kdbx|keychain|keychain-db|ovpn)|\.env(\..*)?|\.netrc|\.pgpass|credentials(\.json)?|token\.json|service[-_]account.*\.json)$/i

export type JuicioArchivo =
  | { ok: true; ruta: string; real: string; nombre: string; bytes: number; host: string }
  | { ok: false; motivo: string }

const expandir = (r: string, home: string) => r === '~' ? home : r.startsWith('~/') ? join(home, r.slice(2)) : r
const contraer = (r: string, home: string) => r === home ? '~' : r.startsWith(home + sep) ? `~${r.slice(home.length)}` : r

/** ¿`aguja` aparece en `texto` como ruta completa (no como prefijo de otra)? */
function apareceEntera(texto: string, aguja: string): boolean {
  for (let i = texto.indexOf(aguja); i >= 0; i = texto.indexOf(aguja, i + 1)) {
    const sig = texto[i + aguja.length]
    if (sig === undefined || !/[\w\-/.]/.test(sig)) return true
    // Un punto final de oración («…banner.png.») no alarga la ruta.
    if (sig === '.' && !/[\w\-/]/.test(texto[i + aguja.length + 1] ?? '')) return true
  }
  return false
}

/** Rutas absolutas que el texto nombra (para decirle al modelo cuál sí vale). */
const rutasNombradas = (textos: string[]) => [...new Set(textos.join('\n').match(/(?:~|\/)[^\s«»"'`,;()]+/g) ?? [])].filter(r => r.length > 2).map(r => r.replace(/[.:]$/, '')).slice(0, 4)

/** ¿El texto nombra el sitio de esta URL? Por host, por dominio registrable o por su marca como palabra. */
export function sitioNombrado(textos: string[], url: string | undefined): { ok: boolean; host: string } {
  let host = ''
  try { host = url ? new URL(url).hostname.toLowerCase() : '' } catch { /* sin URL */ }
  if (!host) return { ok: false, host }
  const t = textos.join('\n').toLowerCase()
  const sinWww = host.replace(/^www\./, '')
  if (t.includes(sinWww)) return { ok: true, host }
  const partes = sinWww.split('.')
  // Dominio registrable: las dos últimas etiquetas (tres si la penúltima es un SLD corto de país: com.mx, co.uk).
  const n = partes.length >= 3 && /^(com|co|org|net|gob|gov|ac|edu)$/.test(partes[partes.length - 2]) && partes[partes.length - 1].length === 2 ? 3 : 2
  const registrable = partes.slice(-n).join('.')
  if (/^\d+$/.test(partes[partes.length - 1])) return { ok: false, host } // una IP vale solo si el texto la trae completa
  if (t.includes(registrable)) return { ok: true, host }
  // La marca («youtube» de youtube.com) nombrada como palabra; las de 1–2 letras (x.com) solo por dominio.
  const marca = partes[partes.length - n]
  const sinAcentos = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (marca && marca.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${marca}([^\\p{L}\\p{N}]|$)`, 'u').test(sinAcentos)) return { ok: true, host }
  return { ok: false, host }
}

export function juzgarArchivo(ruta: string, op: { textos: string[]; url?: string; home?: string }): JuicioArchivo {
  const home = op.home ?? homedir()
  const textos = op.textos.filter(Boolean).map(t => t.normalize('NFC'))
  const dada = String(ruta ?? '').normalize('NFC').trim()
  if (!dada) return { ok: false, motivo: 'archivo necesita `ruta`: la ruta absoluta del archivo, tal cual aparece en el pedido' }
  const absoluta = expandir(dada, home)
  if (!isAbsolute(absoluta)) return { ok: false, motivo: `«${dada}» no es una ruta absoluta: usa la ruta completa tal cual aparece en el pedido (p. ej. ~/Developer/banner.png)` }
  const resuelta = resolve(absoluta)

  // 1. Textual en el pedido o la cita (como la dio el modelo, completa o con ~).
  const formas = [...new Set([dada, absoluta, resuelta, contraer(resuelta, home)])]
  if (!textos.some(t => formas.some(f => apareceEntera(t, f)))) {
    const hay = rutasNombradas(textos)
    return { ok: false, motivo: `la ruta ${dada} no aparece textual en el pedido ni en la cita: solo se sube un archivo que el encargo nombra con su ruta. ${hay.length ? `El encargo nombra: ${hay.join(' · ')}. Usa esa, copiada tal cual.` : 'El encargo no nombra ninguna ruta: pídela.'}` }
  }

  // 3. Llaves: por la ruta escrita y por su destino real (un enlace simbólico no las saca).
  let real = resuelta
  try { real = realpathSync(resuelta) } catch { /* no existe: lo dice la guarda 4 */ }
  for (const r of [resuelta, real]) {
    const segmentos = r.split(sep)
    const carpeta = segmentos.slice(0, -1).find(s => CARPETAS_DE_LLAVES.includes(s))
    if (carpeta) return { ok: false, motivo: `${dada} vive en una carpeta de llaves (${carpeta}): esos archivos nunca se suben a una web` }
    if (ARCHIVO_DE_LLAVE.test(basename(r))) return { ok: false, motivo: `${basename(r)} es un archivo de llaves o secretos: nunca se sube a una web` }
  }

  // 4. Existe y es un archivo normal.
  let bytes = 0
  try {
    const st = statSync(real)
    if (!st.isFile()) return { ok: false, motivo: `${dada} no es un archivo (es una carpeta u otra cosa)` }
    bytes = st.size
  } catch { return { ok: false, motivo: `${dada} no existe en esta Mac: revisa la ruta del pedido` } }

  // 2. El sitio del encargo.
  const s = sitioNombrado(textos, op.url)
  if (!s.ok) return { ok: false, motivo: `la pestaña está en ${s.host || 'una página sin dirección'}, que no es el sitio del encargo: el pedido o la cita tiene que nombrar ese sitio para subirle un archivo` }

  return { ok: true, ruta: dada, real, nombre: basename(real), bytes, host: s.host }
}

/** Tamaño legible para el informe. */
export const tamano = (b: number) => b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`

/**
 * Lo que la página hizo al recibir el archivo (extensión: `aceptacion`). Que el archivo esté en el campo no prueba
 * nada (6 nov 2026: «archivo» dijo ok dos veces y YouTube Studio no se quedó ni el banner ni la foto).
 */
export type Aceptacion = { senal: 'dialogo' | 'vista_previa' | 'campo_leido' | 'texto' | 'formulario'; detalle: string }

/** Una subida que la página aceptó: con qué se verifica después que quedó guardada. */
export interface Subida {
  nombre: string
  real: string
  pestana: number
  /** Zonas (primera línea de texto junto a la imagen) del vecindario del botón que subió. */
  zonas: string[]
  /** Imágenes (src normalizado) que la página mostraba antes de recibir el archivo. */
  antes: string[]
  /** El src con el que una verificación la vio guardada (si el mismo archivo se vuelve a subir, la página puede reusarlo). */
  guardadaEn?: string
  /** La pestaña se recargó (web_navegar) después de la subida: lo que se ve sale de lo guardado, no de la vista previa. */
  recargada?: boolean
}

export interface ImagenPagina { src: string; tipo: 'url' | 'blob' | 'data'; zona: string; ancho?: number }

export type EstadoSubida = 'guardada' | 'vista_previa' | 'sin_cambio'

/**
 * ¿Quedó cada subida en la página? Por zona: la imagen junto al botón que subió tiene un src que no estaba antes. Un src
 * guardado (http) cuenta como «guardada»; un blob o data es la vista previa local, que se pierde si no se guarda, salvo
 * que la pestaña se haya recargado después de subir: entonces la página lo pintó desde lo guardado (YouTube Studio pinta
 * el banner guardado como data: dentro de la ilustración de los dispositivos). Sin zona reconocible se mira toda la
 * página y se dice. Cumple cuando todas quedaron guardadas (o en vista previa, si el
 * resultado pedido es solo adjuntar).
 */
export function juzgarSubidas(subidas: Subida[], imagenes: ImagenPagina[], op: { vistaPreviaBasta?: boolean } = {}): { cumple: boolean; lineas: string[]; estados: EstadoSubida[] } {
  const estados: EstadoSubida[] = []
  const lineas: string[] = []
  // Una imagen nueva no se reparte entre dos archivos distintos (sí entre dos subidas del mismo archivo).
  const usadas = new Map<string, string>()
  for (const s of subidas) {
    const antes = new Set(s.antes)
    const enZona = imagenes.filter(i => s.zonas.includes(i.zona))
    const pool = enZona.length ? enZona : imagenes
    const libre = (src: string) => !usadas.has(src) || usadas.get(src) === s.real
    const nuevas = pool.filter(i => !antes.has(i.src) && libre(i.src))
    // El mismo archivo ya se vio guardado en esta sesión y la página reusó ese src al subirlo otra vez (YouTube lo hace).
    const yaVista = new Set(subidas.filter(x => x !== s && x.real === s.real && x.guardadaEn).map(x => x.guardadaEn!))
    const guardada = nuevas.find(i => i.tipo === 'url' || s.recargada) ?? pool.find(i => yaVista.has(i.src) && libre(i.src))
    const previa = nuevas.find(i => i.tipo !== 'url')
    const donde = enZona.length ? `en «${s.zonas.find(z => enZona.some(i => i.zona === z))}»` : 'en la página (sin la zona del botón)'
    if (guardada) {
      usadas.set(guardada.src, s.real)
      s.guardadaEn = guardada.src
      estados.push('guardada')
      lineas.push(`${s.nombre}: guardada ${donde}${s.recargada && guardada.tipo !== 'url' ? ' (pintada tras recargar)' : ''} · src ${guardada.src.slice(0, 120)}`)
    } else if (previa) {
      estados.push('vista_previa')
      lineas.push(`${s.nombre}: solo vista previa local (${previa.tipo}) ${donde}: la página aún no la guardó (¿falta «Listo», Publicar o Guardar, o se recargó antes de terminar?)`)
    } else {
      estados.push('sin_cambio')
      const hay = pool.slice(0, 2).map(i => i.src.slice(0, 100)).join(' · ')
      lineas.push(`${s.nombre}: NO está ${donde}: la imagen sigue siendo la de antes${hay ? ` (${hay})` : ''}`)
    }
  }
  const cumple = subidas.length > 0 && estados.every(e => e === 'guardada' || (op.vistaPreviaBasta && e === 'vista_previa'))
  return { cumple, lineas: subidas.length ? lineas : ['en esta sesión no se subió ningún archivo'], estados }
}

/** El guardado que provocó un clic (extensión: `esperarEnvios`), en una línea para el informe. */
export function textoGuardado(g: { envios: number; fallidos: number; cancelados?: number; pendientes: number; ms: number } | undefined): string {
  if (!g || !g.envios) return ''
  const partes = [`la página envió ${g.envios} ${g.envios === 1 ? 'petición' : 'peticiones'} y esperé ${(g.ms / 1000).toFixed(1)} s a que terminara`]
  if (g.fallidos) partes.push(`OJO: ${g.fallidos} falló: verifica que se guardó`)
  if (g.pendientes) partes.push(`OJO: ${g.pendientes} sigue en curso: no navegues todavía, verifica en unos segundos`)
  return ` · ${partes.join(' · ')}`
}
