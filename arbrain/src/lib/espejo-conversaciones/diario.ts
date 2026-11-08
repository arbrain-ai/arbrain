/**
 * Diario de conversaciones del modo espejo (5 nov 2026; diseño: docs/builds/espejo-conversaciones-2026-11-05/DISENO.md).
 *
 * Una persona, un cerebro, UNA lista de conversaciones aunque su Arbrain viva en dos máquinas. Cada máquina escribe lo
 * que cambia en sus conversaciones a un diario propio y append-only dentro de su copia (`mi-arbrain`):
 *
 *     arbrain/cerebro/conversaciones/<host>/<AAAA-MM>.jsonl
 *
 * El ciclo del espejo lo sube y baja por git (cada máquina escribe solo su carpeta: nunca choca). La otra máquina lo
 * lee con un cursor (bytes) y lo une a su base local. Mismo patrón que Cloudroom (diario append-only por ejecutor,
 * réplica con cursor), con GitHub de buzón para que dos máquinas que casi nunca coinciden prendidas se pongan al día.
 *
 *   exportar  base local → diario propio, por diferencia contra la huella de lo último exportado o importado. No hay que
 *             enganchar cada ruta que escribe chat: cualquier escritura (enviar, deshacer, bifurcar, borrar) queda
 *             cubierta. Todo valor con forma de llave se tapa antes de escribir (reglas.ts).
 *   importar  diarios ajenos → base local. Gana la última escritura por fila; `updated_at` y `last_message_at` toman
 *             el mayor. Un borrado deja lápida para que una edición más vieja no resucite la fila.
 *
 * Todo es síncrono a propósito: dentro del proceso de la web nunca se intercala con una escritura del chat (la base
 * local también es síncrona por consulta). El estado de la máquina vive en `<datos web>/espejo-conversaciones.json` y se
 * lee y escribe en cada llamada (Next tiene varias copias de este módulo en el mismo proceso).
 */
import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pareceSecreto, taparValor } from './reglas'

export type Fila = Record<string, unknown>
export interface AlmacenCrudo { leer(tabla: string): Fila[]; escribir(tabla: string, filas: Fila[]): void }

export const TABLAS = ['chat_sessions', 'chat_messages'] as const
export type Tabla = (typeof TABLAS)[number]
export const DIARIO_DIR = 'arbrain/cerebro/conversaciones'
export const HOST_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export type Op =
  | { v: 1; op: 'fila'; t: Tabla; id: string; ts: string; h: string; f: Fila }
  | { v: 1; op: 'borra'; t: Tabla; id: string; ts: string; h: string }

export interface Estado {
  v: 1
  /** Por tabla e id: [huella de la fila tal como está en la base, ms de la última escritura que ganó]. */
  filas: Record<Tabla, Record<string, [string, number]>>
  /** Borrados: `tabla:id` → ms. Una edición más vieja que el borrado no resucita la fila. */
  lapidas: Record<string, number>
  /** Bytes ya leídos de cada diario ajeno: `<host>/<AAAA-MM>.jsonl`. */
  cursores: Record<string, number>
  /** Mensajes que llegaron de otra máquina: id → host (el puente de contexto los usa). */
  ajenos: Record<string, string>
  /** Última hora escrita en el diario propio (para que las líneas queden en orden aunque el reloj dude). */
  ultimoTs: number
  ultimaSync?: { en: string; codigo: string; motivo: string }
  ultimaImportacion?: { en: string; operaciones: number; de: string[] }
  aviso?: { en: string; texto: string } | null
}

const vacio = (): Estado => ({ v: 1, filas: { chat_sessions: {}, chat_messages: {} }, lapidas: {}, cursores: {}, ajenos: {}, ultimoTs: 0 })

export function leerEstado(archivo: string): Estado {
  try {
    const e = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<Estado>
    if (e && e.v === 1) {
      const base = vacio()
      return { ...base, ...e, filas: { ...base.filas, ...(e.filas ?? {}) } } as Estado
    }
  } catch { /* primera vez o dañado: se rehace (a lo sumo se reexporta lo propio, que es idempotente) */ }
  return vacio()
}

