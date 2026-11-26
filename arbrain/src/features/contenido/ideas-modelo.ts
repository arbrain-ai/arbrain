/**
 * Ideas del cuartel (v2, 15 nov 2026) · el modelo puro de la pestaña: los tipos del banco (`ideas.py banco`), su lectura
 * tolerante y lo que decide cómo se dibuja cada boceto de miniatura. El dueño: «acá por ejemplo no cambia la miniatura
 * por video»: cada miniatura es de SU título (misma posición) y su dibujo sale de su propio contenido (escena, lado,
 * tinta), así que dos ideas nunca se ven iguales y cambiar de título cambia la miniatura.
 * Sin React ni disco, para poder probarlo.
 */

export const ESCENAS = ['terminal', 'archivo', 'panel', 'versus', 'grafica', 'chat', 'video', 'lista', 'persona'] as const
export type Escena = (typeof ESCENAS)[number]
export type Lado = 'izq' | 'der'

/** `imagen` («<idea>/<n>»): la miniatura REAL ya generada (Sunburst con su cara, 19 nov); sin ella se dibuja el boceto. */
export interface MiniaturaIdea { texto: string; objeto?: string | null; composicion?: string | null; escena?: string | null; lado?: string | null; imagen?: string | null }

/** De cuál de sus 4 referentes sale la idea (19 nov): por convergencia (2 o más en 10 días) o por su 2x, con su apoyo. */
export interface InspiraIdea { referente: string; por: string[]; convergen: string[]; apoyo: { video_id?: string | null; titulo?: string | null; canal?: string | null; veces?: number | null }[] }

export interface IdeaBanco {
  id: string
  estado: 'nueva' | 'guardada' | 'a_guion' | 'aplicada' | 'descartada' | string
  creada?: string | null
  /** «transcript»: Levy leyó el video original. «empaque»: salió de su título y sus números (se dice en la tarjeta). */
  base: 'transcript' | 'empaque'
  idea: string
  solo_tu?: string | null
  angulo?: string | null
  promesa?: string | null
  tipo?: string | null
  formato?: string | null
  titulos: { texto: string; patron?: string | null }[]
  miniaturas: MiniaturaIdea[]
  titulo_elegido?: number | null
  voz_cliente: { texto: string; tipo?: string | null; uso?: string | null }[]
  para_guion?: { gancho?: string | null; demostracion?: string | null; cta?: string | null } | null
  origen?: { video_id?: string | null; titulo?: string | null; canal?: string | null; outlier?: number | null; confianza?: string | null; vistas?: number | null; publicado?: string | null; idioma?: string | null; por_que_funciono?: string | null } | null
  vence?: string | null
  motivo?: string | null
  todoist?: { id?: string | null; proyecto?: string | null } | null
  todoist_error?: string | null
  inspira?: InspiraIdea | null
  regla_publica?: string | null
  /** «tuya» (19 nov): la idea la dijo o escribió el dueño; «mercado»: salió de un video ajeno que funcionó. */
  procedencia: 'tuya' | 'mercado'
  /** De dónde sale una idea tuya: qué fuente, cuándo y la línea donde aparece. */
  fuente?: FuenteTuya | null
}

export interface FuenteTuya { tipo: string; ruta?: string | null; fecha?: string | null; fecha_aprox?: boolean; cita?: string | null; tambien: string[] }

/** La URL de la miniatura real, o null si todavía no existe. */
export const urlImagen = (m: MiniaturaIdea | null | undefined): string | null => {
  const [id, n] = (m?.imagen ?? '').split('/')
  return id && n && /^idea-[\w-]+$/.test(id) && /^\d+$/.test(n) ? `/api/cuartel/cerebro/miniatura?id=${encodeURIComponent(id)}&n=${n}` : null
}

export interface PiezaEvidencia { id: string; fuente: 'canal' | 'nicho' | 'sirvio' | 'dichos'; texto: string; detalle: string; video_id?: string | null }

