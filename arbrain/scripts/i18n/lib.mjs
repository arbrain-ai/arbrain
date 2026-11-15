/**
 * Idioma de la interfaz (13 nov 2026): lectura del código con el compilador de TypeScript, sin ejecutar nada.
 *
 * - `extraerLlaves(archivos)`: los textos que pasan por el catálogo: 1.er argumento de `tr()` y `trNodos()`,
 *   2.º y 3.º de `trn()`, y todo literal dentro de `trMarca()` / `trMarcas()`.
 * - `candidatosSinTraducir(archivos)`: texto visible en español que todavía no pasa por `tr()` (para revisar a mano).
 *
 * Lo usan `revisar.mjs`, `sin-traducir.mjs` y las pruebas (`tests/i18n/catalogo.test.ts`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const RAIZ = resolve(fileURLToPath(new URL('../..', import.meta.url)))
/** Un solo catálogo inglés para toda Arbrain (web y daemon). Vive con el daemon porque él no puede importar fuera de `server/src`. */
export const CATALOGO = join(RAIZ, 'server/src/i18n/en.json')
export const FRAGMENTOS = join(RAIZ, 'src/shared/i18n/fragmentos')

const FUNCIONES_PRIMER_ARG = new Set(['tr', 'trNodos'])
const FUNCIONES_MARCA = new Set(['trMarca', 'trMarcas'])

/** Archivos .ts/.tsx/.mjs de las rutas dadas (carpetas o archivos), sin pruebas ni node_modules. */
export function listarArchivos(rutas) {
  const out = []
  const visitar = (p) => {
    let st
    try { st = statSync(p) } catch { return }
    if (st.isDirectory()) {
      const base = p.split('/').pop()
      if (base === 'node_modules' || base === '.next' || base === 'dist' || base === 'fragmentos' || base.startsWith('.')) return
      for (const n of readdirSync(p)) visitar(join(p, n))
      return
    }
    if (!/\.(tsx?|mjs)$/.test(p) || /\.d\.ts$/.test(p) || /\.test\.(tsx?|mjs)$/.test(p)) return
    out.push(p)
  }
  for (const r of rutas) visitar(resolve(RAIZ, r))
  return out.sort()
}

function fuente(archivo) {
  const texto = readFileSync(archivo, 'utf8')
  const kind = archivo.endsWith('.tsx') ? ts.ScriptKind.TSX : archivo.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  return ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, kind)
}

