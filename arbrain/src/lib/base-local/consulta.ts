/**
 * Base local (edición cliente, 11 oct 2026; docs/builds/empaquetado-2026-10-11/MAPA-WEB.md).
 *
 * El alumno no tiene el Supabase de Daniel. Las rutas que sobreviven en su edición (chat, lienzo) hablan el idioma
 * del cliente de Supabase (`from().select().eq().order()…`). Este módulo implementa ese subconjunto sobre filas en
 * memoria; el almacén (archivos JSON en el servidor, nada en el navegador) se enchufa por fuera.
 *
 * Soporta: select (columnas planas; relaciones anidadas se ignoran), insert, update, upsert (onConflict,
 * ignoreDuplicates), delete; filtros eq, neq, gt, gte, lt, lte, in, is, not, or (con and anidado), like, ilike,
 * contains (arreglos), match; order (varios, nullsFirst), limit, range, single, maybeSingle, conteo exacto y head.
 * Lo que no soporta (rpc, storage, funciones) devuelve un error legible, nunca lanza.
 *
 * Módulo puro: sin node:* (lo usa también el navegador con su almacén inerte).
 */

export type Fila = Record<string, unknown>

export interface ErrorLocal { message: string; code: string; details: string | null; hint: string | null }

export interface Resultado<T = unknown> {
  data: T
  error: ErrorLocal | null
  count: number | null
  status: number
  statusText: string
}

/** Dónde viven las filas de cada tabla. `escribir` reemplaza la tabla completa (lo hace atómico el almacén). */
export interface Almacen {
  leer(tabla: string): Fila[]
  escribir(tabla: string, filas: Fila[]): void
  /** false = solo lectura (navegador): toda mutación devuelve error. */
  readonly escribible: boolean
  nuevoId(): string
}

export function errorLocal(message: string, code = 'LOCAL'): ErrorLocal {
  return { message, code, details: null, hint: null }
}

const TABLA_VALIDA = /^[a-z_][a-z0-9_]{0,62}$/

// ── Comparación al estilo PostgREST: los filtros llegan como texto ───────────────────────────────────────────────

function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function igual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined || b === 'null'
  if (b === null || b === undefined) return false
  return comoTexto(a) === comoTexto(b)
}

const numerico = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))

