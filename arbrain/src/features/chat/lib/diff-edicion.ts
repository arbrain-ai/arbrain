/**
 * «Ver lo que cambió» (27 oct 2026, nodo deshacer; ronda 2 tras el crítico ciego). Cada Edit/Write/MultiEdit del
 * turno se vuelve una edición legible: qué archivo, dicho por su función («tu memoria sobre X», «la skill Y», «el código
 * de «recordatorio del seguimiento»»; el nombre técnico queda tras «Ver ubicación»), y su diff. La prosa (.md) se
 * compara por frase completa (diffFrases); el código, por líneas plegadas. Puro y sin red: lo usan el hilo y el
 * laboratorio.
 */
import type { ChatMessage } from '../hooks/useChat'

export type ClaseArchivo = 'memoria' | 'skill' | 'documento' | 'codigo'
export type LineaDiff = { tipo: 'igual' | 'agregada' | 'quitada'; texto: string }
export type LineaPlegada = LineaDiff | { tipo: 'pliegue'; omitidas: number }

export interface Cambio { antes: string; despues: string }
export interface Edicion {
  toolId: string
  herramienta: 'Edit' | 'Write' | 'MultiEdit' | 'NotebookEdit'
  ruta: string
  /** Cómo se nombra para una persona: «tu memoria «llamadas cohorte»», «la skill «clientes»». */
  lugar: string
  clase: ClaseArchivo
  /** .md, .txt y similares: se lee como texto, no como código. */
  esTexto: boolean
  /** Write: contenido completo (puede ser archivo nuevo o reescrito; el input no dice cuál). */
  escrito: boolean
  cambios: Cambio[]
  agregadas: number
  quitadas: number
  lineas: LineaDiff[]
  /** El input llegó recortado o ilegible: se dice, no se inventa. */
  incompleto: boolean
  fallo: boolean
}

const HERRAMIENTAS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
export const esEdicion = (toolName: string) => HERRAMIENTAS.has(toolName)

const TEXTO = /\.(md|mdx|markdown|txt|rst|adoc)$/i