const nombreLlamada = (n) => {
  const e = n.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

const literal = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
const linea = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

/**
 * { llaves: Map<texto, [ubicaciones]>, dinamicas: [{archivo, linea}], plantillas: [{archivo, linea, texto}] }
 * `plantillas` son errores: `tr(\`Hola ${x}\`)` no tiene llave fija; se escribe `tr('Hola {x}', { x })`.
 */
export function extraerLlaves(archivos) {
  const llaves = new Map()
  const dinamicas = []
  const plantillas = []
  const anotar = (texto, sf, n) => {
    const u = `${relative(RAIZ, sf.fileName)}:${linea(sf, n)}`
    if (!llaves.has(texto)) llaves.set(texto, [])
    llaves.get(texto).push(u)
  }
  for (const archivo of archivos) {
    const sf = fuente(archivo)
    const visitar = (n) => {
      if (ts.isCallExpression(n)) {
        const nombre = nombreLlamada(n)
        const args = n.arguments
        const revisar = (a) => {
          if (!a) return
          if (literal(a)) anotar(a.text, sf, a)
          else if (ts.isTemplateExpression(a)) plantillas.push({ archivo: relative(RAIZ, sf.fileName), linea: linea(sf, a), texto: a.getText(sf).slice(0, 80) })
          else dinamicas.push({ archivo: relative(RAIZ, sf.fileName), linea: linea(sf, a) })
        }
        if (FUNCIONES_PRIMER_ARG.has(nombre) && ts.isIdentifier(n.expression)) revisar(args[0])
        else if (nombre === 'trn' && ts.isIdentifier(n.expression)) { revisar(args[1]); revisar(args[2]) }
        else if (FUNCIONES_MARCA.has(nombre) && ts.isIdentifier(n.expression)) {
          const dentro = (m) => { if (literal(m)) anotar(m.text, sf, m); ts.forEachChild(m, dentro) }
          for (const a of args) dentro(a)
        }
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }
  return { llaves, dinamicas, plantillas }
}

export function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf8'))
}

/** Catálogo inglés + fragmentos pendientes de fusionar (si se piden). */
export function leerCatalogo({ conFragmentos = false } = {}) {
  const cat = { ...leerJson(CATALOGO) }
  if (conFragmentos) {
    let nombres = []
    try { nombres = readdirSync(FRAGMENTOS).filter((n) => n.endsWith('.json')).sort() } catch { /* sin fragmentos */ }
    for (const n of nombres) Object.assign(cat, leerJson(join(FRAGMENTOS, n)))
  }
  return cat
}

export const variablesDe = (texto) => [...new Set([...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()

/** Problemas de un par español → inglés: variables distintas o traducción vacía. */
export function problemasPar(es, en) {
  const p = []
  if (typeof en !== 'string' || !en.trim()) p.push('traducción vacía')
  else {
    const a = variablesDe(es).join(','), b = variablesDe(en).join(',')
    if (a !== b) p.push(`variables distintas: {${a}} → {${b}}`)
  }
  return p
}

// ── Candidatos sin traducir ──────────────────────────────────────────────────────────────────────────────────────

/** Atributos JSX que nunca son texto para la persona. */
const ATRIBUTOS_TECNICOS = new Set([
  'className', 'class', 'style', 'id', 'key', 'href', 'src', 'srcSet', 'type', 'name', 'role', 'rel', 'target', 'method',
  'action', 'htmlFor', 'viewBox', 'd', 'fill', 'stroke', 'xmlns', 'lang', 'dir', 'autoComplete', 'inputMode', 'accept',
  'pattern', 'form', 'value', 'defaultValue', 'variant', 'size', 'tone', 'icon', 'color', 'as', 'mode', 'sandbox', 'allow',
  'enterKeyHint', 'spellCheck', 'autoCapitalize', 'autoCorrect', 'strokeLinecap', 'strokeLinejoin', 'transform', 'points',
  'gradientUnits', 'offset', 'stopColor', 'clipPath', 'mask', 'filter', 'preserveAspectRatio', 'fontFamily', 'textAnchor',
  'dominantBaseline', 'path', 'ruta', 'seccion', 'vista', 'tab', 'tipo', 'estado', 'kind', 'clave', 'llave', 'modo',
  'testid', 'scope', 'crossOrigin', 'referrerPolicy', 'loading', 'decoding', 'media', 'sizes', 'download', 'wrap',
])

const PALABRAS_ES = /\b(de|la|el|los|las|que|en|tu|tus|no|con|para|por|una|un|del|al|se|es|lo|su|sus|ya|más|qué|cómo|aquí|esta|este|hay|sin|como|y|o)\b/i
const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡«»]/

/** ¿Parece texto para una persona en español? (al menos dos palabras o un acento; no rutas, ni clases, ni código) */
export function pareceTextoEs(t) {
  const s = String(t).trim()
  if (s.length < 2) return false
  if (!/[a-záéíóúñ]/i.test(s)) return false
  if (/^[\w./@:#?&=%+-]+$/.test(s) && !ACENTOS.test(s)) {
    // Una sola palabra sin acentos: solo si empieza en mayúscula y es palabra común de la interfaz.
    return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(s) && !/^(Arbrain|Levy|Claude|OpenRouter|Groq|Tailscale|DeepSeek|iPhone|Android|Windows|Linux|macOS|Mac|GitHub|Google|Todoist|Notion|Anthropic|OpenAI|Supabase|Polar|LemonFox|ElevenLabs|Codex|Opus|Sonnet|Haiku|Fable|JSON|HTML|CSS|URL|API|SSE|PWA|OK)$/.test(s)
  }
  if (/^(\.|\/|#|--|@|\$|\{)/.test(s)) return false
  if (/^[a-z0-9-]+(\s+[a-z0-9-:/[\]().%]+)+$/.test(s) && /\b(flex|grid|text-|bg-|px-|py-|mt-|mb-|w-|h-|rounded|border|items-|justify-|gap-)/.test(s)) return false
  return ACENTOS.test(s) || PALABRAS_ES.test(s)
}

function dentroDeTr(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const nombre = nombreLlamada(p)
      if (FUNCIONES_PRIMER_ARG.has(nombre) || FUNCIONES_MARCA.has(nombre) || nombre === 'trn') return true
      if (['log', 'warn', 'error', 'info', 'debug'].includes(nombre) && ts.isPropertyAccessExpression(p.expression) && p.expression.expression.getText() === 'console') return true
      if (['require', 'import', 'getItem', 'setItem', 'removeItem', 'querySelector', 'querySelectorAll', 'getElementById', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'startsWith', 'endsWith', 'includes', 'split', 'join', 'replace', 'test', 'match', 'fetch', 'get', 'set', 'has', 'delete', 'append'].includes(nombre)) return true
    }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
    if (ts.isJsxAttribute(p)) {
      const nombre = p.name.getText()
      if (ATRIBUTOS_TECNICOS.has(nombre) || nombre.startsWith('data-') || nombre.startsWith('on')) return true
    }
    if (ts.isPropertyAssignment(p) && p.name === n) return true
    if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true
    if (ts.isTypeNode?.(p) || ts.isLiteralTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true
    if (ts.isSourceFile(p)) break
  }
  return false
}

/**
 * Lista de { archivo, linea, tipo, texto }: `jsx` (texto entre etiquetas), `atributo` (placeholder, title,
 * aria-label…), `literal` (string con cara de frase en español fuera de `tr()`). Es para revisar: no todo es un error
 * (mensajes de registro, claves, textos para el modelo), pero lo que ve la persona debe pasar por `tr()`.
 */
export function candidatosSinTraducir(archivos, { soloInterfaz = false } = {}) {
  const out = []
  for (const archivo of archivos) {
    const sf = fuente(archivo)
    const rel = relative(RAIZ, sf.fileName)
    const visitar = (n) => {
      if (ts.isJsxText(n)) {
        const t = n.getText(sf).replace(/\s+/g, ' ').trim()
        if (t && /[a-záéíóúñ]{2,}/i.test(t) && !/^[\s{}()·•—–\-:;,.|/]+$/.test(t)) out.push({ archivo: rel, linea: linea(sf, n), tipo: 'jsx', texto: t })
      } else if (literal(n) || ts.isTemplateExpression(n)) {
        const texto = literal(n) ? n.text : n.getText(sf).slice(1, -1)
        if (pareceTextoEs(texto) && !dentroDeTr(n)) {
          const enAtributo = n.parent && ts.isJsxAttribute(n.parent)
          const enJsx = !!n.parent && (ts.isJsxExpression(n.parent) || ts.isConditionalExpression(n.parent) || ts.isBinaryExpression(n.parent))
          const tipo = enAtributo ? 'atributo' : enJsx ? 'jsx' : 'literal'
          if (!soloInterfaz || tipo !== 'literal') out.push({ archivo: rel, linea: linea(sf, n), tipo, texto: texto.replace(/\s+/g, ' ').slice(0, 140) })
        }
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }
  return out
}
