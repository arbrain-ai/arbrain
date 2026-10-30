/**
 * «La historia de tu cerebro» (27 oct 2026): git en humano. Lógica pura, sin disco ni procesos: lo que el servidor
 * lee de git (git.ts) entra aquí como texto y sale como eventos, carriles y diffs que entiende alguien que nunca usó git.
 * Contrato y reglas: docs/builds/harness-noche-2026-10-27/nodos/historia.md.
 *
 *  · Evento   un cambio guardado (commit) contado como frase: qué cambió (por área), quién, cuándo y por qué.
 *  · Carril   un trabajo en paralelo (rama o copia de trabajo de un agente) que sale de main y se junta.
 *  · Diff     memorias y skills como prosa con lo añadido y lo quitado; el código, plegado con su resumen.
 */

export const ZONA = 'America/Mexico_City'

// ── Quién ──

export type Quien = 'persona' | 'levy' | 'subagente' | 'rutina'
export type Area = 'memoria' | 'skills' | 'producto' | 'contenido' | 'sistema'
export const AREAS: readonly Area[] = ['memoria', 'skills', 'producto', 'contenido', 'sistema']
export const NOMBRE_AREA: Record<Area, string> = { memoria: 'Memoria', skills: 'Habilidades', producto: 'Producto', contenido: 'Contenido', sistema: 'Sistema' }
export const NOTA_AREA: Record<Area, string> = {
  memoria: 'Lo que tu cerebro sabe de ti',
  skills: 'Lo que tu cerebro sabe hacer',
  producto: 'La app y su código',
  contenido: 'Documentos, clases y notas de obra',
  sistema: 'Reglas, ajustes y la máquina',
}

/** Un coautor de IA en el mensaje: Claude, Codex, GPT o el correo sin respuesta de Anthropic u OpenAI. */
const IA = /\b(claude|codex|gpt|openai|anthropic|levy)\b|noreply@(anthropic|openai)\.com/i
/** Prefijo de una rutina que guarda sola: `auto(tareas-espejo): …`, `memoria(macbook): 15 archivo(s) sincronizados`. */
const RUTINA = /^(auto|memoria|sync|sincroniza|respaldo|cron)\(([^)]{1,60})\):\s*(.*)$/i

export interface CommitCrudo {
  sha: string
  padres: string[]
  autor: string
  correo: string
  /** ISO 8601 con zona (`%aI`). */
  fecha: string
  /** Mensaje completo (`%B`): primera línea, cuerpo y trailers. */
  mensaje: string
  archivos: ArchivoCrudo[]
}
export interface ArchivoCrudo { ruta: string; mas: number; menos: number; binario: boolean }

/** Trailers `Co-Authored-By:` del mensaje. */
export function coautores(mensaje: string): string[] {
  return [...mensaje.matchAll(/^co-authored-by:\s*(.+)$/gim)].map(m => m[1].trim())
}

/**
 * Regla de autor (explicada en historia.md):
 *  1. Rutina: el mensaje empieza con `auto(…)`, `memoria(…)` u otro prefijo de guardado automático.
 *  2. Subagente: trae coautor de IA y llegó a main desde otro carril (rama `wt-*`, `hn-*` u otra), o vive en uno.
 *  3. Levy: trae coautor de IA (o el autor es un bot) y está en la línea principal de main.
 *  4. Daniel: todo lo demás (su nombre de git sin coautor de IA; incluye «Volver» hecho desde la app).
 */
export function quienDe(c: Pick<CommitCrudo, 'mensaje' | 'autor' | 'correo'>, ctx: { carril?: string | null } = {}): Quien {
  const asunto = primeraLinea(c.mensaje)
  if (RUTINA.test(asunto)) return 'rutina'
  // El trailer firmado manda sobre la adivinanza (contrato en historia.md).
  const firma = firmaDe(c.mensaje)
  if (firma) return firma.quien
  const conIA = coautores(c.mensaje).some(x => IA.test(x)) || /\[bot\]|noreply@(anthropic|openai)/i.test(`${c.autor} ${c.correo}`)
  if (!conIA) return 'persona'
  return ctx.carril && !esMain(ctx.carril) ? 'subagente' : 'levy'
}

/**
 * Trailer estable de autor (27 oct 2026, contrato en historia.md): `Agente: levy`, `Agente: persona`,
 * `Subagente: hn-historia` o `Agente: <nombre>`. Lo escriben delegar y los commits automáticos; así la vista atribuye
 * sin adivinar por carril ni por coautor. `nombre` es el que trae el trailer, tal cual.
 */
export function firmaDe(mensaje: string): { quien: Quien; nombre: string } | null {
  const m = [...mensaje.matchAll(/^(agente|subagente):[ \t]*(\S.{0,79})$/gim)].pop()
  if (!m) return null
  const nombre = m[2].trim()
  if (m[1].toLowerCase() === 'agente') {
    if (/^levy$/i.test(nombre)) return { quien: 'levy', nombre: 'Levy' }
    if (/^(persona|t[uú]|due[nñ]o)$/i.test(nombre)) return { quien: 'persona', nombre: 'Tú' }
    if (/^(rutina|cron)\b/i.test(nombre)) return { quien: 'rutina', nombre }
  }
  return { quien: 'subagente', nombre }
}

export const NOMBRE_QUIEN: Record<Quien, string> = { persona: 'Tú', levy: 'Levy', subagente: 'Un agente', rutina: 'Una rutina' }

export const esMain = (rama: string) => /^(origin\/)?(main|master)$/.test(rama)

// ── Áreas ──

