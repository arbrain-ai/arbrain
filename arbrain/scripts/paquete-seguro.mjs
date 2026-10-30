/**
 * Paquete seguro (seguridad para clientes, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09/AUDITORIA.md, I1).
 *
 * El paquete de escritorio copiaba `.next/standalone` completo, con los `.env` de Daniel dentro (service role de
 * Supabase, PAT, VAPID, tokens). Este módulo:
 *   - `limpiarSecretos(dir)`   quita del paquete los archivos que nunca deben viajar (.env*, .mcp.json, bases, llaves).
 *   - `buscarFugas(dir, ...)`  recorre el paquete y reporta archivos prohibidos, valores de secretos reales del repo y
 *                              formatos de llave conocidos. Nunca imprime un valor: solo archivo y nombre de la variable.
 *
 * Edición cliente (`ARBRAIN_EDICION=cliente`): se limpia y una sola fuga hace fallar el build.
 * Instalación de Daniel (sin la variable): no se toca nada; solo se avisa cuántas fugas lleva su propio paquete.
 *
 * Uso suelto: `node scripts/paquete-seguro.mjs <carpeta-o-.app> [--estricto]` (sale con 1 si hay fugas).
 */
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @param {Record<string, string | undefined>} [env] */
export const esEdicionCliente = (env = process.env) => (env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'

/** Archivos que nunca viajan en un paquete para clientes. Los `.example` son plantillas sin valores. */
const PROHIBIDO = [
  { re: /^\.env(\..+)?$/i, motivo: 'archivo de entorno (.env)', salvo: /\.example$/i },
  { re: /^\.mcp\.json$/i, motivo: 'configuración MCP con credenciales' },
  { re: /^settings\.local\.json$/i, motivo: 'permisos locales de Claude Code' },
  { re: /\.(db|sqlite|sqlite3)(-wal|-shm)?$/i, motivo: 'base de datos local' },
  { re: /^(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/i, motivo: 'llave SSH' },
  { re: /\.(pem|p12|pfx|key)$/i, motivo: 'llave o certificado privado' },
  { re: /^\.npmrc$/i, motivo: 'credenciales de npm' },
]

export function archivoProhibido(nombre) {
  for (const p of PROHIBIDO) if (p.re.test(nombre) && !(p.salvo && p.salvo.test(nombre))) return p.motivo
  return undefined
}

/** Formatos de llave inconfundibles (prefijo + largo). El valor nunca se reporta. */
const FORMATOS = [
  { nombre: 'llave de Anthropic', re: /sk-ant-[A-Za-z0-9_-]{24,}/ },
  { nombre: 'llave de OpenRouter', re: /sk-or-v1-[a-f0-9]{40,}/ },
  { nombre: 'llave de OpenAI', re: /sk-proj-[A-Za-z0-9_-]{24,}/ },
  { nombre: 'token de GitHub', re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { nombre: 'token personal de Supabase', re: /\bsbp_[a-f0-9]{40}\b/ },
  { nombre: 'llave secreta de Supabase', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { nombre: 'llave de AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nombre: 'llave privada PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40}/ },
  { nombre: 'token de Slack', re: /\bxox[bpas]-[A-Za-z0-9-]{20,}/ },
]

/** JWT de Supabase con rol service_role (la llave anónima sí es pública; esta no). */
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g
function jwtServiceRole(texto) {
  for (const m of texto.matchAll(JWT)) {
    try {
      const cuerpo = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (cuerpo && cuerpo.role === 'service_role') return true
    } catch { /* no era un JWT */ }
  }
  return false
}

/** Nombres de variable que guardan secretos; las públicas por diseño quedan fuera. */
const NOMBRE_SECRETO = /(KEY|TOKEN|SECRET|PASSWORD|PASS|PAT|PRIVATE|CREDENTIAL|AUTH)/i
const NOMBRE_PUBLICO = /(^NEXT_PUBLIC_|PUBLISHABLE|ANON|PUBLIC_KEY$|_URL$|_EMAIL$)/i

/** Lee los valores secretos de unos `.env` (para buscarlos dentro del paquete). Devuelve [nombre, valor]. */
export function secretosDe(rutas) {
  const vistos = new Map()
  for (const ruta of rutas) {
    let crudo
    try { crudo = readFileSync(ruta, 'utf8') } catch { continue }
    for (const linea of crudo.split('\n')) {
      const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const [, nombre, bruto] = m
      const valor = bruto.trim().replace(/^["']|["']$/g, '')
      if (!NOMBRE_SECRETO.test(nombre) || NOMBRE_PUBLICO.test(nombre)) continue
      // Valores cortos o triviales («true», «1», «changeme») darían falsos positivos en todo node_modules.
      if (valor.length < 16 || /^(true|false|null|undefined)$/i.test(valor)) continue
      if (!vistos.has(valor)) vistos.set(valor, nombre)
    }
  }
  return [...vistos].map(([valor, nombre]) => ({ nombre, valor }))
}

/** `.env` del repo de origen cuyos valores no deben aparecer en el paquete. */
export function envDelRepo(raizArbrain) {
  const raices = [raizArbrain, join(raizArbrain, 'server'), join(raizArbrain, '..')]
  const rutas = []
  for (const r of raices) {
    let nombres = []
    try { nombres = readdirSync(r) } catch { continue }
    for (const n of nombres) if (/^\.env(\..+)?$/i.test(n) && !/\.example$/i.test(n)) rutas.push(join(r, n))
  }
  return rutas
}

const TOPE_BYTES = 40 * 1024 * 1024

function* recorrer(dir) {
  let entradas = []
  try { entradas = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entradas) {
    const ruta = join(dir, e.name)
    if (e.isSymbolicLink()) { yield { ruta, nombre: e.name, enlace: true }; continue }
    if (e.isDirectory()) { yield* recorrer(ruta); continue }
    if (e.isFile()) yield { ruta, nombre: e.name, enlace: false }
  }
}

/**
 * Busca fugas en una carpeta (o un .app). `secretos`: [{nombre, valor}] de `secretosDe`.
 * Devuelve [{ archivo, motivo }] con rutas relativas; nunca valores.
 * @param {string} dir
 * @param {{ secretos?: { nombre: string, valor: string }[], correos?: string[] }} [opciones]
 */
export function buscarFugas(dir, { secretos = [], correos = [] } = {}) {
  const fugas = []
  const avisos = []
  const agujas = secretos.map(s => ({ nombre: s.nombre, buf: Buffer.from(s.valor, 'utf8') }))
  for (const { ruta, nombre, enlace } of recorrer(dir)) {
    const archivo = relative(dir, ruta) || basename(ruta)
    const prohibido = archivoProhibido(nombre)
    if (prohibido) { fugas.push({ archivo, motivo: prohibido }); continue }
    if (enlace) continue
    let tam = 0
    try { tam = lstatSync(ruta).size } catch { continue }
    if (tam === 0 || tam > TOPE_BYTES) continue
    let buf
    try { buf = readFileSync(ruta) } catch { continue }
    for (const a of agujas) if (buf.indexOf(a.buf) !== -1) fugas.push({ archivo, motivo: `valor de ${a.nombre} del .env del repo` })
    // Texto: binarios grandes (fuentes, imágenes, .node) se revisan solo por valores exactos.
    if (tam > 8 * 1024 * 1024 && !/\.(js|mjs|cjs|json|html|txt|map|css|ts)$/i.test(nombre)) continue
    const texto = buf.toString('latin1')
    for (const f of FORMATOS) if (f.re.test(texto)) fugas.push({ archivo, motivo: f.nombre })
    if (texto.includes('service_role') || texto.includes('eyJ')) { if (jwtServiceRole(texto)) fugas.push({ archivo, motivo: 'JWT de Supabase con rol service_role' }) }
    for (const c of correos) if (c && texto.includes(c)) avisos.push({ archivo, motivo: 'correo personal en el código (datos personales, A12)' })
  }
  return { fugas, avisos }
}

/** Quita del paquete todo archivo prohibido. Devuelve las rutas relativas quitadas. */
export function limpiarSecretos(dir) {
  const quitados = []
  for (const { ruta, nombre } of recorrer(dir)) {
    if (!archivoProhibido(nombre)) continue
    rmSync(ruta, { force: true })
    quitados.push(relative(dir, ruta))
  }
  return quitados
}

export function resumen(fugas, tope = 20) {
  const lineas = fugas.slice(0, tope).map(f => `  - ${f.archivo}: ${f.motivo}`)
  if (fugas.length > tope) lineas.push(`  … y ${fugas.length - tope} más`)
  return lineas.join('\n')
}

const MARCADOR_PENDIENTE = /^<!-- arbrain:[\w-]+ pendiente -->$/
const DATO_PERSONAL = [
  { nombre: 'correo', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { nombre: 'teléfono', re: /\+?\d[\d\s().-]{7,}\d/ },
]

/** ¿Es un marcador legítimo? Primera línea `<!-- arbrain:<algo> pendiente -->` y sin correos ni teléfonos. Devuelve el motivo si no lo es. */
export function motivoNoMarcador(texto) {
  const primera = texto.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].trim()
  if (!MARCADOR_PENDIENTE.test(primera)) return 'sin marcador «<!-- arbrain:… pendiente -->» en la primera línea'
  const dato = DATO_PERSONAL.find(d => d.re.test(texto))
  return dato ? `lleva un ${dato.nombre}` : null
}

/**
 * La memoria del alumno nace sin datos: solo índices (`MEMORY*.md`), README, `.gitkeep` y marcadores `pendiente`
 * (los reescribe la sincronización con el sitio del programa). Cualquier otra cosa detiene el build.
 */
export function memoriaVacia(dir) {
  if (!existsSync(dir)) throw new Error('[desktop] La plantilla no trae .claude/memory.')
  const sobran = []
  const recorrerMemoria = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { recorrerMemoria(join(d, e.name), r); continue }
      if (/^MEMORY[\w-]*\.md$/.test(r) || e.name === 'README.md' || e.name === '.gitkeep') continue
      const motivo = e.name.endsWith('.md') ? motivoNoMarcador(readFileSync(join(d, e.name), 'utf8')) : 'no es un marcador'
      if (motivo) sobran.push(`${r} (${motivo})`)
    }
  }
  recorrerMemoria(dir, '')
  if (sobran.length) throw new Error(`[desktop] La memoria de la plantilla no está vacía: ${sobran.join(', ')}`)
}

// Uso suelto: node scripts/paquete-seguro.mjs <carpeta> [--estricto]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const objetivo = process.argv[2]
  if (!objetivo || !existsSync(objetivo)) { console.error('Uso: node scripts/paquete-seguro.mjs <carpeta-o-.app> [--estricto]'); process.exit(2) }
  const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const correos = (process.env.ARBRAIN_CORREOS_PERSONALES ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const { fugas, avisos } = buscarFugas(objetivo, { secretos: secretosDe(envDelRepo(raiz)), correos })
  const estricto = process.argv.includes('--estricto')
  if (avisos.length) console.warn(`[paquete-seguro] ${avisos.length} aviso(s) de datos personales:\n${resumen(avisos)}`)
  if (fugas.length) {
    console.error(`[paquete-seguro] ${fugas.length} fuga(s) en ${objetivo}:\n${resumen(fugas)}`)
    process.exit(1)
  }
  if (estricto && avisos.length) process.exit(1)
  console.log(`[paquete-seguro] ${objetivo}: sin llaves ni .env.`)
}
