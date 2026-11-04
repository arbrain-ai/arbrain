/**
 * Bandeja de decisiones única (autonomía v2, firmada el 3 nov 2026).
 *
 * Una tarjeta por decisión, con la recomendación de Levy y tres botones: Sí · No · Otro. Llegan dos tipos, a la misma
 * tabla (`confirmaciones`, cliente/confirmaciones.ts) y a la misma bandeja:
 *   - acciones de manos que el freno detuvo por irreversibles (contactar, pagar, borrar, publicar): el Sí reemplaza a la
 *     cita textual; la acción sale en cuanto la persona toca (o, si tardó, cuando Levy la repite);
 *   - decisiones que Levy sube él mismo (un mensaje a un fundador, una compra): `POST /decisiones/pedir`. Nacen en la
 *     cola, avisan al teléfono, y su respuesta vuelve a la conversación de Levy.
 * Si la persona no contesta, nada irreversible sale: una tarjeta abierta nunca ejecuta.
 *
 * En la instalación original esto antes no existía (el freno pedía la frase exacta). Aquí vive su parte del daemon: la
 * tienda, el secreto que separa «pedir» (cualquier agente con el token) de «decidir» (solo la web de la persona), las
 * rutas, el push y la vuelta a la conversación. En la edición cliente la tienda y el secreto ya existían (I8): estas
 * rutas solo agregan la vista única, la política y la métrica.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { DIR_ARBRAIN, esEdicionCliente } from '../edicion.js'
import { diaCivil, instanteDeHoraCivil, zonaDueno } from '../zona.js'
import { pedidoManos, VIDA_COLA_MS, vistaParaPase, type CategoriaConfirmacion, type Confirmacion, type Confirmaciones, type ConversacionConfirmacion } from '../cliente/confirmaciones.js'
import { archivoLegible, CLASES, DIR_HECHO_SOLO, esClase, esModo, esPreset, fijarPolitica, INFO_CLASE, INFO_PRESET, NOMBRE_PRESET, PRESETS, politicaVigente, SIEMPRE_SUYO, type Clase, type HechoSolo, type Modo } from './politica.js'

// ---------- El secreto de decidir (instalación original) ----------

/**
 * Quién puede DECIDIR: solo la web de la persona (su sesión en la app o en el teléfono). Los agentes tienen el token del
 * daemon para pedir y consultar; aprobar exige además este secreto, que el daemon crea al arrancar (0600) y que solo la
 * web lee. En la edición cliente manda el secreto de la app (cliente/secreto.ts), que vive en memoria.
 */
export const RUTA_SECRETO_DECIDIR = () => process.env.ARBRAIN_SECRETO_DECIDIR_ARCHIVO || join(DIR_ARBRAIN(), 'autonomia', 'secreto-decidir')
let secretoCache: string | null = null
export function asegurarSecretoDecidir(): string {
  const ruta = RUTA_SECRETO_DECIDIR()
  try { const s = readFileSync(ruta, 'utf8').trim(); if (s.length >= 32) return (secretoCache = s) } catch { /* se crea */ }
  const s = randomBytes(32).toString('hex')
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  writeFileSync(ruta, s + '\n', { mode: 0o600 })
  return (secretoCache = s)
}
export function secretoDecidirValido(dado: unknown): boolean {
  const s = secretoCache ?? (existsSync(RUTA_SECRETO_DECIDIR()) ? asegurarSecretoDecidir() : '')
  if (!s || typeof dado !== 'string' || dado.length !== s.length) return false
  return timingSafeEqual(Buffer.from(dado), Buffer.from(s))
}

// ---------- De la sesión de Claude a la conversación ----------

/**
 * El proceso de manos de la instalación original nace del `.mcp.json` del proyecto: no sabe su conversación, pero sí su
 * sesión de Claude (`CLAUDE_CODE_SESSION_ID`). El journal del chat la liga a la conversación de la app.
 */
export function scopeDeSesion(db: Database.Database, sesion: unknown): ConversacionConfirmacion | null {
  if (typeof sesion !== 'string' || !/^[0-9a-f-]{36}$/i.test(sesion)) return null
  try {
    const f = db.prepare(`SELECT owner, account, conversation_id FROM chat_runtime_turns WHERE native_thread_id = ? ORDER BY updated_at DESC LIMIT 1`).get(sesion) as { owner: string; account: string; conversation_id: string } | undefined
    return f ? { owner: f.owner, account: f.account, conversationId: f.conversation_id } : null
  } catch { return null }
}