/** A qué parte del cerebro pertenece un archivo. El primer prefijo que coincide manda. */
export function areaDe(ruta: string): Area {
  const r = ruta.replace(/^\.\/+/, '')
  if (/^\.claude\/(memory|diario|knowledge|daily)\//.test(r)) return 'memoria'
  if (/^\.claude\/(skills|skills-archive)\//.test(r) || /^\.agents\/skills\//.test(r) || /^arbrain\/skills\//.test(r)) return 'skills'
  if (/^docs\/builds\//.test(r)) return 'producto'
  if (/^(arbrain|arbrain-extension|agent-server|casa|entorno-fisico|software)\//.test(r)) return 'producto'
  if (/^(contenido|docs|negocio)\//.test(r)) return 'contenido'
  return 'sistema'
}

export interface ResumenArea { area: Area; archivos: number; mas: number; menos: number }

export function porArea(archivos: ArchivoCrudo[]): ResumenArea[] {
  const m = new Map<Area, ResumenArea>()
  for (const a of archivos) {
    const area = areaDe(a.ruta)
    const r = m.get(area) ?? { area, archivos: 0, mas: 0, menos: 0 }
    r.archivos++; r.mas += a.mas; r.menos += a.menos
    m.set(area, r)
  }
  return AREAS.flatMap(a => m.get(a) ?? [])
}

// ── Del texto de git a commits ──

export const SEP_REG = '\x1e'
export const SEP_CAMPO = '\x1f'
/** El formato que espera `parsearLog`: un registro por commit, campos separados; el numstat va después del último campo. */
export const FORMATO_LOG = `${SEP_REG}%H${SEP_CAMPO}%P${SEP_CAMPO}%an${SEP_CAMPO}%ae${SEP_CAMPO}%aI${SEP_CAMPO}%B${SEP_CAMPO}`

/** `a/{x => y}/b` y `a => b` del numstat: la ruta nueva. */
export function rutaNueva(r: string): string {
  if (r.includes('{') && r.includes(' => ')) return r.replace(/\{([^{}]*) => ([^{}]*)\}/g, (_, _a, b) => b).replace(/\/\/+/g, '/')
  const i = r.indexOf(' => ')
  return i >= 0 ? r.slice(i + 4) : r
}

/** `git log --format=FORMATO_LOG --numstat` → commits. Tolera registros rotos: los salta. */
export function parsearLog(texto: string): CommitCrudo[] {
  const out: CommitCrudo[] = []
  for (const reg of texto.split(SEP_REG)) {
    if (!reg.trim()) continue
    const c = reg.split(SEP_CAMPO)
    if (c.length < 7 || !/^[0-9a-f]{40}$/.test(c[0])) continue
    const archivos: ArchivoCrudo[] = []
    for (const linea of c.slice(6).join(SEP_CAMPO).split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(linea)
      if (!m) continue
      const binario = m[1] === '-'
      archivos.push({ ruta: rutaNueva(m[3]), mas: binario ? 0 : Number(m[1]), menos: binario ? 0 : Number(m[2]), binario })
    }
    out.push({ sha: c[0], padres: c[1].split(' ').filter(Boolean), autor: c[2], correo: c[3], fecha: c[4], mensaje: c[5].replace(/\s+$/, ''), archivos })
  }
  return out
}

// ── El mensaje en humano ──

export const primeraLinea = (m: string) => (m.split('\n').find(l => l.trim()) ?? '').trim()

/** El cuerpo sin la primera línea ni los trailers (`Clave: valor` al final). */
export function cuerpo(m: string): string {
  const lineas = m.split('\n')
  const i = lineas.findIndex(l => l.trim())
  return lineas.slice(i + 1).filter(l => !/^(co-authored-by|signed-off-by|arbrain-volver|change-id|agente|subagente):/i.test(l.trim()) && !/^generated by\b/i.test(l.trim())).join('\n').trim()
}

/** Palabras de git que el avatar no tiene por qué conocer, en su idioma. Solo palabras sueltas, nunca dentro de otra. */
const JERGA: [RegExp, string][] = [
  [/\bcommite\w*/gi, 'guarda'], [/\bcommits?\b/gi, 'cambio'], [/\bmerge(d|ar|ado|ada)?\b/gi, 'incorporar'], [/\bworktrees?\b/gi, 'copia de trabajo'],
  [/\bbranch(es)?\b/gi, 'trabajo'], [/\bramas?\b/gi, 'trabajo'], [/\b(origin\/)?(main|master)\b/gi, 'tu cerebro principal'],
  [/\bpush(ed)?\b/gi, 'subir'], [/\brebase\b/gi, 'reacomodar'], [/\brefactor(iza|izar|ing)?\b/gi, 'reorganiza'],
  [/\bfile\(s\) updated\b/gi, 'archivo(s) al día'], [/\bfiles? updated\b/gi, 'archivos al día'],
]
/** «skill» es palabra de programador: para el usuario son habilidades (como en el resto de la app). Va antes de la jerga general. */
const HABILIDAD: [RegExp, string][] = [
  [/\b(?:el|la) skill\b/gi, 'la habilidad'], [/\b(?:los|las) skills\b/gi, 'las habilidades'], [/\b(?:un|una) skill\b/gi, 'una habilidad'],
  [/\bskills\b/g, 'habilidades'], [/\bSkills\b/g, 'Habilidades'], [/\bskill\b/g, 'habilidad'], [/\bSkill\b/g, 'Habilidad'],
]
/** Siglas que sí se escriben en mayúscula aunque tengan 4 letras o más. */
const SIGLAS = new Set(['HTML', 'JSON', 'HTTP', 'HTTPS', 'CORS', 'YAML', 'OAUTH', 'WEBP', 'USDT', 'PKCE'])
/**
 * Versalitas dentro de una frase («LENGUAJE, CONTRASTE, REPORTE, capturas…»): es el grito de un mensaje de commit, no un
 * título. Una racha de dos o más palabras en mayúscula con al menos una de 4 letras o más que no sea sigla pasa a
 * minúscula (las siglas de la racha se quedan). Una palabra sola («API», «PKCE», «MASTER») no se toca.
 */
export function sinVersalitas(t: string): string {
  return t.replace(/(?<![\p{L}\p{N}])\p{Lu}{2,}(?:[ ,;/-]+\p{Lu}{2,})*(?![\p{L}\p{N}])/gu, m => {
    const palabras = m.match(/\p{Lu}+/gu) ?? []
    if (palabras.length < 2 || !palabras.some(w => w.length >= 4 && !SIGLAS.has(w))) return m
    return m.replace(/\p{Lu}+/gu, w => SIGLAS.has(w) ? w : w.toLocaleLowerCase('es-MX'))
  })
}
const sinJerga = (t: string) => JERGA.reduce((s, [re, v]) => s.replace(re, v), HABILIDAD.reduce((s, [re, v]) => s.replace(re, v), sinVersalitas(t)))
const mayuscula = (t: string) => t ? t[0].toLocaleUpperCase('es-MX') + t.slice(1) : t

// ── Ronda 4: sin tecnicismos de programador en lo visible ──

const EXT = 'md|mdx|ts|tsx|js|jsx|mjs|cjs|py|sh|json|jsonl|css|scss|html|png|jpe?g|svg|plist|ya?ml|toml|sql|txt|log|lock|glb|swift|rs'
/** «/perro» → «Perro»: el nombre de una sección de la app. */
const nombreSeccion = (s: string) => mayuscula(humanizar(s))
/**
 * Lo que un profesional no técnico no tiene por qué leer: opciones de comando («--ancho-panel»), rutas y nombres de
 * archivo («~/Library/…/x.jsonl», «conexion.md»), rutas de la API, códigos e ids («61df618d…»), direcciones de la propia
 * máquina («loopback», «127.0.0.1») y nombres de carpeta con guiones («capturar-dueno» → «capturar dueño»). Las rutas de
 * sección de la app («/perro») se leen «la sección Perro». Lo que queda se recose: sin paréntesis vacíos, comas sueltas
 * ni preposiciones colgando al final.
 */
export function sinTecnicismos(t: string): string {
  let s = ` ${t} `
  // Direcciones de la propia máquina.
  s = s.replace(/\bfuera de (?:loopback|localhost|127\.0\.0\.1)\b/gi, 'desde otros equipos')
    .replace(/\b(?:en |solo en )?(?:loopback|localhost|127\.0\.0\.1)(?::\d+)?\b/gi, m => /^solo/i.test(m) ? 'solo en esta máquina' : /^en/i.test(m) ? 'en esta máquina' : 'esta máquina')
  // Ids y códigos: uuid, hash de git, números de sesión largos en hexadecimal.
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, ' ')
  // Opciones de comando: «--clic», «--ancho-panel=520», «-p 3491» no (eso es raro en asuntos).
  s = s.replace(/\b(acepta|aceptan|suma|agrega|añade)((?:\s+--[a-z][\w-]*(?:=\S+)?)+)/gi, (_, v: string, fl: string) => `${v} ${fl.trim().split(/\s+/).length > 1 ? 'opciones nuevas' : 'una opción nueva'}`)
  s = s.replace(/(^|[\s(,«])--[a-z][\w-]*(?:=\S+)?/gi, '$1')
  // Puertos sueltos delante de una ruta («:10000/perro»).
  s = s.replace(/(^|[\s(«])(?:localhost|esta máquina)?:\d{2,5}(?=\/)/gi, '$1')
  // Rutas: empiezan en la casa del usuario o en una carpeta («~/…», «./…», «/api/x»), tienen dos o más carpetas, o
  // terminan en un archivo. «m/s», «ON/OFF» o «título/selector» no son rutas.
  s = s.replace(/(^|[\s(«])([^\s(«]*\/\S*?)(?=$|[\s),;:»]|\.(?:\s|$))/g, (m, pre: string, r: string) => {
    if (/^\/[a-z][a-z-]{1,24}$/.test(r)) return m // «/perro»: una sección, se lee más abajo.
    const ruta = /^(~|\.{1,2})?\//.test(r) || (r.match(/\//g)?.length ?? 0) >= 2 || new RegExp(`\\.(?:${EXT})$`, 'i').test(r) || /^https?:/.test(r)
    return ruta ? pre : m
  })
  // «/perro y /casa» → «las secciones Perro y Casa»; «/perro» → «la sección Perro». «ruta /casa» pierde «ruta».
  s = s.replace(/\b(?:la )?ruta\s+(?=\/[a-z])/gi, '')
    .replace(/(^|[\s(«])\/([a-z][a-z-]{1,24})\s+y\s+\/([a-z][a-z-]{1,24})(?=$|[\s),;:».])/gi, (_, pre, a, b) => `${pre}las secciones ${nombreSeccion(a)} y ${nombreSeccion(b)}`)
    .replace(/(^|[\s(«])\/([a-z][a-z-]{1,24})(?=$|[\s),;:».])/gi, (_, pre, a) => `${pre}la sección ${nombreSeccion(a)}`)
  // Nombres de constantes y variables del código.
  s = s.replace(/\bstack y componentStack\b/g, 'el rastro del error')
    .replace(/\bAPIS?_[A-Z0-9_]+\b/g, 'la lista permitida')
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, 'un ajuste interno')
    .replace(/\b[a-z]{2,}(?:[A-Z][a-z]+)+\b/g, ' ')
  // Nombres de archivo sueltos: sin extensión y legibles («orquestador-one-shot.md» → «orquestador one shot»).
  s = s.replace(new RegExp(`\\b([\\w-]+)\\.(?:${EXT})\\b`, 'gi'), (_, base: string) => humanizar(base))
  // Nombres con guiones en minúscula («capturar-dueno», «perro-telemetria»): palabras con sus acentos de vuelta.
  s = s.replace(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g, m => /\d{4}-\d{2}/.test(m) ? m : humanizar(m))
  // Recoser.
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\(\s*[,;y\s]*\)/g, ' ').replace(/«\s*»/g, ' ')
      .replace(/\(\s*,\s*/g, '(').replace(/\s*,\s*\)/g, ')').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
      .replace(/\s+([,;:.)])/g, '$1').replace(/([,;])(?:\s*[,;])+/g, '$1').replace(/\s{2,}/g, ' ')
      .replace(/\s+(?:en|a|de|del|por|con|y|o|al|desde)[\s.,;:]*$/i, '').replace(/[\s,;:]+$/, '')
  }
  return s.trim().replace(/^[,;:\s]+/, '')
}
/** El asunto traía algo técnico que se quitó (si no, una frase corta es corta por decisión de quien la escribió). */
export const conTecnicismos = (t: string) => sinTecnicismos(t).replace(/\s+/g, ' ') !== t.replace(/\s+/g, ' ').trim()
/** Una frase se lee si le quedan tres palabras y dos con contenido («La sección Perro» sola no dice qué pasó). */
export const fraseDecente = (f: string) => {
  const ps = f.match(/[a-záéíóúñü]{2,}/gi) ?? []
  return ps.length >= 3 && ps.filter(p => p.length >= 4 && !/^secci(ón|ones)$/i.test(p)).length >= 2
}
const limpiar = (t: string) => mayuscula(sinJerga(sinTecnicismos(t.replace(/\s+/g, ' ').trim())).replace(/[.;,\s]+$/, ''))
/** Palabras que un nombre de carpeta pierde (acentos, ñ, siglas) y su forma legible. */
const PALABRAS: Record<string, string> = {
  diseno: 'diseño', sabado: 'sábado', dia: 'día', habitos: 'hábitos', calendario: 'calendario', telefono: 'teléfono', analisis: 'análisis', ultimo: 'último', anos: 'años', vision: 'visión', conexion: 'conexión', guia: 'guía', dueno: 'dueño', duenos: 'dueños', pagina: 'página', paginas: 'páginas', telemetria: 'telemetría', integracion: 'integración',
  sesion: 'sesión', sesiones: 'sesiones', configuracion: 'configuración', navegacion: 'navegación', informacion: 'información', camara: 'cámara',
  ux: 'UX', ui: 'UI', hud: 'HUD', api: 'API', ht: 'Acompañamiento', lt: 'comunidad', ia: 'IA', ci: 'pruebas automáticas', vps: 'VPS', yt: 'YouTube',
  harness: 'harness', noche: 'noche', v0212: 'v0.2.12', mac: 'Mac', windows: 'Windows', levy: 'Levy', arbrain: 'Arbrain',
}
const humanizar = (rama: string) => rama.replace(/^(origin\/|refs\/heads\/)/, '').replace(/[-_/]+/g, ' ').trim()
  .split(' ').map(p => PALABRAS[p.toLowerCase()] ?? p).join(' ')
/** «harness-noche», «perro_hud»: una palabra técnica sin espacios que el avatar no tiene por qué leer así. */
const esSlug = (t: string) => /^[a-z0-9]+([-_][a-z0-9]+)+$/i.test(t.trim())

export type TipoEvento = 'cambio' | 'junta' | 'sincroniza' | 'trae' | 'volver'

export interface Frase {
  tipo: TipoEvento
  /** La frase principal, sin jerga ni prefijo. */
  frase: string
  /** El tema que el mensaje puso al frente («Perro», «Cohorte»), si lo puso. */
  tema?: string
  /** Rutina que guardó sola («tareas espejo», «macbook»). */
  rutina?: string
  /** Rama que entró con un «Merge …». */
  rama?: string
  /** Carril donde ocurrió la junta (`Merge main en perro-telemetria` → perro-telemetria). */
  en?: string
  /** «Volver»: el sha del cambio que se deshizo (trailer `Arbrain-Volver`). */
  volverDe?: string
}

const CONVENCIONAL = /^(feat|fix|docs|chore|refactor|perf|test|style|build|ci)(\(([^)]+)\))?!?:\s*(.+)$/i
const PREFIJO_CONV: Record<string, string> = { fix: 'Arreglo: ', perf: 'Más rápido: ', test: 'Pruebas: ', docs: 'Documentos: ' }

/** De un mensaje de git a la frase que se lee en la historia. */
export function fraseDe(mensaje: string): Frase {
  const asunto = primeraLinea(mensaje)
  const volver = /^arbrain-volver:\s*([0-9a-f]{7,40})\s*$/im.exec(mensaje)
  if (/^volver:\s*/i.test(asunto)) {
    return { tipo: 'volver', frase: `Volvió a como estaba: ${limpiar(asunto.replace(/^volver:\s*/i, '')).replace(/^./, c => c.toLocaleLowerCase('es-MX'))}`, volverDe: volver?.[1] }
  }
  const revert = /^Revert "(.+)"$/.exec(asunto)
  if (revert) { const f = fraseDe(revert[1]); return { tipo: 'cambio', frase: `Deshizo: ${f.frase.replace(/^./, c => c.toLocaleLowerCase('es-MX'))}` } }
  const rutina = RUTINA.exec(asunto)
  if (rutina) {
    const nombre = humanizar(rutina[2])
    const resto = rutina[3]
    const archivos = /(\d+)\s*(?:file|archivo)/i.exec(resto)?.[1]
    const n = archivos ? Number(archivos) : null
    const cuantos = n == null ? '' : n === 1 ? '1 archivo' : `${n} archivos`
    if (/^memoria$/i.test(rutina[1])) return { tipo: 'cambio', rutina: nombre, frase: cuantos ? `${n === 1 ? 'Llegó' : 'Llegaron'} ${cuantos} de memoria desde ${mayuscula(nombre)}` : limpiar(resto) || `Memoria sincronizada desde ${nombre}` }
    return { tipo: 'cambio', rutina: nombre, frase: cuantos ? `Se puso al día sola: ${cuantos} (${nombre})` : limpiar(resto) || `Se puso al día sola (${nombre})` }
  }
  const merge = /^Merge (?:remote-tracking )?(?:branch )?'?([^'\s:;]+)'?(?: of \S+)?(?:\s+(?:into|en)\s+([^\s:;(]+))?\s*(?:\(([^)]*)\))?\s*(?:[:;]\s*(.*))?$/i.exec(asunto)
  if (merge) {
    const rama = merge[1].replace(/^origin\//, '')
    const en = merge[2]?.replace(/^origin\//, '')
    const detalle = merge[4] ? limpiar(merge[4]) : merge[3] ? limpiar(merge[3]) : ''
    if (en && !esMain(en)) return { tipo: 'trae', rama, en, frase: `«${nombreCarril(en)}» se puso al día con ${esMain(rama) ? 'tu cerebro principal' : `«${nombreCarril(rama)}»`}${detalle ? `: ${detalle.replace(/^./, c => c.toLocaleLowerCase('es-MX'))}` : ''}` }
    if (esMain(rama)) return { tipo: 'sincroniza', rama, frase: `Se puso al día con la copia en GitHub${detalle ? ` (${detalle})` : ''}` }
    return { tipo: 'junta', rama, frase: fraseJunta(nombreCarril(rama), detalle) }
  }
  const conv = CONVENCIONAL.exec(asunto)
  if (conv) return { tipo: 'cambio', tema: conv[3] ? mayuscula(humanizar(conv[3])) : undefined, frase: (PREFIJO_CONV[conv[1].toLowerCase()] ?? '') + limpiar(conv[4]) }
  // «Tema: lo que pasó». El tema es corto y no lleva punto; si no, todo es frase.
  const tema = /^([^:]{2,40}):\s+(.+)$/.exec(asunto)
  if (tema && !/[.!?]/.test(tema[1]) && tema[1].split(/\s+/).length <= 5) return { tipo: 'cambio', tema: temaLegible(tema[1]), frase: limpiar(tema[2]) }
  return { tipo: 'cambio', frase: limpiar(asunto) || 'Cambio sin descripción' }
}

/** «Se incorporó «La historia de tu cerebro» a tu cerebro principal: …». */
export function fraseJunta(nombre: string, detalle = ''): string {
  return `Se incorporó «${nombre}» a tu cerebro principal${detalle ? `: ${detalle.replace(/^./, c => c.toLocaleLowerCase('es-MX'))}` : ''}`
}

/** El tema que el mensaje puso al frente, legible: «harness-noche» → «Harness noche»; «Integración harness-noche» igual. */
function temaLegible(t: string): string {
  return mayuscula(t.trim().split(/\s+/).map(p => esSlug(p) ? humanizar(p) : p).join(' '))
}

// ── Cuándo ──

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, ...o })
const diaCivil = (ms: number) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
const hora = (ms: number) => fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(ms)

