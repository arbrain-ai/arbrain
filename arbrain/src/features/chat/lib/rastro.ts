/**
 * El rastro del turno de Levy (25 oct 2026, «respuesta primero, rastro plegado»).
 *
 * Principio: el rastro es para AUDITAR, no para leer. El turno terminado enseña primero la respuesta y, plegado
 * debajo, «Cómo lo hice · N pasos ›». Mientras trabaja, una sola línea viva en español dice qué hace ahora.
 *
 * Aquí vive la parte pura (sin React, sin red, sin modelo): agrupar las herramientas consecutivas por intención
 * («Revisó el calendario · 5 comandos»), la línea viva y el conteo de pasos. Todo determinista y en español: una
 * `description` de Bash en inglés nunca llega a la etiqueta; cae a la familia derivada del comando o la ruta.
 */
import type { ChatMessage, ToolCall, ToolOutput } from '../hooks/useChat'
import { esHerramientaCabina } from '@/features/cabina/model'
import { esViva } from './tareas-turno'

export type EstadoPaso = 'corriendo' | 'error' | 'listo'

export interface LlamadaRastro {
  tool: ToolCall
  input?: string
  output?: ToolOutput
  estado: EstadoPaso
  /** Lo que hizo esta llamada sola, en español (para la lista al abrir el grupo). */
  etiqueta: string
  /** Detalle corto (comando, archivo, búsqueda) en gris. */
  detalle: string | null
  /** ¿La etiqueta dice algo propio de esta llamada (su descripción en español, su archivo) o es la del grupo? */
  especifica: boolean
  /** Qué es, en una palabra: «Comando», «Archivo», «Búsqueda», «Paso». */
  unidad: string
}

export interface GrupoRastro {
  /** Llave estable del grupo (para React): id de su primera llamada. */
  id: string
  /** La intención compartida: misma clave = mismo renglón cuando son consecutivas. */
  clave: string
  llamadas: LlamadaRastro[]
  estado: EstadoPaso
  /** «Revisó el calendario» al terminar; «Revisando el calendario…» mientras corre. */
  etiqueta: string
  /** «5 comandos», «3 archivos»; `null` si es una sola llamada. */
  cuenta: string | null
  /** Subagentes y workflows: en el chat se mencionan, el detalle vive en el Taller. */
  agente: boolean
}

/** Herramientas que no son pasos de Levy hacia Daniel (descubrir herramientas). Mismo criterio que ChatPanel. */
export const HERRAMIENTAS_INTERNAS = new Set(['ToolSearch'])

/** ¿Esta llamada entra al rastro? Las vistas de la Cabina se pintan aparte (son respuesta, no rastro). */
export const entraAlRastro = (toolName: string) => !esHerramientaCabina(toolName) && !HERRAMIENTAS_INTERNAS.has(toolName)

// ─── Idioma y conjugación ───────────────────────────────────────────────────

const PALABRAS_ES = /\b(el|la|los|las|de|del|que|y|en|para|con|por|una?|su|sus|al|se|sin|qué|dónde|cómo|cuál|cuándo|hoy|mañana|ayer|desde|hasta|entre|mi|tu|lo)\b/gi
const PALABRAS_EN = /\b(the|and|of|to|for|with|in|on|from|into|all|any|this|that|its|is|are|was|be|by|how|where|what|which|check|find|list|read|search|locate|inspect|show|get|run|fetch|create|update|regenerate|register|index|verify|test|build|install|count|look|open|grep|dump|print|compare|scan|confirm|kill|start|stop|restart|query|load|save|write|copy|move|remove|delete|add|set|wait|retry|capture|take|render|debug|trace|probe|append|rebase|revert|rerun|smoke|show|wire|wiring|refactor|fix|patch|pull|push|commit|deploy|ensure|extract|parse|dry|session|entry|new|old|file|files|and|code)\b/gi
const ACENTOS = /[áéíóúñ¿¡]/i

/** ¿El texto está en español? Heurística de palabras frecuentes; sin evidencia, no. */
export function esEspanol(texto: string): boolean {
  const t = texto.trim()
  if (!t) return false
  const es = (t.match(PALABRAS_ES)?.length ?? 0) + (ACENTOS.test(t) ? 1 : 0) + (infinitivo(t.split(/\s+/)[0]) ? 1 : 0)
  const en = t.match(PALABRAS_EN)?.length ?? 0
  return es > en
}

/** Verbos frecuentes cuyo pasado (3.ª persona) o gerundio no salen de la regla. */
const IRREGULARES: Record<string, [string, string]> = {
  ver: ['Vio', 'Viendo'], ir: ['Fue', 'Yendo'], dar: ['Dio', 'Dando'], hacer: ['Hizo', 'Haciendo'], poner: ['Puso', 'Poniendo'],
  traer: ['Trajo', 'Trayendo'], decir: ['Dijo', 'Diciendo'], pedir: ['Pidió', 'Pidiendo'], seguir: ['Siguió', 'Siguiendo'],
  obtener: ['Obtuvo', 'Obteniendo'], tener: ['Tuvo', 'Teniendo'], mantener: ['Mantuvo', 'Manteniendo'], componer: ['Compuso', 'Componiendo'],
  proponer: ['Propuso', 'Proponiendo'], elegir: ['Eligió', 'Eligiendo'], corregir: ['Corrigió', 'Corrigiendo'], repetir: ['Repitió', 'Repitiendo'],
  medir: ['Midió', 'Midiendo'], servir: ['Sirvió', 'Sirviendo'], convertir: ['Convirtió', 'Convirtiendo'], venir: ['Vino', 'Viniendo'],
  oír: ['Oyó', 'Oyendo'], saber: ['Supo', 'Sabiendo'], querer: ['Quiso', 'Queriendo'], poder: ['Pudo', 'Pudiendo'], estar: ['Estuvo', 'Estando'],
  dormir: ['Durmió', 'Durmiendo'], sentir: ['Sintió', 'Sintiendo'], preferir: ['Prefirió', 'Prefiriendo'], advertir: ['Advirtió', 'Advirtiendo'],
  conseguir: ['Consiguió', 'Consiguiendo'], despedir: ['Despidió', 'Despidiendo'], impedir: ['Impidió', 'Impidiendo'], vestir: ['Vistió', 'Vistiendo'],
}

