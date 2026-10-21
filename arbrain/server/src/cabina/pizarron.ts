/**
 * El pizarrón (7 oct 2026) · la herramienta con la que Levy enseña en el panel de Daniel.
 *
 * Una sesión es un registro en el repo (docs/pizarron/sesiones/<id>/): sesion.json (lo escribe esta herramienta: los
 * pasos de Levy, las imágenes, el cierre) y eventos.jsonl (lo escribe la app: lo que Daniel toca, predice y dice).
 * La biblioteca (docs/pizarron/biblioteca/<objeto>/) guarda cada objeto vivo con su ficha para reusarlo en cualquier
 * tema. El mapa del alumno (docs/pizarron/alumnos/<alumno>.md) lleva lo que ya domina: cada sesión empieza un paso más allá.
 *
 * La app que reproduce: arbrain/src/features/pizarron/ (director.ts lleva el reloj de la voz, public/pizarron/escenario.js
 * pinta). Todo lo que aquí se valida se valida ANTES de que Daniel lo vea: el error le llega a Levy.
 */
import { textoFaltaLlave } from '../edicion.js'
import { DUENO, DUENO_M, PERSONA_DUENO } from '../dueno.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { REPO } from './documento.js'
import { partirVoz, type Marca } from './pizarron-marcas.js'

export const RAIZ = () => process.env.PIZARRON_DIR || path.join(REPO, 'docs', 'pizarron')
const ID_SESION = /^[a-z0-9][a-z0-9-]{2,90}$/
const ID_OBJETO = /^[a-z0-9][a-z0-9-]{1,60}$/
const ID_EL = /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/
const ESTILOS = ['grande', 'titulo', 'nota', 'formula'] as const
const MODOS = ['arrastra', 'dibuja', 'numero', 'palabras'] as const
const LADOS = ['derecha', 'izquierda', 'arriba', 'abajo'] as const
const ANCLAS_GENERICAS = new Set(['centro', 'arriba', 'abajo', 'izquierda', 'derecha', 'inicio', 'fin'])

// ── tipos (espejo de arbrain/src/features/pizarron/modelo.ts) ──
type Lado = typeof LADOS[number]
interface Base { id: string; junto?: string; lado?: Lado; lugar?: Lado | { x: number; y: number }; oculto?: boolean }
type Elemento =
  | (Base & { tipo: 'objeto'; objeto: string; params?: Record<string, unknown>; ancho?: number; alto?: number; titulo?: string })
  | (Base & { tipo: 'texto'; texto: string; estilo?: typeof ESTILOS[number]; ancho?: number })
  | (Base & { tipo: 'imagen'; imagen: string; ancho?: number; pie?: string })
  | (Base & { tipo: 'hilo'; de: string; a: string; f?: string })
interface Prediccion { pregunta: string; modo: typeof MODOS[number]; en?: string; pista?: string; revela?: string; respuesta?: unknown }
interface Paso { id: string; n: number; creado: string; pon?: Elemento[]; quita?: string[]; voz?: string; predice?: Prediccion; luz?: 'papel' | 'noche'; camara?: boolean }
export interface Sesion {
  version: 1; id: string; tema: string; alumno: string; documento?: string; conversacion?: string
  creada: string; actualizada: string; rev: number; luz?: 'papel' | 'noche'; pasos: Paso[]
  imagenes?: Record<string, { archivo: string; ancho: number; alto: number; prompt?: string }>
  cierre?: { en: string; entendido: string[]; palabras?: string; escritoEn: string[] }
}
export interface Ficha {
  id: string; nombre: string; ensena: string; temas?: string[]; params?: Record<string, { inicial: unknown; min?: number; max?: number; etiqueta?: string }>
  anclas?: string[]; asas?: string[]; metodos?: string[]; eventos?: string[]; ancho?: number; alto?: number; creado?: string; actualizado?: string; usos?: number; sesiones?: string[]
}

// ── archivos ──
const dirSesion = (id: string) => { if (!ID_SESION.test(id)) throw new Error(`Sesión inválida: «${id}».`); return path.join(RAIZ(), 'sesiones', id) }
const dirObjeto = (id: string) => { if (!ID_OBJETO.test(id)) throw new Error(`id de objeto inválido: «${id}» (minúsculas, números y guiones).`); return path.join(RAIZ(), 'biblioteca', id) }
function escribirAtomico(f: string, texto: string) { mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, texto); renameSync(tmp, f) }
export function leerSesion(id: string): Sesion {
  const f = path.join(dirSesion(id), 'sesion.json')
  if (!existsSync(f)) throw new Error(`No existe la sesión «${id}». Ábrela con pizarron {accion:"abrir", tema}.`)
  return JSON.parse(readFileSync(f, 'utf8')) as Sesion
}
function guardarSesion(s: Sesion) { s.actualizada = new Date().toISOString(); s.rev = (s.rev ?? 0) + 1; escribirAtomico(path.join(dirSesion(s.id), 'sesion.json'), JSON.stringify(s, null, 2) + '\n') }
export function leerFicha(id: string): Ficha | null { try { return JSON.parse(readFileSync(path.join(dirObjeto(id), 'ficha.json'), 'utf8')) as Ficha } catch { return null } }
function fichas(): Ficha[] {
  const d = path.join(RAIZ(), 'biblioteca')
  if (!existsSync(d)) return []
  return readdirSync(d).filter(x => ID_OBJETO.test(x)).map(leerFicha).filter((f): f is Ficha => !!f)
}
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const fechaLarga = () => new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' })
export const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'sesion'

// ── abrir ──
export function abrirSesion(o: { tema?: unknown; sesion?: unknown; documento?: unknown; alumno?: unknown; luz?: unknown }, conversacion?: string): { sesion: Sesion; nueva: boolean } {
  if (typeof o.sesion === 'string' && o.sesion) return { sesion: leerSesion(o.sesion), nueva: false }
  if (typeof o.tema !== 'string' || !o.tema.trim()) throw new Error('abrir necesita tema (o sesion para retomar una).')
  const tema = o.tema.trim().slice(0, 120)
  let id = `${hoyMx()}-${slug(tema)}`, k = 2
  while (existsSync(dirSesion(id))) id = `${hoyMx()}-${slug(tema)}-${k++}`
  let documento: string | undefined
  if (typeof o.documento === 'string' && o.documento.trim()) {
    const abs = resolverDoc(o.documento.trim())
    if (!existsSync(abs)) throw new Error(`El documento «${o.documento}» no existe.`)
    documento = path.relative(REPO, abs).startsWith('..') ? abs : path.relative(REPO, abs)
  }
  const ahora = new Date().toISOString()
  const sesion: Sesion = { version: 1, id, tema, alumno: typeof o.alumno === 'string' && /^[a-z]{2,30}$/.test(o.alumno) ? o.alumno : PERSONA_DUENO, ...(documento ? { documento } : {}), ...(conversacion ? { conversacion } : {}), creada: ahora, actualizada: ahora, rev: 0, luz: o.luz === 'noche' ? 'noche' : 'papel', pasos: [], imagenes: {} }
  guardarSesion(sesion)
  return { sesion, nueva: true }
}
function resolverDoc(r: string) { return r.startsWith('/') ? r : r.startsWith('~/') ? path.join(process.env.HOME ?? '', r.slice(2)) : path.join(REPO, r) }