/** «vie, 23 de oct.» → «vie 23 oct». */
const corta = (t: string) => t.replace(/\./g, '').replace(/,/g, '').replace(/ de /g, ' ').replace(/\s+/g, ' ').trim()

/** «hace 4 min», «hace 3 h», «ayer 18:41», «lun 26 oct 09:12», «12 sep 2026». */
export function cuandoRelativo(iso: string, ahora: number): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'sin fecha'
  const s = Math.max(0, (ahora - t) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 6 * 3600 && diaCivil(t) === diaCivil(ahora)) return `hace ${Math.round(s / 3600)} h`
  if (diaCivil(t) === diaCivil(ahora)) return `hoy ${hora(t)}`
  if (diaCivil(t) === diaCivil(ahora - 864e5)) return `ayer ${hora(t)}`
  if (s < 6 * 86400) return `${corta(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(t))} ${hora(t)}`
  const mismoAnio = fmt({ year: 'numeric' }).format(t) === fmt({ year: 'numeric' }).format(ahora)
  return corta(fmt(mismoAnio ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(t))
}

/** «martes 27 de octubre de 2026, 18:41» en la hora de Ciudad de México. */
export function cuandoAbsoluto(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'sin fecha'
  return `${fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(t)}, ${hora(t)}`
}

/** Clave del día (AAAA-MM-DD) en Ciudad de México, para agrupar la línea del tiempo. */
export function claveDia(iso: string): string {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.parse(iso))
  const v = (k: string) => p.find(x => x.type === k)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