export function guardarEstado(archivo: string, e: Estado): void {
  mkdirSync(join(archivo, '..'), { recursive: true, mode: 0o700 })
  const tmp = `${archivo}.${process.pid}.${Date.now().toString(36)}.tmp`
  writeFileSync(tmp, JSON.stringify(e), { mode: 0o600 })
  renameSync(tmp, archivo)
}

export const huella = (f: Fila) => createHash('sha1').update(JSON.stringify(f)).digest('base64url')
const idDe = (f: Fila) => (typeof f.id === 'string' || typeof f.id === 'number') && String(f.id) ? String(f.id) : null
const mes = (ms: number) => new Date(ms).toISOString().slice(0, 7)

/** Una línea del diario, ya tapada y revisada como la revisa el escáner del espejo. null = no puede viajar. */
export function lineaDe(op: Op): string | null {
  if (op.op === 'borra') return JSON.stringify(op)
  let f = taparValor(op.f)
  let linea = JSON.stringify({ ...op, f })
  if (linea.length > 512 * 1024) {
    // Metadatos enormes (adjuntos incrustados): viaja el texto, no el resto.
    f = { ...f, metadata: { espejo: 'metadatos omitidos por tamaño' }, ...(typeof f.content === 'string' ? { content: f.content.slice(0, 200_000) } : {}) }
    linea = JSON.stringify({ ...op, f })
  }
  if (pareceSecreto(linea)) {
    f = { ...f, ...(typeof f.content === 'string' ? { content: '[mensaje omitido: tenía algo con forma de llave]' } : {}), metadata: {} }
    linea = JSON.stringify({ ...op, f })
    if (pareceSecreto(linea)) return null
  }
  return linea
}

export interface Contexto {
  /** Raíz de la copia del alumno (`ARBRAIN_HOME`, la rama `mi-arbrain`). */
  cerebro: string
  host: string
  almacen: AlmacenCrudo
  estadoArchivo: string
  ahora?: () => number
}

export interface ResultadoExportar { escritas: number; borradas: number; omitidas: number; aviso: string | null }

/** Base local → diario propio. Solo lo que cambió desde lo último exportado o importado. */
export function exportar(ctx: Contexto): ResultadoExportar {
  const ahora = ctx.ahora ?? Date.now
  const e = leerEstado(ctx.estadoArchivo)
  const r: ResultadoExportar = { escritas: 0, borradas: 0, omitidas: 0, aviso: null }
  const lineas: string[] = []
  let ts = Math.max(ahora(), e.ultimoTs + 1)
  const siguiente = () => { const t = ts; ts += 1; return t }
  for (const t of TABLAS) {
    const filas = ctx.almacen.leer(t)
    const conocidas = e.filas[t]
    const vistas = new Set<string>()
    for (const f of filas) {
      const id = idDe(f)
      if (!id) continue
      vistas.add(id)
      const h = huella(f)
      if (conocidas[id]?.[0] === h) continue
      const cuando = siguiente()
      const linea = lineaDe({ v: 1, op: 'fila', t, id, ts: new Date(cuando).toISOString(), h: ctx.host, f })
      conocidas[id] = [h, cuando]
      delete e.lapidas[`${t}:${id}`]
      if (linea) { lineas.push(linea); r.escritas++ } else r.omitidas++
    }
    const faltan = Object.keys(conocidas).filter((id) => !vistas.has(id))
    if (!faltan.length) continue
    // Si de golpe falta más de la mitad (base reinstalada, dañada o leída a medias), no se borra nada en la otra.
    if (faltan.length > 20 && faltan.length > Object.keys(conocidas).length / 2) {
      r.aviso = `Faltan ${faltan.length} filas de ${t} en esta máquina de golpe: no las borré en tu otra máquina. Si fue a propósito, bórralas allá también.`
      continue
    }
    for (const id of faltan) {
      const cuando = siguiente()
      lineas.push(JSON.stringify({ v: 1, op: 'borra', t, id, ts: new Date(cuando).toISOString(), h: ctx.host } satisfies Op))
      delete conocidas[id]
      e.lapidas[`${t}:${id}`] = cuando
      if (t === 'chat_messages') delete e.ajenos[id]
      r.borradas++
    }
  }
  if (lineas.length) {
    const dir = join(ctx.cerebro, DIARIO_DIR, ctx.host)
    mkdirSync(dir, { recursive: true })
    // Un solo append: la otra máquina ignora una última línea a medias y la lee entera en el siguiente ciclo.
    appendFileSync(join(dir, `${mes(ts - 1)}.jsonl`), lineas.join('\n') + '\n')
    e.ultimoTs = ts - 1
  }
  if (r.aviso) e.aviso = { en: new Date(ahora()).toISOString(), texto: r.aviso }
  guardarEstado(ctx.estadoArchivo, e)
  return r
}

