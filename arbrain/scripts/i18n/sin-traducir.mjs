#!/usr/bin/env node
/**
 * Texto en español que todavía no pasa por `tr()` (13 nov 2026). Para revisar a mano, no es una prueba: los mensajes de
 * registro, claves internas o textos para el modelo pueden quedarse como están.
 *
 *   node scripts/i18n/sin-traducir.mjs <rutas…> [--interfaz] [--resumen]
 *
 * `--interfaz` deja fuera los literales sueltos (solo JSX y atributos). `--resumen` da el conteo por archivo.
 */
import { candidatosSinTraducir, listarArchivos } from './lib.mjs'

const args = process.argv.slice(2)
const rutas = args.filter((a) => !a.startsWith('--'))
const lista = candidatosSinTraducir(listarArchivos(rutas.length ? rutas : ['src']), { soloInterfaz: args.includes('--interfaz') })
if (args.includes('--resumen')) {
  const por = new Map()
  for (const c of lista) por.set(c.archivo, (por.get(c.archivo) ?? 0) + 1)
  for (const [a, n] of [...por].sort((x, y) => y[1] - x[1])) console.log(`${String(n).padStart(5)}  ${a}`)
  console.log(`${lista.length} candidatos en ${por.size} archivos`)
} else {
  for (const c of lista) console.log(`${c.archivo}:${c.linea}  [${c.tipo}]  ${c.texto}`)
  console.log(`${lista.length} candidatos`)
}