/** Números contra números (aunque uno llegue como texto en un filtro); lo demás como texto (fechas ISO incluidas). */
function comparar(a: unknown, b: unknown): number {
  if ((typeof a === 'number' || typeof b === 'number') && numerico(a) && numerico(b)) return Number(a) - Number(b)
  const sa = comoTexto(a), sb = comoTexto(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function patron(p: string, insensible: boolean): RegExp {
  const cuerpo = p.replace(/[.+?^${}()|[\]\\%*_]/g, (c) => c === '%' || c === '*' ? '[\\s\\S]*' : c === '_' ? '[\\s\\S]' : `\\${c}`)
  return new RegExp(`^${cuerpo}$`, insensible ? 'i' : '')
}

type Predicado = (f: Fila) => boolean

/** `metadata->>turnId`, `datos->a->>b`: lee dentro de columnas JSON como PostgREST (`->>` da texto). */
export function leerColumna(f: Fila, col: string): unknown {
  if (!col.includes('->')) return f[col]
  const partes = col.split(/->>?/)
  const comoTexto = /->>[^>]*$/.test(col)
  let v: unknown = f[partes[0].trim()]
  for (const k of partes.slice(1)) {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
    if (typeof v !== 'object') return null
    v = (v as Fila)[k.trim().replace(/^'|'$/g, '')]
  }
  if (v === undefined) return null
  return comoTexto && v !== null && typeof v === 'object' ? JSON.stringify(v) : v
}

function predicado(col: string, op: string, valor: unknown): Predicado {
  const v = (f: Fila) => leerColumna(f, col)
  switch (op) {
    case 'eq': return (f) => igual(v(f), valor)
    case 'neq': return (f) => !igual(v(f), valor)
    case 'gt': return (f) => v(f) != null && comparar(v(f), valor) > 0
    case 'gte': return (f) => v(f) != null && comparar(v(f), valor) >= 0
    case 'lt': return (f) => v(f) != null && comparar(v(f), valor) < 0
    case 'lte': return (f) => v(f) != null && comparar(v(f), valor) <= 0
    case 'is': {
      const t = comoTexto(valor).toLowerCase()
      if (t === 'null') return (f) => v(f) === null || v(f) === undefined
      if (t === 'true') return (f) => v(f) === true
      if (t === 'false') return (f) => v(f) === false
      return () => false
    }
    case 'in': {
      const lista = Array.isArray(valor) ? valor : String(valor).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
      return (f) => lista.some((x) => igual(v(f), x))
    }
    case 'like': return (f) => v(f) != null && patron(String(valor), false).test(comoTexto(v(f)))
    case 'ilike': return (f) => v(f) != null && patron(String(valor), true).test(comoTexto(v(f)))
    case 'cs': case 'contains': {
      const buscados = Array.isArray(valor) ? valor : String(valor).replace(/^\{|\}$/g, '').split(',').map((s) => s.trim())
      return (f) => {
        const actual = v(f)
        if (Array.isArray(actual)) return buscados.every((b) => actual.some((a) => igual(a, b)))
        if (actual && typeof actual === 'object' && valor && typeof valor === 'object' && !Array.isArray(valor)) {
          return Object.entries(valor as Fila).every(([k, x]) => igual((actual as Fila)[k], x))
        }
        return false
      }
    }
    default: return () => false
  }
}

/** Parte por comas de primer nivel (respeta paréntesis y comillas). */
function partirNivel(texto: string): string[] {
  const partes: string[] = []
  let profundidad = 0, comillas = false, actual = ''
  for (const c of texto) {
    if (c === '"') comillas = !comillas
    if (!comillas && c === '(') profundidad++
    if (!comillas && c === ')') profundidad--
    if (!comillas && profundidad === 0 && c === ',') { partes.push(actual); actual = ''; continue }
    actual += c
  }
  if (actual) partes.push(actual)
  return partes.map((p) => p.trim()).filter(Boolean)
}

/** `a.eq.1,b.is.null,and(c.gt.2,d.lt.3)` → predicado OR. Lo que no entiende no coincide (seguro: no filtra de más). */
export function predicadoOr(expresion: string, conjuncion: 'or' | 'and' = 'or'): Predicado {
  const piezas = partirNivel(expresion).map((pieza): Predicado => {
    const anidado = /^(and|or)\(([\s\S]*)\)$/.exec(pieza)
    if (anidado) return predicadoOr(anidado[2], anidado[1] as 'and' | 'or')
    const negado = /^not\.([\s\S]+)$/.exec(pieza)
    const cuerpo = negado ? negado[1] : pieza
    const m = /^([^.]+)\.([a-z]+)\.([\s\S]*)$/.exec(cuerpo)
    if (!m) return () => false
    const [, col, op, valorCrudo] = m
    let valor: unknown = valorCrudo.replace(/^"|"$/g, '')
    if (op === 'not') {
      const m2 = /^([a-z]+)\.([\s\S]*)$/.exec(valorCrudo)
      if (!m2) return () => false
      const p = predicado(col, m2[1], m2[2])
      return (f) => !p(f)
    }
    if (op === 'in') valor = valorCrudo
    const p = predicado(col, op, valor)
    return negado ? (f) => !p(f) : p
  })
  return conjuncion === 'or' ? (f) => piezas.some((p) => p(f)) : (f) => piezas.every((p) => p(f))
}

/** Columnas planas pedidas en un select (`*`, `id, title`, `id,rel(*)` → ignora la relación). null = todas. */
export function columnasDe(select: string): string[] | null {
  const partes = partirNivel(select.replace(/\s+/g, ' '))
  if (partes.length === 0 || partes.some((p) => p === '*')) return null
  const planas = partes.filter((p) => !p.includes('(')).map((p) => {
    const sinAlias = p.includes(':') ? p.split(':').pop()! : p
    return sinAlias.replace(/::.*$/, '').trim()
  })
  return planas.length ? planas : null
}

function proyectar(fila: Fila, columnas: string[] | null): Fila {
  if (!columnas) return { ...fila }
  const out: Fila = {}
  for (const c of columnas) out[c] = fila[c] ?? null
  return out
}

interface Orden { col: string; asc: boolean; nullsFirst: boolean }

function ordenar(filas: Fila[], ordenes: Orden[]): Fila[] {
  if (!ordenes.length) return filas
  return [...filas].sort((a, b) => {
    for (const o of ordenes) {
      const va = leerColumna(a, o.col), vb = leerColumna(b, o.col)
      const na = va === null || va === undefined, nb = vb === null || vb === undefined
      if (na && nb) continue
      if (na) return o.nullsFirst ? -1 : 1
      if (nb) return o.nullsFirst ? 1 : -1
      const c = comparar(va, vb)
      if (c !== 0) return o.asc ? c : -c
    }
    return 0
  })
}

type Operacion = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

/**
 * Lo que en Postgres pone el esquema (llave primaria generada y `default`s) para las tablas que usa la edición cliente.
 * Sin esto un `.eq('is_deleted', false)` no encontraría filas recién creadas y el lienzo no tendría `page_id`.
 */
export const ESQUEMA_LOCAL: Readonly<Record<string, { clave?: string; defaults?: Fila }>> = {
  chat_sessions: { defaults: { is_favorite: false, is_starred: false, pinned_position: null, archived_at: null, last_read_at: null, last_message_at: null, account: null, profile_id: null } },
  chat_messages: { defaults: { metadata: null, audio_url: null, image_url: null } },
  draw: { clave: 'page_id', defaults: { is_deleted: false, folder_id: null, settings: {}, agent_version: 1, thumbnail_url: null, page_elements: null } },
  draw_folders: { defaults: { parent_id: null, archived_at: null, position: 0 } },
}

/**
 * Constructor encadenable que se resuelve como el de Supabase (`await` devuelve `{ data, error, count }`).
 * Cada `await` ejecuta una vez contra el almacén de forma síncrona (sin carreras dentro del proceso).
 */
export class ConsultaLocal implements PromiseLike<Resultado> {
  private op: Operacion = 'select'
  private filtros: Predicado[] = []
  private ordenes: Orden[] = []
  private limite: number | null = null
  private rango: [number, number] | null = null
  private modo: 'muchas' | 'una' | 'unaOnada' = 'muchas'
  private devolver = false
  private columnas: string[] | null = null
  private conteo = false
  private soloCabecera = false
  private valores: Fila[] = []
  private conflicto = ['id']
  private ignorarDuplicados = false
  private errorPrevio: ErrorLocal | null = null

  constructor(private readonly almacen: Almacen, private readonly tabla: string) {
    if (!TABLA_VALIDA.test(tabla)) this.errorPrevio = errorLocal(`Tabla no válida: ${tabla}`, '42P01')
    this.conflicto = [ESQUEMA_LOCAL[tabla]?.clave ?? 'id']
  }

  // ── Operaciones ──
  select(columnas = '*', opciones?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.op === 'select') {
      this.columnas = columnasDe(columnas)
      this.conteo = !!opciones?.count
      this.soloCabecera = !!opciones?.head
    } else {
      this.devolver = true
      this.columnas = columnasDe(columnas)
    }
    return this
  }
  insert(valores: Fila | Fila[], _opciones?: unknown) { this.op = 'insert'; this.valores = Array.isArray(valores) ? valores : [valores]; return this }
  upsert(valores: Fila | Fila[], opciones?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'
    this.valores = Array.isArray(valores) ? valores : [valores]
    if (opciones?.onConflict) this.conflicto = opciones.onConflict.split(',').map((s) => s.trim()).filter(Boolean)
    this.ignorarDuplicados = !!opciones?.ignoreDuplicates
    return this
  }
  update(valores: Fila, _opciones?: unknown) { this.op = 'update'; this.valores = [valores]; return this }
  delete(_opciones?: unknown) { this.op = 'delete'; return this }

  // ── Filtros ──
  eq(col: string, v: unknown) { this.filtros.push(predicado(col, 'eq', v)); return this }
  neq(col: string, v: unknown) { this.filtros.push(predicado(col, 'neq', v)); return this }
  gt(col: string, v: unknown) { this.filtros.push(predicado(col, 'gt', v)); return this }
  gte(col: string, v: unknown) { this.filtros.push(predicado(col, 'gte', v)); return this }
  lt(col: string, v: unknown) { this.filtros.push(predicado(col, 'lt', v)); return this }
  lte(col: string, v: unknown) { this.filtros.push(predicado(col, 'lte', v)); return this }
  in(col: string, v: readonly unknown[]) { this.filtros.push(predicado(col, 'in', [...v])); return this }
  is(col: string, v: unknown) { this.filtros.push(predicado(col, 'is', v)); return this }
  like(col: string, v: string) { this.filtros.push(predicado(col, 'like', v)); return this }
  ilike(col: string, v: string) { this.filtros.push(predicado(col, 'ilike', v)); return this }
  contains(col: string, v: unknown) { this.filtros.push(predicado(col, 'cs', v)); return this }
  not(col: string, op: string, v: unknown) { const p = predicado(col, op, v); this.filtros.push((f) => !p(f)); return this }
  or(expresion: string, _opciones?: unknown) { this.filtros.push(predicadoOr(expresion)); return this }
  filter(col: string, op: string, v: unknown) {
    const neg = /^not\./.exec(op)
    const p = predicado(col, neg ? op.slice(4) : op, v)
    this.filtros.push(neg ? (f) => !p(f) : p)
    return this
  }
  match(objeto: Fila) { for (const [k, v] of Object.entries(objeto)) this.eq(k, v); return this }

  // ── Forma del resultado ──
  order(col: string, opciones?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (opciones?.foreignTable || opciones?.referencedTable) return this
    const asc = opciones?.ascending ?? true
    this.ordenes.push({ col, asc, nullsFirst: opciones?.nullsFirst ?? !asc })
    return this
  }
  limit(n: number, _opciones?: unknown) { this.limite = Math.max(0, Math.floor(n)); return this }
  range(desde: number, hasta: number) { this.rango = [desde, hasta]; return this }
  single() { this.modo = 'una'; return this }
  maybeSingle() { this.modo = 'unaOnada'; return this }
  abortSignal(_s: AbortSignal) { return this }
  returns<T>() { return this as unknown as ConsultaLocal & PromiseLike<Resultado<T>> }
  throwOnError() { return this }

  then<A = Resultado, B = never>(alResolver?: ((r: Resultado) => A | PromiseLike<A>) | null, alFallar?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    let r: Resultado
    // Base dañada o ilegible = servicio no disponible (503), nunca «no existe» ni una lista vacía.
    try { r = this.ejecutar() } catch (e) {
      const danada = (e as { code?: string } | null)?.code === 'LOCAL_DANADA'
      r = this.fallo(errorLocal(e instanceof Error ? e.message : 'Error de la base local', danada ? 'LOCAL_DANADA' : 'LOCAL'), danada ? 503 : 400)
    }
    return Promise.resolve(r).then(alResolver, alFallar)
  }

  // ── Motor ──
  private fallo(error: ErrorLocal, status = 400): Resultado {
    return { data: null, error, count: null, status, statusText: 'Error' }
  }

  private dar(filas: Fila[], status = 200, total: number | null = null): Resultado {
    const proyectadas = filas.map((f) => proyectar(f, this.columnas))
    if (this.modo === 'una') {
      if (proyectadas.length !== 1) return this.fallo(errorLocal(proyectadas.length ? 'Se esperaba una fila y hay varias.' : 'No hay filas.', 'PGRST116'), 406)
      return { data: proyectadas[0], error: null, count: total, status, statusText: 'OK' }
    }
    if (this.modo === 'unaOnada') {
      if (proyectadas.length > 1) return this.fallo(errorLocal('Se esperaba una fila y hay varias.', 'PGRST116'), 406)
      return { data: proyectadas[0] ?? null, error: null, count: total, status, statusText: 'OK' }
    }
    return { data: this.soloCabecera ? null : proyectadas, error: null, count: total, status, statusText: 'OK' }
  }

  private coincide(f: Fila) { return this.filtros.every((p) => p(f)) }

  private ejecutar(): Resultado {
    if (this.errorPrevio) return this.fallo(this.errorPrevio, 404)
    const todas = this.almacen.leer(this.tabla)
    if (this.op === 'select') {
      let filas = ordenar(todas.filter((f) => this.coincide(f)), this.ordenes)
      const total = this.conteo ? filas.length : null
      if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1)
      if (this.limite !== null) filas = filas.slice(0, this.limite)
      return this.dar(filas, 200, total)
    }
    if (!this.almacen.escribible) return this.fallo(errorLocal('Esta copia no guarda datos aquí.', 'LOCAL_RO'), 403)
    const ahora = new Date().toISOString()
    if (this.op === 'insert' || this.op === 'upsert') {
      const nuevas = [...todas]
      const tocadas: Fila[] = []
      const esquema = ESQUEMA_LOCAL[this.tabla]
      const clavePrimaria = esquema?.clave ?? 'id'
      for (const crudo of this.valores) {
        const fila: Fila = { ...crudo }
        for (const [k, v] of Object.entries(fila)) if (v === undefined) delete fila[k]
        if (fila[clavePrimaria] === undefined && this.op === 'insert') fila[clavePrimaria] = this.almacen.nuevoId()
        const clave = (f: Fila) => this.conflicto.map((c) => comoTexto(f[c])).join('\u0000')
        const i = this.conflicto.every((c) => fila[c] !== undefined) ? nuevas.findIndex((f) => clave(f) === clave(fila)) : -1
        if (i >= 0) {
          if (this.op === 'insert') return this.fallo(errorLocal(`duplicate key value violates unique constraint "${this.tabla}_pkey"`, '23505'), 409)
          if (this.ignorarDuplicados) continue
          nuevas[i] = { ...nuevas[i], ...fila, ...(fila.updated_at === undefined && 'updated_at' in nuevas[i] ? { updated_at: ahora } : {}) }
          tocadas.push(nuevas[i])
          continue
        }
        if (fila[clavePrimaria] === undefined) fila[clavePrimaria] = this.almacen.nuevoId()
        for (const [k, v] of Object.entries(esquema?.defaults ?? {})) if (fila[k] === undefined) fila[k] = typeof v === 'object' && v !== null ? structuredClone(v) : v
        if (fila.created_at === undefined) fila.created_at = ahora
        if (fila.updated_at === undefined) fila.updated_at = ahora
        nuevas.push(fila)
        tocadas.push(fila)
      }
      this.almacen.escribir(this.tabla, nuevas)
      return this.devolver ? this.dar(tocadas, 201) : { data: null, error: null, count: null, status: 201, statusText: 'Created' }
    }
    if (this.op === 'update') {
      const cambios = this.valores[0] ?? {}
      const tocadas: Fila[] = []
      const nuevas = todas.map((f) => {
        if (!this.coincide(f)) return f
        const g = { ...f, ...cambios }
        if (cambios.updated_at === undefined && 'updated_at' in f) g.updated_at = ahora
        tocadas.push(g)
        return g
      })
      if (tocadas.length) this.almacen.escribir(this.tabla, nuevas)
      return this.devolver ? this.dar(tocadas) : { data: null, error: null, count: null, status: 204, statusText: 'No Content' }
    }
    // delete
    const quedan: Fila[] = [], borradas: Fila[] = []
    for (const f of todas) (this.coincide(f) ? borradas : quedan).push(f)
    if (borradas.length) this.almacen.escribir(this.tabla, quedan)
    return this.devolver ? this.dar(borradas) : { data: null, error: null, count: null, status: 204, statusText: 'No Content' }
  }
}

