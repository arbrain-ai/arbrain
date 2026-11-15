#!/usr/bin/env node
/**
 * Fusiona `src/shared/i18n/fragmentos/*.json` en el catálogo único `en.json` (13 nov 2026), con las llaves en orden.
 * Un fragmento manda sobre lo que ya estaba en el catálogo (es la versión más nueva; los cambios se listan). Si dos
 * fragmentos traducen distinto el mismo texto, gana el primero en orden alfabético y el otro se lista para revisarlo. `--borrar` quita los fragmentos fusionados.
 */
import { readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOGO, FRAGMENTOS, leerJson, problemasPar } from './lib.mjs'

const cat = leerJson(CATALOGO)
let nombres = []
try { nombres = readdirSync(FRAGMENTOS).filter((n) => n.endsWith('.json')).sort() } catch { /* nada */ }
const choques = []
const cambiadas = []
const vistos = new Map()
let nuevas = 0
for (const n of nombres) {
  const frag = leerJson(join(FRAGMENTOS, n))
  for (const [es, en] of Object.entries(frag)) {
    if (typeof en !== 'string' || !en.trim()) continue
    if (problemasPar(es, en).length) { choques.push(`${n}: ${JSON.stringify(es)} → ${JSON.stringify(en)} (${problemasPar(es, en).join('; ')}) — no se fusionó`); continue }
    if (vistos.has(es)) { if (cat[es] !== en) choques.push(`${n}: ${JSON.stringify(es)}: se queda ${JSON.stringify(cat[es])} (de ${vistos.get(es)}; no ${JSON.stringify(en)})`); continue }
    if (es in cat && cat[es] !== en) cambiadas.push(`${JSON.stringify(es)}: ${JSON.stringify(cat[es])} → ${JSON.stringify(en)} (${n})`)
    if (!(es in cat)) nuevas++
    cat[es] = en; vistos.set(es, n)
  }
}
const ordenado = Object.fromEntries(Object.keys(cat).sort((a, b) => a.localeCompare(b, 'es')).map((k) => [k, cat[k]]))
writeFileSync(CATALOGO, `${JSON.stringify(ordenado, null, 1)}\n`)
console.log(`${nombres.length} fragmentos · ${nuevas} traducciones nuevas · ${Object.keys(ordenado).length} en el catálogo`)
for (const c of cambiadas) console.log(`  CAMBIA  ${c}`)
for (const c of choques) console.log(`  CHOQUE  ${c}`)
if (process.argv.includes('--borrar')) for (const n of nombres) rmSync(join(FRAGMENTOS, n))