export function tituloDia(clave: string, ahora: number): string {
  const hoy = claveDia(new Date(ahora).toISOString()), ayer = claveDia(new Date(ahora - 864e5).toISOString())
  if (clave === hoy) return 'Hoy'
  if (clave === ayer) return 'Ayer'
  const t = Date.parse(`${clave}T12:00:00-06:00`)
  return mayuscula(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(t))
}

// ── ¿Ya corre? ──

/**
 * `al-instante`: memoria, skills y documentos viven en el disco que tu cerebro lee; guardarlos ya es usarlos.
 * `si` / `no`: toca la app web y se sabe qué versión sirve el Studio (la copia de despliegue).
 * `sin-verificar`: toca el agent-server o la app de escritorio; no hay marca que diga qué commit corre (ámbar en historia.md).
 */
export type Corre = 'al-instante' | 'si' | 'no' | 'sin-verificar'

export function correDe(archivos: { ruta: string }[], desplegado: boolean | null): Corre {
  const web = archivos.some(a => /^arbrain\//.test(a.ruta) && !/^arbrain\/(server|src-tauri|escritorio|empaquetado)\//.test(a.ruta))
  const otros = archivos.some(a => /^(arbrain\/(server|src-tauri|escritorio|empaquetado)|agent-server|arbrain-extension)\//.test(a.ruta))
  if (web) return desplegado == null ? 'sin-verificar' : desplegado ? 'si' : 'no'
  if (otros) return 'sin-verificar'
  return 'al-instante'
}

export const NOMBRE_CORRE: Record<Corre, string> = { 'al-instante': 'Ya vive', si: 'Ya corre', no: 'Falta instalar', 'sin-verificar': 'Sin verificar si corre' }

// ── Eventos ──

export interface Evento {
  sha: string
  corto: string
  tipo: TipoEvento
  quien: Quien
  /** «Levy», «Tú», «Agente · historia», «Rutina · tareas espejo». */
  quienNombre: string
  /** El autor salió de un trailer `Agente:`/`Subagente:`, no de la regla por carril. */
  firmado?: boolean
  cuando: string
  frase: string
  tema?: string
  /** Lo que el mensaje explica debajo de la primera línea. */
  detalle?: string
  carril?: string
  areas: ResumenArea[]
  total: { archivos: number; mas: number; menos: number }
  corre: Corre
  volverDe?: string
  /** Una junta trae dentro los cambios del carril que entró (los primeros). */
  dentro?: Evento[]
  /** Cuántos cambios traía la junta en total. */
  dentroTotal?: number
}

export function nombreQuien(q: Quien, f: Frase, carril?: string | null, firma?: { quien: Quien; nombre: string } | null, nombres?: Map<string, string> | null): string {
  if (q === 'rutina') return f.rutina ? `Rutina · ${f.rutina}` : f.tipo === 'sincroniza' ? 'Sincronía con GitHub' : firma && firma.quien === 'rutina' ? `Rutina · ${firma.nombre}` : 'Rutina'
  if (q === 'subagente') {
    if (firma?.quien === 'subagente') return `Agente · ${nombres?.get(firma.nombre) ?? (esSlug(firma.nombre) || /^(wt|hn)[-_]/.test(firma.nombre) ? nombreCarril(firma.nombre) : firma.nombre)}`
    return carril ? `Agente · ${nombres?.get(carril) ?? nombreCarril(carril)}` : 'Agente'
  }
  return NOMBRE_QUIEN[q]
}

export function eventoDe(c: CommitCrudo, ctx: { carril?: string | null; desplegados?: Set<string> | null; nombres?: Map<string, string> | null } = {}): Evento {
  const f = fraseDe(c.mensaje)
  const firma = firmaDe(c.mensaje)
  // Ponerse al día con GitHub sin coautor de IA lo hace la sincronía de las máquinas, no una decisión de nadie.
  const quien = f.tipo === 'sincroniza' && quienDe(c, { carril: ctx.carril }) === 'persona' ? 'rutina' : quienDe(c, { carril: ctx.carril })
  const total = c.archivos.reduce((t, a) => ({ archivos: t.archivos + 1, mas: t.mas + a.mas, menos: t.menos + a.menos }), { archivos: 0, mas: 0, menos: 0 })
  const detalle = cuerpo(c.mensaje)
  return {
    sha: c.sha, corto: c.sha.slice(0, 7), tipo: f.tipo, quien, quienNombre: nombreQuien(quien, f, ctx.carril, firma, ctx.nombres), ...(firma ? { firmado: true } : {}), cuando: c.fecha,
    frase: fraseDecente(f.frase) || f.tipo !== 'cambio' || !conTecnicismos(primeraLinea(c.mensaje)) ? f.frase : fraseGenerica(primeraLinea(c.mensaje), porArea(c.archivos), f.tema), ...(f.tema ? { tema: f.tema } : {}), ...(detalle ? { detalle: detalle.slice(0, 600) } : {}),
    ...(ctx.carril && !esMain(ctx.carril) ? { carril: ctx.carril } : {}),
    areas: porArea(c.archivos), total,
    corre: correDe(c.archivos, ctx.desplegados ? ctx.desplegados.has(c.sha) : null),
    ...(f.volverDe ? { volverDe: f.volverDe } : {}),
  }
}

const AREA_GENERICA: Record<Area, string> = { memoria: 'la memoria', skills: 'las habilidades', producto: 'la app', contenido: 'los documentos', sistema: 'el sistema' }
/** Si tras quitar lo técnico no queda frase: «Ajustes en la sección Perro», o en la parte del cerebro que más tocó. */
export function fraseGenerica(asunto: string, areas: ResumenArea[], tema?: string): string {
  const sec = /(?:^|[\s(«])\/([a-z][a-z-]{1,24})(?=$|[\s),;:».])/i.exec(asunto)?.[1]
  if (sec) return `Ajustes en la sección ${mayuscula(humanizar(sec))}`
  if (tema && !/^(arreglo|pruebas|documentos|capturas|wip)$/i.test(tema)) return `Ajustes en ${tema}`
  const top = [...areas].sort((a, b) => b.archivos - a.archivos)[0]
  return `Ajustes en ${AREA_GENERICA[top?.area ?? 'sistema']}`
}

// ── Carriles ──

/** `esperando`: la copia existe pero aún no guarda nada (su punta es un commit de main). */
export type EstadoCarril = 'trabajando' | 'listo' | 'en-main' | 'quieto' | 'esperando'
export const NOMBRE_ESTADO: Record<EstadoCarril, string> = { trabajando: 'Trabajando', listo: 'Listo para incorporar', 'en-main': 'Ya incorporado', quieto: 'Detenido', esperando: 'Aún sin cambios' }

export interface CarrilCrudo {
  rama: string
  /** Carpeta de la copia de trabajo (solo el nombre), si tiene una. */
  copia?: string
  adelante: number
  atras: number
  sinGuardar: number
  ultimo: { cuando: string; mensaje: string; autor: string; correo: string } | null
}

export interface Carril {
  rama: string
  nombre: string
  copia?: string
  quien: Quien
  estado: EstadoCarril
  adelante: number
  atras: number
  sinGuardar: number
  ultimo: { cuando: string; frase: string } | null
  /** Cuándo entró a main, si la junta está en la ventana que se leyó. */
  juntado?: string
  /** Desde dónde salió (o se puso al día por última vez): la fecha del punto común con main. */
  salio?: string
  /** Sus últimos cambios propios, en frase. */
  recientes?: { cuando: string; frase: string }[]
}

/** «hn-historia» → «Historia»; «fundador-ganchos-huella» → «Fundador ganchos huella». Los prefijos de copia no dicen nada. */
export function nombreCarril(rama: string): string {
  return mayuscula(humanizar(rama.replace(/^(origin\/)?(wt|hn)[-_]/, '')))
}

/**
 * El nombre del trabajo como lo diría una persona, nunca el nombre crudo de la carpeta. En orden:
 *  1. el título del encargo, si existe su nota (`docs/builds/<obra>/nodos/<nombre>.md`, primera línea);
 *  2. el tema que más repiten sus cambios propios («Perro HUD: …», «Soporte fundadores 28 oct: …» → «Soporte fundadores»);
 *  3. el nombre de la carpeta legible (acentos, ñ y siglas de vuelta: «diseno-unificado» → «Diseño unificado»).
 */
export function nombreTrabajo(rama: string, o: { titulo?: string | null; asuntos?: string[] } = {}): string {
  if (o.titulo) { const t = tituloEncargo(o.titulo); if (t) return t }
  const cuenta = new Map<string, { n: number; orden: number }>()
  ;(o.asuntos ?? []).forEach((a, i) => {
    const f = fraseDe(a)
    if (f.tipo !== 'cambio' || f.rutina || !f.tema) return
    const t = f.tema.replace(/\s+\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w*\.?$/i, '').trim()
    if (!t || primeraLinea(a).split(':')[0].split(/\s+/).some(esSlug) || /^(wip|arreglo|pruebas|documentos|capturas)$/i.test(t)) return
    const k = cuenta.get(t) ?? { n: 0, orden: i }
    k.n++; cuenta.set(t, k)
  })
  const mejor = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n || a[1].orden - b[1].orden)[0]
  if (mejor) return mejor[0]
  // Sin tema: la primera idea de su último cambio propio («Chat por navegador fuera de loopback (un fundador)…»).
  for (const a of o.asuntos ?? []) {
    const f = fraseDe(a)
    if (f.tipo !== 'cambio' || f.rutina || /^(rescate|wip|arreglo:|pruebas:)/i.test(f.frase)) continue
    const palabras = f.frase.split(/\s*[(:;,—]\s*/)[0].split(/\s+/)
    // Ronda 3: sin puntos suspensivos (el nombre se lee dentro de frases); las primeras seis palabras bastan para nombrarlo.
    const idea = (palabras.length > 8 ? palabras.slice(0, 6).join(' ') : palabras.join(' ')).replace(/[.\s]+$/, '')
    if (idea.length >= 6) return mayuscula(idea)
  }
  return nombreCarril(rama)
}

/** «# Nodo historia · «La historia de tu cerebro» (27 oct 2026)» → «La historia de tu cerebro». */
export function tituloEncargo(linea: string): string | null {
  let t = linea.replace(/^#+\s*/, '').trim()
  const comillas = /«([^»]{3,80})»/.exec(t)
  if (comillas) return mayuscula(comillas[1].trim())
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/(^|\s)[—·:-]?\s*\bspec\b\s*[—·:-]?(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim()
  const m = /^nodo\b[^:·]*[:·]\s*(.+)$/i.exec(t)
  if (m) t = m[1]
  else { const antes = /^([^:·—]{3,60})\s*[:·—]\s*\S/.exec(t); if (antes) t = antes[1] }
  t = t.replace(/^nodo\s+/i, '').replace(/[\s:·—-]+$/, '').trim()
  t = sinTecnicismos(t)
  return t.length >= 3 ? mayuscula(t.slice(0, 80)) : null
}

export const RECIENTE_MS = 3 * 3600_000
export const QUIETO_MS = 7 * 864e5
export const SUELTO_MS = 864e5

export function estadoCarril(c: Pick<CarrilCrudo, 'adelante' | 'sinGuardar' | 'ultimo' | 'copia'>, ahora: number): EstadoCarril {
  const edad = c.ultimo ? ahora - Date.parse(c.ultimo.cuando) : Infinity
  if (c.sinGuardar > 0) return 'trabajando'
  if (c.adelante === 0) return 'en-main'
  if (edad < RECIENTE_MS) return 'trabajando'
  if (edad > QUIETO_MS) return 'quieto'
  // «Rescate antes de limpiar…»: un respaldo que se guardó aparte al limpiar una copia, no un trabajo que espera tu sí.
  if (c.ultimo && /^(wip:\s*)?rescate\b/i.test(primeraLinea(c.ultimo.mensaje))) return 'quieto'
  // Un trabajo sin copia que lleva más de un día quieto es un respaldo guardado aparte, no algo que espera tu sí.
  if (!c.copia && edad > SUELTO_MS) return 'quieto'
  return 'listo'
}

const ORDEN_ESTADO: Record<EstadoCarril, number> = { trabajando: 0, listo: 1, 'en-main': 2, esperando: 3, quieto: 4 }

export function carrilDe(c: CarrilCrudo, ahora: number, nombre?: string): Carril {
  let quien: Quien = c.ultimo ? quienDe({ mensaje: c.ultimo.mensaje, autor: c.ultimo.autor, correo: c.ultimo.correo }, { carril: c.rama }) : 'subagente'
  // Ronda 3: ponerse al día (traer lo de otro trabajo) no dice quién trabaja ahí: un trabajo en paralelo es de un agente.
  if (quien === 'persona' && c.ultimo && !esMain(c.rama) && fraseDe(c.ultimo.mensaje).tipo !== 'cambio') quien = 'subagente'
  return {
    rama: c.rama, nombre: nombre ?? nombreCarril(c.rama), ...(c.copia ? { copia: c.copia } : {}), quien,
    estado: estadoCarril(c, ahora), adelante: c.adelante, atras: c.atras, sinGuardar: c.sinGuardar,
    ultimo: c.ultimo ? { cuando: c.ultimo.cuando, frase: fraseDe(c.ultimo.mensaje).frase } : null,
  }
}

export function ordenarCarriles(cs: Carril[]): Carril[] {
  const t = (c: Carril) => c.ultimo ? Date.parse(c.ultimo.cuando) : 0
  return [...cs].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || t(b) - t(a))
}

// ── Diffs legibles ──

export type Linea = { tipo: 'igual' | 'mas' | 'menos'; texto: string } | { tipo: 'cambio'; antes: string; despues: string; partes: Parte[] }
export interface Parte { tipo: 'igual' | 'mas' | 'menos'; texto: string }
export interface Bloque { desde: number; lineas: Linea[] }

/** Diff unificado de un archivo (`git diff -U3`) → bloques. Las parejas quitado/añadido se vuelven «cambio» con sus palabras. */
export function parsearDiff(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  let actual: Bloque | null = null
  let menos: string[] = [], mas: string[] = []
  const vaciar = () => {
    if (!actual) return
    const n = Math.min(menos.length, mas.length)
    for (let i = 0; i < n; i++) {
      const partes = palabras(menos[i], mas[i])
      const iguales = partes.filter(p => p.tipo === 'igual').reduce((s, p) => s + p.texto.length, 0)
      // Si casi nada se parece, no es una edición: es quitar una línea y poner otra.
      if (iguales >= Math.min(menos[i].length, mas[i].length) * 0.35 && menos[i].trim() && mas[i].trim()) actual.lineas.push({ tipo: 'cambio', antes: menos[i], despues: mas[i], partes })
      else { actual.lineas.push({ tipo: 'menos', texto: menos[i] }); actual.lineas.push({ tipo: 'mas', texto: mas[i] }) }
    }
    for (const t of menos.slice(n)) actual.lineas.push({ tipo: 'menos', texto: t })
    for (const t of mas.slice(n)) actual.lineas.push({ tipo: 'mas', texto: t })
    menos = []; mas = []
  }
  for (const l of texto.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l)
    if (h) { vaciar(); actual = { desde: Number(h[1]), lineas: [] }; bloques.push(actual); continue }
    if (!actual || l.startsWith('\\ No newline')) continue
    if (l.startsWith('-')) { menos.push(l.slice(1)); continue }
    if (l.startsWith('+')) { mas.push(l.slice(1)); continue }
    vaciar()
    if (l.startsWith(' ')) actual.lineas.push({ tipo: 'igual', texto: l.slice(1) })
  }
  vaciar()
  return bloques
}

/** Diferencia por palabras (LCS) entre dos renglones. Tope de tamaño: renglones enormes se comparan enteros. */
export function palabras(a: string, b: string): Parte[] {
  const ta = a.split(/(\s+)/).filter(Boolean), tb = b.split(/(\s+)/).filter(Boolean)
  if (ta.length * tb.length > 40_000) return [{ tipo: 'menos', texto: a }, { tipo: 'mas', texto: b }]
  const n = ta.length, m = tb.length
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ta[i] === tb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: Parte[] = []
  const push = (tipo: Parte['tipo'], texto: string) => { const u = out[out.length - 1]; if (u && u.tipo === tipo) u.texto += texto; else out.push({ tipo, texto }) }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { push('igual', ta[i]); i++; j++ }
    else if (L[i + 1][j] >= L[i][j + 1]) push('menos', ta[i++])
    else push('mas', tb[j++])
  }
  while (i < n) push('menos', ta[i++])
  while (j < m) push('mas', tb[j++])
  return out
}

/** Memorias, skills y documentos se leen como texto; lo demás es código o archivo binario. */
export function tipoArchivo(ruta: string, binario: boolean): 'texto' | 'codigo' | 'binario' {
  if (binario) return 'binario'
  return /\.(md|mdx|txt|markdown)$/i.test(ruta) ? 'texto' : 'codigo'
}

/** «3 archivos de código, +120 −40». */
export function resumenCodigo(archivos: { mas: number; menos: number }[]): string {
  const n = archivos.length
  const mas = archivos.reduce((s, a) => s + a.mas, 0), menos = archivos.reduce((s, a) => s + a.menos, 0)
  return `${n === 1 ? '1 archivo' : `${n} archivos`} de código, +${mas} −${menos}`
}

/** El cambio dicho en ideas: «3 renglones nuevos, 1 corregido, 2 quitados». */
export function resumenTexto(bloques: Bloque[]): string {
  let mas = 0, menos = 0, cambio = 0
  for (const b of bloques) for (const l of b.lineas) {
    if (l.tipo === 'mas' && l.texto.trim()) mas++
    else if (l.tipo === 'menos' && l.texto.trim()) menos++
    else if (l.tipo === 'cambio') cambio++
  }
  const p: string[] = []
  if (mas) p.push(mas === 1 ? '1 renglón nuevo' : `${mas} renglones nuevos`)
  if (cambio) p.push(cambio === 1 ? '1 corregido' : `${cambio} corregidos`)
  if (menos) p.push(menos === 1 ? '1 quitado' : `${menos} quitados`)
  return p.join(', ') || 'Solo espacios o formato'
}

// ── Volver ──

/** Dónde se puede volver con un clic: lo que tu cerebro sabe (memoria) y sabe hacer (skills). El código no. */
export const RUTAS_REGRESABLES = ['.claude/memory/', '.claude/skills/'] as const

/** null si se puede volver; si no, la razón en humano. */
export function motivoNoRegresable(ruta: string): string | null {
  if (!ruta || ruta.length > 500 || ruta.includes('\0') || ruta.includes('\\')) return 'Ruta inválida.'
  if (ruta.startsWith('/') || ruta.startsWith('~') || /^[A-Za-z]:/.test(ruta)) return 'Ruta inválida.'
  const partes = ruta.split('/')
  if (partes.some(p => p === '..' || p === '.' || p === '')) return 'Ruta inválida.'
  if (!RUTAS_REGRESABLES.some(p => ruta.startsWith(p))) return 'Volver con un clic solo está disponible para memorias y habilidades.'
  return null
}

export const tituloVolver = (frase: string) => `Volver: ${frase.replace(/^Volvió a como estaba:\s*/i, 'deshacer el regreso de ').slice(0, 90)}`

export function mensajeVolver(o: { frase: string; sha: string; cuando: string; rutas: string[] }): string {
  return [
    tituloVolver(o.frase),
    '',
    `Regresa ${o.rutas.length === 1 ? 'un archivo' : `${o.rutas.length} archivos`} a como estaban antes del cambio ${o.sha.slice(0, 7)} (${cuandoAbsoluto(o.cuando)}):`,
    ...o.rutas.map(r => `- ${r}`),
    '',
    'Hecho desde «La historia de tu cerebro» en Arbrain. Se deshace con otro «Volver» sobre este cambio.',
    '',
    `Arbrain-Volver: ${o.sha}`,
  ].join('\n')
}

// ── Lo que viaja a la pantalla ──

export interface Historia {
  repo: string
  rama: string
  /** Lo que el Studio sirve hoy (la copia de despliegue), si se puede saber. */
  corriendo: { sha: string; corto: string; cuando: string; frase: string } | null
  /** Cambios sin guardar en la copia principal. */
  sinGuardar: number
  /** Los mismos, por parte del cerebro (para decir de quién son sin asustar con un número). */
  sinGuardarAreas?: Partial<Record<Area, number>>
  /** La tira técnica de Daniel: qué está en el cerebro principal y qué ya corre en cada lugar. */
  tira?: Tira
  /** Entregables terminados: documentos de obra, secciones nuevas de la app y trabajos incorporados. */
  hecho?: Hecho[]
  eventos: Evento[]
  carriles: Carril[]
  leidoEn: string
  avisos: string[]
}

export interface ArchivoDiff {
  ruta: string
  area: Area
  tipo: 'texto' | 'codigo' | 'binario'
  estado: 'nuevo' | 'borrado' | 'cambiado'
  mas: number
  menos: number
  /** Texto: los bloques ya legibles. Código: vacío hasta que se despliega. */
  bloques?: Bloque[]
  resumen?: string
  protegido?: boolean
  regresable: boolean
  motivo?: string
}

export interface DiffCambio { sha: string; corto: string; frase: string; cuando: string; quienNombre: string; archivos: ArchivoDiff[]; recortado?: boolean }

export interface PreviaVolver {
  sha: string
  frase: string
  titulo: string
  archivos: { ruta: string; accion: 'restaura' | 'borra' | 'crea'; bloques: Bloque[]; resumen: string }[]
  rechazados: { ruta: string; motivo: string }[]
}

/** La línea del tiempo agrupada por día, en orden. */
export function porDia<T extends { cuando: string }>(xs: T[], ahora: number): { clave: string; titulo: string; eventos: T[] }[] {
  const out: { clave: string; titulo: string; eventos: T[] }[] = []
  for (const x of xs) {
    const k = claveDia(x.cuando)
    const u = out[out.length - 1]
    if (u && u.clave === k) u.eventos.push(x)
    else out.push({ clave: k, titulo: tituloDia(k, ahora), eventos: [x] })
  }
  return out
}


// ── El día en una frase ──

const AREA_EN: Record<Area, string> = { memoria: 'en memoria', skills: 'en habilidades', producto: 'en el producto', contenido: 'en contenido', sistema: 'en el sistema' }
const lista = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`

/** El área que más archivos tocó: un cambio cuenta una sola vez en la frase del día. */
export const areaPrincipal = (e: Pick<Evento, 'areas'>): Area | undefined => e.areas.slice().sort((a, b) => b.archivos - a.archivos)[0]?.area

/**
 * «Hoy tu cerebro cambió 47 veces: 12 en memoria, 5 en skills y 30 en el producto.» y, aparte,
 * «9 trabajos en curso y 2 listos para incorporar.» (null mientras los trabajos no se han leído).
 */
export function resumenDia(eventos: Evento[], ahora: number, carriles?: Pick<Carril, 'estado'>[] | null): { titular: string; detalle: string; trabajos: string | null } {
  const hoy = claveDia(new Date(ahora).toISOString())
  const deHoy = eventos.filter(e => claveDia(e.cuando) === hoy)
  const n = deHoy.length
  const por = new Map<Area, number>()
  for (const e of deHoy) { const a = areaPrincipal(e); if (a) por.set(a, (por.get(a) ?? 0) + 1) }
  const partes = AREAS.filter(a => por.get(a)).map(a => `${por.get(a)} ${AREA_EN[a]}`)
  const titular = n === 0 ? 'Hoy tu cerebro no ha cambiado todavía' : `Hoy tu cerebro cambió ${n === 1 ? '1 vez' : `${n} veces`}`
  const detalle = n === 0 ? 'Cuando Levy, un agente, una rutina o tú guarden algo, aparece aquí.' : `${mayuscula(lista(partes))}.`
  let trabajos: string | null = null
  if (carriles) {
    const enCurso = carriles.filter(c => c.estado === 'trabajando').length, listos = carriles.filter(c => c.estado === 'listo').length
    const a = enCurso === 0 ? 'Ningún trabajo en curso' : enCurso === 1 ? '1 trabajo en curso' : `${enCurso} trabajos en curso`
    trabajos = listos ? `${a} y ${listos === 1 ? '1 listo' : `${listos} listos`} para incorporar.` : `${a}.`
  }
  return { titular, detalle, trabajos }
}

/** Los cambios sin guardar del cerebro principal, dichos como estado y sin cifra que asuste. */
export function fraseEnCurso(areas: Partial<Record<Area, number>> | undefined, total: number): string {
  if (!total) return 'Todo está respaldado.'
  const de = AREAS.filter(a => areas?.[a]).map(a => a === 'memoria' ? 'memoria' : a === 'skills' ? 'habilidades' : a === 'producto' ? 'el producto' : a === 'contenido' ? 'contenido' : 'el sistema')
  const donde = de.length ? ` en ${lista(de.slice(0, 3))}` : ''
  return `Levy y las rutinas tienen cambios abiertos${donde}. Es normal mientras trabajan: se guardan solos y «Volver» no los toca.`
}

/** Porcelana de `git status -z` → cuántos archivos por parte del cerebro (sin el ruido que `contarSinGuardar` quita). */
export function sinGuardarPorArea(rutas: string[]): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {}
  for (const r of rutas) { const a = areaDe(r); out[a] = (out[a] ?? 0) + 1 }
  return out
}

// ── La tira de Daniel: qué está dónde ──

/**
 * `al-dia` / `faltan`: verificado contra lo que corre. `sin-verificar`: no hay marca de versión (se dice, no se adivina);
 * `faltan` en ese caso es una estimación por fecha y así se rotula.
 */
export interface Lugar { estado: 'al-dia' | 'faltan' | 'sin-verificar'; faltan?: number; corto?: string; cuando?: string; estimado?: boolean; nota?: string }
export interface Tira {
  principal: { corto: string; cuando: string; frase: string }
  web: Lugar
  servidor: Lugar
  escritorio: Lugar
}

/** Texto de un lugar de la tira: «Al día», «Faltan 3 cambios», «Sin verificar · ~4 cambios después». */
export function textoLugar(l: Lugar): string {
  const n = (k: number) => k === 1 ? '1 cambio' : `${k} cambios`
  if (l.estado === 'al-dia') return 'Al día'
  if (l.estado === 'faltan') return `Faltan ${n(l.faltan ?? 0)}`
  return l.faltan ? `Sin verificar · ~${n(l.faltan)} después` : 'Sin verificar'
}

// ── Hecho ──

export type TipoHecho = 'documento' | 'seccion' | 'trabajo'
export interface Hecho { tipo: TipoHecho; titulo: string; cuando: string; quienNombre: string; sha: string; ruta?: string }
export const NOMBRE_HECHO: Record<TipoHecho, string> = { documento: 'Documento', seccion: 'Sección de la app', trabajo: 'Trabajo incorporado' }

/** ¿Este archivo nuevo es un entregable? Documentos de obra (no capturas ni herramientas) y secciones nuevas de la app. */
export function tipoHecho(ruta: string): TipoHecho | null {
  if (/^docs\/builds\/[^/]+\/.+\.md$/i.test(ruta) && !/\/(capturas|herramientas)\//.test(ruta)) return 'documento'
  if (/^arbrain\/src\/app\/\(main\)\/[^/]+\/page\.tsx$/.test(ruta)) return 'seccion'
  return null
}

/** El título de un entregable: la primera línea `# …` del documento, o el nombre de la sección. */
export function tituloHecho(ruta: string, texto?: string | null): string {
  if (/\/page\.tsx$/.test(ruta)) {
    const meta = texto ? /title:\s*['"`]([^'"`·|]+)/.exec(texto)?.[1]?.trim() : null
    return meta || mayuscula(humanizar(ruta.split('/').slice(-2)[0]))
  }
  const h1 = texto?.split('\n').find(l => /^#\s+\S/.test(l))
  if (h1) return h1.replace(/^#\s+/, '').replace(/\*\*/g, '').replace(/`/g, '').trim().slice(0, 120)
  const base = ruta.split('/').pop()!.replace(/\.md$/i, '')
  return mayuscula(humanizar(/^(SPEC|README|INDICE)$/i.test(base) ? `${base} ${ruta.split('/').slice(-2)[0]}` : base))
}

/** Los entregables en orden: primero lo más nuevo; un documento que se volvió a crear cuenta una vez (el más reciente). */
export function ordenarHecho(xs: Hecho[]): Hecho[] {
  const vistos = new Set<string>()
  return [...xs].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando)).filter(x => { const k = x.ruta ?? `${x.tipo}:${x.titulo}`; if (vistos.has(k)) return false; vistos.add(k); return true })
}

// ── Ronda 3: lo importante arriba, lo automático plegado ──

/** Lo que guardó una máquina sola: rutinas, sincronías con GitHub y trabajos que se pusieron al día. Se pliega en una fila. */
export const esAutomatico = (e: Pick<Evento, 'quien' | 'tipo'>) => e.quien === 'rutina' || e.tipo === 'sincroniza' || e.tipo === 'trae'

export type FilaLinea = { tipo: 'evento'; e: Evento } | { tipo: 'automaticos'; clave: string; eventos: Evento[] }

/**
 * Una lista de cambios (un día) con lo automático en una sola fila «12 cambios automáticos ›», en el lugar del primero.
 * Uno suelto no se pliega: una fila plegada que esconde una sola cosa es peor que la cosa.
 */
export function agruparAutomaticos(eventos: Evento[]): FilaLinea[] {
  const autos = eventos.filter(esAutomatico)
  if (autos.length < 2) return eventos.map(e => ({ tipo: 'evento', e }))
  const out: FilaLinea[] = []
  let puesto = false
  for (const e of eventos) {
    if (!esAutomatico(e)) { out.push({ tipo: 'evento', e }); continue }
    if (!puesto) { out.push({ tipo: 'automaticos', clave: `auto-${e.sha}`, eventos: autos }); puesto = true }
  }
  return out
}

export type MotivoImportante = 'trabajo' | 'regreso' | 'entregable' | 'memoria' | 'skill' | 'contenido' | 'producto'
export const NOMBRE_MOTIVO: Record<MotivoImportante, string> = {
  trabajo: 'Trabajo incorporado', regreso: 'Regreso', entregable: 'Entregable', memoria: 'Memoria', skill: 'Habilidad', contenido: 'Contenido', producto: 'Producto',
}
const PESO_MOTIVO: Record<MotivoImportante, number> = { trabajo: 5, regreso: 4, entregable: 4, memoria: 3, skill: 3, contenido: 2, producto: 1 }

/** Por qué un cambio le importa al dueño (null si es automático: eso nunca sube a lo importante). */
export function motivoImportante(e: Evento, entregables?: Set<string> | null): MotivoImportante | null {
  if (esAutomatico(e)) return null
  if (e.tipo === 'junta') return 'trabajo'
  if (e.tipo === 'volver') return 'regreso'
  if (entregables && (entregables.has(e.sha) || e.dentro?.some(d => entregables.has(d.sha)))) return 'entregable'
  const toca = (a: Area) => e.areas.some(x => x.area === a)
  if (toca('memoria')) return 'memoria'
  if (toca('skills')) return 'skill'
  if (toca('contenido')) return 'contenido'
  return 'producto'
}

/**
 * «Lo importante de hoy»: de 3 a 5 cambios de hoy que cambiaron algo para el usuario. Primero uno de cada motivo (trabajo
 * incorporado, regreso, entregable, memoria, skill, contenido), luego el resto por peso; el producto solo rellena hasta 3. Lo automático nunca entra. Salen en orden
 * de tiempo (lo más nuevo arriba), como la línea.
 */
export function loImportante(eventos: Evento[], ahora: number, o: { entregables?: Set<string> | null; maximo?: number } = {}): { e: Evento; motivo: MotivoImportante }[] {
  const maximo = o.maximo ?? 5
  const hoy = claveDia(new Date(ahora).toISOString())
  const candidatos = eventos.filter(e => claveDia(e.cuando) === hoy)
    .map(e => ({ e, motivo: motivoImportante(e, o.entregables) }))
    .filter((x): x is { e: Evento; motivo: MotivoImportante } => x.motivo != null)
  const porPeso = [...candidatos].sort((a, b) => PESO_MOTIVO[b.motivo] - PESO_MOTIVO[a.motivo] || Date.parse(b.e.cuando) - Date.parse(a.e.cuando))
  // Variedad primero: el más nuevo de cada motivo (un trabajo, una memoria, una skill, un entregable), luego el resto por peso.
  const fuertes = porPeso.filter(x => PESO_MOTIVO[x.motivo] >= 2)
  const elegidos: typeof candidatos = []
  const motivos = new Set<MotivoImportante>()
  for (const x of fuertes) if (elegidos.length < maximo && !motivos.has(x.motivo)) { elegidos.push(x); motivos.add(x.motivo) }
  for (const x of fuertes) if (elegidos.length < maximo && !elegidos.includes(x)) elegidos.push(x)
  for (const x of porPeso) if (elegidos.length < 3 && !elegidos.includes(x)) elegidos.push(x)
  return elegidos.sort((a, b) => Date.parse(b.e.cuando) - Date.parse(a.e.cuando))
}

/**
 * La frase de una fila, completa y corta: si es larga, se queda con su primera idea entera (lo que va antes de «: »,
 * «; », « (», « — » o «, y »), nunca cortada a media palabra ni con puntos suspensivos. Si no hay dónde partir, va entera.
 */
/** Un pedazo que no deja un paréntesis ni unas comillas abiertas («BETA-LISTA (VPS elegido» no es una frase). */
const cerrada = (t: string) => (t.match(/\(/g)?.length ?? 0) === (t.match(/\)/g)?.length ?? 0) && (t.match(/«/g)?.length ?? 0) === (t.match(/»/g)?.length ?? 0)

export function fraseCorta(frase: string, maximo = 84): string {
  const f = frase.trim()
  if (f.length <= maximo) return f
  let mejor: string | null = null
  for (const sep of [': ', '; ', ' (', ' — ', ' – ', ', y ', '. ']) {
    const i = f.indexOf(sep)
    if (i >= 18 && i <= maximo && cerrada(f.slice(0, i)) && (!mejor || i < mejor.length)) mejor = f.slice(0, i)
  }
  if (!mejor) {
    const i = f.indexOf(', ')
    if (i >= 18 && i <= maximo && cerrada(f.slice(0, i))) mejor = f.slice(0, i)
  }
  return (mejor ?? f).replace(/[,;:]+$/, '').trim()
}

// ── Ronda 4: rutas e ids dentro de la prosa de un diff ──

export type PiezaProsa =
  | { tipo: 'texto'; texto: string }
  /** Un archivo del cerebro citado («user/x-2026-10-14.md»): se lee por su nombre; la ruta, al pedirla. */
  | { tipo: 'archivo'; nombre: string; texto: string }
  /** Una ubicación larga («~/.claude/projects/…/x.jsonl») o un id («61df618d-…»): detrás de «ver ubicación» / «ver id». */
  | { tipo: 'ubicacion' | 'id'; texto: string }

const RE_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,40})$/i
const RE_EXT = new RegExp(`\\.(?:${EXT})$`, 'i')