/** Lee desde `desde` hasta el último salto de línea completo. */
function leerNuevo(ruta: string, desde: number, hasta: number): { texto: string; bytes: number } {
  const n = hasta - desde
  if (n <= 0) return { texto: '', bytes: 0 }
  const buf = Buffer.alloc(n)
  const fd = openSync(ruta, 'r')
  try {
    let leidos = 0
    while (leidos < n) {
      const k = readSync(fd, buf, leidos, n - leidos, desde + leidos)
      if (!k) break
      leidos += k
    }
    const fin = buf.subarray(0, leidos).lastIndexOf(10)
    if (fin < 0) return { texto: '', bytes: 0 }
    return { texto: buf.subarray(0, fin + 1).toString('utf8'), bytes: fin + 1 }
  } finally { closeSync(fd) }
}

/** ¿Hay algo nuevo en los diarios ajenos? Barato: solo `stat`. */
export function hayNuevo(ctx: Pick<Contexto, 'cerebro' | 'host' | 'estadoArchivo'>, e: Estado = leerEstado(ctx.estadoArchivo)): boolean {
  for (const { clave, ruta } of diariosAjenos(ctx)) {
    let tam = 0
    try { tam = statSync(ruta).size } catch { continue }
    if (tam !== (e.cursores[clave] ?? 0)) return true
  }
  return false
}

export function diariosAjenos(ctx: Pick<Contexto, 'cerebro' | 'host'>): Array<{ host: string; clave: string; ruta: string }> {
  const raiz = join(ctx.cerebro, DIARIO_DIR)
  if (!existsSync(raiz)) return []
  const out: Array<{ host: string; clave: string; ruta: string }> = []
  let hosts: string[] = []
  try { hosts = readdirSync(raiz).sort() } catch { return [] }
  for (const host of hosts) {
    if (host === ctx.host || !HOST_RE.test(host)) continue
    let archivos: string[] = []
    try { archivos = readdirSync(join(raiz, host)).filter((a) => /^\d{4}-\d{2}\.jsonl$/.test(a)).sort() } catch { continue }
    for (const a of archivos) out.push({ host, clave: `${host}/${a}`, ruta: join(raiz, host, a) })
  }
  return out
}

/** Hosts que han escrito diario (incluida esta máquina): para Ajustes. */
export function maquinasConDiario(cerebro: string): string[] {
  try { return readdirSync(join(cerebro, DIARIO_DIR)).filter((h) => HOST_RE.test(h)).sort() } catch { return [] }
}

