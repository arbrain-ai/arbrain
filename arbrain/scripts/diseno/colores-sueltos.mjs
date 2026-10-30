// Detector de colores sueltos del lenguaje unificado (27 oct 2026). Sale con código 1 si encuentra alguno.
// Cuenta, en las superficies, todo literal de color que no sea respaldo de un token --l-*:
//  · hojas .css: cada declaración fuera de los bloques de tokens (:root, .dark, @theme) y de lenguaje.css.
//  · .tsx/.ts: literales dentro de `style=` / objetos de estilo, y clases de Tailwind con color arbitrario `[#…]`.
// Uso: node scripts/diseno/colores-sueltos.mjs [--json]
import postcss from 'postcss'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SUPERFICIES, ESCENAS, PALETAS_DATO, BLOQUES_TOKEN, RE_COLOR, enmascarar } from './colores.mjs'

const RAIZ = new URL('../../', import.meta.url).pathname
const lista = rel => { const abs = join(RAIZ, rel); return statSync(abs).isFile() ? [rel] : readdirSync(abs, { recursive: true }).map(f => join(rel, String(f))) }
const enToken = nodo => { for (let p = nodo.parent; p; p = p.parent) { if (p.type === 'rule' && BLOQUES_TOKEN.includes(p.selector.trim())) return true; if (p.type === 'atrule' && (BLOQUES_TOKEN.includes(`@${p.name} ${p.params}`.trim()) || BLOQUES_TOKEN.includes(`@${p.name}`))) return true } return false }

export function sueltos() {
  const hallados = []
  for (const rel of SUPERFICIES.flatMap(lista)) {
    if (ESCENAS.some(e => rel.startsWith(e)) || PALETAS_DATO.includes(rel) || rel.endsWith('lenguaje.css')) continue
    if (rel.endsWith('.css')) {
      postcss.parse(readFileSync(join(RAIZ, rel), 'utf8')).walkDecls(d => {
        if (enToken(d)) return
        for (const m of enmascarar(d.value).matchAll(RE_COLOR)) hallados.push({ archivo: rel, linea: d.source?.start?.line, color: m[0] })
      })
    } else if (/\.tsx?$/.test(rel) && !/\.test\.|\/tests?\//.test(rel)) {
      readFileSync(join(RAIZ, rel), 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return
        const enEstilo = /style=|style:|Style\b|: ?['"`](?:#|rgba?\()|['"`]#[0-9a-fA-F]{3,8}['"`]/.test(l)
        const tw = l.match(/\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\))\]/g) ?? []
        tw.forEach(c => { if (!/var\(--l-/.test(c)) hallados.push({ archivo: rel, linea: i + 1, color: c }) })
        if (!enEstilo) return
        for (const m of enmascarar(l.replace(/\[[^\]]*\]/g, '')).matchAll(/['"`](#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,/%]+\))['"`]|(?<=[:(,]\s*)(#[0-9a-fA-F]{6}\b)/g)) hallados.push({ archivo: rel, linea: i + 1, color: m[1] ?? m[2] })
      })
    }
  }
  return hallados
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const h = sueltos()
  if (process.argv.includes('--json')) console.log(JSON.stringify(h, null, 1))
  else {
    const por = {}; h.forEach(x => { por[x.archivo] = (por[x.archivo] ?? 0) + 1 })
    console.log(Object.entries(por).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${String(n).padStart(4)}  ${a}`).join('\n'))
    console.log(`colores sueltos: ${h.length}`)
  }
  process.exit(h.length ? 1 : 0)
}