// ---------- Lo que hice solo ----------

export function leerHechoSolo(dia: string): HechoSolo[] {
  try {
    return readFileSync(join(DIR_HECHO_SOLO(), `${dia}.jsonl`), 'utf8').split('\n').filter(Boolean).flatMap(l => { try { const h = JSON.parse(l) as HechoSolo; return h && esClase(h.clase) && typeof h.que === 'string' ? [h] : [] } catch { return [] } })
  } catch { return [] }
}

// ---------- Día civil ----------

export function ventanaDelDia(dia: string, zona = zonaDueno()): { desde: number; hasta: number } {
  const desde = instanteDeHoraCivil(dia, 0, 0, zona)
  const siguiente = diaCivil(desde + 36 * 3_600_000, zona)
  return { desde, hasta: instanteDeHoraCivil(siguiente, 0, 0, zona) }
}
const diaAnterior = (dia: string, zona = zonaDueno()) => diaCivil(ventanaDelDia(dia, zona).desde - 12 * 3_600_000, zona)

// ---------- Vista de la bandeja ----------

/** Lo que la bandeja muestra de una tarjeta (sin el literal completo si no hace falta: lo trae `detalle`). */
export interface TarjetaBandeja {
  id: string; estado: Confirmacion['estado']; tipo: Confirmacion['tipo']; categoria: CategoriaConfirmacion; origen: Confirmacion['origen']
  titulo: string; recomendacion?: string; recomienda?: 'si' | 'no'; detalle?: string; literal?: string; botonSi?: string
  creada: number; resuelta?: number; respuesta?: Confirmacion['respuesta']; comentario?: string
  /** Una tarjeta del freno de manos o de la guardia: lo irreversible que Levy quiere hacer. */
  irreversible: boolean
  /** Quién la subió, si no fue Levy en una conversación: «Loop · Cobranza pendiente» (cliente/loops.ts). */
  de?: string
  /** Atada a una hora (3 nov 2026): a partir de aquí ya no aplica y vence sola. Ausente = la vida normal de la cola. */
  vence?: number
  /** Contactar personas o pagar: nunca va en «Sí a todas», una por una. */
  unaPorUna?: boolean
}
/** Lo que nunca se aprueba en lote (3 nov 2026, Daniel vio un «Sí a las 6» que incluía contactar personas). */
export const UNA_POR_UNA: readonly CategoriaConfirmacion[] = ['enviar', 'pagar']
export function tarjeta(c: Confirmacion): TarjetaBandeja {
  return {
    id: c.id, estado: c.estado, tipo: c.tipo, categoria: c.categoria, origen: c.origen,
    titulo: (c.titulo || c.frase || c.resumen).replace(/\s+/g, ' ').slice(0, 200),
    ...(c.recomendacion ? { recomendacion: c.recomendacion } : {}), ...(c.recomienda ? { recomienda: c.recomienda } : {}),
    ...(c.detalle ? { detalle: c.detalle } : {}), ...(c.literal && c.tipo !== 'decision' ? { literal: c.literal.slice(0, 1200) } : {}),
    ...(c.botonSi ? { botonSi: c.botonSi } : {}),
    creada: c.creada, ...(c.resuelta ? { resuelta: c.resuelta } : {}), ...(c.respuesta ? { respuesta: c.respuesta } : {}), ...(c.comentario ? { comentario: c.comentario } : {}),
    irreversible: c.categoria !== 'otra',
    ...(c.origen === 'cron' && c.tipo === 'decision' && c.resumen.startsWith('Loop · ') ? { de: c.resumen } : {}),
    ...((c.estado === 'pendiente' || c.estado === 'en_cola') && c.tipo === 'decision' && c.expira < c.creada + VIDA_COLA_MS - 60_000 ? { vence: c.expira } : {}),
    ...(UNA_POR_UNA.includes(c.categoria) ? { unaPorUna: true } : {}),
  }
}

export function politicaParaLaApp() {
  const p = politicaVigente()
  return {
    preset: p.preset, ajustes: p.ajustes, vigente: p.vigente,
    presets: PRESETS.map(id => ({ id, nombre: NOMBRE_PRESET[id], que: INFO_PRESET[id] })),
    clases: CLASES.map(id => ({ id, ...INFO_CLASE[id], modo: p.vigente[id] })),
    siempreTuyo: SIEMPRE_SUYO,
  }
}