// ── pasos ──
interface Registro { tipo: Elemento['tipo']; objeto?: string; ficha?: Ficha | null; texto?: string }
const sinAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '')

function registroHasta(s: Sesion): Map<string, Registro> {
  const reg = new Map<string, Registro>()
  for (const p of s.pasos) {
    for (const id of p.quita ?? []) reg.delete(id)
    for (const e of p.pon ?? []) reg.set(e.id, { tipo: e.tipo, ...(e.tipo === 'objeto' ? { objeto: e.objeto, ficha: leerFicha(e.objeto) } : {}), ...(e.tipo === 'texto' ? { texto: e.texto } : {}) })
  }
  return reg
}

/** Revisa cada acotación contra lo que habrá en el pizarrón en ese momento. Errores bloquean; avisos solo informan. */
function revisarVoz(voz: string, reg: Map<string, Registro>, donde: string, errores: string[], avisos: string[]) {
  const { segmentos, errores: e } = partirVoz(voz)
  errores.push(...e.map(x => `${donde}: ${x}`))
  const marcas: Marca[] = []
  for (const s of segmentos) { if (s.tipo === 'voz') marcas.push(...s.marcas.map(m => m.marca)); else marcas.push(s.marca) }
  const ref = (r: string | undefined, m: Marca, requerido = true) => {
    if (!r) { if (requerido) errores.push(`${donde}: [[${m.crudo}]] necesita a qué elemento se refiere.`); return }
    const [id, ancla] = r.split('.')
    const x = reg.get(id)
    if (!x) { errores.push(`${donde}: [[${m.crudo}]] nombra «${id}», que no está en el pizarrón en ese momento (elementos: ${[...reg.keys()].join(', ') || 'ninguno'}).`); return }
    if (!ancla || ANCLAS_GENERICAS.has(ancla)) return
    if (x.tipo === 'objeto' && x.ficha) {
      const conocidas = new Set([...(x.ficha.anclas ?? []), ...(x.ficha.asas ?? [])])
      if (!conocidas.has(ancla)) avisos.push(`${donde}: «${id}» (${x.objeto}) no declaró el ancla «${ancla}» en el ensayo (declaró: ${[...conocidas].join(', ') || 'ninguna'}). Si no existe, la acción cae en el centro del objeto.`)
    } else if (x.tipo === 'texto' && x.texto && !x.texto.split(/\s+/).some(p => sinAcento(p) === sinAcento(ancla))) avisos.push(`${donde}: «${ancla}» no es una palabra del texto «${id}».`)
  }
  for (const m of marcas) {
    const v = m.verbo
    if (['mira', 'senala', 'encierra', 'subraya'].includes(v)) ref(m.args[0], m)
    else if (v === 'flecha') { ref(m.args[0], m); ref(m.args[1], m) }
    else if (v === 'muestra' || v === 'oculta') { if (!m.args.length) errores.push(`${donde}: [[${m.crudo}]] necesita el id.`); m.args.forEach(a => { if (!reg.has(a)) errores.push(`${donde}: [[${m.crudo}]] nombra «${a}», que no existe en ese momento.`) }) }
    else if (v === 'escribe') { if (!m.texto && !m.args.length) errores.push(`${donde}: [[${m.crudo}]] necesita el texto entre comillas.`); if (m.opts.en) ref(m.opts.en, m) }
    else if (v === 'pon') {
      const claves = Object.keys(m.opts).filter(k => k.includes('.'))
      if (!claves.length) errores.push(`${donde}: [[${m.crudo}]] se escribe [[pon objeto.parametro=valor dur=1]].`)
      for (const k of claves) {
        const [id, param] = k.split('.'), x = reg.get(id)
        if (!x || x.tipo !== 'objeto') { errores.push(`${donde}: [[${m.crudo}]]: «${id}» no es un objeto vivo en ese momento.`); continue }
        if (x.ficha?.params && !(param in x.ficha.params)) errores.push(`${donde}: [[${m.crudo}]]: «${x.objeto}» no tiene el parámetro «${param}» (tiene: ${Object.keys(x.ficha.params).join(', ') || 'ninguno'}).`)
      }
    } else if (v === 'llama') {
      const [id, met] = (m.args[0] ?? '').split('.'), x = reg.get(id)
      if (!x || x.tipo !== 'objeto') errores.push(`${donde}: [[${m.crudo}]]: «${id}» no es un objeto vivo en ese momento.`)
      else if (x.ficha?.metodos && !x.ficha.metodos.includes(met)) errores.push(`${donde}: [[${m.crudo}]]: «${x.objeto}» no tiene el método «${met}» (tiene: ${x.ficha.metodos.join(', ') || 'ninguno'}).`)
    } else if (v === 'espera') ref(m.args[0], m)
    else if (v === 'luz' && !['papel', 'noche'].includes(m.args[0] ?? '')) errores.push(`${donde}: [[${m.crudo}]]: luz papel o luz noche.`)
  }
  return segmentos.filter(s => s.tipo === 'voz').reduce((n, s) => n + (s.tipo === 'voz' ? s.hablado.length : 0), 0)
}

