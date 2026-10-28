// Migra los colores sueltos de las hojas CSS de las superficies a tokens del lenguaje unificado.
// Cada literal queda como RESPALDO del token (`var(--l-…, literal)`), así el estilo actual se pinta idéntico y el
// unificado lo decide `src/app/lenguaje.css`. Idempotente. Uso: node scripts/diseno/migrar-css.mjs [--seco]
import postcss from 'postcss'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SUPERFICIES, ESCENAS, BLOQUES_TOKEN, RE_COLOR, enmascarar, parsear, familia, paso, hsl } from './colores.mjs'

const SECO = process.argv.includes('--seco')
const REVERTIR = process.argv.includes('--revertir')

/** Deshace la migración: cada `var(--l-…, respaldo)` vuelve a su respaldo (el valor de hoy). Las reglas a mano sin respaldo quedan. */
export function revertir(valor) {
  let out = valor, prev
  do {
    prev = out
    const m = out.match(/var\(--l-[\w-]+,\s*/)
    if (!m) break
    let prof = 0, fin = -1
    for (let k = m.index + 3; k < out.length; k++) {
      if (out[k] === '(') prof++
      else if (out[k] === ')') { prof--; if (prof === 0) { fin = k; break } }
    }
    if (fin < 0) break
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length, fin).trim() + out.slice(fin + 1)
  } while (out !== prev)
  return out
}
const RAIZ = new URL('../../', import.meta.url).pathname
const RE_ESTADO = /:focus|:hover|:active|:checked|activ|selec|current|\bon\b|abiert|open|vivo|encend|press|aria-|data-estado|enfoc|elegid|marcad|sostenien|detener|levy/i
const NEUTRALIZABLES = new Set(['morado', 'ambar'])
/** La tecla de enviar es el material de referencia: su luz no se neutraliza nunca. */
const MATERIAL = ['boton-enviar.module.css']

function archivos(rel) {
  const abs = join(RAIZ, rel)
  if (statSync(abs).isFile()) return [rel]
  return readdirSync(abs, { recursive: true }).map(f => join(rel, String(f))).filter(f => f.endsWith('.css'))
}

function tipoDePropiedad(prop) {
  const p = prop.toLowerCase()
  if (p.startsWith('--')) {
    if (/tinta|texto|ink|text|letra|fg/.test(p)) return 'tinta'
    if (/borde|border|canto|junta|linea|rim/.test(p)) return 'borde'
    if (/sombra|shadow|glow|halo|resplandor/.test(p)) return 'sombra'
    return 'dato'
  }
  if (p === 'color' || p === '-webkit-text-fill-color' || p === 'caret-color' || p.startsWith('text-decoration')) return 'tinta'
  if (p.startsWith('border') || p.startsWith('outline') || p === '-webkit-text-stroke' || p === 'column-rule') return 'borde'
  if (p.startsWith('background')) return 'fondo'
  if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter' || p === '-webkit-filter') return 'sombra'
  return 'dato'
}

/** Partes de primer nivel separadas por comas (para listas de sombras). */
function partes(valor) {
  const out = []; let prof = 0, ini = 0
  for (let i = 0; i < valor.length; i++) {
    const ch = valor[i]
    if (ch === '(') prof++
    else if (ch === ')') prof--
    else if (ch === ',' && prof === 0) { out.push([ini, i]); ini = i + 1 }
  }
  out.push([ini, valor.length])
  return out
}

/** ¿Esta sombra es un anillo (0 0 0 Npx color) que hace de borde? */
const esAnillo = txt => /^\s*(inset\s+)?0(px)?\s+0(px)?\s+0(px)?\s+[\d.]+px/.test(txt.replace(RE_COLOR, '').trim())

function anchoBorde(decl) {
  const m = decl.value.match(/([\d.]+)px/)
  if (m) return parseFloat(m[1])
  let ancho = 1
  decl.parent?.each?.(n => { if (n.type === 'decl' && /^border(-\w+)?-width$/.test(n.prop)) { const k = n.value.match(/([\d.]+)px/); if (k) ancho = parseFloat(k[1]) } })
  return ancho
}