// ── Cliente con forma de Supabase ─────────────────────────────────────────────────────────────────────────────────

const SIN_SUPABASE = 'Esta función no existe en tu edición de Arbrain.'

function canalInerte() {
  const canal = {
    on: (..._args: unknown[]) => canal,
    subscribe: (cb?: (estado: string) => void) => { try { cb?.('CLOSED') } catch { /* inerte */ } return canal },
    send: async () => 'error' as const,
    unsubscribe: async () => 'ok' as const,
    track: async () => 'error' as const,
    untrack: async () => 'ok' as const,
    presenceState: () => ({}),
  }
  return canal
}

export interface UsuarioLocal { id: string; email: string; nombre: string }

export interface OpcionesClienteLocal {
  /** Usuario de la sesión, o null si la petición no viene de la app. */
  usuario?: () => Promise<UsuarioLocal | null> | UsuarioLocal | null
}

/** Cliente con la forma mínima del de Supabase sobre un almacén local. */
export function clienteLocal(almacen: Almacen, opciones: OpcionesClienteLocal = {}) {
  const usuario = async () => {
    const u = await (opciones.usuario?.() ?? null)
    if (!u) return null
    return {
      id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: { full_name: u.nombre }, created_at: '2026-10-11T00:00:00.000Z',
    }
  }
  const sinFuncion = { data: null, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }
  const archivos = {
    upload: async (..._a: unknown[]) => sinFuncion, download: async (..._a: unknown[]) => sinFuncion, remove: async (..._a: unknown[]) => sinFuncion,
    list: async () => ({ data: [], error: null }), createSignedUrl: async () => sinFuncion,
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  }
  return {
    from: (tabla: string) => new ConsultaLocal(almacen, tabla),
    rpc: async (_fn: string, _args?: unknown) => ({ ...sinFuncion, count: null, status: 404, statusText: 'Not Found' }),
    schema: () => ({ from: (tabla: string) => new ConsultaLocal(almacen, tabla) }),
    channel: (_nombre: string, _op?: unknown) => canalInerte(),
    removeChannel: async () => 'ok' as const,
    removeAllChannels: async () => [] as const,
    getChannels: () => [] as unknown[],
    storage: { from: (_bucket: string) => archivos, listBuckets: async () => ({ data: [], error: null }) },
    functions: { invoke: async () => sinFuncion },
    auth: {
      getUser: async () => { const user = await usuario(); return { data: { user }, error: user ? null : errorLocal('Sin sesión', 'LOCAL_AUTH') } },
      getClaims: async () => { const user = await usuario(); return { data: user ? { claims: { sub: user.id, email: user.email } } : null, error: null } },
      getSession: async () => { const user = await usuario(); return { data: { session: user ? { user, access_token: '', refresh_token: '', expires_at: 0 } : null }, error: null } },
      onAuthStateChange: (cb?: (evento: string, sesion: unknown) => void) => {
        void usuario().then((user) => { try { cb?.('INITIAL_SESSION', user ? { user } : null) } catch { /* inerte */ } })
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }),
      signUp: async () => ({ data: { user: null, session: null }, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }),
      resetPasswordForEmail: async () => ({ data: null, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }),
      updateUser: async () => ({ data: { user: null }, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }),
      exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }),
      admin: { listUsers: async () => ({ data: { users: [] }, error: null }), getUserById: async () => ({ data: { user: null }, error: errorLocal(SIN_SUPABASE, 'LOCAL_NA') }) },
    },
  }
}

/** Almacén vacío y de solo lectura (navegador en la edición cliente: los datos viven en el servidor local). */
export const almacenInerte: Almacen = {
  leer: () => [],
  escribir: () => {},
  escribible: false,
  nuevoId: () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-0000-4000-8000-000000000000`),
}

/** Almacén en memoria (pruebas). */
export function almacenMemoria(inicial: Record<string, Fila[]> = {}): Almacen & { tablas: Record<string, Fila[]> } {
  const tablas: Record<string, Fila[]> = { ...inicial }
  let n = 0
  return {
    tablas,
    leer: (t) => tablas[t] ?? [],
    escribir: (t, filas) => { tablas[t] = filas },
    escribible: true,
    nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  }
}