function revisarElemento(e: Record<string, unknown>, reg: Map<string, Registro>, s: Sesion, donde: string, errores: string[]): Elemento | null {
  const id = e.id
  if (typeof id !== 'string' || !ID_EL.test(id)) { errores.push(`${donde}: cada elemento necesita id corto (letras, números, _ o -), p. ej. "curva".`); return null }
  const base: Base = { id }
  if (e.junto != null) { if (typeof e.junto !== 'string' || !reg.has(e.junto)) errores.push(`${donde} ${id}: junto «${String(e.junto)}» no existe.`); else base.junto = e.junto }
  if (e.lado != null) { if (!(LADOS as readonly unknown[]).includes(e.lado)) errores.push(`${donde} ${id}: lado es ${LADOS.join('|')}.`); else base.lado = e.lado as Lado }
  if (e.lugar != null) {
    if ((LADOS as readonly unknown[]).includes(e.lugar)) base.lugar = e.lugar as Lado
    else if (e.lugar && typeof e.lugar === 'object' && Number.isFinite((e.lugar as { x: number }).x) && Number.isFinite((e.lugar as { y: number }).y)) base.lugar = { x: (e.lugar as { x: number }).x, y: (e.lugar as { y: number }).y }
    else errores.push(`${donde} ${id}: lugar es ${LADOS.join('|')} (junto al paso anterior) o {x,y}.`)
  }
  if (e.oculto === true) base.oculto = true
  const tam = (v: unknown, min: number, max: number) => typeof v === 'number' && v >= min && v <= max ? Math.round(v) : undefined
  switch (e.tipo) {
    case 'objeto': {
      if (typeof e.objeto !== 'string' || !leerFicha(e.objeto)) { errores.push(`${donde} ${id}: el objeto «${String(e.objeto)}» no está en la biblioteca. Fabrícalo antes con pizarron {accion:"objeto"} (o búscalo con accion:"biblioteca").`); return null }
      const params = e.params && typeof e.params === 'object' && !Array.isArray(e.params) ? e.params as Record<string, unknown> : undefined
      const f = leerFicha(e.objeto)!
      if (params && f.params) for (const k of Object.keys(params)) if (!(k in f.params)) errores.push(`${donde} ${id}: «${e.objeto}» no tiene el parámetro «${k}» (tiene: ${Object.keys(f.params).join(', ')}).`)
      return { ...base, tipo: 'objeto', objeto: e.objeto, ...(params ? { params } : {}), ...(tam(e.ancho, 120, 2000) ? { ancho: tam(e.ancho, 120, 2000) } : f.ancho ? { ancho: f.ancho } : {}), ...(tam(e.alto, 80, 1600) ? { alto: tam(e.alto, 80, 1600) } : f.alto ? { alto: f.alto } : {}), ...(typeof e.titulo === 'string' ? { titulo: e.titulo.slice(0, 80) } : {}) }
    }
    case 'texto':
      if (typeof e.texto !== 'string' || !e.texto.trim()) { errores.push(`${donde} ${id}: texto vacío.`); return null }
      if (e.estilo != null && !(ESTILOS as readonly unknown[]).includes(e.estilo)) errores.push(`${donde} ${id}: estilo es ${ESTILOS.join('|')}.`)
      return { ...base, tipo: 'texto', texto: e.texto.slice(0, 600), ...(e.estilo ? { estilo: e.estilo as typeof ESTILOS[number] } : {}), ...(tam(e.ancho, 120, 1600) ? { ancho: tam(e.ancho, 120, 1600) } : {}) }
    case 'imagen':
      if (typeof e.imagen !== 'string' || !s.imagenes?.[e.imagen]) { errores.push(`${donde} ${id}: la imagen «${String(e.imagen)}» no existe en la sesión. Genérala antes con pizarron {accion:"imagen"}.`); return null }
      return { ...base, tipo: 'imagen', imagen: e.imagen, ...(tam(e.ancho, 120, 1800) ? { ancho: tam(e.ancho, 120, 1800) } : {}), ...(typeof e.pie === 'string' ? { pie: e.pie.slice(0, 200) } : {}) }
    case 'hilo': {
      const punta = (v: unknown, cual: string) => {
        if (typeof v !== 'string' || !v.includes('.')) { errores.push(`${donde} ${id}: ${cual} es "objeto.parametro".`); return false }
        const [el, p] = v.split('.'), x = reg.get(el)
        if (!x || x.tipo !== 'objeto') { errores.push(`${donde} ${id}: ${cual} «${el}» no es un objeto vivo en ese momento.`); return false }
        if (x.ficha?.params && !(p in x.ficha.params)) { errores.push(`${donde} ${id}: «${x.objeto}» no tiene el parámetro «${p}».`); return false }
        return true
      }
      if (!punta(e.de, 'de') || !punta(e.a, 'a')) return null
      if (e.f != null) { if (typeof e.f !== 'string' || e.f.length > 200) errores.push(`${donde} ${id}: f es una expresión corta en x, p. ej. "2*x".`); else try { new Function('x', `"use strict"; return (${e.f})`) } catch (err) { errores.push(`${donde} ${id}: f no es JavaScript válido (${(err as Error).message}).`) } }
      return { ...base, tipo: 'hilo', de: e.de as string, a: e.a as string, ...(typeof e.f === 'string' ? { f: e.f } : {}) }
    }
  }
  errores.push(`${donde} ${id}: tipo es objeto|texto|imagen|hilo.`)
  return null
}