const masTarde = (a: unknown, b: unknown) => {
  if (typeof a !== 'string') return b
  if (typeof b !== 'string') return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

export interface ResultadoImportar { operaciones: number; aplicadas: number; de: string[] }

/** Diarios ajenos → base local. Idempotente: leer dos veces la misma línea no cambia nada. */
export function importar(ctx: Contexto): ResultadoImportar {
  const e = leerEstado(ctx.estadoArchivo)
  const r: ResultadoImportar = { operaciones: 0, aplicadas: 0, de: [] }
  const ops: Array<{ op: Op; host: string }> = []
  for (const { host, clave, ruta } of diariosAjenos(ctx)) {
    let tam = 0
    try { tam = statSync(ruta).size } catch { continue }
    let desde = e.cursores[clave] ?? 0
    if (tam < desde) desde = 0 // el archivo se reescribió: se relee entero (las reglas de abajo lo hacen inocuo)
    if (tam === desde) continue
    const { texto, bytes } = leerNuevo(ruta, desde, tam)
    if (!bytes) continue
    for (const l of texto.split('\n')) {
      if (!l.trim()) continue
      try {
        const op = JSON.parse(l) as Op
        if (op?.v !== 1 || !(TABLAS as readonly string[]).includes(op.t) || typeof op.id !== 'string' || !op.id) continue
        if (op.op === 'fila' && (!op.f || typeof op.f !== 'object')) continue
        if (op.op !== 'fila' && op.op !== 'borra') continue
        ops.push({ op, host })
      } catch { /* línea ilegible: se salta, nunca detiene la réplica */ }
    }
    e.cursores[clave] = desde + bytes
    if (!r.de.includes(host)) r.de.push(host)
  }
  r.operaciones = ops.length
  if (ops.length) {
    const tablas = new Map<Tabla, { filas: Fila[]; indice: Map<string, number>; cambio: boolean }>()
    const tabla = (t: Tabla) => {
      let x = tablas.get(t)
      if (!x) {
        const filas = [...ctx.almacen.leer(t)]
        const indice = new Map<string, number>()
        filas.forEach((f, i) => { const id = idDe(f); if (id) indice.set(id, i) })
        x = { filas, indice, cambio: false }
        tablas.set(t, x)
      }
      return x
    }
    for (const { op, host } of ops) {
      const cuando = Date.parse(op.ts)
      if (!Number.isFinite(cuando)) continue
      const lapida = e.lapidas[`${op.t}:${op.id}`]
      if (lapida !== undefined && lapida >= cuando) continue
      const x = tabla(op.t)
      const i = x.indice.get(op.id)
      const conocida = e.filas[op.t][op.id]
      if (conocida && conocida[1] > cuando) {
        // Aquí hay algo más nuevo y gana; aun así una conversación toma la hora más reciente de las dos.
        if (op.op === 'fila' && op.t === 'chat_sessions' && i !== undefined) {
          const actual = x.filas[i]
          const horas = { updated_at: masTarde(actual.updated_at, op.f.updated_at), last_message_at: masTarde(actual.last_message_at, op.f.last_message_at) }
          if (horas.updated_at !== actual.updated_at || horas.last_message_at !== actual.last_message_at) {
            const fila = { ...actual }
            if (horas.updated_at !== undefined) fila.updated_at = horas.updated_at
            if (horas.last_message_at !== undefined) fila.last_message_at = horas.last_message_at
            x.filas[i] = fila
            x.cambio = true
            e.filas[op.t][op.id] = [huella(fila), conocida[1]]
          }
        }
        continue
      }
      if (op.op === 'borra') {
        if (i !== undefined) { x.filas.splice(i, 1); x.indice.clear(); x.filas.forEach((f, j) => { const id = idDe(f); if (id) x.indice.set(id, j) }); x.cambio = true }
        delete e.filas[op.t][op.id]
        e.lapidas[`${op.t}:${op.id}`] = cuando
        if (op.t === 'chat_messages') delete e.ajenos[op.id]
        r.aplicadas++
        continue
      }
      let fila: Fila = { ...op.f, id: op.f.id ?? op.id }
      if (i !== undefined && op.t === 'chat_sessions') {
        const actual = x.filas[i]
        fila = { ...fila, updated_at: masTarde(actual.updated_at, fila.updated_at), last_message_at: masTarde(actual.last_message_at, fila.last_message_at) }
        if (fila.last_message_at === undefined) delete fila.last_message_at
        if (fila.updated_at === undefined) delete fila.updated_at
      }
      if (i !== undefined) x.filas[i] = fila
      else { x.indice.set(op.id, x.filas.length); x.filas.push(fila) }
      x.cambio = true
      e.filas[op.t][op.id] = [huella(fila), cuando]
      delete e.lapidas[`${op.t}:${op.id}`]
      // El puente de contexto necesita saber qué mensajes nacieron en otra máquina. Si esta máquina lo tocó antes, ya es
      // de las dos: lo que importa es dónde nació el turno.
      if (op.t === 'chat_messages' && !(i !== undefined && !e.ajenos[op.id])) e.ajenos[op.id] = host
      r.aplicadas++
    }
    for (const [t, x] of tablas) if (x.cambio) ctx.almacen.escribir(t, x.filas)
  }
  if (r.operaciones || r.de.length) e.ultimaImportacion = { en: new Date((ctx.ahora ?? Date.now)()).toISOString(), operaciones: r.operaciones, de: r.de }
  guardarEstado(ctx.estadoArchivo, e)
  return r
}