/** Palabras en -ar/-er/-ir que NO son verbos (para no conjugar «Lugar de…», «Bar», «Mujer»). */
const NO_VERBOS = new Set(['lugar', 'mar', 'bar', 'par', 'hogar', 'altar', 'collar', 'dólar', 'militar', 'popular', 'similar', 'particular', 'mujer', 'ayer', 'placer', 'poder', 'deber', 'taller', 'cráter', 'carácter', 'láser', 'póster', 'porvenir', 'elixir', 'faquir', 'nadir', 'tapir'])

/** «revisar» → la raíz y su conjugación; `null` si la palabra no parece infinitivo español. */
function infinitivo(palabra: string | undefined): [string, string] | null {
  if (!palabra) return null
  const w = palabra.toLowerCase().replace(/[^a-záéíóúñü]/g, '')
  if (w.length < 2 || NO_VERBOS.has(w)) return null
  if (IRREGULARES[w]) return IRREGULARES[w]
  // Pronombre enclítico: «revisarlo», «leerlas» → se conjuga el verbo y se deja el pronombre aparte (raro, se omite).
  const m = /^(.+?)(ar|er|ir)$/.exec(w)
  if (!m) return null
  const [, raiz, fin] = m
  if (raiz.length < 2) return null
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (fin === 'ar') return [cap(`${raiz}ó`), cap(`${raiz}ando`)]
  // leer, creer, construir, incluir: raíz que acaba en vocal → «-yó», «-yendo».
  if (/[aeou]$/.test(raiz)) return [cap(`${raiz}yó`), cap(`${raiz}yendo`)]
  return [cap(`${raiz}ió`), cap(`${raiz}iendo`)]
}

export interface Frase { pasado: string; presente: string }

/**
 * Una descripción en español → su forma en pasado y en presente. «Leer la agenda de hoy» → «Leyó la agenda de hoy» /
 * «Leyendo la agenda de hoy». Si no empieza con un infinitivo («Resumen de eventos»), queda igual en los dos.
 * En inglés o vacía → `null` (no se usa como etiqueta).
 */
export function fraseDeDescripcion(descripcion: string | undefined | null): Frase | null {
  const d = (descripcion ?? '').replace(/\s+/g, ' ').trim().replace(/[.:;]+$/, '')
  if (!d || d.length > 140 || !esEspanol(d)) return null
  const [primera, ...resto] = d.split(' ')
  const conj = infinitivo(primera)
  const cola = resto.join(' ')
  if (!conj) { const igual = d.charAt(0).toUpperCase() + d.slice(1); return { pasado: igual, presente: igual } }
  return { pasado: [conj[0], cola].filter(Boolean).join(' '), presente: [conj[1], cola].filter(Boolean).join(' ') }
}

// ─── De qué trata cada llamada ──────────────────────────────────────────────