export function agregarPasos(id: string, crudos: unknown): { sesion: Sesion; nuevos: Paso[]; avisos: string[]; segundos: number } {
  const s = leerSesion(id)
  if (!Array.isArray(crudos) || !crudos.length) throw new Error('pasos debe ser una lista con al menos un paso.')
  if (crudos.length > 24) throw new Error('Máximo 24 pasos por llamada: manda el resto en otra llamada (la voz de los primeros ya estará sonando).')
  const reg = registroHasta(s), errores: string[] = [], avisos: string[] = [], nuevos: Paso[] = []
  const usados = new Set(s.pasos.map(p => p.id))
  let chars = 0
  crudos.forEach((c, i) => {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const n = s.pasos.length + i + 1
    const pid = typeof o.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,30}$/i.test(o.id) ? o.id : `p${n}`
    const donde = `paso ${pid}`
    if (usados.has(pid)) { errores.push(`${donde}: ese id ya existe en la sesión.`); return }
    usados.add(pid)
    const paso: Paso = { id: pid, n, creado: new Date().toISOString() }
    if (o.quita != null) { if (!Array.isArray(o.quita)) errores.push(`${donde}: quita es una lista de ids.`); else { paso.quita = []; for (const q of o.quita) { if (typeof q === 'string' && reg.has(q)) { paso.quita.push(q); reg.delete(q) } else errores.push(`${donde}: quita «${String(q)}» no existe.`) } } }
    if (o.pon != null) {
      if (!Array.isArray(o.pon)) errores.push(`${donde}: pon es una lista de elementos.`)
      else { paso.pon = []; for (const e of o.pon) { const el = revisarElemento((e ?? {}) as Record<string, unknown>, reg, s, donde, errores); if (el) { paso.pon.push(el); reg.set(el.id, { tipo: el.tipo, ...(el.tipo === 'objeto' ? { objeto: el.objeto, ficha: leerFicha(el.objeto) } : {}), ...(el.tipo === 'texto' ? { texto: el.texto } : {}) }) } } }
    }
    if (o.voz != null) { if (typeof o.voz !== 'string') errores.push(`${donde}: voz es texto.`); else if (o.voz.length > 4000) errores.push(`${donde}: voz demasiado larga (máximo 4000 caracteres; parte en pasos).`); else { paso.voz = o.voz; chars += revisarVoz(o.voz, reg, donde, errores, avisos) } }
    if (o.predice != null) {
      const q = o.predice as Record<string, unknown>
      if (!q || typeof q.pregunta !== 'string' || !(MODOS as readonly unknown[]).includes(q.modo)) errores.push(`${donde}: predice necesita pregunta y modo (${MODOS.join('|')}).`)
      else {
        if (q.en != null && (typeof q.en !== 'string' || !reg.has(q.en))) errores.push(`${donde}: predice.en «${String(q.en)}» no existe.`)
        if ((q.modo === 'arrastra' || q.modo === 'dibuja') && !q.en) errores.push(`${donde}: predecir ${q.modo} necesita en (el objeto sobre el que se predice).`)
        paso.predice = { pregunta: q.pregunta.slice(0, 300), modo: q.modo as typeof MODOS[number], ...(typeof q.en === 'string' ? { en: q.en } : {}), ...(typeof q.pista === 'string' ? { pista: q.pista.slice(0, 160) } : {}), ...(q.respuesta !== undefined ? { respuesta: q.respuesta } : {}) }
        if (typeof q.revela === 'string') { paso.predice.revela = q.revela; chars += revisarVoz(q.revela, reg, `${donde} (revela)`, errores, avisos) }
      }
    }
    if (o.luz === 'papel' || o.luz === 'noche') paso.luz = o.luz
    if (o.camara === false) paso.camara = false
    if (!paso.pon?.length && !paso.voz && !paso.predice && !paso.quita?.length) errores.push(`${donde}: vacío (pon, voz, predice o quita).`)
    nuevos.push(paso)
  })
  if (errores.length) throw new Error(`No guardé ningún paso (${errores.length} error${errores.length === 1 ? '' : 'es'}):\n- ${errores.slice(0, 30).join('\n- ')}`)
  s.pasos.push(...nuevos)
  // Cada objeto usado suma un uso (una vez por sesión): la biblioteca sabe qué se reusa.
  for (const p of nuevos) for (const e of p.pon ?? []) if (e.tipo === 'objeto') {
    const f = leerFicha(e.objeto); if (!f) continue
    const ses = new Set(f.sesiones ?? []); if (ses.has(s.id)) continue
    ses.add(s.id); f.sesiones = [...ses].slice(-50); f.usos = (f.usos ?? 0) + 1
    escribirAtomico(path.join(dirObjeto(f.id), 'ficha.json'), JSON.stringify(f, null, 2) + '\n')
  }
  guardarSesion(s)
  return { sesion: s, nuevos, avisos, segundos: Math.round(chars / 14) }
}

// ── objetos vivos: ensayo en seco ──
/** Un objeto que acepta todo: lienzo, DOM, gradientes. Cualquier llamada devuelve otro igual. */
function comodin(): unknown {
  const f = function () { return p }
  const p: unknown = new Proxy(f, {
    get: (_, k) => k === 'measureText' ? () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) : k === Symbol.toPrimitive ? () => 0 : k === 'getContext' ? () => p : k === 'then' ? undefined : (k === 'width' || k === 'height' || k === 'offsetWidth' || k === 'offsetHeight' || k === 'clientWidth' || k === 'clientHeight') ? 100 : k === 'style' || k === 'dataset' || k === 'classList' ? p : p,
    set: () => true, apply: () => p, construct: () => p as object,
  })
  return p
}
export interface Declarado { params: Record<string, { inicial: unknown; min?: number; max?: number; etiqueta?: string }>; anclas: string[]; asas: string[]; metodos: string[]; eventos: string[] }