const conteo = {}
function token(lit, tipo, estado, decl, contextoParte) {
  const c = parsear(lit)
  const fam = familia(c)
  const alfa = c.a < 1
  const rgb = `${c.r}, ${c.g}, ${c.b}`
  let t = tipo
  if (t === 'sombra' && esAnillo(contextoParte)) t = 'borde'
  let salida
  if (fam === 'gris') {
    if (alfa) salida = `rgba(var(--l-${c.r + c.g + c.b > 382 ? 'luz' : 'sombra'}-rgb, ${rgb}), ${c.a})`
    else salida = `var(--l-gris-${paso('gris', c)}, ${lit})`
  } else if (t === 'tinta') {
    // La tinta respeta la luz del original: un texto claro vive sobre algo oscuro (aunque el tema sea claro, como el HUD de la
    // Casa) y uno oscuro sobre algo claro. Solo los tonos medios siguen al tema.
    const { l } = hsl(c)
    salida = `var(--l-tinta-${fam}${l >= 0.62 ? '-clara' : l <= 0.42 ? '-oscura' : ''}, ${lit})`
  } else if (NEUTRALIZABLES.has(fam) && !estado && t === 'borde' && (decl.prop.startsWith('--') || anchoBorde(decl) < 2)) {
    salida = `var(--l-borde-${fam}, ${lit})`
  } else if (NEUTRALIZABLES.has(fam) && !estado && t === 'fondo' && alfa && c.a < 0.3) {
    salida = `rgba(var(--l-velo-${fam}-rgb, ${rgb}), ${c.a})`
  } else if (NEUTRALIZABLES.has(fam) && !estado && t === 'sombra') {
    salida = alfa ? `rgba(var(--l-halo-${fam}-rgb, ${rgb}), ${c.a})` : `var(--l-halo-${fam}, ${lit})`
  } else if (alfa) {
    salida = `rgba(var(--l-${fam}-${paso(fam, c)}-rgb, ${rgb}), ${c.a})`
  } else {
    salida = `var(--l-${fam}-${paso(fam, c)}, ${lit})`
  }
  const k = salida.match(/--l-[\w-]+/)[0]
  conteo[k] = (conteo[k] ?? 0) + 1
  return salida
}

function migrarValor(decl, estado) {
  const tipo = tipoDePropiedad(decl.prop)
  const valor = decl.value
  const mask = enmascarar(valor)
  if (!RE_COLOR.test(mask)) return null
  RE_COLOR.lastIndex = 0
  const tramos = partes(valor)
  let out = '', ultimo = 0
  for (const m of mask.matchAll(RE_COLOR)) {
    const i = m.index
    const parte = tramos.find(([a, b]) => i >= a && i < b) ?? [0, valor.length]
    out += valor.slice(ultimo, i) + token(valor.slice(i, i + m[0].length), tipo, estado, decl, valor.slice(parte[0], parte[1]))
    ultimo = i + m[0].length
  }
  return out + valor.slice(ultimo)
}

