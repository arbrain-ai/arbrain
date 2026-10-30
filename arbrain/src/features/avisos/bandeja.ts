// La bandeja de la campana (29 oct 2026). Reglas PURAS: qué pide una decisión, qué es riesgo real, qué solo informa,
// cómo se dice en una línea humana y cuándo un aviso se cerró solo. Sin Next ni Supabase (tests/avisos/bandeja.test.ts).
//
// Daniel (29 oct): «soy yo o el sistema de notificaciones las siento algo cutre?? … nunca las checo!!». Principio
// firmado: a Daniel le llegan decisiones, no reportes; la telemetría va a la bitácora. Por eso:
//   · «Te toca decidir» arriba, con conteo. El número de la campana es SOLO este grupo.
//   · «Urgente» solo si es riesgo real (seguridad, servidor caído, alumnos sin poder entrar) y reciente.
//   · «Para saber» plegado: reportes, lecciones nuevas, el Studio apretado. No cuenta.
//   · Un aviso se cierra solo cuando su causa se resolvió (la decisión ya se tomó, la grabación apareció, se repitió).

import type { AvisoKind } from './policy'

export type Grupo = 'decidir' | 'urgente' | 'saber'

/** Lo que se puede hacer desde el aviso. `publicar`, `descartar` y `duda` son los botones de /decidir (el toque de siempre). */
export type AccionAviso =
  | { tipo: 'publicar'; etiqueta: string }
  | { tipo: 'descartar'; etiqueta: string }
  | { tipo: 'duda'; etiqueta: string }
  | { tipo: 'borrador'; etiqueta: string }
  | { tipo: 'abrir'; etiqueta: string; url: string }
  | { tipo: 'visto'; etiqueta: string }

export interface AvisoFila {
  id: string
  created_at: string
  kind: AvisoKind
  source: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  clave?: string | null
  resuelto_at?: string | null
  resuelto_por?: string | null
}

/** Lo que dice arbrain.ai de una decisión de /decidir, buscada por el token de su enlace. */
export interface EstadoDecision {
  estado: 'pendiente' | 'cerrada'
  categoria?: string | null
  /** El texto que Levy propone (la respuesta de la comunidad, el correo). */
  borrador?: string | null
  /** Enlace profundo a lo que escribió la persona en arbrain.ai (su post o su comentario exacto). */
  origen?: string | null
}

export interface AvisoVista {
  id: string
  created_at: string
  kind: AvisoKind
  source: string
  url: string | null
  read_at: string | null
  grupo: Grupo
  /** Quién o qué, en una línea. */
  titulo: string
  /** La decisión (o lo que pasó) en una frase. */
  frase: string | null
  /** Lo que escribió la persona, si aplica (una línea, se despliega con «Ver borrador»). */
  cita: string | null
  borrador: string | null
  /** Enlace profundo al mensaje exacto de la persona en arbrain.ai (29 oct: «que abra exactamente el campo»). */
  origen: string | null
  acciones: AccionAviso[]
}

export interface Bandeja {
  decidir: AvisoVista[]
  urgente: AvisoVista[]
  saber: AvisoVista[]
  /** El número de la campana: decisiones pendientes y nada más. */
  pendientes: number
  /** Avisos que se cerraron solos en esta lectura (el servidor los guarda con su motivo). */
  cerrar: { id: string; por: MotivoCierre }[]
}

export type MotivoCierre = 'decidido' | 'causa-resuelta' | 'repetido'

const HORA = 3600_000
/** Un riesgo deja de ser urgente si nadie lo volvió a reportar en este tiempo (vigia-seguridad repite cada ~6 h mientras siga). */
export const URGENTE_HORAS = 8
/** Una decisión sin estado vivo (sin enlace de /decidir) deja de contar tras este tiempo: pasa a «Para saber». */
export const DECISION_HORAS = 48
/** /decidir caduca a las 72 h (pipeline_ht.py); sin poder leer su estado, tampoco cuenta después. */
export const DECIDIR_HORAS = 72
/** Una pregunta suelta («¿Bajamos a tierra tu día?») vale el día. */
export const PREGUNTA_HORAS = 12
/** El repaso antes de una llamada vale hasta la llamada. */
export const PREVIA_HORAS = 3

/** Emisores cuyo aviso es riesgo real para Daniel: seguridad, servidor caído, alumnos que no pueden entrar. */
const RIESGO = new Set(['vigia-seguridad', 'arbrain-ht-servidor', 'servidores', 'health-sentinel', 'vigia-e2e'])

const RE_DECIDIR = /\/decidir\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/
export function tokenDecidir(url: string | null | undefined): string | null {
  return url ? url.match(RE_DECIDIR)?.[1] ?? null : null
}