/** «user/recompensas-al-llegar-a-la-meta-2026-10-14.md» → «Recompensas al llegar a la meta». */
export function nombreDeArchivo(ruta: string): string {
  const p = ruta.replace(/\/+$/, '').split('/')
  let base = p[p.length - 1]
  if (/^(SKILL|README|INDICE|index)\.md$/i.test(base) && p.length > 1) base = p[p.length - 2]
  base = base.replace(RE_EXT, '').replace(/[-_]\d{4}-\d{2}-\d{2}$/, '')
  return mayuscula(humanizar(base))
}

/** Qué es un pedazo técnico: id, ubicación larga, archivo citado o nada (texto normal). */
export function clasePieza(t: string): 'id' | 'ubicacion' | 'archivo' | null {
  const s = t.replace(/[.,;:]+$/, '')
  if (RE_ID.test(s)) return 'id'
  // «/» suelto («Ciudad de México / Bajío») o una sección («/perro») no son ubicaciones.
  if (!/[a-z0-9]/i.test(s) || /^\/[a-z][a-z-]*$/i.test(s)) return null
  if (!s.includes('/') && !RE_EXT.test(s)) return null
  if (/^https?:\/\//.test(s)) return 'ubicacion'
  const carpetas = s.split('/').filter(Boolean).length
  if (/^(~|\.{1,2})?\//.test(s) || carpetas >= 4 || s.length > 64) return 'ubicacion'
  if (RE_EXT.test(s)) return 'archivo'
  if (carpetas >= 3) return 'ubicacion'
  return null
}

/** Un renglón de prosa partido en texto y pedazos técnicos (rutas e ids sueltos, fuera de las marcas de código). */
export function piezasProsa(texto: string): PiezaProsa[] {
  const out: PiezaProsa[] = []
  let ultimo = 0
  const re = /[^\s()«»"',;]+/g
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const tok = m[0].replace(/[.:]+$/, '')
    const c = clasePieza(tok)
    if (!c) continue
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: texto.slice(ultimo, m.index) })
    out.push(c === 'archivo' ? { tipo: 'archivo', nombre: nombreDeArchivo(tok), texto: tok } : { tipo: c, texto: tok })
    ultimo = m.index + tok.length
  }
  if (ultimo < texto.length) out.push({ tipo: 'texto', texto: texto.slice(ultimo) })
  return out.length ? out : [{ tipo: 'texto', texto }]
}

