/**
 * Recetas de manos: la primera vez el cerebro descubre los pasos; desde la
 * segunda, la tarea corre como receta guardada, sin pensar, y solo vuelve al
 * decisor si la pantalla no coincide.
 *
 * Vive sobre el contrato (`Adaptador`, `Decisor`): no sabe qué tecnología hay
 * debajo y no cambia ningún verbo existente.
 *
 *   - `Grabadora` envuelve al adaptador activo. Cada `observar` deja anotado
 *     cómo reconocer cada ref (rol, etiqueta y ruta de ancestros) y cada
 *     `actuar` exitoso queda en un historial corto.
 *   - `grabarReceta` convierte las últimas acciones en una receta: pasos que
 *     reconocen su elemento por rol + etiqueta + ruta (nunca por ref ni por
 *     coordenadas, que cambian) y un verificador obligatorio.
 *   - `correrReceta` repite los pasos: antes de actuar comprueba que el
 *     elemento existe; si no, cede al decisor (Jev y luego Claude), actúa con
 *     lo que elija y repara la receta. La reparación solo se guarda si el
 *     verificador final pasa. Los pasos que envían, borran, pagan o publican
 *     se detienen y piden confirmación.
 *
 * Dónde viven: `~/.config/arbrain/recetas/<nombre>.json` (JSON legible, uno
 * por receta), o `MANOS_RECETAS_DIR`. Formato y ejemplo en
 * docs/builds/manos-recetas-2026-10-02/RESULTADOS.md.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN } from '../edicion.js'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { juzgar, APPS_CHAT } from './freno.js'

/** Apps de chat o correo: lo que se lee de su pantalla es de terceros y no sale de Anthropic. */
export const esPrivada = (app: string) => APPS_CHAT.has(app.toLowerCase())
import type { Accion, Adaptador, App, Decisor, Elemento, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoObservar, ResultadoAccion, ResultadoVerificar, Ventana } from './contrato.js'

// ---------- Formato en disco ----------

/** Cómo reconocer un elemento sin ref ni coordenadas. */
export interface Descriptor {
  rol: string
  etiqueta?: string
  /** Ancestros desde la ventana, p. ej. ["AXWindow", "AXOutline «Barra lateral»", "AXRow", "AXCell"]. */
  ruta: string[]
}

/** En qué ventana de la app ocurre el paso, relativo al paso anterior. */
export type RelacionVentana = 'frente' | 'misma' | 'nueva'

export interface PasoReceta {
  meta: string
  accion: Accion
  ventana: RelacionVentana
  elemento?: Descriptor
  /** Descriptores anteriores que también valen (los deja cada reparación). */
  alternativas?: Descriptor[]
  texto?: string
  tecla?: string
  modificadores?: string[]
  direccion?: 'arriba' | 'abajo' | 'izquierda' | 'derecha'
  cantidad?: number
  valor?: string
  /** Si el elemento ya tiene este valor, el paso se salta (interruptores a un estado, no alternar). */
  omitir_si_valor?: string
  /** Envía, borra, paga o publica: nunca corre solo, pide confirmación. */
  sensible?: boolean
  /** Rama que la app no siempre muestra (un diálogo): si el elemento no aparece o la tarea ya se cumple, se salta sin ceder. */
  opcional?: boolean
}

export type Verificador =
  | { tipo: 'pantalla'; espera: (Expectativa & { valor_contiene?: string; digitos?: string })[]; tras_paso?: number }
  | { tipo: 'comando'; argv: string[]; igual?: string; contiene?: string; tras_paso?: number }
  | { tipo: 'ventana_cerrada'; tras_paso?: number }

export interface Reparacion { en: string; paso: number; antes?: Descriptor; despues?: Descriptor; decisor: string; confianza: number | null }

export interface Receta {
  nombre: string
  descripcion: string
  /** Bundle id preferido; si no se conoce, nombre visible. */
  app: string
  version: number
  creada: string
  actualizada: string
  parametros: Record<string, string>
  pasos: PasoReceta[]
  /** Obligatorio: sin al menos un verificador final la receta no se graba. */
  verificador: Verificador[]
  corridas: number
  fallos: number
  ultima_ms?: number
  reparaciones: Reparacion[]
}

export const DIR_RECETAS = () => process.env.MANOS_RECETAS_DIR || join(DIR_ARBRAIN(), 'recetas')
const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/