/** Corre el objeto en una caja de arena con un `pz` de ensayo: si truena aquí, Levy lo sabe antes que Daniel. */
export function ensayar(codigo: string, ancho = 560, alto = 360): { errores: string[]; declarado: Declarado } {
  const errores: string[] = []
  const declarado: Declarado = { params: {}, anclas: [], asas: [], metodos: [], eventos: [] }
  if (/^\s*import\s|\bimport\s*\(/m.test(codigo)) errores.push('No uses import: todo lo que necesitas viene en pz (pz.ejes, pz.texto, pz.trazo, pz.color, pz.azar…).')
  if (/^\s*export\s+(?!default\b)/m.test(codigo)) errores.push('Solo se permite export default function montar(pz) { … }.')
  if (/\b(fetch|XMLHttpRequest|localStorage|indexedDB|parent\.|top\.|eval\s*\()/.test(codigo)) errores.push('El objeto corre aislado: sin red, sin almacenamiento ni acceso a la app (fetch, localStorage, parent, top, eval).')
  if (errores.length) return { errores, declarado }
  const cuerpo = /\bexport\s+default\b/.test(codigo) ? codigo.replace(/\bexport\s+default\b/, '__montar =') : `__montar = (${codigo})`
  const valores = new Map<string, unknown>()
  const dibujos: ((c: unknown, t: number) => void)[] = [], cadas: ((dt: number, t: number) => void)[] = [], anclas: [string, () => { x: number; y: number }][] = [], asas: { nombre: string; lugar: (v: unknown) => { x: number; y: number }; valorDe: (x: number, y: number) => unknown }[] = []
  const ctx = comodin()
  const sistema = (op: { x?: [number, number]; y?: [number, number] } = {}) => {
    const [u0, u1] = op.x ?? [-1, 1], [v0, v1] = op.y ?? [-1, 1]
    const s = { caja: { x: 40, y: 20, w: ancho - 80, h: alto - 56 }, u0, u1, v0, v1, x: (u: number) => 40 + ((u - u0) / (u1 - u0)) * (ancho - 80), y: (v: number) => alto - 36 - ((v - v0) / (v1 - v0)) * (alto - 56), u: (x: number) => u0 + ((x - 40) / (ancho - 80)) * (u1 - u0), v: (y: number) => v0 + ((alto - 36 - y) / (alto - 56)) * (v1 - v0), dibujar() {}, curva(_c: unknown, f: (u: number) => number) { for (let i = 0; i <= 8; i++) f(u0 + ((u1 - u0) * i) / 8) }, recta() {}, punto() {} }
    return s
  }
  const pz = {
    ancho, alto, raiz: comodin(), t: 0,
    color: { tinta: '#4a1d8f', morado: '#8C27F1', oro: '#ff9101', oroTinta: '#d97400', grafito: '#4f4e57', papel: '#f8f3ea', texto: '#1c1526', suave: 'rgba(0,0,0,.5)', tenue: 'rgba(0,0,0,.15)', hilo: '#e08a00' },
    fuente: { serif: 'Georgia, serif', sans: 'system-ui, sans-serif' },
    facil: { lineal: (t: number) => t, suave: (t: number) => t, sale: (t: number) => t, entra: (t: number) => t, entraSale: (t: number) => t, rebote: (t: number) => t },
    azar: () => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647 } },
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    lienzo: () => ctx, dibujar: (f: (c: unknown, t: number) => void) => { if (typeof f !== 'function') throw new Error('pz.dibujar recibe una función (ctx, t).'); dibujos.push(f) }, cada: (f: (dt: number, t: number) => void) => { if (typeof f !== 'function') throw new Error('pz.cada recibe una función (dt, t).'); cadas.push(f) }, redibujar: () => {},
    param: (nombre: string, inicial: unknown, op: { min?: number; max?: number; etiqueta?: string } = {}) => {
      if (typeof nombre !== 'string' || !nombre) throw new Error('pz.param(nombre, inicial, {min, max, etiqueta}).')
      if (!(nombre in declarado.params)) { declarado.params[nombre] = { inicial, ...(typeof op.min === 'number' ? { min: op.min } : {}), ...(typeof op.max === 'number' ? { max: op.max } : {}), ...(op.etiqueta ? { etiqueta: op.etiqueta } : {}) }; valores.set(nombre, inicial) }
      return { get valor() { return valores.get(nombre) }, set valor(v: unknown) { valores.set(nombre, v) }, poner: (v: unknown) => { valores.set(nombre, v); return Promise.resolve() } }
    },
    valor: (n: string) => valores.get(n), poner: (n: string, v: unknown) => { if (!valores.has(n)) throw new Error(`pz.poner: no declaraste el parámetro «${n}».`); valores.set(n, v); return Promise.resolve() },
    alCambiar: (n: string, f: unknown) => { if (typeof f !== 'function') throw new Error('pz.alCambiar(nombre, fn).') },
    ancla: (n: string, f: () => { x: number; y: number }) => { if (typeof f !== 'function') throw new Error(`pz.ancla(«${n}», () => ({x, y})).`); declarado.anclas.push(n); anclas.push([n, f]) },
    metodo: (n: string, f: unknown) => { if (typeof f !== 'function') throw new Error(`pz.metodo(«${n}», fn).`); declarado.metodos.push(n) },
    emitir: (e: string) => { if (!declarado.eventos.includes(e)) declarado.eventos.push(e) },
    mundo: () => {},
    asa: (nombre: string, o: { lugar: (v: unknown) => { x: number; y: number }; valorDe: (x: number, y: number) => unknown }) => {
      if (!valores.has(nombre)) throw new Error(`pz.asa(«${nombre}»): declara antes pz.param(«${nombre}», …).`)
      if (!o || typeof o.lugar !== 'function' || typeof o.valorDe !== 'function') throw new Error(`pz.asa(«${nombre}», { lugar: valor => ({x, y}), valorDe: (x, y) => valor }).`)
      declarado.asas.push(nombre); asas.push({ nombre, ...o })
    },
    ejes: sistema, texto: () => {}, trazo: () => {}, animar: () => Promise.resolve(),
  }
  const caja = vm.createContext({ Math, Number, String, Array, Object, JSON, Map, Set, WeakMap, Symbol, Promise, Date, Infinity, NaN, isFinite, isNaN, parseFloat, parseInt, Float32Array, Float64Array, Uint8Array, Int32Array, Uint8ClampedArray, console: { log() {}, warn() {}, error() {} }, Path2D: function () { return comodin() }, document: comodin(), window: comodin(), performance: { now: () => 0 }, requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: () => {}, __montar: undefined as unknown })
  const linea = (e: unknown) => { const m = /pizarron-objeto\.js:(\d+)/.exec(String((e as Error)?.stack ?? '')); return m ? ` (línea ${m[1]})` : '' }
  try { new vm.Script(cuerpo, { filename: 'pizarron-objeto.js' }).runInContext(caja, { timeout: 1000 }) } catch (e) { errores.push(`No compila: ${(e as Error).message}${linea(e)}`); return { errores, declarado } }
  const montar = caja.__montar
  if (typeof montar !== 'function') { errores.push('Debe ser export default function montar(pz) { … }.'); return { errores, declarado } }
  // Cada llamada corre DENTRO del contexto con su tope de tiempo: un bucle infinito del objeto no cuelga a Levy.
  const correr = (que: string, f: () => void) => { try { (caja as Record<string, unknown>).__f = f; vm.runInContext('__f()', caja, { timeout: 800 }) } catch (e) { errores.push(`${que}: ${(e as Error).message}${linea(e)}`) } }
  correr('al montar', () => { const r = (montar as (p: unknown) => unknown)(pz); if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) if (typeof v === 'function' && !declarado.metodos.includes(k)) declarado.metodos.push(k) })
  if (!errores.length) {
    for (let i = 0; i < 3; i++) cadas.forEach((f, j) => correr(`pz.cada #${j + 1}`, () => f(0.016, 0.016 * (i + 1))))
    dibujos.forEach((f, j) => correr(`pz.dibujar #${j + 1}`, () => f(ctx, 0.05)))
    for (const [n, f] of anclas) correr(`ancla «${n}»`, () => { const q = f(); if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new Error('debe devolver {x, y} numéricos (pixeles dentro del objeto).') })
    for (const a of asas) correr(`asa «${a.nombre}»`, () => {
      const q = a.lugar(valores.get(a.nombre)); if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new Error('lugar(valor) debe devolver {x, y} numéricos.')
      const v = a.valorDe(q.x + 3, q.y + 3); if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) throw new Error('valorDe(x, y) debe devolver un valor del parámetro.')
    })
  }
  return { errores, declarado }
}