export function vistaBandeja(store: Confirmaciones, ahora = Date.now()) {
  const hoy = diaCivil(ahora), ayer = diaAnterior(hoy)
  const vHoy = ventanaDelDia(hoy), vAyer = ventanaDelDia(ayer)
  const abiertas = store.pendientes().filter(c => c.estado === 'pendiente' || c.estado === 'en_cola')
  return {
    // En orden: la más vieja primero (la que más lleva esperando).
    pendientes: abiertas.sort((a, b) => a.creada - b.creada).map(tarjeta),
    decididasHoy: store.resueltasDesde(vHoy.desde).filter(c => c.estado !== 'vencida' && c.estado !== 'corrida').map(tarjeta),
    // Las decisiones que vencieron hoy sin respuesta (su hora pasó): «ya no aplica», en el historial; nunca se ejecutan.
    vencidasHoy: store.resueltasDesde(vHoy.desde).filter(c => c.estado === 'vencida' && c.tipo === 'decision').map(tarjeta),
    espera: { hoy: { dia: hoy, ...store.esperaEntre(vHoy.desde, Math.min(vHoy.hasta, ahora)) }, ayer: { dia: ayer, ...store.esperaEntre(vAyer.desde, vAyer.hasta) } },
    hechoSolo: { hoy: leerHechoSolo(hoy).reverse(), ayer: leerHechoSolo(ayer).reverse() },
    politica: politicaParaLaApp(),
  }
}

// ---------- Rutas ----------

export interface DepsBandeja {
  store: () => Confirmaciones | null
  /** ¿La petición trae el secreto de la web de la persona? */
  puedeDecidir: () => boolean
  /** ¿La petición viene con el pase de agente (edición cliente)? */
  conPase: boolean
  /** Base del daemon (para ligar sesión → conversación). */
  db?: () => Database.Database
  /** Deshacer: lleva el pedido a la conversación donde se hizo (si se sabe). */
  deshacer?: (h: HechoSolo, scope: ConversacionConfirmacion) => void
  /** Bitácora del cambio de política. */
  registrar?: (e: Record<string, unknown>) => void
  enviar: (status: number, cuerpo: unknown) => void
}

const CATEGORIAS: readonly CategoriaConfirmacion[] = ['enviar', 'pagar', 'borrar', 'publicar', 'otra']
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const scopeValido = (v: unknown): ConversacionConfirmacion | null => {
  const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return typeof s.owner === 'string' && typeof s.account === 'string' && typeof s.conversationId === 'string' && s.conversationId ? { owner: s.owner, account: s.account, conversationId: s.conversationId } : null
}