const RE_POST = /\/community\?post=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[&#]|$)/i
/** El post de un aviso de recap («…/community?post=<id>»), o null. */
export function postDeRecap(a: Pick<AvisoFila, 'source' | 'title' | 'url'>): string | null {
  if (a.source !== 'ht-grupales' || !/Recap de la grupal/i.test(a.title)) return null
  return a.url?.match(RE_POST)?.[1] ?? null
}

/** Dónde vive lo que escribió la persona: «comunidad:post:<id>» → el post; «comunidad:comentario:<id>» → su comentario. */
export function origenDeClave(clave: string | null | undefined, base: string): string | null {
  const m = (clave ?? '').match(/^comunidad:(post|comentario):([0-9a-f-]{36})$/i)
  if (!m) return null
  const b = base.replace(/\/$/, '')
  return m[1] === 'post' ? `${b}/community?post=${m[2]}` : `${b}/ir/comentario/${m[2]}`
}

// ── Texto humano ──

const EMOJI_INICIAL = /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍\s]+/u
const sinEmoji = (s: string) => s.replace(EMOJI_INICIAL, '').trim()
const mayuscula = (s: string) => s ? s[0].toLocaleUpperCase('es') + s.slice(1) : s
const unaLinea = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Líneas que son jerga interna o instrucciones para Levy: no le llegan a Daniel. */
const JERGA = [
  /\bNO VERIFICADO\b|\bVERIFICADO\b/i,
  /^Queda en borrador\b/i,
  /^Te la paso a ti\b/i,
  /^Si toca dinero\b/i,
  /^Runbook\b/i,
  /^Levy:/i,
  /^Por qué te toca\b/i,
  /el modelo no la marcó segura|el modelo no está seguro/i,
  /^https?:\/\/\S+$/,
]

/** La primera línea útil del cuerpo, sin jerga, recortada a una frase. */
export function primeraLinea(body: string | null, max = 140): string | null {
  for (const cruda of (body ?? '').split('\n')) {
    const l = sinEmoji(cruda).replace(/^[•·\-–]\s*/, '')
    if (!l || JERGA.some(re => re.test(l))) continue
    // Lo que sigue a «Levy:» es para Levy, y un «:» final anuncia una lista que no viaja.
    return recortar(l.split(/\s+Levy:/)[0].replace(/\s*[:·]\s*$/, ''), max)
  }
  return null
}