// Referencias a los tokens de marca del sistema actual (var(--brand), var(--gold), rgba(var(--brand-rgb), a),
// color-mix(…, var(--brand) N%, transparent)): mismas reglas de rol que los literales. El respaldo es la referencia.
const MARCA = { brand: 'morado', 'brand-ink': 'morado', primary: 'morado', 'primary-hover': 'morado', 'accent-purple': 'morado', 'neon-purple': 'morado', gold: 'ambar', 'gold-bright': 'ambar', 'gold-dark': 'ambar' }
const MARCA_RGB = { 'brand-rgb': 'morado', 'primary-rgb': 'morado', 'primary-hover-rgb': 'morado', 'gold-rgb': 'ambar', 'gold-bright-rgb': 'ambar' }
const RE_MARCA = new RegExp(`color-mix\\(in [a-z]+,\\s*var\\(--(${Object.keys(MARCA).join('|')})\\)\\s*([\\d.]+)%,\\s*transparent\\)|rgba?\\(var\\(--(${Object.keys(MARCA_RGB).join('|')})\\),\\s*([\\d.]+)\\)|var\\(--(${Object.keys(MARCA).join('|')})(?:,\\s*(?:[^()]|\\([^()]*\\))*)?\\)`, 'g')
/** Tramos [inicio, fin) ocupados por llamadas var(--l-…) ya escritas (con paréntesis anidados). */
function tramosL(valor) {
  const out = []
  for (const m of valor.matchAll(/var\(--l-/g)) {
    let prof = 0
    for (let k = m.index + 3; k < valor.length; k++) {
      if (valor[k] === '(') prof++
      else if (valor[k] === ')') { prof--; if (prof === 0) { out.push([m.index, k + 1]); break } }
    }
  }
  return out
}
/** Deshace `var(--l-x, var(--l-x, …))` repetido (una pasada vieja no era idempotente con color-mix anidado). */
export function colapsar(valor) {
  let prev
  do {
    prev = valor
    const m = valor.match(/var\((--l-[\w-]+), var\(\1, /)
    if (!m) break
    const ini = m.index + m[0].length - ('var(' + m[1] + ', ').length
    let prof = 0, fin = -1
    for (let k = ini + 3; k < valor.length; k++) {
      if (valor[k] === '(') prof++
      else if (valor[k] === ')') { prof--; if (prof === 0) { fin = k; break } }
    }
    if (fin < 0) break
    valor = valor.slice(0, ini) + valor.slice(ini + ('var(' + m[1] + ', ').length, fin) + valor.slice(fin + 1)
  } while (valor !== prev)
  return valor
}
function migrarMarca(decl, estado, valor) {
  const tipo = tipoDePropiedad(decl.prop)
  const mask = valor.replace(/var\(--l-[\w-]+,\s*(?:var\([^()]*\)|rgba?\(var\([^()]*\)[^()]*\))\s*\)|rgba?\(var\(--l-[\w-]+,\s*var\([^()]*\)\)[^()]*\)/g, m => '¤'.repeat(m.length))
  const tramos = partes(valor)
  let out = '', ultimo = 0, n = 0
  const ocupados = tramosL(valor)
  for (const m of mask.matchAll(RE_MARCA)) {
    const i = m.index, txt = valor.slice(i, i + m[0].length)
    if (ocupados.some(([a, b]) => i >= a && i < b)) continue
    const parte = tramos.find(([a, b]) => i >= a && i < b) ?? [0, valor.length]
    let t = tipo
    if (t === 'sombra' && esAnillo(valor.slice(parte[0], parte[1]).replace(RE_MARCA, '#000'))) t = 'borde'
    let nuevo = null
    if (m[1]) { // color-mix con transparente: un velo o un borde translúcido
      const fam = MARCA[m[1]], a = parseFloat(m[2]) / 100
      if (t === 'tinta') nuevo = `var(--l-tinta-${fam}, ${txt})`
      else if (!estado && t === 'borde') nuevo = `var(--l-borde-${fam}, ${txt})`
      else if (!estado && t === 'fondo' && a < 0.3) nuevo = `rgba(var(--l-velo-${fam}-rgb, var(--${m[1].startsWith('gold') ? 'gold' : 'brand'}-rgb)), ${a})`
      else if (!estado && t === 'sombra') nuevo = `rgba(var(--l-halo-${fam}-rgb, var(--${m[1].startsWith('gold') ? 'gold' : 'brand'}-rgb)), ${a})`
    } else if (m[3]) {
      const fam = MARCA_RGB[m[3]], a = parseFloat(m[4])
      if (t === 'tinta') nuevo = `var(--l-tinta-${fam}, ${txt})`
      else if (!estado && t === 'borde') nuevo = `var(--l-borde-${fam}, ${txt})`
      else if (!estado && t === 'fondo' && a < 0.3) nuevo = `rgba(var(--l-velo-${fam}-rgb, var(--${m[3]})), ${a})`
      else if (!estado && t === 'sombra') nuevo = `rgba(var(--l-halo-${fam}-rgb, var(--${m[3]})), ${a})`
    } else {
      const fam = MARCA[m[5]]
      if (t === 'tinta') nuevo = `var(--l-tinta-${fam}, ${txt})`
      else if (!estado && t === 'borde' && (decl.prop.startsWith('--') || anchoBorde(decl) < 2)) nuevo = `var(--l-borde-${fam}, ${txt})`
      else if (!estado && t === 'sombra') nuevo = `var(--l-halo-${fam}, ${txt})`
    }
    if (!nuevo) continue
    out += valor.slice(ultimo, i) + nuevo; ultimo = i + m[0].length; n++
    const k = nuevo.match(/--l-[\w-]+/)[0]; conteo[k] = (conteo[k] ?? 0) + 1
  }
  return n ? out + valor.slice(ultimo) : null
}

const sinTema = sel => sel.replace(/:global\((?:\.dark|:root:not\(\.dark\)|html\.dark)\)\s*/g, '').trim()
let cejas = new Set()
function esCeja(regla) {
  let mayus = false
  regla?.each?.(d => { if (d.type === 'decl' && d.prop === 'text-transform' && /uppercase/.test(d.value)) mayus = true })
  if (mayus || regla?.type !== 'rule') return mayus
  // También el hijo directo de una ceja (`.ceja b`, `.ceja span`): la palabra resaltada dentro de las versalitas.
  return regla.selector.split(',').some(sel => { const t = sinTema(sel); const padre = t.replace(/\s*[>+~]?\s*[^\s>+~]+$/, '').trim(); return cejas.has(t) || (padre && cejas.has(padre)) })
}

function enBloqueToken(nodo) {
  for (let p = nodo.parent; p; p = p.parent) {
    if (p.type === 'rule' && BLOQUES_TOKEN.includes(p.selector.trim())) return true
    if (p.type === 'atrule' && BLOQUES_TOKEN.includes(`@${p.name} ${p.params}`.trim())) return true
    if (p.type === 'atrule' && BLOQUES_TOKEN.includes(`@${p.name}`)) return true
  }
  return false
}
function selectorDe(nodo) {
  for (let p = nodo.parent; p; p = p.parent) if (p.type === 'rule') return p.selector
  return ''
}

let total = 0
const porArchivo = {}
for (const rel of SUPERFICIES.flatMap(archivos)) {
  if (ESCENAS.some(e => rel.startsWith(e))) continue
  if (rel.endsWith('lenguaje.css')) continue
  const abs = join(RAIZ, rel)
  const src = readFileSync(abs, 'utf8')
  const raiz = postcss.parse(src, { from: abs })
  let n = 0
  cejas = new Set()
  raiz.walkRules(r => { r.each(d => { if (d.type === 'decl' && d.prop === 'text-transform' && /uppercase/.test(d.value)) cejas.add(sinTema(r.selector)) }) })
  raiz.walkDecls(decl => {
    if (enBloqueToken(decl)) return
    if (REVERTIR) { const v = revertir(decl.value); if (v !== decl.value) { decl.value = v; n++ } return }
    const limpio = colapsar(decl.value).replace(/rgba\(var\(--l-(morado|ambar|rojo|verde|azul|rosa)-rgb, (\d+), (\d+), (\d+)\)/g,
      (_, fam, r, g, b) => `rgba(var(--l-${fam}-${paso(fam, { r: +r, g: +g, b: +b, a: 1 })}-rgb, ${r}, ${g}, ${b})`)
    if (limpio !== decl.value) { decl.value = limpio; n++ }
    const estado = MATERIAL.some(m => rel.endsWith(m)) || RE_ESTADO.test(selectorDe(decl))
    const nuevo = migrarValor(decl, estado)
    if (nuevo && nuevo !== decl.value) { decl.value = nuevo; n++ }
    const marca = migrarMarca(decl, estado, decl.value)
    if (marca && marca !== decl.value) { decl.value = marca; n++ }
    // Cejas (versalitas pequeñas): en el lenguaje unificado son gris, como en Salud. El color se reserva al dato.
    if (tipoDePropiedad(decl.prop) === 'tinta' && !estado && esCeja(decl.parent)) {
      const ceja = decl.value.replace(/var\(--l-tinta-(ambar|morado)(?:-clara|-oscura)?,/g, 'var(--l-ceja-$1,')
      if (ceja !== decl.value) { decl.value = ceja; n++; conteo['--l-ceja'] = (conteo['--l-ceja'] ?? 0) + 1 }
    }
  })
  if (n) { porArchivo[rel] = n; total += n; if (!SECO) writeFileSync(abs, raiz.toString()) }
}
console.log(JSON.stringify({ total, porArchivo, tokens: Object.fromEntries(Object.entries(conteo).sort((a, b) => b[1] - a[1])) }, null, 1))
