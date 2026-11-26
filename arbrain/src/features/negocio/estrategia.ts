/**
 * Tu negocio › El pulso › Estrategia (8 nov 2026). Daniel: «al final actua como coordinador para crear un panel de esto…
 * deberia estar dentro del negocio». La cabeza que le faltaba al negocio: a quién sirves, contra qué te comparan y a qué
 * precio. Cuatro vistas (quién compra, contra quién, hacia dónde va, lo que decides) leídas de UN archivo que escribe Levy
 * (`mercado.json`, esquema `arbrain.mercado/v1`), con fecha y fuente por bloque. El panel no reinterpreta: lo que no
 * trae el archivo no se pinta, y «Lo que decides» se marca «propuesta de Levy, sin firmar» hasta que el dueño firme.
 *
 * Lectura tolerante: un bloque roto o ausente queda en null (su vista dice que no hay datos) y cada pieza sin texto se
 * descarta y se cuenta como error; nunca se inventa una cifra. Lógica pura (sin React ni fs): la usan la vista, la API y
 * node:test.
 */
import { enIngles, localeIntl, tr, trMarca, trn } from '@/shared/i18n'

/**
 * v2 (15 nov 2026): suma `rumbo` (el encabezado sale de lo firmado, no del hueco) y `competidores` (la sección dedicada, con
 * establecidos, nuevas promesas y anglo). Un archivo v1 se sigue leyendo: sin esos bloques, el encabezado vuelve a la
 * escalera y la sección Competidores se arma con los hispanos y anglos de «Contra quién».
 */
export const ESQUEMA_MERCADO = 'arbrain.mercado/v2'
export const ESQUEMAS_LEGIBLES = ['arbrain.mercado/v1', ESQUEMA_MERCADO]
/** Ruta del archivo, relativa a la raíz del cerebro (la arma Levy con la investigación de mercado del dueño). */
export const RUTA_MERCADO = '.claude/memory/project/mi-negocio/mercado.json'
export const URL_ESTRATEGIA = '/api/negocio/estrategia'

export const VISTAS = [
  { id: 'compra', nombre: trMarca('Quién compra') },
  { id: 'contra', nombre: trMarca('Contra quién') },
  { id: 'rumbo', nombre: trMarca('Hacia dónde va') },
  { id: 'decides', nombre: trMarca('Lo que decides') },
] as const
export type Vista = (typeof VISTAS)[number]['id']

/** Toda pieza que lleva una cifra o una afirmación trae de dónde sale y cuándo. */
export interface ConFuente { fuente: string; fecha: string }
export interface Evidencia extends ConFuente { tipo: 'dato' | 'cita' | 'limite'; texto: string; lectura: boolean }

export interface Segmento {
  nombre: string; quien: string | null; quiere: string | null; teme: string | null; intento_antes: string | null; paga: string | null
  tamano: (ConFuente & { valor: number; unidad: string; que: string | null }) | null
  evidencia: Evidencia[]
}
export interface Escalon { id: string; nombre: string; universo: string | null; ventana: string | null; segmentos: Segmento[]; separa: { texto: string; evidencia: string | null }[] }
export interface QuienCompra extends ConFuente { escalones: Escalon[]; huecos: string[] }

/**
 * La cara pública de un competidor (8 nov 2026, «Estrategia como Contenido»): la imagen que su página publica para
 * compartirse, con la página de donde salió (`de`), su fuente y su fecha. `avatar` = el de su canal de YouTube (cuadrado);
 * `portada` = la de su Skool o su web (apaisada). Sin imagen, la ficha pinta sus iniciales: nunca se inventa una cara.
 */
export interface Imagen extends ConFuente { url: string; de: string | null; forma: 'avatar' | 'portada' }
export interface Canal extends ConFuente { tipo: string; valor: string; url: string | null; nota: string | null }
export interface Oferta { oferta: string; precio: string; promesa: string | null; url: string | null }
export interface Competidor {
  nombre: string; grupo: 'directo' | 'alcance' | 'alternativa' | 'contraste'; rol: string | null; pais: string | null
  canales: Canal[]; ofertas: Oferta[]; avatar: string | null; hueco: string | null; voz: string[]; imagen: Imagen | null
}
export interface Referente {
  nombre: string; nivel: string | null; categoria: string | null; canales: Canal[]; ofertas: Oferta[]
  avatar: string | null; adelanto: string | null; no_copiar: string | null; imagen: Imagen | null
}
export interface Quien extends ConFuente { nombre: string; precio: string; mercado: 'hispano' | 'anglo' }
export interface Peldano { id: string; nombre: string; rango: string; hueco: boolean; frente: boolean; quienes: Quien[]; tu: (ConFuente & { texto: string }) | null; nota: string | null }
export interface ContraQuien extends ConFuente {
  convencion: string | null
  comparan: (ConFuente & { filas: { escalon: string; contra: string }[] }) | null
  escalera: (ConFuente & { nota: string | null; peldanos: Peldano[] }) | null
  hueco: string[]; saturado: string[]
  dato_promesa: (ConFuente & { texto: string }) | null
  hispanos: Competidor[]; anglos: Referente[]
  voz_publica: (ConFuente & { citas: (ConFuente & { texto: string })[]; falta: string | null }) | null
  limites: string[]
}