/** Una ruta o un comando → la zona del cerebro que toca, en palabras. `null` si no se reconoce. */
export function zonaDe(texto: string): string | null {
  const t = texto
  if (/\.claude\/memory\b|MEMORY[-\w]*\.md/.test(t)) return 'la memoria'
  if (/\.claude\/skills\b|SKILL\.md/.test(t)) return 'las skills'
  if (/\.claude\/(daily|diario)\b/.test(t)) return 'el diario'
  if (/\.claude\/(plan|now\.md)/.test(t)) return 'el plan'
  if (/\/logs?\/|\.log\b|\.janitor\.log/.test(t)) return 'los registros'
  if (/workspace\/uploads\//.test(t)) return 'tus adjuntos'
  if (/arbrain\/agent-server\b/.test(t)) return 'el motor de Levy'
  if (/arbrain\/server\b/.test(t)) return 'el código del servidor'
  if (/arbrain\/(src|tests|scripts)\b/.test(t)) return 'el código de la app'
  if (/contenido\/youtube\b/.test(t)) return 'el material de YouTube'
  if (/\bdocs\//.test(t)) return 'los documentos'
  const app = /Developer\/software\/([\w.-]+)/.exec(t)?.[1]
  if (app) return `la app ${app}`
  if (/(^|\s|'|")\/tmp\//.test(t)) return 'los archivos temporales'
  if (/artificial-brain\/arbrain\b/.test(t)) return 'el código de Arbrain'
  if (/artificial-brain\b|business-os\b/.test(t)) return 'el cerebro'
  return null
}

/** «de el código» → «del código». */
const deZona = (zona: string) => zona.startsWith('el ') ? `del ${zona.slice(3)}` : `de ${zona}`

const nombreArchivo = (ruta: string) => ruta.split('/').filter(Boolean).at(-1) ?? ruta

/** Lo que importa de un comando: sin `cd …&&` ni variables de entorno delante. */
function nucleoComando(cmd: string): string {
  let c = cmd.trim(), antes = ''
  // Prefijos que no dicen qué hace: `cd x &&`, `set -a; source .env; set +a;`, `set -e`, variables de entorno.
  while (c !== antes) {
    antes = c
    c = c.replace(/^(for|while)\s[^;\n]+[;\n]\s*do\s+/, '').replace(/^(cd\s+\S+|set\s+[-+]\w+|source\s+\S+(\s+2>\/dev\/null)?|\.\s+\S+|export\s+\S+)\s*(&&|;|\n)\s*/, '')
      .replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/, '').trim()
  }
  return c
}

interface Intencion {
  clave: string
  pasado: string
  presente: string
  unidad: [string, string]
  agente?: boolean
  /** Lo específico de esta llamada (de su descripción en español o de su objetivo). */
  propia?: Frase | null
  detalle: string | null
}

const COMANDO: [string, string] = ['comando', 'comandos']
const ARCHIVO: [string, string] = ['archivo', 'archivos']
const PASO: [string, string] = ['paso', 'pasos']
const BUSQUEDA: [string, string] = ['búsqueda', 'búsquedas']

const corto = (s: string, max: number) => s.length > max ? `${s.slice(0, max - 1)}…` : s

/** Familias de comandos de Bash, en orden: la primera que reconoce el comando (o su descripción) manda. */
const FAMILIAS_BASH: { re: RegExp; clave: string; pasado: string; presente: string }[] = [
  { re: /\b(vitest|jest|pytest|playwright|tsx --test|node --test|npm (run )?test|pnpm test|npm run e2e)\b/, clave: 'pruebas', pasado: 'Corrió las pruebas', presente: 'Corriendo las pruebas' },
  { re: /\b(tsc|typecheck|eslint|npm run lint)\b/, clave: 'tipos', pasado: 'Revisó los tipos', presente: 'Revisando los tipos' },
  { re: /\b(next build|npm run build|vite build|npm run desktop|xcodebuild|cargo build)\b/, clave: 'compilar', pasado: 'Compiló la app', presente: 'Compilando la app' },
  { re: /mc-event\.py|gog\s+calendar|scripts\/calendar\/|calendar\/v3/, clave: 'calendario', pasado: 'Revisó el calendario', presente: 'Revisando el calendario' },
  { re: /api\.todoist|todoist\.com|scripts\/\S*todoist|todoist[-_][\w-]*\.(py|sh|ts)/i, clave: 'todoist', pasado: 'Revisó Todoist', presente: 'Revisando Todoist' },
  { re: /gog\s+(gmail|mail)|gmail\.googleapis/i, clave: 'correo', pasado: 'Revisó el correo', presente: 'Revisando el correo' },
  { re: /gog\s+drive|drive\.google|googleapis\.com\/drive/i, clave: 'drive', pasado: 'Revisó Drive', presente: 'Revisando Drive' },
  { re: /\b(psql|supabase|sqlite3|rest\/v1)\b/, clave: 'base', pasado: 'Consultó la base de datos', presente: 'Consultando la base de datos' },
  { re: /\bgit\s+(commit|push|merge|rebase|cherry-pick)\b/, clave: 'git-guardar', pasado: 'Guardó los cambios en Git', presente: 'Guardando los cambios en Git' },
  { re: /\b(git|gh)\s/, clave: 'git', pasado: 'Revisó el repositorio', presente: 'Revisando el repositorio' },
  { re: /\b(df|du)\s|janitor|diskutil/, clave: 'disco', pasado: 'Revisó el disco', presente: 'Revisando el disco' },
  { re: /\b(ps|pgrep|pkill|kill|launchctl|lsof|top|vm_stat|memory_pressure)\b/, clave: 'procesos', pasado: 'Revisó los procesos', presente: 'Revisando los procesos' },
  { re: /\b(npm (i|install|ci)|pnpm (i|install|add)|brew install|pip3? install)\b/, clave: 'instalar', pasado: 'Instaló dependencias', presente: 'Instalando dependencias' },
  { re: /\bcurl\b|https?:\/\//, clave: 'servicio', pasado: 'Consultó un servicio', presente: 'Consultando un servicio' },
]

/** Cuántas de FAMILIAS_BASH ganan aunque el comando empiece leyendo (pruebas … base de datos). */
const FUERTES = 8

/** Comandos que solo leen archivos: se agrupan por zona con Read, Grep y Glob («Revisó la memoria · 4 pasos»). */
const SOLO_LECTURA = /^(cat|ls|echo|printf|pdftotext|grep|rg|find|head|tail|sed\s+-n|wc|stat|file|tree|jq|less|awk|sort|uniq|diff|readlink|realpath|basename|dirname|test|\[)\b/

function intencionBash(input: Record<string, unknown> | null, crudo: string | undefined): Intencion {
  const cmd = typeof input?.command === 'string' ? input.command : (/"command"\s*:\s*"([^"]*)/.exec(crudo ?? '')?.[1] ?? '')
  const desc = typeof input?.description === 'string' ? input.description : (/"description"\s*:\s*"([^"]*)/.exec(crudo ?? '')?.[1] ?? '')
  const nucleo = nucleoComando(cmd)
  const propia = fraseDeDescripcion(desc)
  const detalle = nucleo ? corto(nucleo.replace(/\s+/g, ' '), 90) : null
  const base = { unidad: COMANDO, propia, detalle }
  const zona = zonaDe(cmd)
  const familia = (f: typeof FAMILIAS_BASH[number]): Intencion => ({ ...base, clave: `bash:${f.clave}`, pasado: f.pasado, presente: f.presente })
  // Primero las familias que nombran un servicio o una verificación (pruebas, calendario, correo…); luego, si el
  // comando empieza leyendo archivos, es una lectura aunque al final mire `git status`; luego el resto.
  const fuertes = FAMILIAS_BASH.slice(0, FUERTES)
  for (const f of fuertes) if (f.re.test(nucleo)) return familia(f)
  if (SOLO_LECTURA.test(nucleo)) {
    return zona
      ? { ...base, clave: `leer:${zona}`, pasado: `Revisó ${zona}`, presente: `Revisando ${zona}` }
      : { ...base, clave: 'leer:archivos', pasado: 'Revisó archivos', presente: 'Revisando archivos' }
  }
  for (const f of FAMILIAS_BASH.slice(FUERTES)) if (f.re.test(nucleo)) return familia(f)
  const carpeta = /scripts\/([\w-]+)/.exec(cmd)?.[1]
  if (/^(python3?|node|tsx|bash|sh|zsh|npx)\s/.test(nucleo) && (carpeta || zona)) {
    const de = carpeta ? `de ${carpeta}` : deZona(zona!)
    return { ...base, clave: `script:${carpeta ?? zona}`, pasado: `Corrió scripts ${de}`, presente: `Corriendo un script ${de}` }
  }
  return { ...base, clave: 'bash:otro', pasado: 'Corrió comandos', presente: 'Corriendo un comando' }
}

/** Servidores MCP conocidos, en palabras de Daniel. */
const MCP: Record<string, { pasado: string; presente: string; clave?: string }> = {
  supabase: { pasado: 'Consultó la base de datos', presente: 'Consultando la base de datos', clave: 'bash:base' },
  polar: { pasado: 'Consultó Polar', presente: 'Consultando Polar' },
  claude_ai_Gmail: { pasado: 'Revisó el correo', presente: 'Revisando el correo', clave: 'bash:correo' },
  gmail: { pasado: 'Revisó el correo', presente: 'Revisando el correo', clave: 'bash:correo' },
  claude_ai_Google_Calendar: { pasado: 'Revisó el calendario', presente: 'Revisando el calendario', clave: 'bash:calendario' },
  google_calendar: { pasado: 'Revisó el calendario', presente: 'Revisando el calendario', clave: 'bash:calendario' },
  claude_ai_Google_Drive: { pasado: 'Revisó Drive', presente: 'Revisando Drive', clave: 'bash:drive' },
  google: { pasado: 'Usó Google', presente: 'Usando Google' },
  'google-workspace': { pasado: 'Usó Google', presente: 'Usando Google' },
  claude_ai_vidIQ_for_Claude: { pasado: 'Consultó YouTube', presente: 'Consultando YouTube' },
  claude_ai_Canva: { pasado: 'Trabajó en Canva', presente: 'Trabajando en Canva' },
  claude_ai_Claude_Docs: { pasado: 'Trabajó en un documento', presente: 'Trabajando en un documento' },
  claude_ai_Notion: { pasado: 'Revisó Notion', presente: 'Revisando Notion' },
  claude_ai_Linear: { pasado: 'Revisó Linear', presente: 'Revisando Linear' },
  claude_ai_Fireflies: { pasado: 'Revisó las reuniones grabadas', presente: 'Revisando las reuniones grabadas' },
  'claude-in-chrome': { pasado: 'Usó el navegador', presente: 'Usando el navegador', clave: 'manos:web' },
  todoist: { pasado: 'Revisó Todoist', presente: 'Revisando Todoist', clave: 'bash:todoist' },
}

/** `mcp__servidor__herramienta` (Claude) o `servidor_herramienta` (Codex, solo para los servidores propios). */
function partesMcp(toolName: string): [string, string] | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (m) return [m[1], m[2]]
  const c = /^(cabina|manos)_(.+)$/.exec(toolName)
  return c ? [c[1], c[2]] : null
}