export class AlmacenRecetas {
  constructor(readonly dir = DIR_RECETAS()) {}
  private ruta(nombre: string): string {
    if (!NOMBRE_VALIDO.test(nombre)) throw new Error(`Nombre de receta inválido «${nombre}»: minúsculas, dígitos y guiones (máx. 64).`)
    return join(this.dir, `${nombre}.json`)
  }
  leer(nombre: string): Receta | null {
    const r = this.ruta(nombre)
    return existsSync(r) ? JSON.parse(readFileSync(r, 'utf8')) as Receta : null
  }
  guardar(receta: Receta): string {
    mkdirSync(this.dir, { recursive: true })
    const r = this.ruta(receta.nombre)
    const tmp = `${r}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(receta, null, 2) + '\n')
    renameSync(tmp, r)
    return r
  }
  listar(): Receta[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir).filter(f => f.endsWith('.json')).flatMap(f => { try { return [JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as Receta] } catch { return [] } })
  }
}

// ---------- Reconocer elementos ----------

const norm = (s?: string) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
const pieza = (e: Pick<Elemento, 'rol' | 'etiqueta'>) => e.etiqueta ? `${e.rol} «${e.etiqueta}»` : e.rol

/** Ruta de ancestros de cada elemento (el árbol llega en orden de recorrido con profundidad). La ventana va sin título: cambia con la vista. */
export function rutas(o: Observacion): Map<string, string[]> {
  const res = new Map<string, string[]>()
  const pila: { prof: number; pieza: string }[] = []
  for (const e of o.elementos) {
    const prof = e.profundidad ?? 0
    while (pila.length && pila[pila.length - 1].prof >= prof) pila.pop()
    res.set(e.ref, pila.map(p => p.pieza))
    pila.push({ prof, pieza: e.rol === 'AXWindow' ? 'AXWindow' : pieza(e) })
  }
  return res
}

export function describir(o: Observacion, ref: string, r = rutas(o)): Descriptor | undefined {
  const e = o.elementos.find(x => x.ref === ref)
  if (!e) return undefined
  return { rol: e.rol, ...(e.etiqueta ? { etiqueta: e.etiqueta } : {}), ruta: r.get(ref) ?? [] }
}

/** Ancestros en común contando desde el más cercano: la ruta pesa más cerca del elemento. */
function parecidoRuta(a: string[], b: string[]): number {
  let n = 0
  for (let i = a.length - 1, j = b.length - 1; i >= 0 && j >= 0; i--, j--) { if (norm(a[i]) !== norm(b[j])) break; n++ }
  return n
}

export type Emparejado = { tipo: 'uno'; elemento: Elemento } | { tipo: 'ninguno' } | { tipo: 'ambiguo'; candidatos: Elemento[] }

/** Busca el elemento del paso: mismo rol y etiqueta (o una alternativa); la ruta desempata. Nunca adivina entre empates. */
export function emparejar(o: Observacion, d: Descriptor, alternativas: Descriptor[] = []): Emparejado {
  const r = rutas(o)
  for (const desc of [d, ...alternativas]) {
    const mismos = o.elementos.filter(e => e.rol === desc.rol && norm(e.etiqueta) === norm(desc.etiqueta))
    if (!mismos.length) continue
    if (mismos.length === 1) return { tipo: 'uno', elemento: mismos[0] }
    const puntos = mismos.map(e => ({ e, p: parecidoRuta(r.get(e.ref) ?? [], desc.ruta) + (norm((r.get(e.ref) ?? []).join('/')) === norm(desc.ruta.join('/')) ? 100 : 0) }))
    const max = Math.max(...puntos.map(x => x.p))
    const mejores = puntos.filter(x => x.p === max).map(x => x.e)
    return mejores.length === 1 ? { tipo: 'uno', elemento: mejores[0] } : { tipo: 'ambiguo', candidatos: mejores }
  }
  return { tipo: 'ninguno' }
}

/** Mismo patrón que `Peligro` de la app (modo acotado) más los descartes de documentos. */
export const PATRON_SENSIBLE = /\b(enviar|send|borrar|eliminar|delete|remove|pagar|pay|comprar|buy|purchase|publicar|publish|post|transferir|transfer|confirmar pago|no guardar|don.t save|descartar|discard)\b/i
/**
 * Sensible = lo que el freno trataría como irreversible, juzgado sobre el descriptor del paso (rol, etiqueta,
 * ruta) y sus teclas: Enter en un compositor, ⌘Q, ⌘⌫, botones de diálogo peligrosos, «Eliminar»… Cerrar
 * ventanas no cuenta aquí: el freno lo resuelve al correr según si la ventana la abrió esta sesión.
 */
export const esSensible = (p: Partial<Pick<PasoReceta, 'elemento' | 'texto' | 'accion' | 'tecla' | 'modificadores'>>) => {
  if (PATRON_SENSIBLE.test(p.elemento?.etiqueta ?? '')) return true
  const ruta = p.elemento?.ruta ?? []
  const j = juzgar({ accion: p.accion ?? 'click', tecla: p.tecla, modificadores: p.modificadores, texto: p.texto, ref: p.elemento ? 'r' : undefined },
    { ...(p.elemento ? { elemento: { rol: p.elemento.rol, titulo: p.elemento.etiqueta } } : {}), ancestros: [...ruta].reverse(), dentro_de: ruta.some(r => r.startsWith('AXSheet')) ? ['hoja'] : [] })
  return j.irreversible && j.categoria !== 'ventana_de_daniel'
}

// ---------- Grabadora ----------

export interface AccionGrabada {
  en: number
  pid: number
  app?: string
  ventana?: number
  pedido: PedidoActuar
  elemento?: Descriptor
  /** Ventanas que se conocían antes de esta acción: sirve para saber si el paso siguiente ocurre en una ventana nueva. */
  conocidas: Set<number>
}

/** Envuelve al adaptador activo y anota lo necesario para grabar. No cambia ninguna respuesta. */
export class Grabadora implements Adaptador {
  readonly nombre: string
  private descriptores = new Map<string, { d: Descriptor; ventana: number }>()
  private conocidas = new Set<number>()
  historial: AccionGrabada[] = []

  constructor(readonly interno: Adaptador, private readonly max = 60) { this.nombre = interno.nombre }

  private clave(pid: number, ref: string) { return `${pid}:${ref}` }

  async observar(p: PedidoObservar): Promise<Observacion> {
    const o = await this.interno.observar(p)
    // Una observación filtrada (`consulta`) también sirve: la ruta sale de los ancestros que trae.
    const r = rutas(o)
    for (const e of o.elementos) this.descriptores.set(this.clave(o.pid, e.ref), { d: { rol: e.rol, ...(e.etiqueta ? { etiqueta: e.etiqueta } : {}), ruta: r.get(e.ref) ?? [] }, ventana: o.ventana })
    this.conocidas.add(o.ventana)
    return o
  }

  async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    const conocidas = new Set(this.conocidas)
    const r = await this.interno.actuar(p)
    if (!r.ok) return r
    const pid = p.pid ?? (p.app ? (await this.interno.apps()).find(a => a.bundle === p.app || a.nombre === p.app)?.pid : undefined)
    if (!pid) return r
    const anotado = p.ref ? this.descriptores.get(this.clave(pid, p.ref)) : undefined
    this.historial.push({ en: Date.now(), pid, app: p.app, ventana: p.ventana ?? anotado?.ventana, pedido: { ...p }, elemento: anotado?.d, conocidas })
    if (this.historial.length > this.max) this.historial.shift()
    return r
  }

  async ventanas(p?: { app?: string; pid?: number }): Promise<Ventana[]> {
    const v = await this.interno.ventanas(p)
    for (const w of v) this.conocidas.add(w.id)
    return v
  }

  async abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }> {
    const r = await this.interno.abrir(app)
    for (const w of r.ventanas) this.conocidas.add(w.id)
    return r
  }

  /** Olvida las acciones anteriores (lo que venga después es lo que se graba). */
  limpiar(): void { this.historial = [] }

  apps(): Promise<App[]> { return this.interno.apps() }
  verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> { return this.interno.verificar(p) }
  cursor() { return this.interno.cursor() }
  salud() { return this.interno.salud() }
  cerrar() { return this.interno.cerrar() }
  get contexto() { return this.interno.contexto?.bind(this.interno) }
  get pagina() { return this.interno.pagina?.bind(this.interno) }
  get medios() { return this.interno.medios?.bind(this.interno) }
  get soltar() { return this.interno.soltar?.bind(this.interno) }
  get mostrar() { return this.interno.mostrar?.bind(this.interno) }
  get inactividad() { return this.interno.inactividad?.bind(this.interno) }
}

export interface PedidoGrabar {
  nombre: string
  descripcion?: string
  /** Cuántas de las últimas acciones exitosas forman la receta (todas las del historial si falta). */
  ultimas?: number
  /** Meta en palabras de cada paso, en orden (sirve al decisor si un día no coincide). */
  metas?: string[]
  /** nombre → valor usado en esta corrida. Cada aparición del valor en textos y verificadores pasa a `{{nombre}}`. */
  parametros?: Record<string, string>
  verificador: Verificador[]
  /** Índices (desde 0) de pasos que envían, borran, pagan o publican, además de los que detecta la etiqueta. */
  sensibles?: number[]
  /** Índices de pasos que la app no siempre pide (un diálogo): se saltan si no aparecen. */
  opcionales?: number[]
  /** Si ya existe, la reemplaza (por defecto rechaza). */
  reemplazar?: boolean
}

/** Valores cortos (menos de 3 caracteres, como «1») no se reemplazan solos: se escriben como {{nombre}} donde toquen. */
function parametrizar(s: string | undefined, params: Record<string, string>): string | undefined {
  if (s == null) return s
  let r = s
  for (const [k, v] of Object.entries(params)) if (v && v.length >= 3) r = r.split(v).join(`{{${k}}}`)
  return r
}
function etiquetaParametrizada(d: Descriptor, params: Record<string, string>): Descriptor {
  const k = Object.entries(params).find(([, v]) => v && d.etiqueta != null && norm(d.etiqueta) === norm(v))?.[0]
  return k ? { ...d, etiqueta: `{{${k}}}` } : d
}
function parametrizarTodo<T>(x: T, params: Record<string, string>): T {
  if (typeof x === 'string') return parametrizar(x, params) as T
  if (Array.isArray(x)) return x.map(y => parametrizarTodo(y, params)) as T
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, parametrizarTodo(v, params)])) as T
  return x
}
function sustituir<T>(x: T, params: Record<string, string>): T {
  if (typeof x === 'string') return x.replace(/\{\{(\w+)\}\}/g, (m, k) => params[k] ?? m) as T
  if (Array.isArray(x)) return x.map(y => sustituir(y, params)) as T
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sustituir(v, params)])) as T
  return x
}

function validarVerificadores(v: Verificador[] | undefined, pasos: number): void {
  if (!Array.isArray(v) || !v.some(x => x.tras_paso == null)) throw new Error('La receta necesita al menos un verificador final (sin tras_paso): sin verificador no hay receta.')
  for (const x of v) {
    if (x.tras_paso != null && (x.tras_paso < 0 || x.tras_paso >= pasos)) throw new Error(`tras_paso ${x.tras_paso} fuera de rango (0..${pasos - 1}).`)
    if (x.tipo === 'pantalla' && !x.espera?.length) throw new Error('Verificador de pantalla sin espera.')
    if (x.tipo === 'comando') comandoPermitido(x.argv)
  }
}

/** Los verificadores por comando solo leen: lista cerrada, sin shell. */
const COMANDOS_LECTURA: Record<string, (argv: string[]) => boolean> = {
  defaults: a => a[1] === 'read' || a[1] === 'read-type',
  pgrep: () => true,
  // Windows: leer el registro y la lista de procesos.
  reg: a => (a[1] ?? '').toLowerCase() === 'query',
  tasklist: () => true,
}
function comandoPermitido(argv: string[]): void {
  if (!Array.isArray(argv) || !argv.length || !COMANDOS_LECTURA[argv[0]]?.(argv)) throw new Error(`Verificador por comando no permitido: ${JSON.stringify(argv)}. Solo lectura: defaults read, pgrep, reg query, tasklist.`)
}

export async function grabarReceta(g: Grabadora, almacen: AlmacenRecetas, p: PedidoGrabar): Promise<{ receta: Receta; ruta: string }> {
  if (!p.reemplazar && almacen.leer(p.nombre)) throw new Error(`Ya existe la receta «${p.nombre}». Usa reemplazar: true o córrela.`)
  const acciones = p.ultimas ? g.historial.slice(-p.ultimas) : [...g.historial]
  if (!acciones.length) throw new Error('No hay acciones grabadas: haz la tarea con observar/actuar y luego grábala.')
  const pid = acciones[0].pid
  if (acciones.some(a => a.pid !== pid)) throw new Error('Las acciones tocan más de una app: una receta es de una sola app. Usa `ultimas` para acotar.')
  const app = (await g.apps()).find(a => a.pid === pid)
  const params = p.parametros ?? {}
  const pasos: PasoReceta[] = acciones.map((a, i) => {
    const previa = acciones[i - 1]
    const ventana: RelacionVentana = !previa || a.ventana == null ? 'frente' : a.ventana === previa.ventana ? 'misma' : !previa.conocidas.has(a.ventana) ? 'nueva' : 'frente'
    const q = a.pedido
    const paso: PasoReceta = {
      meta: p.metas?.[i] ?? `${q.accion}${a.elemento ? ` ${pieza(a.elemento)}` : q.tecla ? ` ${[...(q.modificadores ?? []), q.tecla].join('+')}` : ''}`,
      accion: q.accion, ventana,
      // Un elemento cuya etiqueta ES un parámetro (el chat «Ana», la nota «Compras») queda como {{nombre}}: la receta sirve para otro.
      ...(a.elemento ? { elemento: etiquetaParametrizada(a.elemento, params) } : {}),
      ...(q.texto != null ? { texto: parametrizar(q.texto, params) } : {}),
      ...(q.tecla ? { tecla: q.tecla } : {}), ...(q.modificadores?.length ? { modificadores: q.modificadores } : {}),
      ...(q.direccion ? { direccion: q.direccion } : {}), ...(q.cantidad ? { cantidad: q.cantidad } : {}),
      ...(q.valor != null ? { valor: parametrizar(q.valor, params) } : {}),
    }
    if (q.ref && !a.elemento) throw new Error(`El paso ${i} usó ${q.ref} sin un observar previo que lo describa: observa antes de actuar.`)
    if (esSensible(paso) || p.sensibles?.includes(i)) paso.sensible = true
    if (p.opcionales?.includes(i)) paso.opcional = true
    return paso
  })
  const verificador = (p.verificador ?? []).map(v => parametrizarTodo(v, params))
  validarVerificadores(verificador, pasos.length)
  // El verificador final debe cumplirse ahora mismo: se graba lo que funcionó, no lo que se intentó.
  const ctx: Contexto = { manos: g.interno, pid, ventanaUltima: acciones[acciones.length - 1].ventana }
  for (const v of verificador.filter(x => x.tras_paso == null)) {
    const r = await verificarUno(sustituir(v, params), ctx)
    if (!r.cumple) throw new Error(`No grabé: el verificador no se cumple ahora (${r.detalle}). Termina la tarea o corrige el verificador.`)
  }
  const ahora = new Date().toISOString()
  const previa = almacen.leer(p.nombre)
  const receta: Receta = {
    nombre: p.nombre, descripcion: p.descripcion ?? '', app: app?.bundle ?? app?.nombre ?? acciones[0].app ?? String(pid),
    version: (previa?.version ?? 0) + 1, creada: previa?.creada ?? ahora, actualizada: ahora,
    parametros: Object.fromEntries(Object.keys(params).map(k => [k, ''])),
    pasos, verificador, corridas: 0, fallos: 0, reparaciones: [],
  }
  g.limpiar()
  return { receta, ruta: almacen.guardar(receta) }
}

/** Lee el estado real por un comando de la lista cerrada de solo lectura (regla de oro: comando antes que pantalla). */
export async function leerComando(argv: string[]): Promise<string> {
  comandoPermitido(argv)
  return ejecutar(argv)
}

// ---------- Correr ----------

interface Contexto { manos: Adaptador; pid: number; ventanaUltima?: number }

function ejecutar(argv: string[]): Promise<string> {
  return new Promise((ok, mal) => execFile(argv[0], argv.slice(1), { timeout: 5000 }, (e, out) => (e && (e as any).code !== 1 ? mal(e) : ok(String(out ?? '').trim()))))
}

async function verificarUno(v: Verificador, c: Contexto): Promise<{ cumple: boolean; detalle: string }> {
  if (v.tipo === 'comando') {
    comandoPermitido(v.argv)
    const out = await ejecutar(v.argv).catch(e => `error: ${(e as Error).message}`)
    const cumple = v.igual != null ? out === v.igual : v.contiene != null ? out.includes(v.contiene) : out.length > 0
    return { cumple, detalle: `${v.argv.join(' ')} → «${out.slice(0, 80)}»` }
  }
  if (v.tipo === 'ventana_cerrada') {
    if (c.ventanaUltima == null) return { cumple: false, detalle: 'no sé qué ventana debía cerrarse' }
    const sigue = (await c.manos.ventanas({ pid: c.pid })).some(w => w.id === c.ventanaUltima && w.en_pantalla)
    return { cumple: !sigue, detalle: sigue ? `la ventana ${c.ventanaUltima} sigue abierta` : `ventana ${c.ventanaUltima} cerrada` }
  }
  let o: Observacion
  try { o = await c.manos.observar({ pid: c.pid, ...(c.ventanaUltima ? { ventana: c.ventanaUltima } : {}), max_elementos: 400 }) }
  catch (e) { return { cumple: false, detalle: `no pude observar: ${(e as Error).message}` } }
  const leidos: string[] = []
  for (const x of v.espera) {
    const hit = o.elementos.find(e => (!x.rol || e.rol === x.rol) && (!x.etiqueta_contiene || norm(e.etiqueta).includes(norm(x.etiqueta_contiene)))
      && (x.valor == null || norm(String(e.valor ?? '')) === norm(x.valor)) && (x.valor_contiene == null || String(e.valor ?? '').includes(x.valor_contiene))
      && (x.digitos == null || String(e.valor ?? '').replace(/[^\d]/g, '') === x.digitos))
    if (!hit) return { cumple: false, detalle: `no aparece ${JSON.stringify(x)}` }
    // Lo leído va al que pidió (encargar lo devuelve como evidencia); la bitácora no lo guarda (cerebro.ts).
    leidos.push(`${hit.etiqueta ? `«${String(hit.etiqueta).slice(0, 40)}»` : hit.rol}${hit.valor != null && hit.valor !== '' ? ` = «${String(hit.valor).slice(0, 80)}»` : ''}`)
  }
  return { cumple: true, detalle: `la pantalla cumple: ${leidos.join('; ')}` }
}

async function verificarConEspera(v: Verificador, c: Contexto, maxMs: number): Promise<{ cumple: boolean; detalle: string }> {
  const fin = performance.now() + maxMs
  let r = await verificarUno(v, c)
  while (!r.cumple && performance.now() < fin) { await dormir(30); r = await verificarUno(v, c) }
  return r
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

async function verificarFinal(receta: Receta, params: Record<string, string>, c: Contexto, maxMs: number): Promise<{ cumple: boolean; detalle: string; detalles: string[] }> {
  const detalles: string[] = []
  for (const v of receta.verificador.filter(x => x.tras_paso == null)) {
    const vr = await verificarConEspera(sustituir(v, params), c, maxMs)
    detalles.push(vr.detalle)
    if (!vr.cumple) return { cumple: false, detalle: vr.detalle, detalles }
  }
  return { cumple: true, detalle: detalles.join(' · '), detalles }
}
/** Una sola lectura, sin esperar: ¿la tarea ya está hecha? */
async function cumpleFinal(receta: Receta, params: Record<string, string>, c: Contexto): Promise<boolean> {
  for (const v of receta.verificador.filter(x => x.tras_paso == null)) if (!(await verificarUno(sustituir(v, params), c)).cumple) return false
  return true
}
const ROLES_OPCION = /^(AXButton|AXCheckBox|AXSwitch|AXRadioButton|AXRow|AXCell|AXMenuButton|AXPopUpButton|AXMenuItem|AXLink|AXStaticText|AXTextArea|AXTextField|AXSlider|AXComboBox|AXTab)$/

export interface PasoCorrido { paso: number; meta: string; ventana?: number; observar_ms: number; actuar_ms: number; observaciones: number; estado: 'receta' | 'reparado' | 'omitido'; decisor?: string; confianza?: number | null; detalle?: string }

export interface ResultadoCorrer {
  ok: boolean
  estado: 'hecho' | 'fallo' | 'requiere_confirmacion'
  receta: string
  version: number
  ms: number
  pasos: PasoCorrido[]
  reparada: boolean
  verificador?: string
  detalle?: string
  /** Paso detenido por ser sensible: correr de nuevo con `confirmar: [paso]` tras el sí de Daniel. */
  paso_sensible?: { paso: number; meta: string; etiqueta?: string }
}

export interface OpcionesCorrer {
  parametros?: Record<string, string>
  /** Índices de pasos sensibles que Daniel ya confirmó en esta conversación. */
  confirmar?: number[]
  /** Cita del pedido de Daniel que confirma esos pasos (llega al freno). */
  confirmacion?: string
  /** Tope de espera a que aparezca el elemento de un paso (ms). Antes se cede solo si la pantalla ya dejó de cambiar. */
  espera_elemento_ms?: number
  /** Cuánto tiempo sin cambios en el árbol cuenta como «la app ya terminó de cargar» (ms). */
  quieto_ms?: number
  /** Cuánto esperar a que el verificador se cumpla (ms). */
  espera_verificador_ms?: number
}

export async function correrReceta(manos: Adaptador, decisor: () => Decisor, almacen: AlmacenRecetas, nombre: string, op: OpcionesCorrer = {}): Promise<ResultadoCorrer> {
  const t0 = performance.now()
  const base = almacen.leer(nombre)
  if (!base) throw new Error(`No existe la receta «${nombre}». Usa listar_recetas.`)
  const params = op.parametros ?? {}
  const faltan = Object.keys(base.parametros).filter(k => params[k] == null)
  if (faltan.length) throw new Error(`Faltan parámetros: ${faltan.join(', ')}.`)
  const receta: Receta = structuredClone(base)
  const pasos: PasoCorrido[] = []
  const reparaciones: Reparacion[] = []
  const salir = (r: Omit<ResultadoCorrer, 'receta' | 'version' | 'ms' | 'pasos' | 'reparada'>): ResultadoCorrer => {
    // Una falla cuenta en la receta; las reparaciones no verificadas se descartan.
    if (r.estado === 'fallo') { const d = almacen.leer(nombre); if (d) { d.fallos++; almacen.guardar(d) } }
    return { ...r, receta: nombre, version: base.version, ms: Math.round(performance.now() - t0), pasos, reparada: false }
  }

  // Sensible antes de tocar nada: si algún paso exige confirmación, no se empieza a medias.
  const sensibles = receta.pasos.map((p, i) => ({ p, i })).filter(({ p, i }) => (p.sensible || esSensible(p)) && !op.confirmar?.includes(i))
  if (sensibles.length) {
    const { p, i } = sensibles[0]
    return salir({ ok: false, estado: 'requiere_confirmacion', detalle: `El paso ${i} («${p.meta}») envía, borra, paga o publica: pide confirmación a ${DUENO} y corre de nuevo con confirmar: [${sensibles.map(s => s.i).join(', ')}].`, paso_sensible: { paso: i, meta: p.meta, etiqueta: p.elemento?.etiqueta } })
  }

  // Varias instancias (la de Daniel en otro escritorio y otra a la vista): se usa la que tiene ventana en pantalla.
  const candidatas = (await manos.apps()).filter(a => a.bundle === receta.app || a.nombre === receta.app)
  let app = candidatas[0]
  for (const a of candidatas.length > 1 ? candidatas : []) if ((await manos.ventanas({ pid: a.pid }).catch(() => [])).some(v => v.en_pantalla)) { app = a; break }
  const pid = app?.pid ?? (await manos.abrir(receta.app)).pid
  const ctx: Contexto = { manos, pid }
  let ventanaPrev: number | undefined
  let ventanasAntes: Set<number> | undefined
  const esperaEl = op.espera_elemento_ms ?? 8000
  const quieto = op.quieto_ms ?? 1000

  for (let i = 0; i < receta.pasos.length; i++) {
    const paso = sustituir(receta.pasos[i], params)
    const siguiente = receta.pasos[i + 1]
    let ventana: number | undefined
    const tObs = performance.now()
    if (paso.ventana === 'misma') ventana = ventanaPrev
    else if (paso.ventana === 'nueva') {
      const fin = performance.now() + 3000
      while (ventana == null && performance.now() < fin) {
        ventana = (await manos.ventanas({ pid })).find(w => w.en_pantalla && !ventanasAntes?.has(w.id))?.id
        if (ventana == null) await dormir(25)
      }
      if (ventana == null) return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: no apareció la ventana nueva que espera la receta` })
    }

    let o: Observacion | undefined, ref: string | undefined, observaciones = 0
    let estado: PasoCorrido['estado'] = 'receta', quien: string | undefined, confianza: number | null | undefined
    if (paso.elemento) {
      // Verificar que el elemento existe antes de actuar; la app puede tardar en mostrarlo.
      // No se cede mientras la app siga cambiando (un panel que carga): solo cuando el árbol lleva `quieto` ms igual,
      // o al tope. Así una app lenta no se confunde con una pantalla distinta.
      const tIni = performance.now()
      const tope = paso.opcional ? Math.min(esperaEl, 2000) : esperaEl
      let m: Emparejado = { tipo: 'ninguno' }
      let yaCumple = false, huella = '', huellaDesde = tIni
      while (true) {
        try { o = await manos.observar({ pid, ...(ventana ? { ventana } : {}), max_elementos: 400 }); observaciones++; m = emparejar(o, paso.elemento, paso.alternativas) }
        catch { o = undefined }
        if (m.tipo === 'uno') break
        // Un paso opcional (un diálogo que no siempre sale) se salta en cuanto la tarea ya se cumple.
        if (paso.opcional && (yaCumple = await cumpleFinal(receta, params, ctx))) break
        const h = o ? o.elementos.map(e => `${e.rol}|${e.etiqueta ?? ''}`).join('\n') : ''
        const t = performance.now()
        // Un árbol vacío es una app que todavía no responde, no una pantalla estable.
        if (h !== huella || (o?.elementos.length ?? 0) <= 1) { huella = h; huellaDesde = t }
        // Al menos dos lecturas: una sola observación lenta (la app ahogada) no basta para declarar la pantalla distinta.
        if (observaciones >= 2 && ((o && t - huellaDesde >= quieto) || t - tIni >= tope)) break
        await dormir(30)
      }
      // Opcional: se salta si la tarea ya se cumple o si su ventana ya no está. Si la app sí muestra algo estable
      // que no coincide (el diálogo con otra etiqueta), se repara como cualquier paso.
      if (paso.opcional && m.tipo !== 'uno' && (yaCumple || !o)) {
        pasos.push({ paso: i, meta: paso.meta, observar_ms: Math.round(performance.now() - tObs), actuar_ms: 0, observaciones, estado: 'omitido', detalle: yaCumple ? 'la tarea ya se cumplía' : 'su ventana ya no está' })
        continue
      }
      if (!o) return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: no pude observar la app` })
      // En un chat, un elemento que es un parámetro (el contacto) no se adivina: si no está, falla cerrado.
      if (m.tipo !== 'uno' && esPrivada(receta.app) && /\{\{\w+\}\}/.test(receta.pasos[i].elemento?.etiqueta ?? '')) return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: no encontré «${paso.elemento.etiqueta}» y en un chat no se adivina` })
      if (m.tipo === 'uno') ref = m.elemento.ref
      else {
        // No coincide: cede al decisor con la meta del paso y lo que hay en pantalla.
        const pool = m.tipo === 'ambiguo' ? m.candidatos : o.elementos.filter(e => ROLES_OPCION.test(e.rol) && (e.etiqueta || /AXText/.test(e.rol)))
        if (!pool.length) return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: el elemento no está y no hay opciones en pantalla` })
        const opciones = Object.fromEntries(pool.slice(0, 80).map(e => [e.ref, `${e.rol} «${e.etiqueta ?? ''}»${e.valor ? ` (valor ${String(e.valor).slice(0, 40)})` : ''}`]))
        let d
        try {
          d = await decisor().decidir({
            pregunta: `Meta: ${paso.meta}. La receta esperaba ${pieza(paso.elemento)}${m.tipo === 'ambiguo' ? ', pero hay varios iguales' : ', pero ya no está'}. ¿Qué elemento hay que accionar ahora?`,
            // Reparar es adivinar menos que descubrir: interruptores y pasos sensibles exigen la confianza alta.
            estado: { ventana: o.titulo, arbol: o.texto.slice(0, 6000) }, opciones, cambia_estado: !!paso.sensible || /CheckBox|Switch|Radio/.test(paso.elemento.rol),
            // Las opciones son etiquetas de la pantalla: en un chat (nombres, mensajes) no salen a otro proveedor.
            ...(esPrivada(receta.app) ? { privado: true } : {}),
          })
        } catch (e) { return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: el decisor no pudo elegir (${(e as Error).message.slice(0, 120)})` }) }
        ref = d.eleccion; estado = 'reparado'; quien = d.decisor; confianza = d.confianza
        const nuevo = describir(o, ref)
        if (nuevo && esSensible({ elemento: nuevo }) && !op.confirmar?.includes(i)) {
          return salir({ ok: false, estado: 'requiere_confirmacion', detalle: `Al reparar, el paso ${i} cayó en «${nuevo.etiqueta}», que envía, borra, paga o publica: pide confirmación.`, paso_sensible: { paso: i, meta: paso.meta, etiqueta: nuevo.etiqueta } })
        }
        reparaciones.push({ en: new Date().toISOString(), paso: i, antes: receta.pasos[i].elemento, despues: nuevo, decisor: d.decisor, confianza: d.confianza })
        const original = receta.pasos[i]
        if (nuevo) {
          original.alternativas = [original.elemento!, ...(original.alternativas ?? [])].filter((x, k, arr) => arr.findIndex(y => JSON.stringify(y) === JSON.stringify(x)) === k).slice(0, 5)
          original.elemento = nuevo
        }
      }
      const actual = o.elementos.find(e => e.ref === ref)
      if (paso.omitir_si_valor != null && actual && norm(String(actual.valor ?? '')) === norm(paso.omitir_si_valor)) {
        pasos.push({ paso: i, meta: paso.meta, observar_ms: Math.round(performance.now() - tObs), actuar_ms: 0, observaciones, estado: 'omitido' })
        ventanaPrev = o.ventana
        continue
      }
    }
    const observar_ms = performance.now() - tObs
    if (siguiente?.ventana === 'nueva') ventanasAntes = new Set((await manos.ventanas({ pid })).map(w => w.id))
    const destino = o?.ventana ?? ventana
    // Asentar solo cuando el paso siguiente espera un cambio de la app (un panel que carga, una ventana o un diálogo nuevos).
    // Si su elemento ya está a la vista (los botones de la Calculadora) o no hay siguiente, se salta: el paso siguiente
    // espera a su propio elemento y el verificador espera su condición.
    const sigVisible = !siguiente || (siguiente.ventana === 'misma' && !!siguiente.elemento && !siguiente.opcional && !!o && emparejar(o, sustituir(siguiente.elemento, params), siguiente.alternativas).tipo === 'uno')
    const tAct = performance.now()
    // La confirmación es por etiqueta, no por posición: un paso reparado solo la lleva si cayó en un elemento
    // con la misma etiqueta que la grabada (o una alternativa); si cayó en otro botón, el freno vuelve a frenar.
    const real = ref && o ? o.elementos.find(e => e.ref === ref) : undefined
    const mismaEtiqueta = !real || estado !== 'reparado' || [paso.elemento, ...(paso.alternativas ?? [])].some(d => d && d.rol === real.rol && norm(d.etiqueta) === norm(real.etiqueta))
    const confirmado = !!op.confirmar?.includes(i) && mismaEtiqueta
    const r = await manos.actuar({ pid, ...(destino ? { ventana: destino } : {}), accion: paso.accion, ...(ref ? { ref } : {}),
      // La receta nunca fabrica permiso: pasa la cita de Daniel o nada (y el freno detiene el paso).
      ...(confirmado && op.confirmacion ? { confirmacion: op.confirmacion } : {}),
      ...(paso.texto != null ? { texto: paso.texto } : {}), ...(paso.tecla ? { tecla: paso.tecla } : {}), ...(paso.modificadores ? { modificadores: paso.modificadores } : {}),
      ...(paso.direccion ? { direccion: paso.direccion } : {}), ...(paso.cantidad ? { cantidad: paso.cantidad } : {}), ...(paso.valor != null ? { valor: paso.valor } : {}),
      ...(sigVisible ? { asentar: false } : {}) })
    const actuar_ms = performance.now() - tAct
    pasos.push({ paso: i, meta: paso.meta, ventana: destino, observar_ms: Math.round(observar_ms), actuar_ms: Math.round(actuar_ms), observaciones, estado, ...(quien ? { decisor: quien, confianza } : {}), ...(r.ok ? {} : { detalle: r.detalle }) })
    if (r.efecto === 'bloqueado') return salir({ ok: false, estado: 'requiere_confirmacion', detalle: `paso ${i}: ${r.detalle}`, paso_sensible: { paso: i, meta: paso.meta, etiqueta: real?.etiqueta ?? paso.elemento?.etiqueta } })
    if (!r.ok) return salir({ ok: false, estado: 'fallo', detalle: `paso ${i}: ${r.detalle ?? 'la acción falló'}` })
    ventanaPrev = destino
    ctx.ventanaUltima = destino
    for (const v of receta.verificador.filter(x => x.tras_paso === i)) {
      const vr = await verificarConEspera(sustituir(v, params), ctx, op.espera_verificador_ms ?? 3000)
      if (!vr.cumple) return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: `verificador tras el paso ${i}: ${vr.detalle}` })
    }
  }

  // Verificador final obligatorio. Si no se cumple, la app pudo abrir una rama nueva (un diálogo): el decisor
  // propone hasta dos pasos más y, si con ellos se cumple, quedan en la receta como opcionales.
  let detalles: string[] = []
  for (let extra = 0; ; extra++) {
    const vr = await verificarFinal(receta, params, ctx, op.espera_verificador_ms ?? 3000)
    detalles = vr.detalles
    if (vr.cumple) break
    const motivo = `verificador final: ${vr.detalle}${reparaciones.length ? ' (la reparación no se guardó)' : ''}`
    if (extra >= 2 || ctx.ventanaUltima == null) return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: motivo })
    const tObs = performance.now()
    let o: Observacion
    try { o = await manos.observar({ pid, ventana: ctx.ventanaUltima, max_elementos: 400 }) } catch { return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: motivo }) }
    const pool = o.elementos.filter(e => ROLES_OPCION.test(e.rol) && e.etiqueta && /AXButton|AXCheckBox|AXRadioButton|AXMenuItem|AXLink|AXPopUpButton/.test(e.rol))
    if (!pool.length) return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: motivo })
    const ultimo = receta.pasos[receta.pasos.length - 1]
    let d
    try {
      d = await decisor().decidir({
        pregunta: `Se hicieron todos los pasos (el último: «${sustituir(ultimo.meta, params)}») pero la tarea aún no se cumple (${vr.detalle}). ¿Qué elemento hay que accionar para terminarla?`,
        estado: { tarea: receta.descripcion, ventana: o.titulo, arbol: o.texto.slice(0, 6000) },
        opciones: Object.fromEntries(pool.slice(0, 80).map(e => [e.ref, `${e.rol} «${e.etiqueta}»`])), cambia_estado: true,
        ...(esPrivada(receta.app) ? { privado: true } : {}),
      })
    } catch (e) { return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: `${motivo}; el decisor no pudo proponer un paso (${(e as Error).message.slice(0, 100)})` }) }
    const nuevo = describir(o, d.eleccion)
    if (!nuevo) return salir({ ok: false, estado: 'fallo', verificador: vr.detalle, detalle: motivo })
    // Si lo que falta es justo el elemento original de un paso que se «reparó» en esta corrida, esa reparación
    // fue falsa (p. ej. el decisor eligió otra cosa mientras el panel cargaba): se revierte y no se agrega paso.
    const falsa = reparaciones.find(x => x.antes && [x.antes, ...(base.pasos[x.paso]?.alternativas ?? [])].some(a => a.rol === nuevo.rol && norm(a.etiqueta) === norm(nuevo.etiqueta)))
    const idx = falsa ? falsa.paso : receta.pasos.length
    const sensible = esSensible({ elemento: nuevo })
    if (sensible && !falsa && !op.confirmar?.includes(idx)) {
      return salir({ ok: false, estado: 'requiere_confirmacion', detalle: `Para terminar, el decisor propone «${nuevo.etiqueta}» (paso ${idx}), que envía, borra, paga o publica: pide confirmación a ${DUENO} y corre de nuevo con confirmar: [${idx}].`, paso_sensible: { paso: idx, meta: `completar «${ultimo.meta}»`, etiqueta: nuevo.etiqueta } })
    }
    const tAct = performance.now()
    const r = await manos.actuar({ pid, ventana: o.ventana, accion: 'click', ref: d.eleccion,
      ...(sensible && op.confirmar?.includes(idx) && op.confirmacion ? { confirmacion: op.confirmacion } : {}) })
    if (r.efecto === 'bloqueado') return salir({ ok: false, estado: 'requiere_confirmacion', detalle: r.detalle, paso_sensible: { paso: idx, meta: `completar «${ultimo.meta}»`, etiqueta: nuevo.etiqueta } })
    pasos.push({ paso: idx, meta: `completar «${ultimo.meta}»`, ventana: o.ventana, observar_ms: Math.round(tAct - tObs), actuar_ms: Math.round(performance.now() - tAct), observaciones: 1, estado: 'reparado', decisor: d.decisor, confianza: d.confianza, ...(r.ok ? {} : { detalle: r.detalle }) })
    if (!r.ok) return salir({ ok: false, estado: 'fallo', detalle: `paso ${idx}: ${r.detalle ?? 'la acción falló'}` })
    if (falsa) {
      receta.pasos[falsa.paso] = structuredClone(base.pasos[falsa.paso])
      reparaciones.splice(reparaciones.indexOf(falsa), 1)
      pasos[pasos.length - 1].detalle = `revierte la reparación del paso ${falsa.paso}`
      continue
    }
    receta.pasos.push({ meta: `completar «${ultimo.meta}»`, accion: 'click', ventana: 'misma', elemento: nuevo, opcional: true, ...(sensible ? { sensible: true } : {}) })
    reparaciones.push({ en: new Date().toISOString(), paso: idx, despues: nuevo, decisor: d.decisor, confianza: d.confianza })
  }
  const ms = Math.round(performance.now() - t0)
  // Solo una corrida verificada guarda: contador y, si hubo, la reparación (nueva versión).
  const guardar = almacen.leer(nombre) ?? base
  guardar.corridas++
  guardar.ultima_ms = ms
  if (reparaciones.length) {
    guardar.pasos = receta.pasos
    guardar.version++
    guardar.actualizada = new Date().toISOString()
    guardar.reparaciones = [...guardar.reparaciones, ...reparaciones].slice(-20)
  }
  almacen.guardar(guardar)
  return { ok: true, estado: 'hecho', receta: nombre, version: guardar.version, ms, pasos, reparada: reparaciones.length > 0, verificador: detalles.join(' · ') }
}

/** Resumen corto para `listar_recetas`. */
export function resumen(r: Receta) {
  return { nombre: r.nombre, descripcion: r.descripcion, app: r.app, pasos: r.pasos.length, parametros: Object.keys(r.parametros), sensibles: r.pasos.flatMap((p, i) => (p.sensible ? [i] : [])), version: r.version, corridas: r.corridas, fallos: r.fallos, reparaciones: r.reparaciones.length, ultima_ms: r.ultima_ms }
}