export interface Tendencia { tendencia: string; evidencia: string | null; en_espanol: string | null; fuentes: string[] }
export interface HaciaDonde extends ConFuente {
  tendencias: Tendencia[]
  dos_avatares: { el_que_vende: string; el_dueno_que_usa: string; donde_caes: string | null } | null
  senales_hispanas: (ConFuente & { lista: (ConFuente & { texto: string })[] }) | null
}

/** Un borrador de Levy. `firmado` solo existe cuando el dueño lo firmó (fecha y, si quiere, sus palabras). */
export interface Borrador { estado: 'borrador' | 'firmado'; borrador: string; por_que: string | null; no_es: string | null; evidencia: Evidencia[]; firmado: { fecha: string; texto: string | null } | null }
export interface LoQueDecides extends ConFuente {
  estado: 'borrador' | 'firmado'
  para_que: string | null; como_firmar: string | null; no_se_reabre: string[]
  avatares: (Borrador & { escalon: string })[]
  posicionamiento: Borrador | null
}

export interface Linea extends ConFuente { pregunta: string; respuesta: string; propia: boolean }

/**
 * El rumbo firmado (15 nov 2026, Daniel: «siii full bajo ticket de 6-12 meses de acuerdo»). Encabeza el panel: el titular y
 * la frase salen de aquí, con la cita y la fecha de la firma. `abierto`: lo que sigue sin decidir y el panel dice como tal.
 */
export interface Rumbo extends ConFuente { titular: string; frase: string; cita: string | null; firmado: string; abierto: string[] }

/**
 * Competidores (15 nov 2026, Daniel: «quiero algo dedicado a esto, tipo una lista… miembros en su comunidad, "oferta" que
 * puedas inferir, mensaje… faltan "las nuevas promesas"»). Esquema de los censos: `.claude/drafts/2026-11-15-competidores/ESQUEMA.md`.
 */
export type GrupoCompetidor = 'establecido' | 'promesa' | 'anglo'
export interface CanalC extends ConFuente { tipo: string; valor: string; seguidores: number | null; url: string | null }
export interface ComunidadC extends ConFuente { plataforma: string; acceso: 'pago' | 'gratis' | 'mixta' | null; miembros: number | null; valor: string; url: string | null }
export interface OfertaC { nombre: string; precio: string; usd_mes: number | null; forma: string | null; promesa: string | null; oculto: boolean; inferido: boolean; url: string | null; fuente: string | null; fecha: string | null }
export interface FichaCompetidor {
  id: string; nombre: string; marca: string | null; mercado: 'hispano' | 'anglo'; grupo: GrupoCompetidor; pais: string | null; descripcion: string | null
  canales: CanalC[]; comunidad: ComunidadC | null; oferta: OfertaC[]
  mensaje: { texto: string; donde: string | null; url: string | null; fecha: string | null } | null
  mecanismo: { texto: string; inferido: boolean } | null
  sofisticacion: { nivel: number; por_que: string | null; inferido: boolean } | null
  cadencia: (ConFuente & { videos_semana: number | null; valor: string }) | null
  velocidad: (ConFuente & { pct_30d: number | null; seguidores_30d: number | null; seguidores_7d: number | null; vistas_30d: number | null; valor: string; inferido: boolean }) | null
  por_que_crece: string | null; mejor_que_tu: string | null; cambios: string | null
  imagen: Imagen | null; fuentes: { url: string; que: string | null; fecha: string | null }[]
}
/** `tu`: el canal del dueño medido con la misma regla que los demás (marca oro en el campo). */
export interface Competidores extends ConFuente { metodo: string | null; limites: string[]; lista: FichaCompetidor[]; tu: (ConFuente & { valor: string; seguidores: number | null; url: string | null }) | null }

export interface Mercado {
  actualizado: string | null
  rumbo: Rumbo | null
  competidores: Competidores | null
  cabeza: (ConFuente & { lineas: Linea[] }) | null
  quien_compra: QuienCompra | null
  contra_quien: ContraQuien | null
  hacia_donde: HaciaDonde | null
  lo_que_decides: LoQueDecides | null
}

/** Respuesta de /api/negocio/estrategia. `oculto`: vistas con números propios que el modo directo no deja ver. */
export type RespuestaEstrategia =
  | { activo: false }
  | { activo: true; ruta: string; existe: boolean; datos: Mercado | null; errores?: string[]; directo: boolean; oculto: Vista[]; cliente: boolean }

// ── Lectura tolerante ──

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const FECHA = /^\d{4}-\d{2}(-\d{2})?$/
const fecha = (x: unknown): string | null => { const t = texto(x); return t && FECHA.test(t) ? t : null }
const textos = (x: unknown): string[] => (Array.isArray(x) ? x.map(texto).filter((t): t is string => !!t) : [])

/** Lector con su propia lista de errores: cada pieza descartada deja una línea que dice dónde. */
class Lector {
  errores: string[] = []
  falla(donde: string, que: string) { this.errores.push(`${donde}: ${tr(que)}`) }

  /** fuente y fecha obligatorias; sin una de las dos, la pieza no se pinta. */
  conFuente(x: Record<string, unknown>, donde: string, heredada?: ConFuente): ConFuente | null {
    const fuente = texto(x.fuente) ?? heredada?.fuente ?? null
    const f = fecha(x.fecha) ?? heredada?.fecha ?? null
    if (!fuente) { this.falla(donde, trMarca('falta «fuente»')); return null }
    if (!f) { this.falla(donde, trMarca('falta «fecha» (AAAA-MM-DD)')); return null }
    return { fuente, fecha: f }
  }