const servidorLegible = (s: string) => s.replace(/^claude_ai_/, '').replace(/_for_Claude$/, '').replace(/[_-]+/g, ' ').trim()

function str(o: Record<string, unknown> | null, ...campos: string[]): string | null {
  for (const c of campos) { const v = o?.[c]; if (typeof v === 'string' && v.trim()) return v.trim() }
  return null
}

function intencionDe(tool: ToolCall, crudo: string | undefined): Intencion {
  let input: Record<string, unknown> | null = null
  try { const v = crudo ? JSON.parse(crudo) : null; input = v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { /* JSON parcial mientras llega */ }
  // Con el JSON aún parcial (llega por deltas), el campo se rescata del texto crudo.
  const campo = (c: string) => str(input, c) ?? new RegExp(`"${c}"\\s*:\\s*"([^"]*)`, 's').exec(crudo ?? '')?.[1] ?? null
  const n = tool.toolName

  if (n === 'Bash' || n === 'BashOutput' || n === 'shell' || n === 'exec_command') return intencionBash(input, crudo)

  if (n === 'Read' || n === 'Grep' || n === 'Glob' || n === 'LS' || n === 'NotebookRead') {
    const ruta = campo('file_path') ?? campo('path') ?? ''
    const patron = campo('pattern')
    const zona = zonaDe(ruta) ?? (patron ? zonaDe(patron) : null)
    const unidad = n === 'Read' ? ARCHIVO : BUSQUEDA
    const detalle = n === 'Read' ? (ruta ? ruta.split('/').slice(-2).join('/') : null) : (patron ? corto(patron, 60) : null)
    const propia: Frase | null = n === 'Read' && zona === 'tus adjuntos' ? { pasado: 'Miró tu adjunto', presente: 'Mirando tu adjunto' }
      : n === 'Read' && ruta ? { pasado: `Leyó ${nombreArchivo(ruta)}`, presente: `Leyendo ${nombreArchivo(ruta)}` }
      : n === 'Grep' && patron ? { pasado: `Buscó «${corto(patron, 40)}»${zona ? ` en ${zona}` : ''}`, presente: `Buscando «${corto(patron, 40)}»${zona ? ` en ${zona}` : ''}` }
      : null
    return zona
      ? { clave: `leer:${zona}`, pasado: `Revisó ${zona}`, presente: `Revisando ${zona}`, unidad, propia, detalle }
      : { clave: 'leer:archivos', pasado: n === 'Read' ? 'Leyó archivos' : 'Buscó en los archivos', presente: n === 'Read' ? 'Leyendo archivos' : 'Buscando en los archivos', unidad, propia, detalle }
  }

  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit') {
    const ruta = campo('file_path') ?? campo('notebook_path') ?? ''
    const zona = zonaDe(ruta)
    const verbo: [string, string] = n === 'Write' ? ['Escribió', 'Escribiendo'] : ['Editó', 'Editando']
    const propia = ruta ? { pasado: `${verbo[0]} ${nombreArchivo(ruta)}`, presente: `${verbo[1]} ${nombreArchivo(ruta)}` } : null
    return { clave: `editar:${zona ?? 'archivos'}`, pasado: zona ? `Editó ${zona}` : 'Editó archivos', presente: zona ? `Editando ${zona}` : 'Editando archivos', unidad: ARCHIVO, propia, detalle: ruta ? ruta.split('/').slice(-2).join('/') : null }
  }

  if (n === 'WebSearch' || n === 'WebFetch') {
    const q = campo('query'), url = campo('url')
    let host: string | null = null
    try { host = url ? new URL(url).hostname.replace(/^www\./, '') : null } catch { host = null }
    const propia = n === 'WebSearch' && q ? { pasado: `Buscó «${corto(q, 48)}»`, presente: `Buscando «${corto(q, 48)}»` }
      : host ? { pasado: `Leyó ${host}`, presente: `Leyendo ${host}` } : null
    return { clave: 'web', pasado: 'Investigó en la web', presente: 'Investigando en la web', unidad: n === 'WebSearch' ? BUSQUEDA : ['página', 'páginas'], propia, detalle: q ? corto(q, 60) : url ? corto(url, 60) : null }
  }

  if (n === 'Agent' || n === 'Task' || n === 'Workflow') {
    const d = campo('description') ?? campo('name')
    return { clave: 'agentes', pasado: 'Delegó en agentes', presente: 'Delegando en un agente', unidad: ['agente', 'agentes'], agente: true, propia: d ? { pasado: `Delegó: ${corto(d, 60)}`, presente: `Delegando: ${corto(d, 60)}` } : null, detalle: d ? corto(d, 60) : null }
  }
  if (n === 'SendMessage' || n === 'TaskStop' || n === 'TaskOutput') {
    return { clave: 'agentes', pasado: 'Coordinó a sus agentes', presente: 'Coordinando a sus agentes', unidad: PASO, agente: true, propia: null, detalle: null }
  }
  if (n === 'TodoWrite') return { clave: 'plan', pasado: 'Ordenó su plan', presente: 'Ordenando su plan', unidad: ['cambio', 'cambios'], propia: null, detalle: null }
  if (n === 'Skill') {
    const s = campo('skill') ?? campo('name')
    return { clave: 'skill', pasado: 'Consultó skills', presente: 'Consultando una skill', unidad: ['skill', 'skills'], propia: s ? { pasado: `Consultó la skill ${s}`, presente: `Consultando la skill ${s}` } : null, detalle: s }
  }
  if (n === 'AskUserQuestion') return { clave: 'pregunta', pasado: 'Te hizo una pregunta', presente: 'Preparando una pregunta', unidad: ['pregunta', 'preguntas'], propia: null, detalle: null }

  const mcp = partesMcp(n)
  if (mcp) {
    const [servidor, herramienta] = mcp
    const primero = (() => { const m = /"[^"]+"\s*:\s*"([^"]{1,80})/.exec(crudo ?? ''); return m ? corto(m[1], 60) : null })()
    if (servidor === 'cabina') {
      if (/^(delegar|retomar|cerrar|detener|atender)$/.test(herramienta)) {
        const nombre = campo('nombre')
        const verbos: Record<string, [string, string]> = { delegar: ['Delegó en agentes', 'Delegando en un agente'], retomar: ['Retomó a un agente', 'Retomando a un agente'], cerrar: ['Cerró agentes', 'Cerrando un agente'], detener: ['Detuvo a un agente', 'Deteniendo a un agente'], atender: ['Atendió a sus agentes', 'Atendiendo a sus agentes'] }
        const [p, pr] = verbos[herramienta]
        return { clave: 'agentes', pasado: p, presente: pr, unidad: herramienta === 'delegar' ? ['agente', 'agentes'] : PASO, agente: true, propia: herramienta === 'delegar' && nombre ? { pasado: `Delegó: ${corto(nombre, 60)}`, presente: `Delegando: ${corto(nombre, 60)}` } : null, detalle: nombre ? corto(nombre, 60) : primero }
      }
      if (herramienta === 'despertador') return { clave: 'cabina:despertador', pasado: 'Programó un despertador', presente: 'Programando un despertador', unidad: ['despertador', 'despertadores'], propia: null, detalle: primero }
      return { clave: 'cabina', pasado: 'Usó la Cabina', presente: 'Usando la Cabina', unidad: PASO, propia: null, detalle: primero }
    }
    if (servidor === 'manos') {
      if (herramienta === 'encargar') {
        const pedido = campo('pedido')
        return { clave: 'manos:encargar', pasado: 'Encargó una tarea en pantalla', presente: 'Haciendo una tarea en pantalla', unidad: ['encargo', 'encargos'], propia: null, detalle: pedido ? corto(pedido, 70) : primero }
      }
      if (/^web_/.test(herramienta)) return { clave: 'manos:web', pasado: 'Navegó en la web', presente: 'Navegando en la web', unidad: PASO, propia: null, detalle: campo('url') ?? primero }
      return { clave: 'manos:pantalla', pasado: 'Operó la computadora', presente: 'Operando la computadora', unidad: PASO, propia: null, detalle: primero }
    }
    const conocido = MCP[servidor]
    if (conocido) return { clave: conocido.clave ?? `mcp:${servidor}`, pasado: conocido.pasado, presente: conocido.presente, unidad: PASO, propia: null, detalle: primero }
    const legible = servidorLegible(servidor)
    return { clave: `mcp:${servidor}`, pasado: `Usó ${legible}`, presente: `Usando ${legible}`, unidad: PASO, propia: null, detalle: primero }
  }

  return { clave: `tool:${n}`, pasado: `Usó ${n}`, presente: `Usando ${n}`, unidad: PASO, propia: null, detalle: null }
}

// ─── Agrupar ────────────────────────────────────────────────────────────────

const plural = (n: number, [uno, varios]: [string, string]) => `${n} ${n === 1 ? uno : varios}`

function estadoDe(tool: ToolCall, output: ToolOutput | undefined): EstadoPaso {
  if (tool.status === 'running') return 'corriendo'
  return output?.isError || /^(denied|interrupted|cancelled)$/.test(output?.kind ?? '') ? 'error' : 'listo'
}

/** Lecturas y ediciones seguidas se funden aunque cambien de carpeta: la intención es la misma (investigar, editar). */
const fusionDe = (clave: string) => /^(leer|editar):/.test(clave) ? clave.split(':')[0] : clave
const zonaDeClave = (clave: string) => { const z = clave.split(':').slice(1).join(':'); return z && z !== 'archivos' ? z : null }

/** «la memoria» · «la memoria y las skills» · «la memoria, las skills y más». */
function listaZonas(todas: string[]): string {
  // «el código del servidor» + «el código de la app» = el mismo repositorio: se dice una vez.
  const codigo = todas.filter(z => z.startsWith('el código'))
  const zonas = codigo.length > 1 ? [...todas.filter(z => !z.startsWith('el código')), 'el código de Arbrain'] : todas
  if (zonas.length <= 1) return zonas[0] ?? 'archivos'
  if (zonas.length === 2) return `${zonas[0]} y ${zonas[1]}`
  return `${zonas[0]}, ${zonas[1]} y más`
}

/** Las herramientas del turno, en orden, agrupadas por intención cuando son consecutivas. */
export function agruparHerramientas(msg: Pick<ChatMessage, 'toolCalls' | 'toolInputs' | 'toolOutputs'>): GrupoRastro[] {
  const grupos: { clave: string; intenciones: Intencion[]; llamadas: LlamadaRastro[] }[] = []
  for (const tool of msg.toolCalls ?? []) {
    if (!entraAlRastro(tool.toolName)) continue
    const input = msg.toolInputs?.[tool.toolId]
    const output = msg.toolOutputs?.[tool.toolId]
    const it = intencionDe(tool, input)
    const estado = estadoDe(tool, output)
    const llamada: LlamadaRastro = {
      tool, input, output, estado, detalle: it.detalle, especifica: !!it.propia,
      unidad: it.unidad[0].charAt(0).toUpperCase() + it.unidad[0].slice(1),
      etiqueta: estado === 'corriendo' ? (it.propia?.presente ?? it.presente) : (it.propia?.pasado ?? it.pasado),
    }
    const clave = fusionDe(it.clave)
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.clave === clave) { ultimo.intenciones.push(it); ultimo.llamadas.push(llamada) }
    else grupos.push({ clave, intenciones: [it], llamadas: [llamada] })
  }
  return grupos.map(({ clave, intenciones, llamadas }) => {
    const estado: EstadoPaso = llamadas.some(l => l.estado === 'corriendo') ? 'corriendo' : llamadas.some(l => l.estado === 'error') ? 'error' : 'listo'
    const n = llamadas.length
    const primera = intenciones[0]
    // Base del grupo: la de su primera llamada, o la lista de carpetas si es una lectura/edición que recorrió varias.
    let base: Frase = { pasado: primera.pasado, presente: primera.presente }
    if ((clave === 'leer' || clave === 'editar') && n > 1) {
      const zonas = [...new Set(intenciones.map(i => zonaDeClave(i.clave)).filter((z): z is string => !!z))]
      const [p, pr] = clave === 'leer' ? ['Revisó', 'Revisando'] : ['Editó', 'Editando']
      const lista = listaZonas(zonas)
      base = { pasado: `${p} ${lista}`, presente: `${pr} ${lista}` }
    }
    let etiqueta: string
    if (estado === 'corriendo') {
      const it = intenciones[llamadas.findIndex(l => l.estado === 'corriendo')]
      // Mientras corre, lo específico de la llamada en curso dice más (si tiene descripción en español o archivo).
      etiqueta = `${it.propia?.presente ?? (n === 1 ? it.presente : base.presente)}…`
    } else if (n === 1) {
      etiqueta = primera.propia?.pasado ?? primera.pasado
    } else if (clave === 'bash:otro' && primera.propia) {
      // Comandos sin familia conocida: la descripción en español de Levy dice más que «Corrió comandos».
      etiqueta = primera.propia.pasado
    } else {
      etiqueta = base.pasado
    }
    const unidades = new Set(intenciones.map(i => i.unidad.join('|')))
    const unidad = unidades.size === 1 ? primera.unidad : PASO
    return {
      id: llamadas[0].tool.toolId, clave, llamadas, estado, etiqueta,
      cuenta: n > 1 ? plural(n, unidad) : null,
      agente: !!primera.agente,
    }
  })
}

// ─── Razonamiento ───────────────────────────────────────────────────────────

const RE_THINKING = /<!--thinking-->([\s\S]*?)<!--\/thinking-->/g

/**
 * Separa el razonamiento de la respuesta. Las sesiones CLI recargadas traen el pensamiento fundido en `content`
 * como `<!--thinking-->…<!--/thinking-->`: va al rastro plegado, no encima de la respuesta. El texto queda intacto.
 */
export function separarRazonamiento(msg: Pick<ChatMessage, 'content' | 'thinking'>): { razonamiento: string; respuesta: string } {
  const partes: string[] = []
  if (msg.thinking?.trim()) partes.push(msg.thinking.trim())
  const respuesta = (msg.content ?? '').replace(RE_THINKING, (_, t: string) => { if (t.trim()) partes.push(t.trim()); return '' })
  return { razonamiento: partes.join('\n\n'), respuesta: respuesta.replace(/^\s*\n+/, '').replace(/\n{3,}/g, '\n\n') }
}

// ─── Conteo, agentes y línea viva ───────────────────────────────────────────

/** Pasos del turno = llamadas que se pueden auditar en el rastro (sin las vistas de la Cabina ni las internas). */
export function contarPasos(msg: Pick<ChatMessage, 'toolCalls'>): number {
  return (msg.toolCalls ?? []).filter(t => entraAlRastro(t.toolName)).length
}

/** «2 pasos» · «1 paso». */
export const textoPasos = (n: number) => plural(n, PASO)

const LLAMA_AGENTE = /^(Agent|Task|Workflow)$|^mcp__cabina__(delegar|retomar)$|^cabina_(delegar|retomar)$/

/** Agentes que trabajan ahora para este turno: tareas vivas del SDK, o, si no hay, llamadas de delegar en curso. */
export function agentesTrabajando(msg: Pick<ChatMessage, 'tasks' | 'toolCalls'>): number {
  const tareas = (msg.tasks ?? []).filter(esViva).length
  if (tareas) return tareas
  return (msg.toolCalls ?? []).filter(t => t.status === 'running' && LLAMA_AGENTE.test(t.toolName)).length
}

/** «2 agentes trabajando» · «1 agente trabajando». */
export const textoAgentes = (n: number) => `${plural(n, ['agente', 'agentes'])} trabajando`

/**
 * Una línea en español de qué hace Levy AHORA. Del grupo en curso si hay herramienta corriendo; si escribe, lo dice;
 * si solo piensa, «Pensando cómo responder» (o «el siguiente paso» si ya usó herramientas). Nunca texto del SDK.
 */
export function lineaViva(msg: Pick<ChatMessage, 'toolCalls' | 'toolInputs' | 'toolOutputs' | 'content' | 'status' | 'tasks' | 'streaming' | 'questionPrompts'> & { thinking?: string }, grupos = agruparHerramientas(msg)): string {
  if (msg.questionPrompts?.some(q => q.status === 'pending')) return 'Esperando tu respuesta'
  if (msg.status === 'compacting') return 'Organizando el contexto'
  const enCurso = grupos.find(g => g.estado === 'corriendo')
  if (enCurso) return enCurso.etiqueta.replace(/…$/, '')
  const respuesta = separarRazonamiento({ content: msg.content ?? '' }).respuesta.trim()
  if (respuesta) return 'Escribiendo la respuesta'
  const agentes = agentesTrabajando(msg)
  if (agentes) return `Esperando a ${agentes === 1 ? 'su agente' : `sus ${agentes} agentes`}`
  return grupos.length ? 'Pensando el siguiente paso' : 'Pensando cómo responder'
}

/** ¿Hay algo que poner en «Cómo lo hice»? (razonamiento, plan, herramientas, tareas o resúmenes del SDK). */
export function hayRastro(msg: Pick<ChatMessage, 'content' | 'thinking' | 'toolCalls' | 'todos' | 'tasks' | 'toolSummaries'>): boolean {
  return !!separarRazonamiento(msg).razonamiento
    || contarPasos(msg) > 0
    || !!msg.todos?.length || !!msg.tasks?.length || !!msg.toolSummaries?.length
}

// ─── Cronología: razonamiento y herramientas intercalados (25 oct 2026, 08:39) ──────────────────────────────────────
//
// Daniel: «un toggle simple "Razonamiento" ARRIBA del mensaje que al abrirse muestre el razonamiento y las herramientas
// en su lugar cronológico correcto». `thinking` es un solo string acumulado: la cronología guarda offsets sobre él (no
// duplica texto) y el id de cada herramienta, en el orden en que llegaron. La graban useChat (en vivo) y el servidor
// (snapshot persistido). Turnos viejos sin cronología: el razonamiento entero primero y luego las herramientas.

export type PasoCronologia = { tipo: 'pensamiento'; desde: number; hasta: number } | { tipo: 'herramienta'; toolId: string }

/** Anota `largo` caracteres de pensamiento que empiezan en `desde`; si siguen al último tramo de pensamiento, lo alarga. */
export function anotarPensamiento(c: PasoCronologia[], desde: number, largo: number): void {
  if (largo <= 0) return
  const ultimo = c[c.length - 1]
  if (ultimo?.tipo === 'pensamiento' && ultimo.hasta === desde) ultimo.hasta = desde + largo
  else c.push({ tipo: 'pensamiento', desde, hasta: desde + largo })
}

/** Anota el arranque de una herramienta (una sola vez por id). */
export function anotarHerramienta(c: PasoCronologia[], toolId: string): void {
  if (!c.some(p => p.tipo === 'herramienta' && p.toolId === toolId)) c.push({ tipo: 'herramienta', toolId })
}

export type Tramo = { tipo: 'pensamiento'; texto: string } | { tipo: 'herramientas'; grupos: GrupoRastro[] }

/**
 * La línea de tiempo del turno: pensamiento → herramientas → pensamiento… en el orden real. Dentro de cada tramo de
 * herramientas seguidas se mantiene la agrupación por intención. Sin cronología (turnos viejos, sesiones CLI con el
 * razonamiento fundido en `content`): el razonamiento entero primero y luego las herramientas, sin inventar orden.
 */
export function lineaDeTiempo(msg: Partial<Pick<ChatMessage, 'content' | 'thinking' | 'toolCalls' | 'toolInputs' | 'toolOutputs' | 'cronologia'>>): Tramo[] {
  const tramos: Tramo[] = []
  const pensar = (texto: string) => {
    const t = texto.trim()
    if (!t) return
    const ultimo = tramos[tramos.length - 1]
    if (ultimo?.tipo === 'pensamiento') ultimo.texto += `\n\n${t}`
    else tramos.push({ tipo: 'pensamiento', texto: t })
  }
  const llamadas = msg.toolCalls ?? []
  const porId = new Map(llamadas.map(t => [t.toolId, t]))
  const herramientas = (ids: string[]) => {
    const grupos = agruparHerramientas({ ...msg, toolCalls: ids.map(id => porId.get(id)!).filter(Boolean) })
    if (grupos.length) tramos.push({ tipo: 'herramientas', grupos })
  }
  // Razonamiento fundido en `content` (sesiones CLI recargadas): siempre sin cronología, va primero.
  const fundido = separarRazonamiento({ content: msg.content ?? '' }).razonamiento
  const thinking = msg.thinking ?? ''
  const cron = msg.cronologia ?? []
  if (!cron.length) {
    pensar(fundido); pensar(thinking); herramientas(llamadas.map(t => t.toolId))
    return tramos
  }
  pensar(fundido)
  const usadas = new Set<string>()
  let pendientes: string[] = []
  let leido = 0
  for (const paso of cron) {
    if (paso.tipo === 'herramienta') {
      if (porId.has(paso.toolId) && !usadas.has(paso.toolId)) { pendientes.push(paso.toolId); usadas.add(paso.toolId) }
      continue
    }
    const desde = Math.max(0, Math.min(paso.desde, thinking.length)), hasta = Math.max(desde, Math.min(paso.hasta, thinking.length))
    if (hasta <= desde) continue
    if (pendientes.length) { herramientas(pendientes); pendientes = [] }
    pensar(thinking.slice(desde, hasta))
    leido = Math.max(leido, hasta)
  }
  // Herramientas que la cronología no vio (llegaron antes de grabarla) y pensamiento sin anotar: al final, en orden.
  pendientes.push(...llamadas.map(t => t.toolId).filter(id => !usadas.has(id)))
  if (pendientes.length) herramientas(pendientes)
  if (leido < thinking.length) pensar(thinking.slice(leido))
  return tramos
}

// ─── Delegación: una línea, no una tarjeta (27 oct 2026) ────────────────────────────────────────────────────────────
//
// Daniel (18:17, con captura): «mandaste subagentes, me queda claro, pero eso se ve en prima de tool usage dentro de tu
// razonamiento». Al delegar, el chat dice «Lanzó 2 subagentes · Goal UX, Harness» con un punto de estado y un clic al
// Taller. La tarjeta grande de Trabajos queda para cuando él la pide (ver Cabina › CabinaDelMensaje).

const DELEGA = /(?:^|__|_)cabina(?:__|_)delegar$|^(Agent|Task)$/

export interface Delegados { nombres: string[]; estado: EstadoPaso; total: number }

/** Los subagentes que Levy lanzó en este turno (cabina delegar, o Agent/Task del SDK), con su estado de lanzamiento. */
export function delegadosDe(msg: Pick<ChatMessage, 'toolCalls' | 'toolInputs' | 'toolOutputs'>): Delegados | null {
  const llamadas = (msg.toolCalls ?? []).filter(t => DELEGA.test(t.toolName))
  if (!llamadas.length) return null
  const nombres: string[] = []
  for (const t of llamadas) {
    const crudo = msg.toolInputs?.[t.toolId]
    let input: Record<string, unknown> | null = null
    try { const v = crudo ? JSON.parse(crudo) : null; input = v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { /* parcial */ }
    const nombre = str(input, 'nombre', 'description', 'name') ?? /"(?:nombre|description)"\s*:\s*"([^"]*)/.exec(crudo ?? '')?.[1] ?? null
    // «Goal UX: que la meta no entierre respuestas» → «Goal UX»: el nombre corto, el encargo completo vive en el Taller.
    if (nombre) nombres.push(corto(nombre.split(/[:·—(]/)[0].trim() || nombre, 28))
  }
  const estados = llamadas.map(t => estadoDe(t, msg.toolOutputs?.[t.toolId]))
  const estado: EstadoPaso = estados.includes('corriendo') ? 'corriendo' : estados.includes('error') ? 'error' : 'listo'
  return { nombres, estado, total: llamadas.length }
}

/** «Lanzó 2 subagentes · Goal UX, Harness» · «Lanzando un subagente · Goal UX». */
export function textoDelegados(d: Delegados): string {
  const verbo = d.estado === 'corriendo' ? (d.total === 1 ? 'Lanzando un subagente' : `Lanzando ${d.total} subagentes`)
    : d.estado === 'error' ? (d.total === 1 ? 'No pudo lanzar el subagente' : `Lanzó subagentes con un error`)
    : d.total === 1 ? 'Lanzó un subagente' : `Lanzó ${d.total} subagentes`
  const nombres = d.nombres.length > 3 ? [...d.nombres.slice(0, 3), `${d.nombres.length - 3} más`] : d.nombres
  return nombres.length ? `${verbo} · ${nombres.join(', ')}` : verbo
}