/** «agentes-1-3-1-y-definicion-2026-10-25.md» → «agentes 1 3 1 y definicion»; «CambiosTurno.tsx» → «cambios turno». */
export function nombreLegible(ruta: string): string {
  const base = ruta.split('/').pop() ?? ruta
  const sin = base.replace(/\.[^.]+$/, '').replace(/\.(test|spec|module)$/, '').replace(/[-_]?\d{4}-\d{2}-\d{2}$/, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').replace(/[-_.]+/g, ' ').trim()
  return (/[A-Z]/.test(sin) && sin !== sin.toUpperCase() ? sin.toLowerCase() : sin) || base
}

/**
 * De qué trata un archivo de código, si el propio contenido lo dice: la primera frase de su comentario de arriba
 * («/** Recordatorio del seguimiento a fundadores: …» → «recordatorio del seguimiento a fundadores»). Solo con Write
 * (Edit no trae el archivo completo); si no hay comentario, null y se usa el nombre del archivo.
 */
export function temaDelCodigo(contenido: string | undefined): string | null {
  if (!contenido) return null
  const m = /^\s*(?:\/\*\*?|\/\/|#(?!!)|""")\s*\**\s*([^\n]+)/.exec(contenido.replace(/^#![^\n]*\n/, '').replace(/^\s*['"]use (client|server|strict)['"];?\s*\n/, ''))
  if (!m) return null
  const frase = m[1].replace(/\*\/.*$/, '').split(/[:.(—]|\s-\s/)[0].replace(/[«»"`*]/g, '').trim()
  const palabras = frase.split(/\s+/).filter(Boolean)
  if (palabras.length < 2 || palabras.length > 9 || !/^\p{L}/u.test(frase)) return null
  return frase[0].toLowerCase() + frase.slice(1)
}

/** El papel del archivo de código, dicho en humano: «la pantalla», «la prueba», «el estilo»… */
function papelDelCodigo(ruta: string): string {
  const base = ruta.split('/').pop() ?? ''
  if (/\.(test|spec)\.[jt]sx?$|\/tests?\//.test(ruta)) return 'la prueba'
  if (/\.(css|scss)$/.test(base)) return 'el estilo'
  if (/\/app\/(.+\/)?page\.tsx$/.test(ruta)) return 'la página'
  if (/\/api\/.+\/route\.[jt]s$/.test(ruta)) return 'la conexión del servidor'
  if (/\.tsx$/.test(base)) return 'la pantalla'
  if (/\.json$/.test(base)) return 'los ajustes'
  if (/\.(py|sh|mjs)$/.test(base) || /\/scripts\//.test(ruta)) return 'el script'
  return 'el código'
}

/** Los archivos que tienen nombre propio en la vida de Levy. */
const CONOCIDOS: Array<[RegExp, ClaseArchivo, string]> = [
  [/\.claude\/memory\/MEMORY\.md$/, 'memoria', 'tu memoria esencial'],
  [/\.claude\/memory\/MEMORY-indice\.md$/, 'memoria', 'el índice de tus memorias'],
  [/\.claude\/memory\/MEMORY-user\.md$/, 'memoria', 'tu memoria sobre quién eres'],
  [/\.claude\/memory\/RETRATO\.md$/, 'memoria', 'tu retrato'],
  [/(^|\/)(CLAUDE|AGENTS)\.md$/, 'documento', 'las instrucciones de Levy'],
  [/\.claude\/now\.md$/, 'documento', 'tu resumen de hoy'],
  [/\.claude\/settings(\.local)?\.json$/, 'codigo', 'los ajustes de Levy'],
]

/**
 * Cómo se nombra un archivo para una persona, por su función y no por su nombre técnico: «tu memoria sobre «llamadas
 * cohorte»», «la skill «clientes»», «el código de «recordatorio del seguimiento»». El nombre técnico queda para «Ver
 * ubicación». `contenido` (el de un Write) deja decir de qué trata el código.
 */
export function claseDe(ruta: string, contenido?: string): { clase: ClaseArchivo; lugar: string } {
  for (const [re, clase, lugar] of CONOCIDOS) if (re.test(ruta)) return { clase, lugar }
  const skill = /\.claude\/skills\/([^/]+)\//.exec(ruta)?.[1]
  if (skill) {
    const resto = ruta.split(`/skills/${skill}/`)[1] ?? ''
    if (/^SKILL\.md$/i.test(resto)) return { clase: 'skill', lugar: `la skill «${skill}»` }
    const que = /^scripts\//.test(resto) ? 'el script' : TEXTO.test(resto) ? 'la guía' : 'el archivo'
    return { clase: 'skill', lugar: `${que} «${nombreLegible(resto)}» de la skill «${skill}»` }
  }
  if (/\.claude\/memory\//.test(ruta) || /(^|\/)MEMORY[-\w]*\.md$/.test(ruta)) return { clase: 'memoria', lugar: `tu memoria sobre «${nombreLegible(ruta)}»` }
  if (TEXTO.test(ruta)) return { clase: 'documento', lugar: `el documento «${nombreLegible(ruta)}»` }
  const base = ruta.split('/').pop() ?? ruta
  const generico = /^(index|page|route|layout)\.[jt]sx?$/.test(base) ? nombreLegible(ruta.split('/').slice(-2, -1)[0] ?? base) : nombreLegible(base)
  const papel = papelDelCodigo(ruta)
  const tema = temaDelCodigo(contenido)
  return { clase: 'codigo', lugar: tema ? `${papel === 'el código' ? 'el código' : papel} de «${tema}»` : `${papel} «${generico}»` }
}

/** Ruta corta para «Ver ubicación»: desde `.claude/` o desde la carpeta del proyecto. */
export function rutaCorta(ruta: string): string {
  const i = ruta.indexOf('/.claude/')
  if (i >= 0) return ruta.slice(i + 1)
  const m = /\/(arbrain|docs|contenido|negocio)\/.*/.exec(ruta)
  if (m) return m[0].slice(1)
  return ruta.split('/').slice(-3).join('/')
}

const MAX_CELDAS = 2_000_000
const partir = (t: string) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'))

/** LCS sobre dos listas de textos (líneas, frases o palabras normalizadas). Si es enorme, todo sale y todo entra. */
export function lcsTextos(a: string[], b: string[]): LineaDiff[] {
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fin = 0
  while (fin < a.length - ini && fin < b.length - ini && a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++
  const pre = a.slice(0, ini).map(texto => ({ tipo: 'igual' as const, texto }))
  const post = a.slice(a.length - fin).map(texto => ({ tipo: 'igual' as const, texto }))
  const x = a.slice(ini, a.length - fin), y = b.slice(ini, b.length - fin)
  const n = x.length, m = y.length
  const medio: LineaDiff[] = []
  if ((n + 1) * (m + 1) > MAX_CELDAS) {
    x.forEach(texto => medio.push({ tipo: 'quitada', texto }))
    y.forEach(texto => medio.push({ tipo: 'agregada', texto }))
  } else {
    const dp = new Uint32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i * (m + 1) + j] = x[i] === y[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
    let i = 0, j = 0
    while (i < n && j < m) {
      if (x[i] === y[j]) { medio.push({ tipo: 'igual', texto: x[i] }); i++; j++ }
      else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) medio.push({ tipo: 'quitada', texto: x[i++] })
      else medio.push({ tipo: 'agregada', texto: y[j++] })
    }
    while (i < n) medio.push({ tipo: 'quitada', texto: x[i++] })
    while (j < m) medio.push({ tipo: 'agregada', texto: y[j++] })
  }
  return [...pre, ...medio, ...post]
}

/** Diff por líneas (código). */
export const diffLineas = (antes: string, despues: string): LineaDiff[] => lcsTextos(partir(antes), partir(despues))

// ── Prosa: por frase completa ──
// El diff por caracteres o por signos se lee mal («, » resaltado, una palabra tachada para reaparecer dos lugares
// después). En memorias, skills y documentos se compara por FRASE: la vieja tachada arriba y la nueva abajo; dentro,
// solo palabras completas y solo cuando el cambio es pequeño. La puntuación no cuenta como cambio.

/** Una palabra de una frase, marcada si entró o salió. */
export interface PalabraMarcada { texto: string; marca: boolean }
export type BloqueProsa =
  | { tipo: 'igual'; frase: string }
  | { tipo: 'pliegue'; frases: number }
  /** `antes`/`despues`: frases (cada una sus palabras). `fino`: hay palabras marcadas; si no, la frase entera cambió. */
  | { tipo: 'cambio'; antes: PalabraMarcada[][]; despues: PalabraMarcada[][]; fino: boolean }

/** El texto partido en frases: cada renglón es al menos una; dentro, se corta tras . ! ? … antes de mayúscula. */
export function frases(texto: string): string[] {
  return texto.split('\n').map(l => l.trim()).filter(Boolean)
    .flatMap(l => l.split(/(?<=[.!?…])\s+(?=[\p{Lu}¿¡«"(\d*_-])/u).map(f => f.trim()).filter(Boolean))
}

/** Para comparar, una palabra sin la puntuación de sus orillas ni el formato: «**lunes,» = «lunes». */
const clave = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase() || w

/**
 * Cuándo el cambio es «pequeño» y vale marcar palabras: se conserva al menos el 60 % del lado corto y una cuarta parte
 * del largo (así, una frase corregida más una frase nueva al lado sigue siendo fina). Si no, la frase va entera.
 */
const fino = (iguales: number, a: number, b: number) => !!a && !!b && iguales / Math.min(a, b) >= 0.6 && iguales / Math.max(a, b) >= 0.25

function marcar(antes: string[], despues: string[]): { antes: PalabraMarcada[][]; despues: PalabraMarcada[][]; fino: boolean } {
  const pa = antes.map(f => f.split(/\s+/).filter(Boolean)), pd = despues.map(f => f.split(/\s+/).filter(Boolean))
  const fa = pa.flat(), fd = pd.flat()
  const d = lcsTextos(fa.map(clave), fd.map(clave))
  const ma: boolean[] = [], md: boolean[] = []
  let iguales = 0
  for (const l of d) {
    if (l.tipo === 'igual') { ma.push(false); md.push(false); iguales++ }
    else if (l.tipo === 'quitada') ma.push(true)
    else md.push(true)
  }
  const esFino = fino(iguales, fa.length, fd.length)
  // Una palabra que solo cambió de lugar («lunes y miércoles» → «lunes, miércoles y viernes») no es cambio: ni se tacha
  // arriba ni se resalta abajo. Solo queda marcado lo que de verdad entró o salió.
  const salen = new Map<string, number>()
  fa.forEach((w, i) => { if (ma[i]) salen.set(clave(w), (salen.get(clave(w)) ?? 0) + 1) })
  const movidas = new Map<string, number>()
  fd.forEach((w, i) => {
    const k = clave(w)
    if (md[i] && (salen.get(k) ?? 0) > 0) { salen.set(k, salen.get(k)! - 1); movidas.set(k, (movidas.get(k) ?? 0) + 1); md[i] = false }
  })
  fa.forEach((w, i) => { const k = clave(w); if (ma[i] && (movidas.get(k) ?? 0) > 0) { movidas.set(k, movidas.get(k)! - 1); ma[i] = false } })
  let k = 0, q = 0
  return {
    antes: pa.map(ws => ws.map(texto => ({ texto, marca: esFino && ma[k++] }))),
    despues: pd.map(ws => ws.map(texto => ({ texto, marca: esFino && md[q++] }))),
    fino: esFino,
  }
}

/** Diff de prosa por frase. Lo igual se pliega a `contexto` frases alrededor de cada cambio. */
export function diffFrases(antes: string, despues: string, contexto = 1): BloqueProsa[] {
  const d = lcsTextos(frases(antes), frases(despues))
  const crudo: Array<{ tipo: 'igual'; frase: string } | { tipo: 'cambio'; q: string[]; a: string[] }> = []
  for (const l of d) {
    const u = crudo[crudo.length - 1]
    if (l.tipo === 'igual') crudo.push({ tipo: 'igual', frase: l.texto })
    else if (u?.tipo === 'cambio') (l.tipo === 'quitada' ? u.q : u.a).push(l.texto)
    else crudo.push({ tipo: 'cambio', q: l.tipo === 'quitada' ? [l.texto] : [], a: l.tipo === 'agregada' ? [l.texto] : [] })
  }
  const cerca = crudo.map(() => false)
  crudo.forEach((b, k) => { if (b.tipo === 'cambio') for (let x = -contexto; x <= contexto; x++) if (crudo[k + x]) cerca[k + x] = true })
  const out: BloqueProsa[] = []
  let omitidas = 0
  crudo.forEach((b, k) => {
    if (b.tipo === 'igual' && !cerca[k]) { omitidas++; return }
    if (omitidas) { out.push({ tipo: 'pliegue', frases: omitidas }); omitidas = 0 }
    out.push(b.tipo === 'igual' ? b : { tipo: 'cambio', ...marcar(b.q, b.a) })
  })
  if (omitidas) out.push({ tipo: 'pliegue', frases: omitidas })
  return out
}

/** Lo igual se pliega a `contexto` líneas alrededor de cada cambio. */
export function plegarLineas(lineas: LineaDiff[], contexto = 2): LineaPlegada[] {
  const cerca = lineas.map(() => false)
  lineas.forEach((l, k) => { if (l.tipo !== 'igual') for (let d = -contexto; d <= contexto; d++) if (lineas[k + d]) cerca[k + d] = true })
  const out: LineaPlegada[] = []
  let omitidas = 0
  lineas.forEach((l, k) => {
    if (l.tipo !== 'igual' || cerca[k]) {
      if (omitidas) { out.push({ tipo: 'pliegue', omitidas }); omitidas = 0 }
      out.push(l)
    } else omitidas++
  })
  if (omitidas) out.push({ tipo: 'pliegue', omitidas })
  return out
}

function parsear(crudo: string | undefined): Record<string, unknown> | null {
  if (!crudo) return null
  try { const v = JSON.parse(crudo); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null } catch { return null }
}
const s = (v: unknown) => (typeof v === 'string' ? v : null)

/** La edición de una llamada, o null si no es una herramienta que edita. */
export function edicionDe(tool: { toolId: string; toolName: string }, crudo: string | undefined, fallo = false): Edicion | null {
  if (!esEdicion(tool.toolName)) return null
  const input = parsear(crudo)
  const ruta = s(input?.file_path) ?? s(input?.notebook_path) ?? new RegExp('"(?:file_path|notebook_path)"\\s*:\\s*"([^"]*)').exec(crudo ?? '')?.[1] ?? ''
  const herramienta = tool.toolName as Edicion['herramienta']
  let cambios: Cambio[] = []
  let incompleto = !input
  if (input) {
    if (herramienta === 'Write') cambios = [{ antes: '', despues: s(input.content) ?? '' }]
    else if (herramienta === 'MultiEdit') {
      const edits = Array.isArray(input.edits) ? input.edits as Array<Record<string, unknown>> : []
      cambios = edits.map(e => ({ antes: s(e.old_string) ?? '', despues: s(e.new_string) ?? '' }))
      if (!edits.length) incompleto = true
    } else if (herramienta === 'NotebookEdit') cambios = [{ antes: '', despues: s(input.new_source) ?? '' }]
    else {
      const antes = s(input.old_string), despues = s(input.new_string)
      if (antes === null || despues === null) incompleto = true
      cambios = [{ antes: antes ?? '', despues: despues ?? '' }]
    }
  }
  const lineas = cambios.flatMap((c, i) => {
    const d = diffLineas(c.antes, c.despues)
    // Entre dos cambios de un MultiEdit va un pliegue: no son contiguos en el archivo.
    return i ? [{ tipo: 'igual' as const, texto: '…' }, ...d] : d
  })
  const { clase, lugar } = claseDe(ruta, herramienta === 'Write' ? cambios[0]?.despues : undefined)
  return {
    toolId: tool.toolId, herramienta, ruta, lugar, clase, esTexto: TEXTO.test(ruta), escrito: herramienta === 'Write',
    cambios, lineas, incompleto, fallo,
    agregadas: lineas.filter(l => l.tipo === 'agregada').length,
    quitadas: lineas.filter(l => l.tipo === 'quitada').length,
  }
}

const lineasDe = (n: number) => `${n} ${n === 1 ? 'línea' : 'líneas'}`
/** «de la skill» / «del archivo». */
const de = (lugar: string) => lugar.startsWith('el ') ? `del ${lugar.slice(3)}` : `de ${lugar}`
const a = (lugar: string) => lugar.startsWith('el ') ? `al ${lugar.slice(3)}` : `a ${lugar}`

/** La frase humana de una edición: «cambió 3 líneas en tu memoria «llamadas cohorte»». */
export function resumenHumano(e: Edicion): string {
  if (e.fallo) return `intentó cambiar ${e.lugar}, pero no se aplicó`
  if (e.incompleto && !e.agregadas && !e.quitadas) return `cambió ${e.lugar}`
  if (e.escrito) return `escribió ${e.lugar} (${lineasDe(e.agregadas)})`
  if (!e.quitadas) return `agregó ${lineasDe(e.agregadas)} ${a(e.lugar)}`
  if (!e.agregadas) return `quitó ${lineasDe(e.quitadas)} ${de(e.lugar)}`
  return `cambió ${lineasDe(Math.max(e.agregadas, e.quitadas))} en ${e.lugar}`
}

/** La nota de arriba del código, completa («Recordatorio del seguimiento a fundadores: media hora antes de cada grupal.»). */
export function notaDelCodigo(contenido: string | undefined): string | null {
  if (!contenido || !temaDelCodigo(contenido)) return null
  const m = /^\s*(?:\/\*\*?|\/\/|#(?!!)|""")\s*\**\s*([^\n]+)/.exec(contenido.replace(/^#![^\n]*\n/, '').replace(/^\s*['"]use (client|server|strict)['"];?\s*\n/, ''))
  const nota = m?.[1].replace(/\*\/.*$/, '').replace(/"""\s*$/, '').trim()
  return nota || null
}

/** Las partes del código que el cambio toca, por su nombre legible: «horaDelAviso» → «hora del aviso». */
function partesTocadas(lineas: LineaDiff[]): string[] {
  const nombres = new Set<string>()
  for (const l of lineas) {
    if (l.tipo === 'igual') continue
    const m = /\b(?:function|const|let|var|class|def|interface|type)\s+([A-Za-z_$][\w$]*)/.exec(l.texto)
    if (m) nombres.add(nombreLegible(m[1]).toLowerCase())
  }
  return [...nombres].slice(0, 3)
}

/**
 * El cambio de un valor suelto, si es todo lo que pasó: «AVISO_ANTES_MIN = 30» → «= 45» da «30» ahora es «45».
 * Solo cuando cada línea quitada tiene su gemela agregada que difiere en un solo trozo.
 */
function valoresCambiados(lineas: LineaDiff[]): Array<[string, string]> | null {
  const q = lineas.filter(l => l.tipo === 'quitada'), a = lineas.filter(l => l.tipo === 'agregada')
  if (!q.length || q.length !== a.length || q.length > 3) return null
  const pares: Array<[string, string]> = []
  for (let i = 0; i < q.length; i++) {
    const x = q[i].texto.trim().split(/(\s+|[=:,()[\]{};])/), y = a[i].texto.trim().split(/(\s+|[=:,()[\]{};])/)
    if (x.length !== y.length) return null
    const distintos = x.map((t, k) => [t, y[k]] as [string, string]).filter(([u, v]) => u !== v)
    if (distintos.length !== 1) return null
    pares.push([distintos[0][0].replace(/^['"`]|['"`]$/g, ''), distintos[0][1].replace(/^['"`]|['"`]$/g, '')])
  }
  return pares
}

/**
 * Qué cambió en el código, en una frase para quien no lee código (ronda 3). El monoespaciado queda tras «Ver el
 * código». Con Write se dice para qué sirve según su propia nota de arriba; con Edit, qué valor cambió o qué partes.
 */
export function fraseCodigo(e: Edicion): string {
  if (e.fallo) return 'Este cambio no se aplicó: el código quedó como estaba.'
  if (e.escrito) {
    const nota = notaDelCodigo(e.cambios[0]?.despues)
    const tam = `Levy escribió este archivo completo (${lineasDe(e.agregadas)}).`
    return nota ? `${tam} Su nota de arriba dice para qué sirve: «${nota.replace(/[«»]/g, '"')}»` : `${tam} No trae una nota que diga para qué sirve.`
  }
  const valores = valoresCambiados(e.lineas)
  if (valores) return valores.map(([u, v]) => `Cambió un valor: donde decía «${u}» ahora dice «${v}».`).join(' ')
  const partes = partesTocadas(e.lineas)
  const cuanto = !e.quitadas ? `Agregó ${lineasDe(e.agregadas)}` : !e.agregadas ? `Quitó ${lineasDe(e.quitadas)}` : `Cambió ${lineasDe(Math.max(e.agregadas, e.quitadas))}`
  return partes.length ? `${cuanto} en ${partes.length === 1 ? 'la parte' : 'las partes'} ${lista(partes.map(p => `«${p}»`))}.` : `${cuanto} de código.`
}

/** Las ediciones del turno en el orden en que ocurrieron. */
export function edicionesDelTurno(msg: Pick<ChatMessage, 'toolCalls' | 'toolInputs' | 'toolOutputs'>): Edicion[] {
  return (msg.toolCalls ?? []).flatMap(t => {
    const out = msg.toolOutputs?.[t.toolId]
    const e = edicionDe(t, msg.toolInputs?.[t.toolId], !!out?.isError || !!out?.kind)
    return e ? [e] : []
  })
}

/** Archivos distintos que el turno tocó (sin contar las ediciones que no se aplicaron). */
export function archivosTocados(ediciones: Edicion[]): string[] {
  return [...new Set(ediciones.filter(e => !e.fallo && e.ruta).map(e => e.ruta))]
}

/**
 * Una entrada por archivo: si Levy editó tres veces la misma memoria en el turno, se ve una memoria con sus tres
 * cambios, no tres renglones. Las fallidas se juntan solo entre ellas (una aplicada manda sobre una fallida).
 */
export function porArchivo(ediciones: Edicion[]): Edicion[] {
  const orden: string[] = []
  const grupos = new Map<string, Edicion[]>()
  for (const e of ediciones) {
    const k = e.ruta || e.toolId
    if (!grupos.has(k)) { grupos.set(k, []); orden.push(k) }
    grupos.get(k)!.push(e)
  }
  return orden.map(k => {
    const todas = grupos.get(k)!
    const vale = todas.filter(e => !e.fallo)
    const g = vale.length ? vale : todas
    if (g.length === 1) return g[0]
    const conTema = g.find(e => e.escrito) ?? g[0]
    const lineas = g.flatMap((e, i) => i ? [{ tipo: 'igual' as const, texto: '…' }, ...e.lineas] : e.lineas)
    return {
      ...g[0], lugar: conTema.lugar, cambios: g.flatMap(e => e.cambios), lineas,
      escrito: g.every(e => e.escrito), incompleto: g.some(e => e.incompleto), fallo: !vale.length,
      agregadas: g.reduce((n, e) => n + e.agregadas, 0), quitadas: g.reduce((n, e) => n + e.quitadas, 0),
    }
  })
}

const CLASES: Record<ClaseArchivo, [string, string]> = {
  memoria: ['memoria', 'memorias'], skill: ['skill', 'skills'], documento: ['documento', 'documentos'], codigo: ['archivo de código', 'archivos de código'],
}
const lista = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`

/**
 * La fila que cierra el turno: «Levy cambió 2 memorias y 1 skill». Cuenta archivos distintos (las skills, por skill:
 * su SKILL.md y sus guías son una), sin las ediciones que no se aplicaron.
 */
export function resumenTurno(ediciones: Edicion[]): string {
  const vale = porArchivo(ediciones).filter(e => !e.fallo)
  if (!vale.length) return ediciones.length ? 'Levy intentó cambiar archivos, pero no se aplicó' : ''
  const cuenta = new Map<ClaseArchivo, Set<string>>()
  for (const e of vale) {
    const k = e.clase === 'skill' ? (/\.claude\/skills\/([^/]+)\//.exec(e.ruta)?.[1] ?? e.ruta) : e.ruta
    if (!cuenta.has(e.clase)) cuenta.set(e.clase, new Set())
    cuenta.get(e.clase)!.add(k)
  }
  const partes = (['memoria', 'skill', 'documento', 'codigo'] as ClaseArchivo[]).filter(c => cuenta.has(c)).map(c => {
    const n = cuenta.get(c)!.size
    return `${n} ${CLASES[c][n === 1 ? 0 : 1]}`
  })
  return `Levy cambió ${lista(partes)}`
}

/** Cómo se nombra una ruta de la vista previa de «Deshacer»: con el nombre que ya tiene en el turno, si lo tiene. */
export function lugarDeRuta(ruta: string, ediciones: Edicion[] = []): string {
  return porArchivo(ediciones).find(e => e.ruta === ruta)?.lugar ?? claseDe(ruta).lugar
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * La frase del diálogo de «Deshacer» (ronda 3): qué pasa con tus archivos, en una sola oración. El SDK cuenta, al
 * rebobinar, las líneas que vuelven (`inserciones`: las que Levy cambió o quitó) y las que se van (`borrados`: las
 * que Levy agregó).
 * «Tu memoria vuelve a como estaba antes de este turno: se quitan 14 líneas que Levy agregó y regresan 3 que cambió.»
 */
export function fraseDeshacer(v: { archivos: string[]; inserciones: number; borrados: number }, ediciones: Edicion[] = [], cuando?: string): string {
  const n = v.archivos.length
  if (!n) return 'Tus archivos ya están como antes de este turno.'
  const quien = n === 1 ? lugarDeRuta(v.archivos[0], ediciones) : `estos ${n} archivos`
  const sujeto = n === 1 ? `${quien[0].toUpperCase()}${quien.slice(1)} vuelve a como estaba` : `Tus ${n} archivos vuelven a como estaban`
  const antes = `antes de este turno${cuando ? ` (tu mensaje de las ${cuando})` : ''}`
  const partes = [
    v.borrados ? `se ${v.borrados === 1 ? 'quita' : 'quitan'} ${plural(v.borrados, 'línea', 'líneas')} que Levy agregó` : '',
    v.inserciones ? `${v.inserciones === 1 ? 'regresa' : 'regresan'} ${v.borrados ? v.inserciones : plural(v.inserciones, 'línea', 'líneas')} que ${v.borrados ? '' : 'Levy '}cambió` : '',
  ].filter(Boolean)
  return `${sujeto} ${antes}${partes.length ? `: ${partes.join(' y ')}` : ''}.`
}

/** La fila del turno después de deshacer: «Deshiciste lo que Levy cambió: 1 memoria, 1 skill y 1 archivo de código». */
export function resumenDeshecho(ediciones: Edicion[]): string {
  const r = resumenTurno(ediciones)
  return r.startsWith('Levy cambió ') ? `Deshiciste lo que Levy cambió: ${r.slice('Levy cambió '.length)}` : r
}