  lista<T>(x: unknown, donde: string, uno: (y: Record<string, unknown>, d: string) => T | null): T[] {
    if (x === undefined || x === null) return []
    if (!Array.isArray(x)) { this.falla(donde, trMarca('no es una lista')); return [] }
    const out: T[] = []
    x.forEach((y, i) => {
      if (!obj(y)) { this.falla(`${donde} ${i + 1}`, trMarca('no es un objeto')); return }
      const r = uno(y, `${donde} ${i + 1}`)
      if (r !== null) out.push(r)
    })
    return out
  }

  /** Cada evidencia trae SU fuente y SU fecha: no hereda las del bloque. */
  evidencia(y: Record<string, unknown>, d: string): Evidencia | null {
    const t = texto(y.texto)
    if (!t) { this.falla(d, trMarca('falta «texto»')); return null }
    const cf = this.conFuente(y, d)
    if (!cf) return null
    const tipo = y.tipo === 'cita' || y.tipo === 'limite' ? y.tipo : 'dato'
    return { tipo, texto: t, lectura: y.lectura === true, ...cf }
  }

  canal(y: Record<string, unknown>, d: string): Canal | null {
    const tipo = texto(y.tipo), valor = texto(y.valor)
    if (!tipo || !valor) { this.falla(d, trMarca('falta «tipo» o «valor»')); return null }
    const cf = this.conFuente(y, d)
    return cf && { tipo, valor, url: texto(y.url), nota: texto(y.nota), ...cf }
  }

  oferta(y: Record<string, unknown>, d: string): Oferta | null {
    const o = texto(y.oferta), precio = texto(y.precio)
    if (!o || !precio) { this.falla(d, trMarca('falta «oferta» o «precio»')); return null }
    return { oferta: o, precio, promesa: texto(y.promesa), url: texto(y.url) }
  }

  /** Solo https: una imagen por http o con otro esquema no se carga (la app no pide nada inseguro). */
  imagen(y: unknown, d: string): Imagen | null {
    if (y === undefined || y === null) return null
    if (!obj(y)) { this.falla(d, trMarca('no es un objeto')); return null }
    const url = texto(y.url)
    if (!url || !/^https:\/\//.test(url)) { this.falla(d, trMarca('«url» debe empezar con https://')); return null }
    const cf = this.conFuente(y, d)
    const de = texto(y.de)
    return cf && { url, de: de && /^https?:\/\//.test(de) ? de : null, forma: y.forma === 'portada' ? 'portada' : 'avatar', ...cf }
  }

  borrador(y: Record<string, unknown>, d: string): Borrador | null {
    const b = texto(y.borrador)
    if (!b) { this.falla(d, trMarca('falta «borrador»')); return null }
    const f = obj(y.firmado) ? y.firmado : null
    const firmado = f && fecha(f.fecha) ? { fecha: fecha(f.fecha)!, texto: texto(f.texto) } : null
    return {
      // Solo es firmado si trae la firma: un «estado: firmado» sin fecha sigue siendo borrador.
      estado: y.estado === 'firmado' && firmado ? 'firmado' : 'borrador', borrador: b, firmado,
      por_que: texto(y.por_que), no_es: texto(y.no_es),
      evidencia: this.lista(y.evidencia, `${d} › evidencia`, (e, de) => this.evidencia(e, de)),
    }
  }
}

function cabeza(l: Lector, x: unknown): Mercado['cabeza'] {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'cabeza')
  if (!b) return null
  const lineas = l.lista(x.lineas, 'cabeza › línea', (y, d) => {
    const pregunta = texto(y.pregunta), respuesta = texto(y.respuesta)
    if (!pregunta || !respuesta) { l.falla(d, trMarca('falta «pregunta» o «respuesta»')); return null }
    const cf = l.conFuente(y, d, b)
    return cf && { pregunta, respuesta, propia: y.propia === true, ...cf }
  })
  return lineas.length ? { ...b, lineas } : null
}

function quienCompra(l: Lector, x: unknown): QuienCompra | null {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'quién compra')
  if (!b) return null
  const escalones = l.lista(x.escalones, 'quién compra › escalón', (e, d) => {
    const nombre = texto(e.nombre)
    if (!nombre) { l.falla(d, trMarca('falta «nombre»')); return null }
    const segmentos = l.lista(e.segmentos, `${nombre} › segmento`, (s, ds) => {
      const n = texto(s.nombre)
      if (!n) { l.falla(ds, trMarca('falta «nombre»')); return null }
      let tamano: Segmento['tamano'] = null
      if (obj(s.tamano)) {
        const v = s.tamano.valor
        const cf = l.conFuente(s.tamano, `${ds} › tamaño`)
        if (typeof v === 'number' && Number.isFinite(v) && cf) tamano = { valor: v, unidad: texto(s.tamano.unidad) ?? '', que: texto(s.tamano.que), ...cf }
        else if (cf) l.falla(`${ds} › tamaño`, trMarca('«valor» no es un número'))
      }
      return {
        nombre: n, quien: texto(s.quien), quiere: texto(s.quiere), teme: texto(s.teme), intento_antes: texto(s.intento_antes), paga: texto(s.paga),
        tamano, evidencia: l.lista(s.evidencia, `${ds} › evidencia`, (y, dy) => l.evidencia(y, dy)),
      }
    })
    const separa = l.lista(e.separa, `${nombre} › separa`, (y, dy) => {
      const t = texto(y.texto)
      if (!t) { l.falla(dy, trMarca('falta «texto»')); return null }
      return { texto: t, evidencia: texto(y.evidencia) }
    })
    return { id: texto(e.id) ?? nombre, nombre, universo: texto(e.universo), ventana: texto(e.ventana), segmentos, separa }
  })
  return { ...b, escalones, huecos: textos(x.huecos) }
}