export interface TipoContenido {
  estado: 'hipotesis' | 'firmada' | 'rechazada'
  frase: string
  para_quien?: string | null
  formatos: { id: string; nombre: string; que_es?: string | null; ejemplo?: string | null; evidencia: string[] }[]
  no_es: string[]
  duda?: string | null
  generado?: string | null
  firma?: { cuando?: string | null; nota?: string | null } | null
  ajuste?: string | null
  /** «levy»: la frase es un borrador que propuso Levy (sin firmar); `de_donde_sale`: las frases suyas que lo originan. */
  autor?: string | null
  de_donde_sale: { texto: string; fecha?: string | null }[]
  evidencia: Record<string, PiezaEvidencia>
  fuentes: { canal: number; nicho: number; sirvio: number; dichos: number }
}

export interface Banco {
  ideas: IdeaBanco[]
  /** Sus referentes de estudio (los nombres salen del universo, no del código). */
  referentes: string[]
  tipo: TipoContenido | null
  nicho?: string | null
  reglas: { tope_por_decidir: number; caduca_dias: number; guardada_dias: number }
  cuentas: { por_decidir: number; guardadas: number; en_backlog: number; fuera: number; caducadas: number; tuyas: number }
  /** La dirección de miniaturas que eligió el dueño; null = aún no elige (las tarjetas muestran el boceto). */
  estilo_miniaturas: { estilo: string; nombre?: string | null } | null
}

type Suelto = Record<string, unknown>
const obj = (x: unknown): Suelto | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Suelto) : null)
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

