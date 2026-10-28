// Genera el bloque «utilidades de color» de src/app/lenguaje.css: cada clase de color de Tailwind usada en la app se
// reasigna a su rol del lenguaje unificado (tinta legible, borde neutro, velo neutro). Solo actúa con
// html[data-estilo='unificado'] y con la misma especificidad que la utilidad original, así hover:, focus: y aria-
// siguen ganando (son estado, y el estado conserva su color). Uso: node scripts/diseno/clases-tailwind.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('../../', import.meta.url).pathname
const ARCHIVO = join(RAIZ, 'src/app/lenguaje.css')
const INI = '/* ── utilidades de color (generado por scripts/diseno/clases-tailwind.mjs; no editar a mano) ── */'
const FIN = '/* ── fin de utilidades generadas ── */'

const FAM = {
  morado: 'primary|primary-hover|brand|brand-ink|accent-purple|neon-purple|purple-\\d{2,3}|violet-\\d{2,3}|indigo-\\d{2,3}|fuchsia-\\d{2,3}',
  ambar: 'gold|gold-bright|gold-dark|amber-\\d{2,3}|orange-\\d{2,3}|yellow-\\d{2,3}',
  rojo: 'red-\\d{2,3}|rose-\\d{2,3}|error',
  verde: 'emerald-\\d{2,3}|green-\\d{2,3}|teal-\\d{2,3}|lime-\\d{2,3}|success',
  azul: 'sky-\\d{2,3}|blue-\\d{2,3}|cyan-\\d{2,3}',
}
const NEUTRALIZABLES = new Set(['morado', 'ambar'])
const archivos = readdirSync(join(RAIZ, 'src'), { recursive: true }).map(String).filter(f => /\.(tsx|ts)$/.test(f))
const usadas = new Set()
for (const f of archivos) {
  const txt = readFileSync(join(RAIZ, 'src', f), 'utf8')
  for (const m of txt.matchAll(/(?<=["'`\s{(])((?:text|border(?:-[trblxy])?|bg|ring|outline|decoration|divide|fill|stroke)-[a-z]+(?:-[a-z]+)?(?:-\d{2,3})?(?:\/\d{1,3})?)(?=["'`\s})])/g)) usadas.add(m[1])
}
const reglas = { tinta: {}, borde: {}, velo: {}, anillo: {} }
const sel = c => `:where(html[data-estilo='unificado']) [class~="${c}"]`
for (const c of [...usadas].sort()) {
  for (const [fam, re] of Object.entries(FAM)) {
    const m = c.match(new RegExp(`^(text|border(?:-[trblxy])?|bg|ring|outline|decoration|divide|fill|stroke)-(?:${re})(?:/(\\d{1,3}))?$`))
    if (!m) continue
    const [, util, alfa] = m
    if (util === 'text' || util === 'decoration') (reglas.tinta[fam] ??= []).push(c)
    else if (NEUTRALIZABLES.has(fam) && (util.startsWith('border') || util === 'divide' || util === 'outline')) (reglas.borde[fam] ??= []).push(c)
    else if (NEUTRALIZABLES.has(fam) && util === 'ring') (reglas.anillo[fam] ??= []).push(c)
    else if (NEUTRALIZABLES.has(fam) && util === 'bg' && alfa && +alfa < 30) (reglas.velo[`${fam}|${alfa}`] ??= []).push(c)
  }
}
let css = `${INI}\n@layer utilities {\n`
for (const [fam, cs] of Object.entries(reglas.tinta)) css += `  ${cs.map(sel).join(',\n  ')} { color: var(--l-tinta-${fam}); text-decoration-color: currentColor; }\n`
for (const [fam, cs] of Object.entries(reglas.borde)) css += `  ${cs.map(sel).join(',\n  ')} { border-color: var(--l-borde-${fam}); outline-color: var(--l-borde-${fam}); }\n`
for (const [fam, cs] of Object.entries(reglas.anillo)) css += `  ${cs.map(sel).join(',\n  ')} { --tw-ring-color: var(--l-borde-${fam}); }\n`
for (const [k, cs] of Object.entries(reglas.velo)) { const [fam, a] = k.split('|'); css += `  ${cs.map(sel).join(',\n  ')} { background-color: rgba(var(--l-velo-${fam}-rgb), ${(+a / 100).toFixed(2)}); }\n` }
css += `}\n${FIN}`
const actual = readFileSync(ARCHIVO, 'utf8')
const i = actual.indexOf(INI), j = actual.indexOf(FIN)
writeFileSync(ARCHIVO, i >= 0 && j > i ? actual.slice(0, i) + css + actual.slice(j + FIN.length) : `${actual.trimEnd()}\n\n${css}\n`)
console.log('clases', [...Object.values(reglas)].reduce((n, g) => n + Object.values(g).flat().length, 0))