function contraQuien(l: Lector, x: unknown): ContraQuien | null {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'contra quién')
  if (!b) return null
  let comparan: ContraQuien['comparan'] = null
  if (obj(x.comparan)) {
    const cf = l.conFuente(x.comparan, 'contra quién › comparan', b)
    const filas = l.lista(x.comparan.filas, 'comparan › fila', (y, d) => {
      const escalon = texto(y.escalon), contra = texto(y.contra)
      if (!escalon || !contra) { l.falla(d, trMarca('falta «escalon» o «contra»')); return null }
      return { escalon, contra }
    })
    if (cf && filas.length) comparan = { ...cf, filas }
  }
  let escalera: ContraQuien['escalera'] = null
  if (obj(x.escalera)) {
    const cf = l.conFuente(x.escalera, 'escalera', b)
    const peldanos = l.lista(x.escalera.peldanos, 'escalera › peldaño', (y, d) => {
      const nombre = texto(y.nombre), rango = texto(y.rango)
      if (!nombre || !rango) { l.falla(d, trMarca('falta «nombre» o «rango»')); return null }
      const quienes = l.lista(y.quienes, `${nombre} ›`, (q, dq) => {
        const n = texto(q.nombre), precio = texto(q.precio)
        if (!n || !precio) { l.falla(dq, trMarca('falta «nombre» o «precio»')); return null }
        const cq = l.conFuente(q, dq)
        return cq && { nombre: n, precio, mercado: q.mercado === 'anglo' ? 'anglo' as const : 'hispano' as const, ...cq }
      })
      let tu: Peldano['tu'] = null
      if (obj(y.tu) && texto(y.tu.texto)) { const ct = l.conFuente(y.tu, `${nombre} › tú`); if (ct) tu = { texto: texto(y.tu.texto)!, ...ct } }
      return { id: texto(y.id) ?? nombre, nombre, rango, hueco: y.hueco === true, frente: y.frente === true, quienes, tu, nota: texto(y.nota) }
    })
    if (cf && peldanos.length) escalera = { ...cf, nota: texto(x.escalera.nota), peldanos }
  }
  let dato: ContraQuien['dato_promesa'] = null
  if (obj(x.dato_promesa) && texto(x.dato_promesa.texto)) { const cf = l.conFuente(x.dato_promesa, 'dato de la promesa', b); if (cf) dato = { texto: texto(x.dato_promesa.texto)!, ...cf } }
  let voz: ContraQuien['voz_publica'] = null
  if (obj(x.voz_publica)) {
    const cf = l.conFuente(x.voz_publica, 'voz pública', b)
    const citas = l.lista(x.voz_publica.citas, 'voz pública › cita', (y, d) => {
      const t = texto(y.texto)
      if (!t) { l.falla(d, trMarca('falta «texto»')); return null }
      const donde = texto(y.donde)
      const f = fecha(y.fecha)
      if (!donde || !f) { l.falla(d, trMarca('falta «donde» o «fecha»')); return null }
      return { texto: t, fuente: donde, fecha: f }
    })
    if (cf) voz = { ...cf, citas, falta: texto(x.voz_publica.falta) }
  }
  const GRUPOS = ['directo', 'alcance', 'alternativa', 'contraste'] as const
  const hispanos = l.lista(x.hispanos, 'competencia hispana', (y, d): Competidor | null => {
    const nombre = texto(y.nombre)
    if (!nombre) { l.falla(d, trMarca('falta «nombre»')); return null }
    const grupo = (GRUPOS as readonly unknown[]).includes(y.grupo) ? y.grupo as Competidor['grupo'] : 'contraste'
    return {
      nombre, grupo, rol: texto(y.rol), pais: texto(y.pais), avatar: texto(y.avatar), hueco: texto(y.hueco), voz: textos(y.voz),
      imagen: l.imagen(y.imagen, `${nombre} › imagen`),
      canales: l.lista(y.canales, `${nombre} › canal`, (c, dc) => l.canal(c, dc)),
      ofertas: l.lista(y.ofertas, `${nombre} › oferta`, (o, dof) => l.oferta(o, dof)),
    }
  })
  const anglos = l.lista(x.anglos, 'referentes anglo', (y, d): Referente | null => {
    const nombre = texto(y.nombre)
    if (!nombre) { l.falla(d, trMarca('falta «nombre»')); return null }
    return {
      nombre, nivel: texto(y.nivel), categoria: texto(y.categoria), avatar: texto(y.avatar), adelanto: texto(y.adelanto), no_copiar: texto(y.no_copiar),
      imagen: l.imagen(y.imagen, `${nombre} › imagen`),
      canales: l.lista(y.canales, `${nombre} › canal`, (c, dc) => l.canal(c, dc)),
      ofertas: l.lista(y.ofertas, `${nombre} › oferta`, (o, dof) => l.oferta(o, dof)),
    }
  })
  return {
    ...b, convencion: texto(x.convencion), comparan, escalera, hueco: textos(x.hueco), saturado: textos(x.saturado),
    dato_promesa: dato, hispanos, anglos, voz_publica: voz, limites: textos(x.limites),
  }
}