export function guardarObjeto(o: Record<string, unknown>): { ficha: Ficha; nuevo: boolean; avisos: string[] } {
  if (typeof o.id !== 'string' || !ID_OBJETO.test(o.id)) throw new Error('objeto necesita id (minúsculas, números y guiones; p. ej. "pendiente-tangente").')
  if (typeof o.codigo !== 'string' || o.codigo.length < 20) throw new Error('objeto necesita codigo: export default function montar(pz) { … }.')
  if (o.codigo.length > 60_000) throw new Error('El código pasa de 60 000 caracteres: divídelo en objetos más chicos.')
  if (typeof o.nombre !== 'string' || typeof o.ensena !== 'string') throw new Error('objeto necesita nombre y ensena (qué enseña, en una frase).')
  const ancho = typeof o.ancho === 'number' ? Math.round(o.ancho) : 560, alto = typeof o.alto === 'number' ? Math.round(o.alto) : 360
  const { errores, declarado } = ensayar(o.codigo, ancho, alto)
  if (errores.length) throw new Error(`El ensayo del objeto falló; no lo guardé:\n- ${errores.slice(0, 12).join('\n- ')}`)
  const d = dirObjeto(o.id), previa = leerFicha(o.id)
  const ahora = new Date().toISOString()
  const ficha: Ficha = {
    id: o.id, nombre: o.nombre.slice(0, 80), ensena: o.ensena.slice(0, 300), ...(Array.isArray(o.temas) ? { temas: o.temas.filter((t): t is string => typeof t === 'string').slice(0, 12) } : previa?.temas ? { temas: previa.temas } : {}),
    params: declarado.params, anclas: declarado.anclas, asas: declarado.asas, metodos: declarado.metodos, eventos: [...new Set([...declarado.eventos, ...(Array.isArray(o.eventos) ? o.eventos.filter((x): x is string => typeof x === 'string') : [])])],
    ancho, alto, creado: previa?.creado ?? ahora, actualizado: ahora, usos: previa?.usos ?? 0, sesiones: previa?.sesiones ?? [],
  }
  escribirAtomico(path.join(d, 'objeto.js'), o.codigo.endsWith('\n') ? o.codigo : o.codigo + '\n')
  escribirAtomico(path.join(d, 'ficha.json'), JSON.stringify(ficha, null, 2) + '\n')
  const avisos: string[] = []
  if (!declarado.asas.length) avisos.push(`No declaró ninguna asa (pz.asa): ${DUENO} no podrá jalar nada con el dedo. Si la idea se mueve, dale un asa atada a un parámetro.`)
  if (!Object.keys(declarado.params).length) avisos.push('No declaró parámetros: la mano rápida ([[pon …]]) no podrá moverlo y la reproducción no guardará sus cambios.')
  return { ficha, nuevo: !previa, avisos }
}

// ── imágenes (Sunburst, la única) ──
const REF_IMAGEN = {
  papel: 'contenido/youtube/proyectos/2026-09-16-astra-computer-use-7-casos/visuales/prueba-didactico-3/A-grabado-claro.png',
  noche: 'contenido/youtube/assets/grabado-refs/16-luz-mapa.png',
}
const PREFIJO = {
  papel: 'Premium adult educational illustration. Match reference scientific engraving craft: fine umber crosshatching, REALISTIC solid objects with volume, perspective and materials, amber directional illumination and violet volumetric shadows, all on CLEAN LIGHT pale ivory yellow parchment that fills the canvas edge to edge. No cartoon, no thick comic outlines. Simplify composition to teach clearly; few objects, ample whitespace; no frame, no border, no logo, no watermark, no signature. If labels are listed, bold hand-lettered BLACK marker capitals, ONLY those labels, each exactly once, spelled exactly with Spanish accents; otherwise no text at all. Reference is visual style, NOT subject. ',
  noche: 'Cinematic scientific engraving, same craft as reference: fine etched crosshatching, tangible realistic solid materials, strongly directional amber-gold illumination against deep violet shadow masses and near black. One quiet magnificent visual metaphor. Shadows must be VIOLET, not brown or sepia. No text whatsoever, no letters, no numbers, no border, no logos, no UI. Reference is craft and light, NOT subject. ',
}
function referencia(luz: 'papel' | 'noche'): string | null {
  for (const base of [REPO, path.join(process.env.HOME ?? '', 'Developer/artificial-brain')]) { const f = path.join(base, REF_IMAGEN[luz]); if (existsSync(f)) return f }
  return null
}
export async function generarImagen(o: Record<string, unknown>): Promise<string> {
  const s = leerSesion(String(o.sesion ?? ''))
  if (typeof o.id !== 'string' || !ID_EL.test(o.id)) throw new Error('imagen necesita id corto (letras, números, _ o -).')
  if (typeof o.prompt !== 'string' || o.prompt.trim().length < 20) throw new Error('imagen necesita prompt: la escena concreta (objetos, relación, rótulos exactos si los hay).')
  const luz = o.luz === 'noche' ? 'noche' : 'papel', aspecto = ['16:9', '4:3', '1:1', '3:4'].includes(String(o.aspecto)) ? String(o.aspecto) : '16:9'
  const { readEnvFile } = await import('../env.js')
  const key = process.env.OPENROUTER_API_KEY || readEnvFile(['OPENROUTER_API_KEY']).OPENROUTER_API_KEY
  if (!key) throw new Error(textoFaltaLlave('OPENROUTER_API_KEY', 'Falta OPENROUTER_API_KEY en arbrain/server/.env: no hay imágenes.'))
  const ref = referencia(luz)
  const prompt = PREFIJO[luz] + o.prompt.trim()
  const cuerpo = { model: 'openai/gpt-image-2.5-sunburst', quality: 'low', aspect_ratio: aspecto, n: 1, prompt, ...(ref ? { input_references: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + readFileSync(ref).toString('base64') } }] } : {}) }
  const t0 = Date.now()
  const r = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(180_000) })
  const j = await r.json().catch(() => ({})) as { data?: { b64_json?: string }[]; usage?: { cost?: number }; error?: { message?: string } }
  const b64 = j.data?.[0]?.b64_json
  if (!r.ok || !b64) throw new Error(`Sunburst no devolvió imagen (${r.status}${j.error?.message ? `: ${j.error.message}` : ''}). No hay respaldo con otro modelo.`)
  const dir = path.join(dirSesion(s.id), 'imagenes'); mkdirSync(dir, { recursive: true })
  const png = path.join(dir, `${o.id}.png`), jpg = path.join(dir, `${o.id}.jpg`)
  const raw = Buffer.from(b64, 'base64'); writeFileSync(png, raw)
  let ancho = raw.readUInt32BE(16), alto = raw.readUInt32BE(20)
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '--resampleWidth', '1400', png, '--out', jpg], { stdio: 'ignore' })
    alto = Math.round((alto * 1400) / ancho); ancho = 1400
  } catch { writeFileSync(jpg, raw) }
  const costo = j.usage?.cost
  writeFileSync(path.join(dir, `${o.id}.json`), JSON.stringify({ model: cuerpo.model, quality: 'low', aspect_ratio: aspecto, prompt, referencia: ref, usage: j.usage ?? null, segundos: Math.round((Date.now() - t0) / 100) / 10 }, null, 2) + '\n')
  const fresca = leerSesion(s.id)
  fresca.imagenes = { ...(fresca.imagenes ?? {}), [o.id]: { archivo: `${o.id}.jpg`, ancho, alto, prompt: o.prompt.trim().slice(0, 400) } }
  guardarSesion(fresca)
  return `Imagen «${o.id}» lista en ${Math.round((Date.now() - t0) / 1000)} s (Sunburst low${typeof costo === 'number' ? `, costo US$${costo.toFixed(4)}` : ', costo no reportado'}). Úsala en un paso: {tipo:"imagen", id:"…", imagen:"${o.id}", pie:"…"}.`
}