/** Las rutas de la bandeja (las dos ediciones) y, en la original, las de confirmación que usan las manos. */
export async function rutasBandeja(metodo: string, ruta: string, cuerpo: Record<string, unknown>, d: DepsBandeja): Promise<boolean> {
  const original = !esEdicionCliente()
  const esBandeja = ruta === '/decisiones' || ruta.startsWith('/decisiones/') || ruta.startsWith('/autonomia/')
  const esManos = original && (ruta === '/confirmaciones' || ruta.startsWith('/confirmaciones/'))
  if (!esBandeja && !esManos) return false
  // El pase de agente (cliente) no abre la bandeja: la ve y la decide la persona.
  if (d.conPase) { d.enviar(403, { error: 'Solo la app puede usar esta ruta.' }); return true }
  const store = d.store()

  if (ruta === '/autonomia/politica') {
    if (metodo === 'GET') { d.enviar(200, politicaParaLaApp()); return true }
    if (metodo === 'POST') {
      // Un agente no cambia su propia autonomía: solo la persona, desde su app.
      if (!d.puedeDecidir()) { d.enviar(403, { error: 'Solo tú, desde Arbrain, cambias la política de autonomía.' }); return true }
      if (!esPreset(cuerpo.preset)) { d.enviar(400, { error: `preset: ${PRESETS.join(', ')}` }); return true }
      const ajustes: Partial<Record<Clase, Modo>> = {}
      for (const [c, m] of Object.entries((cuerpo.ajustes ?? {}) as Record<string, unknown>)) if (esClase(c) && esModo(m)) ajustes[c] = m
      fijarPolitica(cuerpo.preset, ajustes, 'app')
      d.registrar?.({ evento: 'politica_autonomia', preset: cuerpo.preset, ajustes })
      d.enviar(200, politicaParaLaApp())
      return true
    }
  }
  if (!store) { d.enviar(503, { error: 'La bandeja no está iniciada.' }); return true }

  if (metodo === 'GET' && ruta === '/decisiones') { d.enviar(200, vistaBandeja(store)); return true }

  if (metodo === 'POST' && (ruta === '/decisiones/resolver' || ruta === '/decisiones/lote')) {
    if (!d.puedeDecidir()) { d.enviar(403, { error: 'Solo tú decides, desde Arbrain o tu teléfono.' }); return true }
    const respuesta = cuerpo.respuesta
    if (respuesta !== 'si' && respuesta !== 'no' && respuesta !== 'otro') { d.enviar(400, { error: 'respuesta: si, no u otro' }); return true }
    const decision = respuesta === 'si' ? 'permitir' : respuesta === 'no' ? 'rechazar' : 'otro'
    const ids = ruta === '/decisiones/lote' ? (Array.isArray(cuerpo.ids) ? cuerpo.ids : []).filter((x): x is string => typeof x === 'string' && /^cf_[0-9a-f]{12}$/.test(x)).slice(0, 50) : [String(cuerpo.id ?? '')]
    if (!ids.length || (ruta === '/decisiones/lote' && respuesta === 'otro')) { d.enviar(400, { error: ruta === '/decisiones/lote' ? 'ids requeridos; «Otro» va de una en una.' : 'id requerido' }); return true }
    const hechas: TarjetaBandeja[] = [], errores: { id: string; error: string }[] = []
    for (const id of ids) {
      const c = store.get(id)
      // «Córrelo tú» (tipo manos) no se aprueba desde la bandeja: lo corre la persona en su terminal (la tarjeta del hilo).
      if (c?.tipo === 'manos' && respuesta === 'si') { errores.push({ id, error: 'Esto lo corres tú desde su tarjeta en el chat.' }); continue }
      // «Sí a todas» nunca contacta personas ni paga: esas van una por una (el lote las rechaza aunque la app las mande).
      if (ruta === '/decisiones/lote' && respuesta === 'si' && c && UNA_POR_UNA.includes(c.categoria)) { errores.push({ id, error: 'Contactar y pagar van una por una.' }); continue }
      const r = store.resolver(id, decision, { comentario: cuerpo.comentario })
      if (r.ok) hechas.push(tarjeta(r.confirmacion)); else errores.push({ id, error: r.error })
    }
    d.enviar(hechas.length || !errores.length ? 200 : 409, ruta === '/decisiones/lote' ? { hechas, errores } : hechas[0] ?? { error: errores[0]?.error })
    return true
  }

  if (metodo === 'POST' && ruta === '/decisiones/pedir') {
    // Levy sube una decisión suya (un agente con el token). Nace en la cola: nadie la espera en el momento.
    const titulo = texto(cuerpo.titulo, 160)
    if (!titulo) { d.enviar(400, { error: 'titulo requerido (la decisión en una línea).' }); return true }
    const categoria = CATEGORIAS.includes(cuerpo.categoria as CategoriaConfirmacion) ? cuerpo.categoria as CategoriaConfirmacion : 'otra'
    const scope = scopeValido(cuerpo.conversacion) ?? (d.db ? scopeDeSesion(d.db(), cuerpo.sesion) : null)
    const detalle = typeof cuerpo.detalle === 'string' ? cuerpo.detalle.slice(0, 2000) : undefined
    const expira = cuerpo.expira == null || cuerpo.expira === '' ? null : expiraDe(cuerpo.expira)
    if (expira === undefined) { d.enviar(400, { error: 'expira: «HH:MM» de hoy, una fecha ISO («2026-11-04T13:00») o milisegundos, en el futuro.' }); return true }
    const c = store.pedir({
      origen: 'agente', tipo: 'decision', categoria, creadaPor: 'peticion', enCola: true,
      titulo, resumen: titulo, ...(detalle ? { detalle } : {}),
      recomendacion: texto(cuerpo.recomendacion, 600) || undefined,
      recomienda: cuerpo.recomienda === 'si' || cuerpo.recomienda === 'no' ? cuerpo.recomienda : undefined,
      // La misma decisión (mismo título y conversación) se actualiza en su lugar en vez de apilarse.
      huella: `decision:${createHashCorta(JSON.stringify([titulo, scope?.conversationId ?? cuerpo.sesion ?? '']))}`,
      ...(scope ? { conversacion: scope } : {}), ...(typeof cuerpo.sesion === 'string' ? { sesion: cuerpo.sesion } : {}),
      ...(expira ? { expira } : {}),
    })
    d.enviar(200, { id: c.id, estado: c.estado, conversacion: !!scope, ...(expira ? { vence: c.expira } : {}) })
    return true
  }

  if (metodo === 'POST' && ruta === '/decisiones/usar') {
    // El puente del Sí con las manos: una decisión aprobada autoriza acciones de su categoría (tope y vida en la tienda).
    const id = typeof cuerpo.id === 'string' && /^cf_[0-9a-f]{12}$/.test(cuerpo.id) ? cuerpo.id : ''
    const categoria = CATEGORIAS.includes(cuerpo.categoria as CategoriaConfirmacion) ? cuerpo.categoria as CategoriaConfirmacion : 'otra'
    const c = id ? store.usarDecision(id, categoria) : null
    d.enviar(200, c ? { ok: true, id: c.id, usos: c.usos } : { ok: false })
    return true
  }

  if (metodo === 'POST' && ruta === '/autonomia/deshacer') {
    if (!d.puedeDecidir()) { d.enviar(403, { error: 'Solo tú pides deshacer, desde Arbrain.' }); return true }
    const dia = typeof cuerpo.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.dia) ? cuerpo.dia : diaCivil(Date.now())
    const h = leerHechoSolo(dia).find(x => x.ts === cuerpo.ts)
    const scope = h ? scopeValido(h.conversacion) ?? (d.db && h.sesion ? scopeDeSesion(d.db(), h.sesion) : null) : null
    if (!h) { d.enviar(404, { error: 'No encontré esa acción.' }); return true }
    if (!scope || !d.deshacer) { d.enviar(409, { error: h.deshacer ? `Deshazlo así: ${h.deshacer}.` : 'Esta acción no sabe deshacerse sola.' }); return true }
    d.deshacer(h, scope)
    d.enviar(200, { ok: true })
    return true
  }

  const m = ruta.match(/^\/decisiones\/(cf_[0-9a-f]{12})$/)
  if (metodo === 'GET' && m) { const c = store.get(m[1]); d.enviar(c ? 200 : 404, c ? tarjeta(c) : { error: 'No existe esa decisión.' }); return true }

  // ---- Instalación original: lo que el MCP de manos pide (en el alumno vive en las rutas del cliente) ----
  if (esManos) {
    if (metodo === 'POST' && (ruta === '/confirmaciones/pedir' || ruta === '/confirmaciones/consumir')) {
      const p = pedidoManos(cuerpo)
      if ('error' in p) { d.enviar(p.status, { error: p.error }); return true }
      if (ruta === '/confirmaciones/consumir') { d.enviar(200, { ok: store.consumir(p.huella) }); return true }
      const scope = d.db ? scopeDeSesion(d.db(), cuerpo.sesion) : null
      const recomendacion = texto(cuerpo.recomendacion, 600)
      d.enviar(200, store.pedir({ origen: 'manos', categoria: p.categoria, resumen: p.resumen, detalle: p.detalle, literal: p.literal, herramienta: p.herramienta, huella: p.huella, creadaPor: 'peticion', ...(texto(cuerpo.titulo, 160) ? { titulo: texto(cuerpo.titulo, 160) } : {}), ...(recomendacion ? { recomendacion, recomienda: 'si' as const } : {}), ...(scope ? { conversacion: scope } : {}), ...(typeof cuerpo.sesion === 'string' ? { sesion: cuerpo.sesion.slice(0, 60) } : {}) }))
      return true
    }
    if (metodo === 'POST' && ruta === '/confirmaciones/encolar') {
      const id = typeof cuerpo.id === 'string' && /^cf_[0-9a-f]{12}$/.test(cuerpo.id) ? cuerpo.id : null
      const c = id ? store.get(id) : null
      if (!c || c.origen !== 'manos') { d.enviar(404, { error: 'No existe esa confirmación de manos.' }); return true }
      d.enviar(200, store.encolar(id!) ?? c)
      return true
    }
    const mc = ruta.match(/^\/confirmaciones\/(cf_[0-9a-f]{12})$/)
    if (metodo === 'GET' && mc) { const v = vistaParaPase(store.get(mc[1])); d.enviar(v ? 200 : 404, v ?? { error: 'No existe esa confirmación.' }); return true }
    if (metodo === 'GET' && ruta === '/confirmaciones') { d.enviar(200, { pendientes: store.pendientes(), terminadas: store.terminadas() }); return true }
  }
  d.enviar(404, { error: 'Ruta desconocida.' })
  return true
}