function haciaDonde(l: Lector, x: unknown): HaciaDonde | null {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'hacia dónde va')
  if (!b) return null
  const tendencias = l.lista(x.tendencias, 'tendencia', (y, d) => {
    const t = texto(y.tendencia)
    if (!t) { l.falla(d, trMarca('falta «tendencia»')); return null }
    return { tendencia: t, evidencia: texto(y.evidencia), en_espanol: texto(y.en_espanol), fuentes: textos(y.fuentes) }
  })
  let dos: HaciaDonde['dos_avatares'] = null
  if (obj(x.dos_avatares)) {
    const a = texto(x.dos_avatares.el_que_vende), c = texto(x.dos_avatares.el_dueno_que_usa)
    if (a && c) dos = { el_que_vende: a, el_dueno_que_usa: c, donde_caes: texto(x.dos_avatares.donde_caes) }
  }
  let senales: HaciaDonde['senales_hispanas'] = null
  if (obj(x.senales_hispanas)) {
    const cf = l.conFuente(x.senales_hispanas, 'señales hispanas', b)
    const lista = l.lista(x.senales_hispanas.lista, 'señal', (y, d) => {
      const t = texto(y.texto)
      if (!t) { l.falla(d, trMarca('falta «texto»')); return null }
      const c = l.conFuente(y, d)
      return c && { texto: t, ...c }
    })
    if (cf && lista.length) senales = { ...cf, lista }
  }
  return { ...b, tendencias, dos_avatares: dos, senales_hispanas: senales }
}

function loQueDecides(l: Lector, x: unknown): LoQueDecides | null {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'lo que decides')
  if (!b) return null
  const avatares = l.lista(x.avatares, 'avatar', (y, d) => {
    const escalon = texto(y.escalon)
    if (!escalon) { l.falla(d, trMarca('falta «escalon»')); return null }
    const r = l.borrador(y, `avatar de ${escalon}`)
    return r && { ...r, escalon }
  })
  const posicionamiento = obj(x.posicionamiento) ? l.borrador(x.posicionamiento, 'posicionamiento') : null
  const piezas = [...avatares, ...(posicionamiento ? [posicionamiento] : [])]
  return {
    ...b,
    // Firmado solo si TODO está firmado; con un borrador vivo, la vista entera dice «sin firmar».
    estado: piezas.length && piezas.every(p => p.estado === 'firmado') ? 'firmado' : 'borrador',
    para_que: texto(x.para_que), como_firmar: texto(x.como_firmar), no_se_reabre: textos(x.no_se_reabre), avatares, posicionamiento,
  }
}

