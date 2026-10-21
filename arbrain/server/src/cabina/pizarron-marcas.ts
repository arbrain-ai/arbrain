/**
 * Acotaciones del pizarrón: espejo EXACTO de arbrain/src/features/pizarron/marcas.ts (la app las reproduce; aquí se
 * validan antes de guardar un paso, para que el error le llegue a Levy y no a Daniel). La paridad la vigila
 * pizarron.test.ts, que lee el archivo de la app y compara ambos sobre los mismos casos.
 */
export interface Marca { verbo: string; args: string[]; opts: Record<string, string>; texto?: string; crudo: string }
/** Un tramo hablado con sus acciones en coordenadas del texto HABLADO (sin acotaciones). */
export interface Tramo { tipo: 'voz'; hablado: string; marcas: { en: number; marca: Marca }[] }
/** `pausa` y `espera` parten la voz: el reloj se detiene entre tramos. */
export interface Control { tipo: 'pausa'; segundos: number; marca: Marca }
export interface Espera { tipo: 'espera'; que: string; marca: Marca }
export type Segmento = Tramo | Control | Espera

export const VERBOS = ['mira', 'todo', 'acerca', 'senala', 'encierra', 'subraya', 'flecha', 'escribe', 'muestra', 'oculta', 'pon', 'llama', 'luz', 'borra', 'pausa', 'espera'] as const
const ALIAS: Record<string, string> = { 'señala': 'senala', apunta: 'senala', señalar: 'senala', 'mirá': 'mira', enfoca: 'mira', escribir: 'escribe', subrayar: 'subraya', encerrar: 'encierra', aleja: 'todo' }

const TOKEN = /"([^"]*)"|«([^»]*)»|“([^”]*)”|([^\s=]+)=(?:"([^"]*)"|«([^»]*)»|(\S+))|(\S+)/g

/** Lee una acotación sin los corchetes: `encierra curva.punto color=oro`. */
export function leerMarca(cuerpo: string): Marca {
  const crudo = cuerpo.trim()
  const args: string[] = [], opts: Record<string, string> = {}
  let texto: string | undefined, verbo = ''
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(crudo))) {
    const citado = m[1] ?? m[2] ?? m[3]
    if (citado !== undefined) { if (texto === undefined) texto = citado; else args.push(citado); continue }
    if (m[4] !== undefined) { opts[m[4]] = m[5] ?? m[6] ?? m[7] ?? ''; continue }
    const t = m[8]!
    if (!verbo) verbo = t.toLowerCase(); else args.push(t)
  }
  verbo = ALIAS[verbo] ?? verbo.normalize('NFD').replace(/[̀-ͯ]/g, '')
  return { verbo, args, opts, ...(texto !== undefined ? { texto } : {}), crudo }
}

/**
 * Parte la voz de un paso en tramos hablados y controles. Las posiciones de las acciones se dan en el texto que
 * de verdad se dice (sin acotaciones y con los espacios colapsados), que es el que se alinea con el audio.
 */
export function partirVoz(voz: string): { segmentos: Segmento[]; errores: string[] } {
  const segmentos: Segmento[] = [], errores: string[] = []
  let hablado = '', marcas: Tramo['marcas'] = []
  const cerrarTramo = () => {
    const limpio = hablado.replace(/\s+$/, '')
    if (limpio.trim() || marcas.length) segmentos.push({ tipo: 'voz', hablado: limpio, marcas: marcas.map(x => ({ ...x, en: Math.min(x.en, limpio.length) })) })
    hablado = ''; marcas = []
  }
  const agregar = (texto: string) => {
    for (const c of texto) {
      const blanco = /\s/.test(c)
      if (blanco) { if (hablado && !/\s$/.test(hablado)) hablado += ' ' }
      else hablado += c
    }
  }
  const re = /\[\[([\s\S]*?)\]\]/g
  let i = 0, m: RegExpExecArray | null
  while ((m = re.exec(voz))) {
    agregar(voz.slice(i, m.index)); i = m.index + m[0].length
    const marca = leerMarca(m[1])
    if (!marca.verbo) { errores.push(`Acotación vacía: «${m[0]}».`); continue }
    if (!(VERBOS as readonly string[]).includes(marca.verbo)) { errores.push(`No conozco la acotación «${marca.verbo}» en «${m[0]}». Verbos: ${VERBOS.join(', ')}.`); continue }
    if (marca.verbo === 'pausa') { cerrarTramo(); const s = Number(marca.args[0] ?? 1); segmentos.push({ tipo: 'pausa', segundos: Number.isFinite(s) ? Math.min(Math.max(s, 0.1), 20) : 1, marca }); continue }
    if (marca.verbo === 'espera') {
      cerrarTramo()
      if (!marca.args[0]) errores.push(`«${m[0]}»: espera necesita qué esperar, p. ej. [[espera curva.x0]] (un parámetro o un evento del objeto).`)
      segmentos.push({ tipo: 'espera', que: marca.args[0] ?? '', marca }); continue
    }
    // La acción cae donde empieza la siguiente palabra hablada (no en el espacio previo).
    const en = hablado.length && /\s$/.test(hablado) ? hablado.length : hablado.length
    marcas.push({ en, marca })
  }
  agregar(voz.slice(i))
  cerrarTramo()
  if (/\[\[/.test(voz.replace(re, ''))) errores.push('Hay un «[[» sin cerrar.')
  return { segmentos, errores }
}

/** Lo que se dice, sin acotaciones (para mostrar o leer el paso entero). */
export const sinMarcas = (voz: string) => partirVoz(voz).segmentos.filter((s): s is Tramo => s.tipo === 'voz').map(s => s.hablado).join(' ').trim()