// ── Anoche, para el reporte de las 05:30 (28 oct 2026) ──

/**
 * «Anoche: 6 trabajos, 1 decisión tuya»: la línea del reporte matutino, de la MISMA lectura que Taller › Historia. Trabajos = los
 * de agentes que se movieron en la ventana (incorporados a main o con cambios propios, por nombre, sin contar dos veces);
 * decisiones tuyas = lo que el héroe llama «Te toca»: trabajos listos que esperan que los incorpores. Sin rojo ni juicio.
 */
export function lineaAnoche(eventos: readonly Pick<Evento, 'tipo' | 'cuando' | 'frase'>[], carriles: readonly Pick<Carril, 'nombre' | 'estado' | 'ultimo' | 'juntado'>[], desde: number, hasta: number): { trabajos: number; decisiones: number; texto: string } {
  const en = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return t >= desde && t <= hasta }
  const nombres = new Set<string>()
  for (const e of eventos) if (e.tipo === 'junta' && en(e.cuando)) nombres.add(/«([^»]+)»/.exec(e.frase)?.[1] ?? e.frase)
  for (const c of carriles) if (en(c.ultimo?.cuando) || en(c.juntado)) nombres.add(c.nombre)
  const trabajos = nombres.size, decisiones = carriles.filter(c => c.estado === 'listo').length
  const texto = `Anoche: ${trabajos === 1 ? '1 trabajo' : `${trabajos} trabajos`}, ${decisiones === 1 ? '1 decisión tuya' : `${decisiones} decisiones tuyas`}${decisiones ? ' (Taller › Historia)' : ''}`
  return { trabajos, decisiones, texto }
}