// ── leer lo que hizo el alumno ──
interface EventoCrudo { t: string; tipo: string; [k: string]: unknown }
function eventos(id: string): EventoCrudo[] {
  const f = path.join(dirSesion(id), 'eventos.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) as EventoCrudo } catch { return null } }).filter((x): x is EventoCrudo => !!x)
}
export function leerAlumno(id: string, { todo = false } = {}): { text: string; imagenes: { data: string; mimeType: string }[] } {
  const s = leerSesion(id), ev = eventos(id)
  const cursorF = path.join(dirSesion(id), '.leido')
  const desde = todo ? 0 : Number(existsSync(cursorF) ? readFileSync(cursorF, 'utf8') : 0) || 0
  const nuevos = ev.slice(desde)
  writeFileSync(cursorF, String(ev.length))
  const fin = new Set(ev.filter(e => e.tipo === 'fin-paso').map(e => e.paso as string))
  const ini = ev.filter(e => e.tipo === 'inicio-paso').map(e => e.paso as string)
  const enCurso = ini.filter(p => !fin.has(p)).pop()
  const lineas: string[] = [`Sesión «${s.tema}» (${s.id}): ${s.pasos.length} pasos escritos, ${fin.size} ya vistos por ${DUENO}${enCurso ? `, sonando ahora: ${enCurso}` : ''}${s.pasos.length > fin.size && !enCurso ? ' (la app no los ha reproducido: ¿tiene el panel abierto?)' : ''}.`]
  if (!ev.length) lineas.push('Todavía no hay eventos de la app: nadie ha abierto esta sesión en el panel.')
  const imagenes: { data: string; mimeType: string }[] = []
  const params = new Map<string, { n: number; primero: unknown; ultimo: unknown }>(), evs = new Map<string, { n: number; datos: unknown }>()
  let trazosLibres = 0
  for (const e of nuevos) {
    if (e.tipo === 'respuesta') {
      lineas.push(`PREDICCIÓN en ${e.paso} (${e.modo}): ${JSON.stringify(e.valor)}`)
      const p = s.pasos.find(x => x.id === e.paso)
      if (p?.predice?.respuesta !== undefined) lineas.push(`  la respuesta correcta que dejaste: ${JSON.stringify(p.predice.respuesta)}`)
      if (typeof e.foto === 'string' && imagenes.length < 2) { try { imagenes.push({ data: readFileSync(path.join(dirSesion(id), e.foto)).toString('base64'), mimeType: 'image/png' }); lineas.push('  (abajo va la foto del objeto con su lápiz encima)') } catch { /* sin foto */ } }
    } else if (e.tipo === 'mensaje') lineas.push(`DIJO desde el pizarrón: «${e.texto}»`)
    else if (e.tipo === 'error') lineas.push(`ERROR en el escenario (${e.donde}): ${e.mensaje}`)
    else if (e.tipo === 'gesto') {
      const g = e.gesto as { tipo: string; el?: string; param?: string; valor?: unknown; evento?: string; datos?: unknown; pred?: string | null }
      if (g.tipo === 'param') { const k = `${g.el}.${g.param}`, x = params.get(k); if (x) { x.n++; x.ultimo = g.valor } else params.set(k, { n: 1, primero: g.valor, ultimo: g.valor }) }
      else if (g.tipo === 'evento') { const k = `${g.el}:${g.evento}`, x = evs.get(k); if (x) { x.n++; x.datos = g.datos } else evs.set(k, { n: 1, datos: g.datos }) }
      else if (g.tipo === 'trazo' && !g.pred) trazosLibres++
    }
  }
  for (const [k, x] of params) lineas.push(`MOVIÓ ${k}: ${x.n} cambio(s), de ${fmt(x.primero)} a ${fmt(x.ultimo)}`)
  for (const [k, x] of evs) lineas.push(`EVENTO ${k} ×${x.n}${x.datos != null ? `, último: ${JSON.stringify(x.datos).slice(0, 200)}` : ''}`)
  if (trazosLibres) lineas.push(`DIBUJÓ ${trazosLibres} trazo(s) libres con su lápiz.`)
  if (nuevos.length && lineas.length === 1) lineas.push('Sin gestos nuevos desde la última lectura (solo avanzó la reproducción).')
  const declarados = new Map<string, EventoCrudo>(); for (const e of ev) if (e.tipo === 'declarado') declarados.set(e.el as string, e)
  if (declarados.size) lineas.push(`Objetos montados: ${[...declarados.values()].map(d => `${d.el} (${d.objeto}: params ${(d.params as string[]).join('/') || '—'}, anclas ${(d.anclas as string[]).join('/') || '—'})`).join(' · ')}`)
  return { text: lineas.join('\n'), imagenes }
}
const fmt = (v: unknown) => typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v)