/**
 * Cuándo deja de aplicar una decisión atada a una hora (3 nov 2026: una llamada de «hoy a la 1 pm» seguía en la bandeja cuando ya
 * pasó). «13:00» = hoy a esa hora del dueño; «2026-11-04T13:00» (sin zona) = esa hora civil del dueño; con zona o en ms, tal cual.
 * Devuelve undefined si no se entiende o ya pasó.
 */
export function expiraDe(v: unknown, ahora = Date.now(), zona = zonaDueno()): number | undefined {
  let t: number | undefined
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{12,}$/.test(v.trim()))) t = Number(v)
  else if (typeof v === 'string') {
    const s = v.trim(), hhmm = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s), civil = /^(\d{4}-\d{2}-\d{2})[T ]([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/.exec(s)
    if (hhmm) t = instanteDeHoraCivil(diaCivil(ahora, zona), Number(hhmm[1]), Number(hhmm[2]), zona)
    else if (civil) t = instanteDeHoraCivil(civil[1], Number(civil[2]), Number(civil[3]), zona)
    else if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) t = Date.parse(s)
  }
  return t !== undefined && Number.isFinite(t) && t > ahora ? t : undefined
}

const createHashCorta = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)

// ---------- Push al teléfono ----------

const VERBO: Record<CategoriaConfirmacion, string> = { enviar: 'contactar a alguien', pagar: 'pagar', borrar: 'borrar', publicar: 'publicar', otra: 'decidir algo' }
/** El aviso de una tarjeta nueva: qué es, qué recomienda Levy y que sin su toque no sale. */
export function avisoDeTarjeta(c: Confirmacion): { title: string; body: string } {
  const que = (c.titulo || c.frase || c.resumen).replace(/\s+/g, ' ').slice(0, 140)
  const rec = c.recomendacion ? ` Levy recomienda ${c.recomienda === 'no' ? 'NO' : 'Sí'}: ${c.recomendacion.replace(/\s+/g, ' ').slice(0, 100)}` : ''
  return { title: `Levy espera tu toque: ${VERBO[c.categoria]}`.slice(0, 120), body: `${que}.${rec} Sin tu toque no sale.`.slice(0, 300) }
}

