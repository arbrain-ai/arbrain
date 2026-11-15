/**
 * Formatos de número y fecha de Excel (14 nov 2026, visor de documentos: «Excel tables… números alineados y formateados»).
 *
 * Una celda de .xlsx guarda el número crudo (45610.5) y aparte el código de formato de su estilo ("dd/mm/yyyy h:mm",
 * "#,##0.00;[Red](#,##0.00)", "0.0%"). Aquí se convierte en el texto que Excel enseñaría, sin librería: el 95 % de los
 * archivos reales usa una docena de formatos y lo raro (fracciones, condiciones) cae a algo legible, nunca a un error.
 *
 * Convenciones del lector en español de México: miles con coma, decimales con punto, fecha corta día/mes/año.
 * Puro y sin DOM: lo prueban tests/visor/tabla-formato.test.ts.
 */

export type Idioma = 'es' | 'en'
export interface Formateado { texto: string; rojo?: boolean }

/** Formatos integrados (numFmtId < 164). El 14 y el 22 son «fecha corta del sistema»: aquí día/mes/año. */
export const FORMATOS_INTEGRADOS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  5: '"$"#,##0_);("$"#,##0)', 6: '"$"#,##0_);[Red]("$"#,##0)', 7: '"$"#,##0.00_);("$"#,##0.00)', 8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
}

const MESES: Record<Idioma, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
const DIAS: Record<Idioma, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}
const abreviar = (s: string) => s.slice(0, 3)

// ── Partir el código en secciones y quitar lo que no se pinta ──

/** Secciones separadas por «;» que no estén entre comillas, corchetes ni escapadas. */
export function secciones(codigo: string): string[] {
  const out: string[] = []
  let actual = '', comillas = false, corchete = false
  for (let i = 0; i < codigo.length; i++) {
    const c = codigo[i]
    if (c === '\\' && !comillas && i + 1 < codigo.length) { actual += c + codigo[++i]; continue }
    if (c === '"') comillas = !comillas
    else if (!comillas && c === '[') corchete = true
    else if (!comillas && c === ']') corchete = false
    if (c === ';' && !comillas && !corchete) { out.push(actual); actual = ''; continue }
    actual += c
  }
  out.push(actual)
  return out
}

/** Lo que queda del código sin literales: sirve para saber si es fecha o número. */
function sinLiterales(seccion: string): string {
  return seccion.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\*./g, '').replace(/\[(?!h\]|hh\]|m\]|mm\]|s\]|ss\])[^\]]*\]/gi, '')
}

/** ¿El código pinta fecha u hora? (y, m, d, h, s fuera de literales, o un tiempo transcurrido [h]). */
export function esFormatoFecha(codigo: string): boolean {
  if (!codigo || /^general$/i.test(codigo.trim())) return false
  const s = sinLiterales(secciones(codigo)[0])
  return /[ymdhs]/i.test(s.replace(/E[+-]/gi, '')) || /\[(h|hh|m|mm|s|ss)\]/i.test(secciones(codigo)[0])
}

interface Condicion { op: string; n: number }
function condicionDe(seccion: string): Condicion | null {
  const m = /\[(<=|>=|<>|<|>|=)\s*(-?[\d.]+)\]/.exec(seccion)
  return m ? { op: m[1], n: Number(m[2]) } : null
}
function cumple(c: Condicion, v: number) {
  switch (c.op) { case '<': return v < c.n; case '<=': return v <= c.n; case '>': return v > c.n; case '>=': return v >= c.n; case '=': return v === c.n; default: return v !== c.n }
}

// ── Números ──

/** «General»: entero tal cual; decimales hasta 10 cifras significativas; muy grande o muy chico, científico. */
export function general(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v)
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) return v.toExponential(5).replace(/\.?0+e/, 'e').toUpperCase()
  return String(Number(v.toPrecision(10)))
}

/** Redondeo de presentación sin el error clásico de 1.005 → 1.00. */
function fijo(n: number, d: number): string {
  const r = Math.round(Number(`${n}e${d}`))
  return Number.isFinite(r) ? Number(`${r}e-${d}`).toFixed(d) : n.toFixed(d)
}