export function recortar(s: string, max: number): string {
  const t = unaLinea(s)
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[,;:.\s]+$/, '')}…`
}

const citaDe = (body: string | null) => {
  // El emisor recorta el cuerpo: la cita puede llegar sin su «»» final.
  const m = (body ?? '').match(/escribió: «([\s\S]+?)(?:»|$)/)
  return m ? recortar(m[1], 220) : null
}

const enlaceUtil = (url: string | null) => url && url !== '/' ? url : null

type Forma = Omit<AvisoVista, 'id' | 'created_at' | 'kind' | 'source' | 'url' | 'read_at' | 'borrador' | 'origen'> & { vigenciaH?: number }

const visto: AccionAviso = { tipo: 'visto', etiqueta: 'Ya lo vi' }
const abrir = (url: string | null, etiqueta = 'Abrir'): AccionAviso[] => {
  const u = enlaceUtil(url)
  return u ? [{ tipo: 'abrir', etiqueta, url: u }] : []
}

/** Cómo se dice cada aviso: un título de una línea (quién/qué), la decisión en una frase y sus botones. */
export function presentar(a: AvisoFila, estado?: EstadoDecision | null): Forma {
  const titulo0 = sinEmoji(a.title).replace(/^🧪\s*/, '')
  const token = tokenDecidir(a.url)

  // La comunidad del programa: «¿Publico la respuesta de Levy a X?». Publicar y Descartar son los botones de /decidir.
  // En la campana de quien revisa por el dueño (27 oct: las que no tocan dinero ni promesas) dice «¿Publicas…?» y su
  // página trae «Editar» y «Tengo duda» (no se publica y pasa al dueño): los mismos botones, aquí (29 oct).
  const delRevisor = titulo0.match(/^¿[Pp]ublicas la respuesta de Levy a (.+?)\?$/)
  if (delRevisor && token) {
    return {
      grupo: 'decidir', titulo: `${delRevisor[1]} en la comunidad`, frase: '¿Publicas la respuesta de Levy?',
      cita: citaDe(a.body),
      acciones: [{ tipo: 'publicar', etiqueta: 'Publícala' }, { tipo: 'borrador', etiqueta: 'Ver borrador' },
        ...abrir(a.url, 'Editar'), { tipo: 'duda', etiqueta: 'Tengo duda' }],
      vigenciaH: DECIDIR_HORAS,
    }
  }
  const com = titulo0.match(/^(?:(\S+) tiene duda: )?¿[Pp]ublico (la respuesta de Levy|tu respuesta) a (.+?)\?$/)
  if (com && token) {
    const deLevy = com[2] !== 'tu respuesta'
    return {
      grupo: 'decidir', titulo: `${com[3]} en la comunidad`,
      frase: `${com[1] ? `${com[1]} tiene duda. ` : ''}¿Publico ${deLevy ? 'la respuesta de Levy' : 'tu respuesta'}?`,
      cita: citaDe(a.body),
      acciones: [{ tipo: 'publicar', etiqueta: 'Publicar' }, { tipo: 'borrador', etiqueta: 'Ver borrador' }, { tipo: 'descartar', etiqueta: 'Descartar' }],
      vigenciaH: DECIDIR_HORAS,
    }
  }
  if (token) {
    // Las demás decisiones de /decidir (¿Entra?, recordatorios en sombra, cobros, casos): se responden en su página.
    const entra = titulo0.match(/^¿Entra (.+)\?$/)
    const mando = titulo0.match(/^¿Mando a (.+?) (el|la|los|las) (.+)\?$/)
    const partida = titulo0.match(/^(.+?)\.\s+(¿.+\?)$/)
    const [titulo, frase] = entra ? [entra[1], '¿Entra al Acompañamiento?']
      : mando ? [mando[1], `¿Le mando ${mando[2]} ${mando[3]}?`]
      : partida ? [partida[1], partida[2]]
      : [titulo0, primeraLinea(a.body)]
    return { grupo: 'decidir', titulo, frase, cita: citaDe(a.body), acciones: [...abrir(a.url, 'Decidir'), visto], vigenciaH: DECIDIR_HORAS }
  }

  if (a.source === 'ht-grupales') {
    if (/^Recap de la grupal/i.test(titulo0)) {
      const post = (a.body ?? '').split(/:\s*quedó como borrador/i)[0]
      // «Publicar» es el mismo botón del feed, de un toque (ht-agenda recap-publicar); «Ver borrador» abre ESE post.
      const publicar: AccionAviso[] = postDeRecap(a) ? [{ tipo: 'publicar', etiqueta: 'Publicar' }] : []
      return {
        grupo: 'decidir', titulo: 'Recap de la grupal', frase: 'Está en borrador en Anuncios. ¿Lo publicas?',
        cita: post && post !== a.body ? recortar(sinEmoji(post), 160) : null,
        acciones: [...publicar, ...abrir(a.url, 'Ver borrador'), visto], vigenciaH: DECISION_HORAS,
      }
    }
    if (/^No encontré la grabación/i.test(titulo0)) {
      const fecha = fechaDeGrupal(a.body)
      return {
        grupo: 'decidir', titulo: `Falta la grabación de la grupal${fecha ? ` · ${fecha}` : ''}`,
        frase: 'Pásale a Levy el enlace de Fathom y la lección sale sola.', cita: null, acciones: [visto], vigenciaH: DECISION_HORAS,
      }
    }
    return { grupo: 'saber', titulo: titulo0, frase: primeraLinea(a.body), cita: null, acciones: abrir(a.url) }
  }

  if (a.source === 'sfc:reporte-clase') {
    const clase = titulo0.match(/^Clase lista para revisar: (.+)$/)
    if (clase) {
      return {
        grupo: 'decidir', titulo: clase[1],
        frase: /borrador/i.test(a.body ?? '') ? 'La lección y el post de SaaS Factory quedaron en borrador. ¿Los revisas?' : 'Lista para revisar.',
        cita: null, acciones: [...abrir(a.url), visto], vigenciaH: DECISION_HORAS,
      }
    }
    return { grupo: 'saber', titulo: titulo0.replace(/^Asistencia de la clase: /, 'Asistencia · '), frase: null, cita: null, acciones: abrir(a.url) }
  }

  const sub = titulo0.match(/^Un subagente espera tu decisión · (.+)$/)
  if (sub) return { grupo: 'decidir', titulo: sub[1], frase: 'Un subagente espera tu decisión.', cita: null, acciones: [...abrir(a.url ?? '/', 'Abrir'), visto], vigenciaH: 48 }
  if (a.source === 'guardia:cola') {
    return { grupo: 'decidir', titulo: (a.body ?? '').split('.')[0] || titulo0, frase: 'Levy te espera para decidir; siguió con lo demás.', cita: null, acciones: [{ tipo: 'abrir', etiqueta: 'Abrir', url: a.url || '/' }, visto], vigenciaH: 48 }
  }
  if (a.source === 'preflight-llamada') {
    return { grupo: 'decidir', titulo: titulo0, frase: primeraLinea(a.body), cita: null, acciones: [...abrir(a.url), visto], vigenciaH: PREVIA_HORAS }
  }

  const pideVa = /«(va|mándalo)»|espera tu decisión|falta un permiso/i.test(`${titulo0}\n${a.body ?? ''}`)
  if (pideVa) return { grupo: 'decidir', titulo: titulo0, frase: primeraLinea(a.body), cita: null, acciones: [...abrir(a.url), visto], vigenciaH: DECISION_HORAS }
  if (titulo0.startsWith('¿')) return { grupo: 'decidir', titulo: titulo0, frase: primeraLinea(a.body), cita: null, acciones: [...abrir(a.url), visto], vigenciaH: PREGUNTA_HORAS }

  if (a.kind === 'alerta' && RIESGO.has(a.source)) {
    const { titulo, frase } = riesgo(a, titulo0)
    return { grupo: 'urgente', titulo, frase, cita: null, acciones: [...abrir(a.url), visto], vigenciaH: URGENTE_HORAS }
  }
  return { grupo: 'saber', titulo: titulo0, frase: primeraLinea(a.body), cita: null, acciones: abrir(a.url) }
}

function riesgo(a: AvisoFila, titulo0: string): { titulo: string; frase: string | null } {
  if (a.source === 'vigia-seguridad') {
    // «VPS: disco al 97.3% (respaldos y base en riesgo)» → título «VPS: disco al 97.3%», frase «Respaldos y base en riesgo.»
    const l = primeraLinea(a.body, 200)
    const m = l?.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (m) return { titulo: m[1], frase: `${mayuscula(m[2])}.` }
    return { titulo: l ?? titulo0, frase: null }
  }
  const titulo = mayuscula(titulo0.replace(/^Arbrain:\s*/, ''))
  const veces = (a.body ?? '').match(/(\d+) pasadas seguidas/)
  if (veces) return { titulo, frase: `Falló en ${veces[1]} revisiones seguidas.` }
  return { titulo, frase: primeraLinea(a.body) }
}

/** «👥 Grupal · … (mié 28 oct): no hay enlace…» → «mié 28 oct». */
export function fechaDeGrupal(body: string | null): string | null {
  return (body ?? '').match(/\(([a-záéíóú]{3} \d{1,2} [a-z]{3})\)/i)?.[1] ?? null
}

// ── Autorresolución ──

const normalizar = (s: string) => sinEmoji(s).replace(/\d+(?:[.,]\d+)?/g, 'N').toLowerCase()

/**
 * El tema de un aviso: dos avisos del mismo tema son el mismo asunto y solo vale el más nuevo. Un enlace propio
 * (una decisión, un post, una lección) es su tema; sin él, el título y, en alertas y grupales, qué dice (sin cifras:
 * «disco al 97.3%» y «disco al 97.5%» son el mismo asunto; «Seguridad: VPS» por disco o por puertos, no).
 */
export function temaDe(a: AvisoFila): string {
  const u = enlaceUtil(a.url)
  const especifico = u && /[?#]|\/decidir\/|\/classroom\/[^/?#]+/.test(u) && !u.startsWith('/chat?session=') && !u.startsWith('/rutinas')
  if (especifico) return `${a.source}|${u}`
  // Títulos genéricos («Seguridad: VPS», «No encontré la grabación…»): el asunto está en el cuerpo.
  const conCuerpo = a.source === 'vigia-seguridad' || a.source === 'ht-grupales'
  return `${a.source}|${normalizar(a.title)}${conCuerpo ? `|${normalizar(primeraLinea(a.body, 400) ?? '').slice(0, 50)}` : ''}`
}

/**
 * ¿Se cerró solo? La causa manda: la decisión ya se tomó en /decidir (o caducó), la grabación que faltaba ya es lección,
 * o un aviso más nuevo del mismo tema lo reemplazó. `filas` viene del más nuevo al más viejo.
 */
export function motivoDeCierre(a: AvisoFila, filas: AvisoFila[], estados: ReadonlyMap<string, EstadoDecision>,
  publicados: ReadonlySet<string> = new Set()): MotivoCierre | null {
  const token = tokenDecidir(a.url)
  if (token && estados.get(token)?.estado === 'cerrada') return 'decidido'
  // El recap que ya no es borrador (lo publicó en el feed o desde aquí) no pide nada: se lee en vivo, no se espera al cron.
  const post = postDeRecap(a)
  if (post && publicados.has(post)) return 'causa-resuelta'
  const t = Date.parse(a.created_at)
  const despues = filas.filter(o => o.id !== a.id && Date.parse(o.created_at) > t)
  if (a.source === 'ht-grupales' && /^No encontré la grabación/i.test(a.title)) {
    const fecha = fechaDeGrupal(a.body)
    if (fecha && despues.some(o => o.source === 'ht-grupales' && /^Nueva lección/i.test(o.title) && (o.body ?? '').includes(fecha))) return 'causa-resuelta'
  }
  const tema = temaDe(a)
  if (despues.some(o => temaDe(o) === tema)) return 'repetido'
  return null
}

/** Arma la campana: agrupa, ordena (lo más nuevo arriba), cierra lo resuelto y cuenta solo decisiones pendientes. */
export function armarBandeja(filas: AvisoFila[], estados: ReadonlyMap<string, EstadoDecision>, ahora: Date, topeSaber = 20,
  publicados: ReadonlySet<string> = new Set()): Bandeja {
  const orden = [...filas].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
  const out: Bandeja = { decidir: [], urgente: [], saber: [], pendientes: 0, cerrar: [] }
  for (const a of orden) {
    if (a.resuelto_at) continue
    const por = motivoDeCierre(a, orden, estados, publicados)
    if (por) { out.cerrar.push({ id: a.id, por }); continue }
    const token = tokenDecidir(a.url)
    const estado = token ? estados.get(token) ?? null : null
    const { vigenciaH, ...forma } = presentar(a, estado)
    let grupo = forma.grupo
    const edadH = (ahora.getTime() - Date.parse(a.created_at)) / HORA
    // Una decisión con estado vivo «pendiente» sigue contando mientras arbrain.ai la tenga abierta.
    const vivaPendiente = estado?.estado === 'pendiente'
    if (grupo !== 'saber' && vigenciaH && edadH > vigenciaH && !vivaPendiente) grupo = 'saber'
    const acciones = grupo === 'saber' && forma.grupo !== 'saber' ? forma.acciones.filter(x => x.tipo === 'abrir') : forma.acciones
    // Sin el borrador a la mano, «Ver borrador» abre la página de la decisión.
    const borrador = estado?.borrador ?? null
    const origen = estado?.origen ?? null
    // «Ver en arbrain.ai»: el post o el comentario exacto de la persona, en toda respuesta de la comunidad que aún se decide.
    const conOrigen: AccionAviso[] = origen && acciones.some(x => x.tipo === 'publicar') ? [...acciones, { tipo: 'abrir', etiqueta: 'Ver en arbrain.ai', url: origen }] : acciones
    const vista: AvisoVista = {
      id: a.id, created_at: a.created_at, kind: a.kind, source: a.source, url: a.url, read_at: a.read_at,
      ...forma, grupo, borrador, origen, acciones: conOrigen.map(x => x.tipo === 'borrador' && !borrador && !forma.cita ? { tipo: 'abrir', etiqueta: x.etiqueta, url: a.url ?? '/' } : x),
    }
    out[grupo].push(vista)
  }
  out.saber = out.saber.slice(0, topeSaber)
  out.pendientes = out.decidir.length
  return out
}

// ── /decidir: el mismo toque que el botón de la página ──

/**
 * La página /decidir/<token> de arbrain.ai pinta cada botón como un formulario de server action que funciona sin
 * JavaScript (`<input type="hidden" name="$ACTION_ID_…">` + token, paso, r). Enviar ESE formulario es exactamente lo
 * que pasa cuando Daniel toca «Publícala» o «No»: misma acción (responderDecision), mismas reglas, mismo efecto.
 * Devuelve los campos del formulario del botón pedido, o null si la página no lo ofrece (ya decidida, caducada).
 */
export function formularioDecision(html: string, r: 'si' | 'no' | 'duda'): Record<string, string> | null {
  for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)) {
    const dentro = m[1]
    if (!/<button\b/.test(dentro) || /<textarea\b/.test(dentro)) continue
    const campos: Record<string, string> = {}
    for (const i of dentro.matchAll(/<input\b[^>]*>/g)) {
      const nombre = i[0].match(/\bname="([^"]+)"/)?.[1]
      if (!nombre) continue
      campos[nombre] = desescapar(i[0].match(/\bvalue="([^"]*)"/)?.[1] ?? '')
    }
    if (campos.paso === 'decision' && campos.r === r && campos.token && Object.keys(campos).some(k => k.startsWith('$ACTION_ID_'))) return campos
  }
  return null
}

const desescapar = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
