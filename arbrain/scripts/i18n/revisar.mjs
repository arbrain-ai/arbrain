#!/usr/bin/env node
/**
 * ¿Cada texto marcado tiene su inglés? (13 nov 2026)
 *
 *   node scripts/i18n/revisar.mjs [rutas…] [--fragmentos] [--faltantes-json] [--estricto]
 *
 * Sin rutas revisa `src` (web) y `server/src` (daemon). Reporta llaves sin traducción, traducciones con variables distintas y `tr()` con plantilla
 * (`tr(\`…${x}\`)`, que no tiene llave fija). `--fragmentos` cuenta también `src/shared/i18n/fragmentos/*.json`
 * (trabajo en curso). `--faltantes-json` imprime un JSON { "español": "" } con lo que falta, listo para traducir.
 * `--estricto` sale con 1 si hay algo.
 */
import { candidatosSinTraducir as _c, extraerLlaves, leerCatalogo, listarArchivos, problemasPar } from './lib.mjs'

const args = process.argv.slice(2)
const rutas = args.filter((a) => !a.startsWith('--'))
const archivos = listarArchivos(rutas.length ? rutas : ['src', 'server/src'])
const cat = leerCatalogo({ conFragmentos: args.includes('--fragmentos') })
const { llaves, plantillas } = extraerLlaves(archivos)

const faltan = []
const malos = []
for (const [es, donde] of llaves) {
  if (!(es in cat)) { faltan.push([es, donde]); continue }
  const p = problemasPar(es, cat[es])
  if (p.length) malos.push([es, cat[es], p, donde])
}

if (args.includes('--faltantes-json')) {
  process.stdout.write(`${JSON.stringify(Object.fromEntries(faltan.map(([es]) => [es, ''])), null, 2)}\n`)
  process.exit(0)
}

console.log(`${archivos.length} archivos · ${llaves.size} textos marcados · ${faltan.length} sin inglés · ${malos.length} con problemas · ${plantillas.length} tr() con plantilla`)
for (const [es, donde] of faltan.slice(0, 400)) console.log(`  FALTA  ${JSON.stringify(es)}  (${donde[0]}${donde.length > 1 ? ` +${donde.length - 1}` : ''})`)
if (faltan.length > 400) console.log(`  … y ${faltan.length - 400} más`)
for (const [es, en, p, donde] of malos) console.log(`  MAL    ${JSON.stringify(es)} → ${JSON.stringify(en)}: ${p.join('; ')} (${donde[0]})`)
for (const x of plantillas) console.log(`  PLANTILLA  ${x.archivo}:${x.linea}  ${x.texto}  → usa tr('… {var} …', { var })`)
void _c
if (args.includes('--estricto') && (faltan.length || malos.length || plantillas.length)) process.exit(1)