const agrupar = (ent: string) => ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** El patrón numérico (0, #, ?, coma y punto) aplicado a un valor ya positivo y escalado. */
function patronNumero(n: number, patron: string): string {
  // Científico: «0.00E+00», «##0.0E+0»
  const e = /^([#0?,.]*)[eE]([+-])([#0?]+)$/.exec(patron)
  if (e) {
    const [ent, dec = ''] = e[1].split('.')
    const decimales = dec.replace(/[^0?#]/g, '').length
    const pasos = Math.max(1, ent.replace(/[^0#?]/g, '').length)
    let exp = n === 0 ? 0 : Math.floor(Math.log10(n))
    if (pasos > 1 && /#/.test(ent)) exp = Math.floor(exp / pasos) * pasos
    const mant = n / 10 ** exp
    const signo = exp < 0 ? '-' : e[2] === '+' ? '+' : ''
    return `${fijo(mant, decimales)}E${signo}${String(Math.abs(exp)).padStart(e[3].length, '0')}`
  }
  const punto = patron.indexOf('.')
  const pEnt = punto >= 0 ? patron.slice(0, punto) : patron
  const pDec = punto >= 0 ? patron.slice(punto + 1).replace(/,/g, '') : ''
  const minDec = (pDec.match(/0/g) ?? []).length
  const maxDec = (pDec.match(/[0#?]/g) ?? []).length
  let [ent, dec = ''] = fijo(n, maxDec).split('.')
  // Los «#» sueltan sus ceros de sobra hasta el mínimo; los «?» los vuelven espacio para alinear el punto.
  let k = dec.length
  while (k > minDec && dec[k - 1] === '0') k--
  dec = pDec.includes('?') ? dec.slice(0, k).padEnd(maxDec, ' ') : dec.slice(0, k)
  const minEnt = (pEnt.match(/0/g) ?? []).length
  if (ent === '0' && minEnt === 0) ent = ''
  ent = ent.padStart(minEnt, '0')
  if (/[0#?],+[0#?]/.test(pEnt)) ent = agrupar(ent)
  if (punto < 0) return ent
  return dec.length ? `${ent}.${dec}` : `${ent}.`
}

/** Una sección numérica completa: literales, porcentaje, escala por comas finales y el patrón. */
function seccionNumero(v: number, seccion: string, conSigno: boolean): string {
  let fuera = ''
  let patron = ''
  let porcentajes = 0
  let enPatron = false, patronHecho = false
  for (let i = 0; i < seccion.length; i++) {
    const c = seccion[i]
    if (c === '"') { const j = seccion.indexOf('"', i + 1); fuera += seccion.slice(i + 1, j < 0 ? undefined : j); i = j < 0 ? seccion.length : j; if (enPatron) patronHecho = true; continue }
    if (c === '\\') { fuera += seccion[++i] ?? ''; if (enPatron) patronHecho = true; continue }
    if (c === '_') { i++; fuera += ' '; if (enPatron) patronHecho = true; continue }
    if (c === '*') { i++; continue }
    if (c === '[') { const j = seccion.indexOf(']', i); const dentro = seccion.slice(i + 1, j < 0 ? undefined : j); const m = /^\$([^-\]]*)/.exec(dentro); if (m) fuera += m[1]; i = j < 0 ? seccion.length : j; continue }
    if (c === '%') { porcentajes++; fuera += '%'; if (enPatron) patronHecho = true; continue }
    if (!patronHecho && (/[0#?]/.test(c) || ((c === ',' || c === '.') && (enPatron || /[0#?]/.test(seccion[i + 1] ?? ''))) || (enPatron && /[eE]/.test(c) && /[+-]/.test(seccion[i + 1] ?? '')))) {
      if (!enPatron) { enPatron = true; fuera += '\u0000' }
      patron += c
      if (/[eE]/.test(c)) patron += seccion[++i]
      continue
    }
    if (enPatron) patronHecho = true
    if (c === '@') continue
    fuera += c
  }
  let n = Math.abs(v) * 100 ** porcentajes
  // Comas al final del patrón: cada una divide entre mil («#,##0,» = miles).
  const finales = /,+$/.exec(patron.split('.')[0].replace(/[eE].*$/, ''))
  if (finales && !patron.includes('.')) { n /= 1000 ** finales[0].length; patron = patron.replace(/,+$/, '') }
  else if (/,+\./.test(patron)) { const k = /(,+)\./.exec(patron)![1].length; n /= 1000 ** k; patron = patron.replace(/,+\./, '.') }
  const cuerpo = patron ? patronNumero(n, patron) : ''
  const signo = conSigno && v < 0 && Math.abs(v) * 100 ** porcentajes >= 1e-12 && /[1-9]/.test(cuerpo) ? '-' : ''
  return fuera.includes('\u0000') ? fuera.replace('\u0000', signo + cuerpo) : signo + fuera + cuerpo
}

// ── Fechas ──

/** Serial de Excel → milisegundos UTC (respeta el sistema 1904 y el falso 29 feb 1900 del sistema 1900). */
export function serialAMs(serial: number, fecha1904 = false): number {
  const dias = fecha1904 ? serial + 1462 : serial < 60 ? serial + 1 : serial
  return Math.round((dias - 25569) * 86400000)
}
/** Milisegundos UTC → serial de Excel (sistema 1900). */
export function msASerial(ms: number): number {
  const s = ms / 86400000 + 25569
  return s < 61 ? s - 1 : s
}

function seccionFecha(v: number, seccion: string, fecha1904: boolean, idioma: Idioma): string {
  const fraccion = /s\.0+/i.exec(seccion)
  const ms = serialAMs(v, fecha1904)
  const redondeo = fraccion ? 10 ** (3 - Math.min(3, fraccion[0].length - 2)) : 1000
  const t = Math.round(ms / redondeo) * redondeo
  const d = new Date(t)
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), dia = d.getUTCDay()
  let H = d.getUTCHours()
  const Mi = d.getUTCMinutes(), S = d.getUTCSeconds(), MS = d.getUTCMilliseconds()
  const ampm = /AM\/PM|A\/P/i.test(seccion)
  // Tokens: corridas de la misma letra, AM/PM, literales.
  const tokens: { t: string; lit?: boolean }[] = []
  for (let i = 0; i < seccion.length;) {
    const c = seccion[i]
    if (c === '"') { const j = seccion.indexOf('"', i + 1); tokens.push({ t: seccion.slice(i + 1, j < 0 ? undefined : j), lit: true }); i = j < 0 ? seccion.length : j + 1; continue }
    if (c === '\\') { tokens.push({ t: seccion[i + 1] ?? '', lit: true }); i += 2; continue }
    if (c === '_') { tokens.push({ t: ' ', lit: true }); i += 2; continue }
    if (c === '*') { i += 2; continue }
    if (c === '[') { const j = seccion.indexOf(']', i); const dentro = seccion.slice(i + 1, j < 0 ? undefined : j); if (/^(h+|m+|s+)$/i.test(dentro)) tokens.push({ t: `[${dentro.toLowerCase()}]` }); i = j < 0 ? seccion.length : j + 1; continue }
    if (/^AM\/PM/i.test(seccion.slice(i))) { tokens.push({ t: 'AM/PM' }); i += 5; continue }
    if (/^A\/P/i.test(seccion.slice(i))) { tokens.push({ t: 'A/P' }); i += 3; continue }
    const l = c.toLowerCase()
    if ('ymdhse'.includes(l)) { let j = i; while (j < seccion.length && seccion[j].toLowerCase() === l) j++; tokens.push({ t: l.repeat(j - i) }); i = j; continue }
    if (c === '0' && tokens.length && tokens[tokens.length - 1].t === '.') { let j = i; while (seccion[j] === '0') j++; tokens.push({ t: '0'.repeat(j - i) }); i = j; continue }
    tokens.push({ t: c, lit: true }); i++
  }
  // «m» es minutos si va después de horas o antes de segundos.
  const reales = tokens.map((x, i) => ({ ...x, i })).filter(x => !x.lit)
  const minutos = new Set<number>()
  reales.forEach((x, k) => {
    if (!/^m{1,2}$/.test(x.t)) return
    const antes = reales[k - 1]?.t ?? '', despues = reales[k + 1]?.t ?? ''
    if (/^h|^\[h/.test(antes) || /^s|^\[s/.test(despues)) minutos.add(x.i)
  })
  if (ampm) { H = H % 12; if (H === 0) H = 12 }
  const total = v // días desde el origen: los tiempos transcurridos ([h]:mm) cuentan desde el serial crudo
  const meses = MESES[idioma], dias = DIAS[idioma]
  let out = ''
  tokens.forEach((x, i) => {
    if (x.lit) { out += x.t; return }
    const t2 = x.t
    switch (true) {
      case t2 === '[h]' || t2 === '[hh]': out += String(Math.floor(total * 24 + 1e-9)).padStart(t2.length - 2, '0'); break
      case t2 === '[m]' || t2 === '[mm]': out += String(Math.floor(total * 1440 + 1e-9)).padStart(t2.length - 2, '0'); break
      case t2 === '[s]' || t2 === '[ss]': out += String(Math.round(total * 86400)).padStart(t2.length - 2, '0'); break
      case /^y+$/.test(t2): out += t2.length <= 2 ? String(Y % 100).padStart(2, '0') : String(Y); break
      case /^m+$/.test(t2) && minutos.has(i): out += t2.length === 1 ? String(Mi) : String(Mi).padStart(2, '0'); break
      case t2 === 'm': out += String(M + 1); break
      case t2 === 'mm': out += String(M + 1).padStart(2, '0'); break
      case t2 === 'mmm': out += abreviar(meses[M]); break
      case t2 === 'mmmmm': out += meses[M][0].toUpperCase(); break
      case /^m{4,}$/.test(t2): out += meses[M]; break
      case t2 === 'd': out += String(D); break
      case t2 === 'dd': out += String(D).padStart(2, '0'); break
      case t2 === 'ddd': out += abreviar(dias[dia]); break
      case /^d{4,}$/.test(t2): out += dias[dia]; break
      case t2 === 'h': out += String(H); break
      case /^h+$/.test(t2): out += String(H).padStart(2, '0'); break
      case t2 === 's': out += String(S); break
      case /^s+$/.test(t2): out += String(S).padStart(2, '0'); break
      case /^0+$/.test(t2): out += String(MS).padStart(3, '0').slice(0, t2.length); break
      case t2 === 'AM/PM': out += d.getUTCHours() < 12 ? 'a. m.' : 'p. m.'; break
      case t2 === 'A/P': out += d.getUTCHours() < 12 ? 'a' : 'p'; break
      case /^e+$/.test(t2): out += String(Y); break
      default: out += t2
    }
  })
  if (idioma === 'en') out = out.replace('a. m.', 'AM').replace('p. m.', 'PM')
  return out
}

/** El texto que Excel enseñaría para un número con este código de formato. */
export function formatearNumero(v: number, codigo: string | undefined, opciones: { fecha1904?: boolean; idioma?: Idioma } = {}): Formateado {
  const idioma = opciones.idioma ?? 'es'
  if (!Number.isFinite(v)) return { texto: String(v) }
  const c = (codigo ?? 'General').trim()
  if (!c || /^general$/i.test(c)) return { texto: general(v) }
  const ss = secciones(c)
  // Elegir la sección: con condiciones explícitas manda la primera que se cumple; si no, positivo;negativo;cero;texto.
  let i = 0, conSigno = true
  const conds = ss.map(condicionDe)
  if (conds.some(Boolean)) {
    const k = conds.findIndex((x, j) => x ? cumple(x, v) : j === ss.length - 1 || (j < 3 && !conds.slice(j).some(Boolean)))
    i = k < 0 ? Math.min(ss.length - 1, 1) : k
    conSigno = !conds[i] && v < 0
  } else if (v < 0 && ss.length >= 2 && ss[1].trim() !== '') { i = 1; conSigno = false }
  else if (v === 0 && ss.length >= 3) { i = 2; conSigno = false }
  const seccion = ss[i] ?? ss[0]
  const rojo = /\[(red|rojo|color\s*3)\]/i.test(seccion) || undefined
  if (/^@$/.test(sinLiterales(seccion).trim())) return { texto: general(v), rojo }
  if (esFormatoFecha(seccion) && !/^[#0?,.%\s]*$/.test(sinLiterales(seccion))) return { texto: seccionFecha(v, seccion, !!opciones.fecha1904, idioma), rojo }
  // Fracciones («# ?/?»): se enseñan como decimal legible.
  if (/\?\/\?|#\/#|0\/0/.test(sinLiterales(seccion))) return { texto: general(Number(v.toFixed(4))), rojo }
  return { texto: seccionNumero(v, seccion, conSigno), rojo }
}

/** Código del estilo: integrado o propio del libro. */
export function codigoDeFormato(id: number, propios: Map<number, string>): string {
  return propios.get(id) ?? FORMATOS_INTEGRADOS[id] ?? 'General'
}
