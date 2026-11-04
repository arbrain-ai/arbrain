/**
 * La política de autonomía desde la terminal (la lee Levy; la app la cambia por su ruta).
 *   tsx src/autonomia/cli.ts ver               lo vigente y qué significa cada clase
 *   tsx src/autonomia/cli.ts fijar <preset>    cauteloso | equilibrado | piloto (escribe el archivo)
 *   tsx src/autonomia/cli.ts hoy               «Lo que hice solo» de hoy
 *   tsx src/autonomia/cli.ts decidir --titulo «…» --recomienda si|no --recomendacion «…» [--detalle «texto exacto»] [--categoria enviar|pagar|borrar|publicar|otra] [--expira 13:00|2026-11-04T13:00]
 *   tsx src/autonomia/cli.ts decision <cf_id>  cómo quedó una decisión
 *   tsx src/autonomia/cli.ts anotar --clase configurar --que «…» [--deshacer «…»]   una línea en «Lo que hice solo»
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diaCivil } from '../zona.js'
import { anotarHechoSolo, archivoLegible, DIR_HECHO_SOLO, esClase, esPreset, fijarPolitica, politicaVigente, PRESETS, RUTA_POLITICA } from './politica.js'
import { DECISION_DESCRIPTION, ejecutarDecision } from './decision-tool.js'

const [orden, arg] = process.argv.slice(2)
/** `--clave valor` → { clave: valor }. */
const opciones = (args: string[]) => { const o: Record<string, string> = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[i + 1]?.startsWith('--') ? 'true' : (args[++i] ?? 'true'); return o }
if (orden === 'decidir' || orden === 'decision') {
  const o = opciones(process.argv.slice(3))
  if (o.ayuda) { console.log(DECISION_DESCRIPTION); process.exit(0) }
  const r = await ejecutarDecision(orden === 'decision' ? { accion: 'ver', id: arg } : { ...o, accion: 'pedir' }, null)
  console.log(r.text)
  process.exit(r.error ? 1 : 0)
} else if (orden === 'anotar') {
  const o = opciones(process.argv.slice(3))
  if (!esClase(o.clase) || !o.que) { console.error('anotar --clase <clase> --que «…» [--deshacer «…»] [--donde «…»]'); process.exit(2) }
  anotarHechoSolo({ clase: o.clase, que: o.que, ...(o.deshacer ? { deshacer: o.deshacer } : {}), ...(o.donde ? { donde: o.donde } : {}), origen: 'levy', ...(process.env.CLAUDE_CODE_SESSION_ID ? { sesion: process.env.CLAUDE_CODE_SESSION_ID } : {}) })
  console.log('anotado en «Lo que hice solo»')
} else if (orden === 'fijar') {
  if (!esPreset(arg)) { console.error(`preset: ${PRESETS.join(' | ')}`); process.exit(2) }
  fijarPolitica(arg, politicaVigente().ajustes, 'terminal')
  console.log(`${RUTA_POLITICA()} → ${arg}`)
} else if (orden === 'hoy') {
  const f = join(DIR_HECHO_SOLO(), `${diaCivil(new Date())}.jsonl`)
  const filas = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  if (!filas.length) console.log('Hoy no hice nada solo todavía.')
  for (const h of filas) console.log(`${new Date(h.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${h.que}${h.deshacer ? ` (deshacer: ${h.deshacer})` : ''}`)
} else {
  console.log(`${RUTA_POLITICA()}${existsSync(RUTA_POLITICA()) ? '' : ' (sin archivo: rige el preset por defecto)'}`)
  console.log(JSON.stringify(archivoLegible(politicaVigente()), null, 2))
}