const miles = (n: number | null) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} K` : String(n))

function normalizarIdea(x: unknown, i: number): IdeaBanco[] {
  const o = obj(x)
  if (!o) return []
  const titulos = arr(o.titulos).flatMap((t): IdeaBanco['titulos'] => {
    if (typeof t === 'string') return txt(t) ? [{ texto: txt(t)! }] : []
    const tt = obj(t)
    return tt && txt(tt.texto) ? [{ texto: txt(tt.texto)!, patron: txt(tt.patron) }] : []
  })
  const idea = txt(o.idea) ?? txt(o.angulo) ?? titulos[0]?.texto
  if (!idea) return []
  const miniaturas = arr(o.miniaturas).flatMap((m): MiniaturaIdea[] => {
    if (typeof m === 'string') return txt(m) ? [{ texto: txt(m)! }] : []
    const mm = obj(m)
    return mm && txt(mm.texto) ? [{ texto: txt(mm.texto)!, objeto: txt(mm.objeto), composicion: txt(mm.composicion), escena: txt(mm.escena), lado: txt(mm.lado), imagen: txt(mm.imagen) }] : []
  })
  const f = obj(o.origen), g = obj(o.para_guion), td = obj(o.todoist), ins = obj(o.inspira)
  const elegido = num(o.titulo_elegido)
  return [{
    id: txt(o.id) ?? `idea-${i}`, estado: txt(o.estado) ?? 'nueva', creada: txt(o.creada), base: o.base === 'empaque' ? 'empaque' : 'transcript',
    idea, solo_tu: txt(o.solo_tu), angulo: txt(o.angulo), promesa: txt(o.promesa), tipo: txt(o.tipo), formato: txt(o.formato), titulos, miniaturas,
    titulo_elegido: elegido != null && elegido >= 0 && elegido < titulos.length ? elegido : null,
    voz_cliente: arr(o.voz_cliente).flatMap(c => { const cc = obj(c); return cc && txt(cc.texto) ? [{ texto: txt(cc.texto)!, tipo: txt(cc.tipo), uso: txt(cc.uso) }] : [] }),
    para_guion: g && (txt(g.gancho) || txt(g.demostracion) || txt(g.cta)) ? { gancho: txt(g.gancho), demostracion: txt(g.demostracion), cta: txt(g.cta) } : null,
    origen: f ? { video_id: txt(f.video_id), titulo: txt(f.titulo), canal: txt(f.canal), outlier: num(f.outlier), confianza: txt(f.confianza), vistas: num(f.vistas), publicado: txt(f.publicado), idioma: txt(f.idioma), por_que_funciono: txt(f.por_que_funciono) } : null,
    vence: txt(o.vence), motivo: txt(o.motivo), todoist: td ? { id: txt(td.id), proyecto: txt(td.proyecto) } : null, todoist_error: txt(o.todoist_error),
    inspira: ins && txt(ins.referente) ? {
      referente: txt(ins.referente)!, por: arr(ins.por).flatMap(x => (txt(x) ? [txt(x)!] : [])), convergen: arr(ins.convergen).flatMap(x => (txt(x) ? [txt(x)!] : [])),
      apoyo: arr(ins.apoyo).flatMap(a => { const aa = obj(a); return aa && txt(aa.titulo) ? [{ video_id: txt(aa.video_id), titulo: txt(aa.titulo), canal: txt(aa.canal), veces: num(aa.veces) }] : [] }),
    } : null,
    regla_publica: txt(o.regla_publica),
    procedencia: o.procedencia === 'tuya' ? 'tuya' : 'mercado',
    fuente: (() => { const fu = obj(o.fuente); return fu ? { tipo: txt(fu.tipo) ?? 'app', ruta: txt(fu.ruta), fecha: txt(fu.fecha), fecha_aprox: fu.fecha_aprox === true, cita: txt(fu.cita), tambien: arr(fu.tambien).flatMap(x => (txt(x) ? [txt(x)!] : [])) } : null })(),
  }]
}

/** La evidencia de la hipótesis, aplanada por id (c1, n3, s2, d1) y ya con el renglón que se lee en pantalla. */
function normalizarEvidencia(raw: unknown): Record<string, PiezaEvidencia> {
  const ev = obj(raw) ?? {}
  const out: Record<string, PiezaEvidencia> = {}
  for (const fuente of ['canal', 'nicho', 'sirvio', 'dichos'] as const) {
    for (const x of arr(ev[fuente])) {
      const o = obj(x), id = o && txt(o.id), texto = o && (txt(o.titulo) ?? txt(o.texto))
      if (!o || !id || !texto) continue
      const veces = num(o.veces), vistas = miles(num(o.vistas))
      const detalle = fuente === 'canal' ? [o.lado === 'abajo' ? 'de lo que menos te funcionó' : 'tu canal', vistas && `${vistas} vistas`, veces ? `×${veces} tu mediana` : null].filter(Boolean).join(' · ')
        : fuente === 'nicho' ? [txt(o.canal), veces ? `×${veces >= 10 ? Math.round(veces) : veces}` : null, num(o.dias) != null ? `hace ${num(o.dias)} d` : null].filter(Boolean).join(' · ')
        : fuente === 'sirvio' ? ['te sirvió', txt(o.canal)].filter(Boolean).join(' · ')
        : ['lo dijiste tú', txt(o.fecha)].filter(Boolean).join(' · ')
      out[id] = { id, fuente, texto, detalle, video_id: txt(o.video_id) }
    }
  }
  return out
}

function normalizarTipo(raw: unknown): TipoContenido | null {
  const o = obj(raw), frase = o && txt(o.frase)
  if (!o || !frase) return null
  const evidencia = normalizarEvidencia(o.evidencia)
  const formatos = arr(o.formatos).flatMap(f => {
    const ff = obj(f), id = ff && txt(ff.id), nombre = ff && txt(ff.nombre)
    return ff && id && nombre ? [{ id, nombre, que_es: txt(ff.que_es), ejemplo: txt(ff.ejemplo), evidencia: arr(ff.evidencia).filter((e): e is string => typeof e === 'string' && e in evidencia) }] : []
  })
  const firma = obj(o.firma)
  const cuenta = (f: PiezaEvidencia['fuente']) => Object.values(evidencia).filter(e => e.fuente === f).length
  return {
    estado: o.estado === 'firmada' ? 'firmada' : o.estado === 'rechazada' ? 'rechazada' : 'hipotesis', frase, para_quien: txt(o.para_quien), formatos,
    no_es: arr(o.no_es).flatMap(x => (txt(x) ? [txt(x)!] : [])), duda: txt(o.duda), generado: txt(o.generado),
    firma: firma ? { cuando: txt(firma.cuando), nota: txt(firma.nota) } : null, ajuste: txt(o.ajuste), evidencia, autor: txt(o.autor),
    de_donde_sale: arr(o.de_donde_sale).flatMap(x => { const d = obj(x); return d && txt(d.texto) ? [{ texto: txt(d.texto)!, fecha: txt(d.fecha) }] : [] }),
    fuentes: { canal: cuenta('canal'), nicho: cuenta('nicho'), sirvio: cuenta('sirvio'), dichos: cuenta('dichos') },
  }
}

export function normalizarBanco(raw: unknown): Banco {
  const o = obj(raw) ?? {}
  const ideas = arr(o.ideas).flatMap(normalizarIdea)
  const r = obj(o.reglas) ?? {}, c = obj(o.cuentas) ?? {}
  const en = (e: string[]) => ideas.filter(i => e.includes(i.estado) && i.procedencia !== 'tuya').length
  const est = obj(o.estilo_miniaturas)
  return {
    ideas, tipo: normalizarTipo(o.tipo), nicho: txt(o.nicho), referentes: arr(o.referentes).flatMap(x => (txt(x) ? [txt(x)!] : [])),
    reglas: { tope_por_decidir: num(r.tope_por_decidir) ?? 6, caduca_dias: num(r.caduca_dias) ?? 14, guardada_dias: num(r.guardada_dias) ?? 30 },
    cuentas: { por_decidir: en(['nueva']), guardadas: ideas.filter(i => i.estado === 'guardada').length, en_backlog: ideas.filter(i => i.estado === 'a_guion' || i.estado === 'aplicada').length, fuera: en(['descartada']), caducadas: num(c.caducadas) ?? 0, tuyas: ideas.filter(i => i.procedencia === 'tuya' && i.estado === 'nueva').length },
    estilo_miniaturas: est && txt(est.estilo) ? { estilo: txt(est.estilo)!, nombre: txt(est.nombre) } : null,
  }
}

// ── El boceto de cada miniatura ──────────────────────────────────────────────

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** De qué va el objeto de la miniatura cuando el banco no trae `escena` (ideas de antes): se lee de su descripción. */
const PISTAS: [Escena, RegExp][] = [
  ['versus', /\b(dos |lado a lado|contra|versus|vs\b|dividid|antes y (el )?despues|dos columnas|dos terminales|dos cuadros)/],
  ['terminal', /\b(terminal|consola|comando|carpeta|claude code|codigo|repo)\b/],
  ['archivo', /\b(archivo|claude\.md|documento|skill|prompt|plantilla|playbook|checklist|contrato|hoja)\b/],
  ['grafica', /\b(grafica|curva|linea de|crecimiento|ventas|ingresos|metricas|numeros)\b/],
  ['panel', /\b(panel|tablero|dashboard|arbrain|marcador|calendario|agenda)\b/],
  ['chat', /\b(chat|mensaje|whatsapp|conversacion|correo|respuesta)\b/],
  ['video', /\b(video|linea de tiempo|edicion|miniatura|canal|youtube|revision)\b/],
  ['lista', /\b(lista|pasos|reglas|errores|tareas)\b/],
  ['persona', /\b(cliente|fundador|alumno|consultor|dueno|equipo|robot)\b/],
]

export function escenaDe(m: MiniaturaIdea): Escena {
  if (m.escena && (ESCENAS as readonly string[]).includes(m.escena)) return m.escena as Escena
  const t = sinAcentos(`${m.objeto ?? ''}`)
  return PISTAS.find(([, re]) => re.test(t))?.[0] ?? 'panel'
}

/** Cuántas formas tiene cada escena en el dibujo (las demás, una). */
export const FORMAS: Partial<Record<Escena, number>> = { archivo: 3, terminal: 2, panel: 2, versus: 2 }

/** Que dos ideas a la vista no compartan dibujo: a la n-ésima idea cuya miniatura elegida usa la misma escena le toca la
 * forma n de esa escena. Devuelve idea → variante (0 para la primera de cada escena). */
export function variantesPorEscena(ideas: Pick<IdeaBanco, 'id' | 'miniaturas' | 'titulo_elegido'>[]): Map<string, number> {
  const vistas = new Map<Escena, number>(), out = new Map<string, number>()
  for (const i of ideas) {
    const m = miniaturaDe(i, i.titulo_elegido ?? 0)
    if (!m) continue
    const e = escenaDe(m.m), n = vistas.get(e) ?? 0
    out.set(i.id, n)
    vistas.set(e, n + 1)
  }
  return out
}

/** Semilla estable por texto (FNV-1a): la misma idea se dibuja igual siempre; dos ideas distintas, distinto. */
export function semilla(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function ladoDe(m: MiniaturaIdea, clave: string): Lado {
  if (m.lado === 'izq' || m.lado === 'der') return m.lado
  // Ideas de antes: la composición empieza por dónde va la persona («… a la izquierda, mirando la pantalla; el objeto a la
  // derecha»), así que manda el primer lado que se nombra.
  const c = sinAcentos(m.composicion ?? '')
  const iz = c.indexOf('izquierda'), de = c.indexOf('derecha')
  if (iz >= 0 && (de < 0 || iz < de)) return 'izq'
  if (de >= 0) return 'der'
  return semilla(clave) % 2 ? 'der' : 'izq'
}

export const TINTAS = ['oro', 'violeta', 'coral', 'verde', 'azul', 'ambar'] as const
export type Tinta = (typeof TINTAS)[number]

/** La tinta de la miniatura n de una idea: arranca donde diga su id y avanza de a una, así las de una idea no se repiten. */
export const tintaDe = (ideaId: string, n: number): Tinta => TINTAS[(semilla(ideaId) + n) % TINTAS.length]

/** El veredicto en una o dos líneas parejas, para que la palabra grande llene su mitad de la miniatura. */
export function lineasVeredicto(texto: string): string[] {
  const p = texto.trim().split(/\s+/).filter(Boolean)
  if (p.length <= 1 || texto.length <= 9) return [p.join(' ')]
  let mejor = 1, dif = Infinity
  for (let i = 1; i < p.length; i++) {
    const d = Math.abs(p.slice(0, i).join(' ').length - p.slice(i).join(' ').length)
    if (d < dif) { dif = d; mejor = i }
  }
  return [p.slice(0, mejor).join(' '), p.slice(mejor).join(' ')]
}

/** La miniatura que le toca al título n: la de su misma posición; si la idea trae menos miniaturas que títulos, se reparten. */
export function miniaturaDe(idea: Pick<IdeaBanco, 'miniaturas'>, n: number): { m: MiniaturaIdea; indice: number } | null {
  if (!idea.miniaturas.length) return null
  const indice = n % idea.miniaturas.length
  return { m: idea.miniaturas[indice], indice }
}

// ── Tiempo: lo que falta para que una idea se vaya sola ──────────────────────

export function diasPara(iso: string | null | undefined, ahora = Date.now()): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.ceil((t - ahora) / 864e5)
}

export function textoVence(idea: Pick<IdeaBanco, 'vence'>, ahora = Date.now()): string | null {
  const d = diasPara(idea.vence, ahora)
  if (d == null) return null
  return d <= 0 ? 'se va hoy' : d === 1 ? 'se va mañana' : `se va sola en ${d} días`
}

/** El aviso solo cuando ya urge (la regla general se dice una vez, arriba): así no se repite en cada tarjeta. */
export function avisoVence(idea: Pick<IdeaBanco, 'vence'>, ahora = Date.now(), umbral = 5): string | null {
  const d = diasPara(idea.vence, ahora)
  return d != null && d <= umbral ? textoVence(idea, ahora) : null
}

/** El rendimiento del original en un renglón honesto: sus vistas y cuántas veces lo normal de su canal. Un ×131 sobre un
 * canal chico exagera (el JUEZ lo midió), así que el multiplicador se topa en «×100+» y nunca va solo. */
export function rendimientoOrigen(o: { outlier?: number | null; vistas?: number | null } | null | undefined): { vistas: string | null; veces: string | null } {
  const v = o?.vistas, p = o?.outlier
  return {
    vistas: v ? `${miles(v)} vistas` : null,
    veces: p && p >= 1.5 ? (p > 100 ? '×100+' : `×${p >= 10 ? Math.round(p) : p.toFixed(1)}`) : null,
  }
}

/** Por qué entra una idea de sus referentes, en una línea: «<referente> · convergen 3 en 10 días» o «<referente> · su 7.4x». */
export function textoInspira(ins: InspiraIdea | null | undefined, veces?: number | null): string | null {
  if (!ins) return null
  const conv = ins.por.includes('convergencia') && ins.convergen.length >= 2 ? `convergen ${ins.convergen.length} de tus referentes en 10 días` : null
  const x = ins.por.includes('outlier') && veces && veces >= 2 ? `su ${veces >= 10 ? Math.round(veces) : veces.toFixed(1)}x` : null
  return [ins.referente, conv ?? x].filter(Boolean).join(' · ')
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Cuándo salió el video original: lo reciente en días («hace 5 días»); lo viejo con su fecha, para que se note («18 jun»). */
export function fechaOrigen(iso: string | null | undefined, ahora = Date.now()): { texto: string; hace?: string; viejo: boolean } | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const dias = Math.floor((ahora - t) / 864e5)
  if (dias <= 0) return { texto: 'hoy', viejo: false }
  if (dias <= 30) return { texto: dias === 1 ? 'ayer' : `hace ${dias} días`, viejo: false }
  const d = new Date(t)
  // `hace` va aparte: en pantallas angostas se queda solo la fecha, que es lo que no se puede perder
  return { texto: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`, hace: `hace ${dias < 60 ? `${Math.round(dias / 7)} semanas` : `${Math.round(dias / 30)} meses`}`, viejo: true }
}