/** La página del teléfono donde se decide (`arbrain/src/app/(main)/telefono/decisiones`). */
export const RUTA_TELEFONO_DECISIONES = '/telefono/decisiones'

type Enviar = (url: string, init: RequestInit) => Promise<Response>
/**
 * Instalación original: push a los teléfonos de la persona por la ruta única de avisos de la web (la misma de
 * «ábrelo en mi teléfono»), una vez por tarjeta. Nunca lanza. En la edición cliente avisa `cliente/cola.ts`.
 */
export async function avisarTarjetaAlTelefono(c: Confirmacion, enviar: Enviar = fetch): Promise<string> {
  try {
    const { readEnvFile } = await import('../env.js')
    const { instalacionOriginal } = await import('../dueno.js')
    const env = readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_URL'])
    const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? env.OPENCLAW_GATEWAY_TOKEN, mc = process.env.MC_URL ?? env.MC_URL ?? 'http://127.0.0.1:3300'
    if (!token) return 'sin_token'
    const usuario = instalacionOriginal().perfil_id
    const r = await enviar(`${mc}/api/notifications/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ ...avisoDeTarjeta(c), url: `${RUTA_TELEFONO_DECISIONES}?id=${c.id}`, tag: `decision-${c.id}`, source: 'bandeja:decisiones', kind: 'agente', ...(usuario ? { userId: usuario } : {}) }),
    })
    const b = await r.json().catch(() => ({})) as { sent?: number; error?: string }
    return !r.ok || b.error ? `fallo:${b.error ?? r.status}` : b.sent ? 'enviado' : 'campana'
  } catch (e) { return `fallo:${e instanceof Error ? e.message : 'error'}` }
}