// ── escribir de vuelta ──
export function escribirDeVuelta(o: Record<string, unknown>): string {
  const s = leerSesion(String(o.sesion ?? ''))
  const lista = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 400)).slice(0, 12) : []
  const entendido = lista(o.entendido)
  if (!entendido.length) throw new Error(`escribir necesita entendido: la lista de lo que ${DUENO} entendió, en su marco (no lo que tú explicaste).`)
  const palabras = typeof o.palabras === 'string' ? o.palabras.trim().slice(0, 1200) : ''
  const domina = lista(o.domina), fragil = lista(o.fragil), siguiente = typeof o.siguiente === 'string' ? o.siguiente.trim().slice(0, 300) : ''
  const fecha = fechaLarga()
  const bloque = [
    `<!-- pizarron:${s.id} · lo escribe el pizarrón; se reemplaza entero si esta sesión vuelve a cerrarse -->`,
    `## Lo que entendí en el pizarrón · ${fecha}`, '',
    ...(palabras ? [`> «${palabras.replace(/\n+/g, ' ')}»`, ''] : []),
    ...entendido.map(x => `- ${x}`), '',
    ...(domina.length ? [`**Ya lo domino:** ${domina.join('; ')}.`] : []),
    ...(fragil.length ? [`**Todavía frágil:** ${fragil.join('; ')}.`] : []),
    ...(siguiente ? [`**Siguiente paso:** ${siguiente}`] : []),
    `<!-- /pizarron:${s.id} -->`,
  ].join('\n')
  const escritos: string[] = []
  const poner = (f: string, encabezado: string) => {
    const previo = existsSync(f) ? readFileSync(f, 'utf8') : encabezado
    const re = new RegExp(`<!-- pizarron:${s.id}[\\s\\S]*?<!-- /pizarron:${s.id} -->`)
    const nuevo = re.test(previo) ? previo.replace(re, bloque) : `${previo.replace(/\s*$/, '')}\n\n${bloque}\n`
    escribirAtomico(f, nuevo); escritos.push(path.relative(REPO, f).startsWith('..') ? f : path.relative(REPO, f))
  }
  // El documento: si es .md, el bloque va al final (solo ese bloque es del pizarrón); si es HTML u otro, al lado.
  const doc = s.documento ? resolverDoc(s.documento) : null
  if (doc && /\.(md|markdown)$/i.test(doc)) poner(doc, '')
  else if (doc) poner(path.join(path.dirname(doc), 'APRENDIDO.md'), `# Lo aprendido en el pizarrón sobre «${path.basename(path.dirname(doc))}»\n\nCada sesión del pizarrón que recorre este documento deja aquí lo que ${DUENO} entendió, con sus palabras.\n`)
  else poner(path.join(dirSesion(s.id), 'APRENDIDO.md'), `# ${s.tema}\n`)
  // El mapa del alumno: lo que domina, por tema. Cada sesión empieza un paso más allá de aquí.
  const mapa = path.join(RAIZ(), 'alumnos', `${s.alumno}.md`)
  const previo = existsSync(mapa) ? readFileSync(mapa, 'utf8') : `# Lo que ${s.alumno === PERSONA_DUENO ? DUENO_M : s.alumno} ya domina\n\nLo escribe el pizarrón al cerrar cada sesión. Levy lo lee al abrir la siguiente para empezar un paso más allá. ${DUENO_M} puede corregirlo a mano.\n`
  const entrada = `- ${fecha} · [${s.id}](../sesiones/${s.id}/sesion.json) · ${domina.length ? `domina: ${domina.join('; ')}` : `entendió: ${entendido.slice(0, 3).join('; ')}`}${fragil.length ? ` · frágil: ${fragil.join('; ')}` : ''}${siguiente ? ` · siguiente: ${siguiente}` : ''}`
  const titulo = `## ${s.tema}`
  // Volver a cerrar la misma sesión reemplaza su renglón (no lo duplica); lo más nuevo va arriba.
  const sinEsta = previo.split('\n').filter(l => !l.includes(`](../sesiones/${s.id}/`)).join('\n')
  const nuevo = sinEsta.includes(`\n${titulo}\n`) ? sinEsta.replace(`\n${titulo}\n`, `\n${titulo}\n${entrada}\n`) : `${sinEsta.replace(/\s*$/, '')}\n\n${titulo}\n${entrada}\n`
  escribirAtomico(mapa, nuevo); escritos.push(path.relative(REPO, mapa))
  const fresca = leerSesion(s.id)
  fresca.cierre = { en: new Date().toISOString(), entendido, ...(palabras ? { palabras } : {}), escritoEn: escritos }
  guardarSesion(fresca)
  return `Escrito de vuelta en ${escritos.join(' y ')}. En el pizarrón, el lápiz de ${DUENO} se vuelve tinta. Díselo en una línea; no repitas la lista.`
}

/** Lo que el alumno ya domina de un tema (o todo, si es corto): la primera lectura de cada sesión. */
export function mapaDelAlumno(alumno: string, tema: string): string {
  const f = path.join(RAIZ(), 'alumnos', `${alumno}.md`)
  if (!existsSync(f)) return `Sin mapa todavía: es la primera sesión de ${alumno}. Pregunta qué sabe antes de explicar.`
  const t = readFileSync(f, 'utf8')
  const palabras = slug(tema).split('-').filter(p => p.length > 3)
  const secciones = t.split(/\n(?=## )/).filter(x => x.startsWith('## '))
  const afines = secciones.filter(x => palabras.some(p => slug(x).includes(p)))
  if (afines.length) return afines.join('\n').slice(0, 2500)
  return `Nada de «${tema}» en su mapa. Temas que ya trabajó: ${secciones.map(x => x.split('\n')[0].slice(3)).join(' · ') || 'ninguno'}.`
}

export function describirBiblioteca(buscar?: string): string {
  const todas = fichas()
  const q = buscar ? slug(buscar).split('-').filter(Boolean) : []
  const elegidas = q.length ? todas.filter(f => q.some(p => slug(`${f.id} ${f.nombre} ${f.ensena} ${(f.temas ?? []).join(' ')}`).includes(p))) : todas
  if (!todas.length) return 'La biblioteca está vacía: el primer objeto que fabriques inaugura la biblioteca.'
  if (!elegidas.length) return `Nada para «${buscar}» entre ${todas.length} objetos. Fabrica uno nuevo con accion:"objeto".`
  return elegidas.sort((a, b) => (b.usos ?? 0) - (a.usos ?? 0)).map(f => `· ${f.id} — ${f.nombre}: ${f.ensena} [${f.ancho}×${f.alto}; params ${Object.entries(f.params ?? {}).map(([k, p]) => `${k}=${fmt(p.inicial)}${p.min !== undefined ? `(${p.min}…${p.max})` : ''}`).join(', ') || '—'}; asas ${f.asas?.join(', ') || '—'}; anclas ${f.anclas?.join(', ') || '—'}; métodos ${f.metodos?.join(', ') || '—'}; eventos ${f.eventos?.join(', ') || '—'}; usos ${f.usos ?? 0}]`).join('\n')
}

export function oficio(): string {
  const f = path.join(RAIZ(), 'OFICIO.md')
  return existsSync(f) ? readFileSync(f, 'utf8') : 'Lee docs/pizarron/OFICIO.md.'
}

export function resumenPasos(nuevos: Paso[]): string {
  return nuevos.map(p => `${p.id}${p.pon?.length ? ` +${p.pon.map(e => e.id).join(',')}` : ''}${p.predice ? ' [predice]' : ''}`).join(' · ')
}