function rumbo(l: Lector, x: unknown): Rumbo | null {
  if (!obj(x)) return null
  const titular = texto(x.titular), frase = texto(x.frase), firmado = fecha(x.firmado)
  if (!titular || !frase) { l.falla('rumbo', trMarca('falta «titular» o «frase»')); return null }
  // Sin la fecha de la firma no hay rumbo firmado: el encabezado vuelve a la escalera.
  if (!firmado) { l.falla('rumbo', trMarca('falta «firmado» (AAAA-MM-DD)')); return null }
  const cf = l.conFuente(x, 'rumbo')
  return cf && { ...cf, titular, frase, cita: texto(x.cita), firmado, abierto: textos(x.abierto) }
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const GRUPOS_C = ['establecido', 'promesa', 'anglo'] as const

function competidores(l: Lector, x: unknown): Competidores | null {
  if (!obj(x)) return null
  const b = l.conFuente(x, 'competidores')
  if (!b) return null
  const vistos = new Set<string>()
  const lista = l.lista(x.lista, 'competidor', (y, d): FichaCompetidor | null => {
    const nombre = texto(y.nombre)
    if (!nombre) { l.falla(d, trMarca('falta «nombre»')); return null }
    const fuentes = Array.isArray(y.fuentes) ? y.fuentes.filter(obj).map(f => ({ url: texto(f.url), que: texto(f.que), fecha: fecha(f.fecha) }))
      .filter((f): f is { url: string; que: string | null; fecha: string | null } => !!f.url && /^https?:\/\//.test(f.url)) : []
    // Una ficha sin una sola fuente pública no se pinta: nada inventado.
    if (!fuentes.length) { l.falla(nombre, trMarca('falta al menos una «fuentes» con url')); return null }
    const id = texto(y.id) ?? nombre
    if (vistos.has(id)) { l.falla(nombre, trMarca('«id» repetido')); return null }
    vistos.add(id)
    const mercado = y.mercado === 'anglo' ? 'anglo' as const : 'hispano' as const
    const grupo = (GRUPOS_C as readonly unknown[]).includes(y.grupo) ? y.grupo as GrupoCompetidor : mercado === 'anglo' ? 'anglo' : 'establecido'
    const canales = l.lista(y.canales, `${nombre} › canal`, (c, dc) => {
      const tipo = texto(c.tipo), valor = texto(c.valor)
      if (!tipo || !valor) { l.falla(dc, trMarca('falta «tipo» o «valor»')); return null }
      const cf = l.conFuente(c, dc)
      return cf && { tipo, valor, seguidores: num(c.seguidores), url: texto(c.url), ...cf }
    })
    let comunidad: ComunidadC | null = null
    if (obj(y.comunidad)) {
      const c = y.comunidad, plataforma = texto(c.plataforma), valor = texto(c.valor)
      const cf = plataforma && valor ? l.conFuente(c, `${nombre} › comunidad`) : (l.falla(`${nombre} › comunidad`, trMarca('falta «plataforma» o «valor»')), null)
      const acceso = c.acceso === 'pago' || c.acceso === 'gratis' || c.acceso === 'mixta' ? c.acceso : null
      if (cf) comunidad = { plataforma: plataforma!, valor: valor!, acceso, miembros: num(c.miembros), url: texto(c.url), ...cf }
    }
    const oferta = l.lista(y.oferta, `${nombre} › oferta`, (o, dof) => {
      const n = texto(o.nombre), precio = texto(o.precio)
      if (!n || !precio) { l.falla(dof, trMarca('falta «nombre» o «precio»')); return null }
      return { nombre: n, precio, usd_mes: num(o.usd_mes), forma: texto(o.forma), promesa: texto(o.promesa), oculto: o.oculto === true, inferido: o.inferido === true, url: texto(o.url), fuente: texto(o.fuente), fecha: fecha(o.fecha) }
    })
    const m = obj(y.mensaje) && texto(y.mensaje.texto) ? { texto: texto(y.mensaje.texto)!, donde: texto(y.mensaje.donde), url: texto(y.mensaje.url), fecha: fecha(y.mensaje.fecha) } : null
    const mec = obj(y.mecanismo) && texto(y.mecanismo.texto) ? { texto: texto(y.mecanismo.texto)!, inferido: y.mecanismo.inferido !== false } : null
    const nivel = obj(y.sofisticacion) ? num(y.sofisticacion.nivel) : null
    const sof = obj(y.sofisticacion) && nivel !== null && nivel >= 1 && nivel <= 5
      ? { nivel: Math.round(nivel), por_que: texto(y.sofisticacion.por_que), inferido: y.sofisticacion.inferido !== false } : null
    let cadencia: FichaCompetidor['cadencia'] = null
    if (obj(y.cadencia) && texto(y.cadencia.valor)) { const cf = l.conFuente(y.cadencia, `${nombre} › cadencia`); if (cf) cadencia = { videos_semana: num(y.cadencia.videos_semana), valor: texto(y.cadencia.valor)!, ...cf } }
    let velocidad: FichaCompetidor['velocidad'] = null
    if (obj(y.velocidad) && texto(y.velocidad.valor)) {
      const v = y.velocidad, cf = l.conFuente(v, `${nombre} › velocidad`)
      if (cf) velocidad = { pct_30d: num(v.pct_30d), seguidores_30d: num(v.seguidores_30d), seguidores_7d: num(v.seguidores_7d), vistas_30d: num(v.vistas_30d), valor: texto(v.valor)!, inferido: v.inferido === true, ...cf }
    }
    return {
      id, nombre, marca: texto(y.marca), mercado, grupo, pais: texto(y.pais), descripcion: texto(y.descripcion),
      canales, comunidad, oferta, mensaje: m, mecanismo: mec, sofisticacion: sof, cadencia, velocidad,
      por_que_crece: texto(y.por_que_crece), mejor_que_tu: texto(y.mejor_que_tu), cambios: texto(y.cambios),
      imagen: l.imagen(y.imagen, `${nombre} › imagen`), fuentes,
    }
  })
  let tu: Competidores['tu'] = null
  if (obj(x.tu) && texto(x.tu.valor)) {
    const cf = l.conFuente(x.tu, 'competidores › tú')
    if (cf) tu = { valor: texto(x.tu.valor)!, seguidores: num(x.tu.seguidores), url: texto(x.tu.url), ...cf }
  }
  return lista.length ? { ...b, metodo: texto(x.metodo), limites: textos(x.limites), lista, tu } : null
}

/** Lee `mercado.json` con tolerancia. Un esquema distinto se dice, pero se intenta leer igual (el panel muestra lo legible). */
export function leerMercado(x: unknown): { mercado: Mercado | null; errores: string[] } {
  if (!obj(x)) return { mercado: null, errores: [tr('El archivo no es un objeto JSON.')] }
  const l = new Lector()
  if (!ESQUEMAS_LEGIBLES.includes(x.esquema as string)) l.falla('esquema', tr('se esperaba «{esquema}»', { esquema: ESQUEMA_MERCADO }))
  const mercado: Mercado = {
    actualizado: fecha(x.actualizado),
    rumbo: rumbo(l, x.rumbo),
    competidores: competidores(l, x.competidores),
    cabeza: cabeza(l, x.cabeza),
    quien_compra: quienCompra(l, x.quien_compra),
    contra_quien: contraQuien(l, x.contra_quien),
    hacia_donde: haciaDonde(l, x.hacia_donde),
    lo_que_decides: loQueDecides(l, x.lo_que_decides),
  }
  const vacio = !mercado.rumbo && !mercado.competidores && !mercado.cabeza && !mercado.quien_compra && !mercado.contra_quien && !mercado.hacia_donde && !mercado.lo_que_decides
  return { mercado: vacio ? null : mercado, errores: vacio ? [...l.errores, tr('Ningún bloque se pudo leer.')] : l.errores }
}

/**
 * Modo directo: fuera lo que lleva números propios del negocio (quién compra, los borradores con su evidencia y las líneas
 * de la cabeza marcadas `propia`) y el rumbo (una decisión interna no se transmite). Lo público (competencia, referentes,
 * tendencias) se queda.
 */
export function ocultarEnDirecto(m: Mercado): { mercado: Mercado; oculto: Vista[] } {
  const lineas = m.cabeza?.lineas.filter(x => !x.propia) ?? []
  return {
    mercado: { ...m, quien_compra: null, lo_que_decides: null, rumbo: null, cabeza: m.cabeza && lineas.length ? { ...m.cabeza, lineas } : null },
    oculto: ['compra', 'decides'],
  }
}

// ── Ayudas de la vista ──

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «2026-11-08» → «8 nov»; «2026-10» → «oct». Con `conAnio`, o si el año no es el de referencia, lo agrega. */
export function fechaHumana(f: string, ref?: string | null): string {
  const m = FECHA.exec(f)
  if (!m) return f
  const [anio, mes, dia] = f.split('-')
  const nombre = MESES[Number(mes) - 1] ?? mes
  const conAnio = !ref || ref.slice(0, 4) !== anio
  // En inglés, «Nov 8» / «Oct» / «Nov 8, 2026» con Intl; en español, igual que siempre.
  if (enIngles()) return new Date(Date.UTC(Number(anio), Number(mes) - 1, dia ? Number(dia) : 1)).toLocaleDateString(localeIntl(), { ...(dia ? { day: 'numeric' } : {}), month: 'short', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' })
  return `${dia ? `${Number(dia)} ` : ''}${nombre}${conAnio ? ` ${anio}` : ''}`
}

/** «Fuente · fecha» de una pieza, como se pinta bajo cada cifra. */
export const pie = (c: ConFuente, ref?: string | null) => `${c.fuente} · ${fechaHumana(c.fecha, ref)}`

/** La parte de la competencia que se ve primero: los directos; lo demás va plegado. */
export const directos = (h: Competidor[]) => h.filter(c => c.grupo === 'directo')

/** El canal que da la medida de un competidor: el primero de YouTube, si no el primero. */
export const alcanceDe = (c: { canales: Canal[] }) => c.canales.find(x => /youtube/i.test(x.tipo)) ?? c.canales[0] ?? null

/** Las ofertas que cobran (las de precio 0 o gratis no cuentan como escalón de pago). */
export const ofertasDePago = (c: { ofertas: Oferta[] }) => c.ofertas.filter(o => !/^(0|0 usd|gratis)\b/i.test(o.precio.trim()) && !/^«?SUSCR[IÍ]BETE 100% GRATIS/i.test(o.precio))

/** El dominio de una URL, para enlazar una fuente sin pintar la URL entera. */
export function dominio(url: string): string {
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''}`.slice(0, 48) } catch { return url.slice(0, 48) }
}

/** Las iniciales de una ficha sin imagen: la primera letra de las dos primeras palabras con mayúscula («Juan Lombana · …» → «JL»). */
export function iniciales(nombre: string): string {
  const palabras = nombre.split(/[·(+,–-]/)[0].trim().split(/\s+/).filter(w => /^\p{Lu}/u.test(w))
  return (palabras.length ? palabras : [nombre]).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('es')
}

/** El nombre corto de una ficha: lo que va antes de «·» o «(» («Juan Lombana · AI Troopers» → «Juan Lombana»). */
export const nombreCorto = (nombre: string) => nombre.split(/\s·\s|\s\(/)[0].trim()
/** Lo que sigue al nombre corto (la marca o el programa), si lo hay. */
export const marcaDe = (nombre: string) => { const m = /\s·\s(.+)$|\s\((.+)\)$/.exec(nombre); return (m?.[1] ?? m?.[2] ?? '').trim() || null }

/** La audiencia que se lee en la ficha: «260K suscriptores · 199 videos» → «260K suscriptores». */
export const audiencia = (c: Canal) => c.valor.split(/\s·\s|\s\(/)[0]

/**
 * Abrir la sección en una pestaña (8 nov 2026): la tarjeta de El pulso deja el pedido y la sección lo toma al montarse
 * (o lo escucha si ya está abierta). Una sola vez: volver a montar la sección no lo repite.
 */
export const LLAVE_VISTA_ESTRATEGIA = 'arbrain.estrategia.vista'
export const EVENTO_VISTA_ESTRATEGIA = 'arbrain:estrategia-vista'
export const esVista = (x: unknown): x is Vista => VISTAS.some(v => v.id === x)
/**
 * El pedido guardado lleva su hora («decides@1762870000000») y vale unos segundos (11 nov 2026). Abrir la sección cambia
 * la clave de la pestaña y la vuelve a montar: la instancia vieja oye el evento y la nueva lee la llave al nacer, así que
 * el evento ya no la consume (antes la vieja se la llevaba y «Lo que decides» se quedaba arriba). La hora evita que una
 * llave que nadie tomó baje a una tarjeta días después.
 */
export const VIGENCIA_PEDIDO_MS = 10_000
export const pedidoEstrategia = (vista: Vista, ahora = Date.now()) => `${vista}@${ahora}`
export function leerPedidoEstrategia(valor: string | null, ahora = Date.now()): Vista | null {
  if (!valor) return null
  const [vista, t] = valor.split('@')
  const edad = ahora - Number(t)
  return esVista(vista) && Number.isFinite(edad) && edad >= 0 && edad < VIGENCIA_PEDIDO_MS ? vista : null
}

/** Cuántas piezas siguen sin firmar (avatares y posicionamiento). */
export function sinFirmar(d: LoQueDecides | null): number {
  if (!d) return 0
  return d.avatares.filter(a => a.estado !== 'firmado').length + (d.posicionamiento && d.posicionamiento.estado !== 'firmado' ? 1 : 0)
}

// ── Panel v2 (9 nov 2026, Daniel: «quiero algo tan bonito visualmente como business intelligence… es mucho texto») ──
// Cada pregunta se contesta con una figura y una frase. Lo que sigue es puro: qué frase va en cada tarjeta, el titular y
// los tramos de la barra de cada escalón. Nada se redacta aquí: las frases salen del archivo o son conteos.

export type Tema = 'compra' | 'contra' | 'precio'
const TEMAS: Record<Tema, RegExp> = { compra: /sirves|compra/i, contra: /compar|contra/i, precio: /precio/i }
/** La línea de la cabeza que contesta un tema (por su pregunta; si ninguna coincide, por su lugar: 1.ª, 2.ª, 3.ª). */
export function lineaDe(c: Mercado['cabeza'], tema: Tema): Linea | null {
  if (!c?.lineas.length) return null
  const porPregunta = c.lineas.find(x => TEMAS[tema].test(x.pregunta))
  if (porPregunta) return porPregunta
  const i = tema === 'compra' ? 0 : tema === 'contra' ? 1 : 2
  const usadas = new Set((['compra', 'contra', 'precio'] as Tema[]).filter(t => t !== tema).map(t => c.lineas.find(x => TEMAS[t].test(x.pregunta))))
  return c.lineas.filter(x => !usadas.has(x))[i] ?? null
}

/**
 * El titular sale del dato, no de una redacción. Con rumbo firmado, su titular (15 nov: «Full bajo ticket»); sin él, si un
 * peldaño marcado como hueco es también donde estás tú, «Estás en el hueco».
 */
export function titularDe(m: Mercado): string {
  if (m.rumbo) return m.rumbo.titular
  return m.contra_quien?.escalera?.peldanos.some(p => p.hueco && p.tu) ? tr('Estás en el hueco') : tr('Tu mercado')
}

/** Los tramos de la barra de un escalón: cada segmento con su parte del total de SUS segmentos (las unidades no se cruzan). */
export function tramos(e: Escalon): { nombre: string; valor: number | null; unidad: string | null; parte: number }[] {
  const total = e.segmentos.reduce((s, x) => s + (x.tamano?.valor ?? 0), 0)
  return e.segmentos.map(s => ({ nombre: s.nombre, valor: s.tamano?.valor ?? null, unidad: s.tamano?.unidad ?? null, parte: total > 0 && s.tamano ? s.tamano.valor / total : 0 }))
}

/** La frase de Hacia dónde va: un conteo, no una lectura nueva. */
export function fraseRumbo(h: HaciaDonde): string {
  const n = h.tendencias.length, s = h.senales_hispanas?.lista.length ?? 0
  const base = trn(n, '{n} tendencia ya pasa en inglés, cada una con lo que anticipa en español en 6 a 12 meses', '{n} tendencias ya pasan en inglés, cada una con lo que anticipa en español en 6 a 12 meses')
  return s ? tr('{base}; {senales} aquí.', { base, senales: trn(s, '{n} señal ya se mueve', '{n} señales ya se mueven') }) : `${base}.`
}

/** Palabras que no cierran una frase («de», «la», «a»…): una línea corta nunca termina en ellas ni en un número suelto. */
const NO_CIERRA = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'y', 'o', 'e', 'u', 'en', 'con', 'por', 'para', 'que', 'un', 'una', 'su', 'sus', 'se', 'le', 'ya', 'desde', 'entre', 'sin', 'como'])

/**
 * La línea corta de una respuesta para la portada (dieta del 17 nov 2026, Daniel: «hay mucho texto»): sacada del mismo
 * texto, nunca escrita de nuevo. Su primera cláusula (hasta «:» o «;»); si pasa de `max` palabras, sus primeras palabras
 * hasta la última que cierra frase, con «…». Un paréntesis nunca queda abierto. La respuesta entera vive al abrir.
 */
export function lineaCorta(texto: string, max = 14): string {
  const limpio = texto.trim().replace(/\s+/g, ' ')
  const clausula = limpio.split(/[:;]\s/)[0].replace(/[.,]$/, '')
  const palabras = clausula.split(' ')
  // Una cláusula entera cierra sola (juez de la dieta: los «…» se leían como recorte); solo lo cortado lleva «…».
  if (palabras.length <= max) return clausula
  let n = max
  const cierra = (k: number) => {
    const w = palabras[k - 1].replace(/[),.]+$/, '').toLowerCase()
    const abiertos = palabras.slice(0, k).join(' ').split('(').length - palabras.slice(0, k).join(' ').split(')').length
    return !NO_CIERRA.has(w) && !/^\(?[\d.,$%]+$/.test(w) && abiertos === 0
  }
  while (n > 1 && !cierra(n)) n--
  return `${palabras.slice(0, n).join(' ').replace(/[,;]$/, '')}…`
}