const NOMBRE_FUENTE: Record<string, string> = {
  app: 'la escribiste aquí', backlog: 'tu ideas-backlog', todoist: 'Todoist › YouTube', banco: 'tu banco de contenido', motor: 'el motor de ideas',
  diario: 'tu diario', memoria: 'una conversación con Levy', encargo: 'se lo dijiste a Levy',
}

/** De dónde sale una idea tuya, en una línea corta: «tu diario · 18 nov» (+ «y 2 más» si la dijiste en otras fuentes). */
export function textoFuente(f: FuenteTuya | null | undefined): { texto: string; detalle: string | null } {
  if (!f) return { texto: 'tuya', detalle: null }
  const fecha = f.fecha && /^\d{4}-\d{2}-\d{2}/.test(f.fecha) ? `${Number(f.fecha.slice(8, 10))} ${MESES[Number(f.fecha.slice(5, 7)) - 1]}${f.fecha_aprox ? ' (aprox.)' : ''}` : null
  const donde = NOMBRE_FUENTE[f.tipo] ?? f.tipo
  const mas = f.tambien.length ? ` · y en ${f.tambien.length} ${f.tambien.length === 1 ? 'fuente más' : 'fuentes más'}` : ''
  const detalle = [f.ruta, f.cita ? `«${f.cita}»` : null, ...f.tambien.map(t => `también: ${t}`)].filter(Boolean).join('\n') || null
  return { texto: [donde, fecha].filter(Boolean).join(' · ') + mas, detalle }
}

export const MOTIVOS: [string, string][] = [['no_es_mi_nicho', 'No es mi nicho'], ['ya_lo_hice', 'Ya lo hice'], ['no_me_late', 'No me late']]
