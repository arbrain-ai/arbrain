/**
 * La política de autonomía desde la terminal (la lee Levy; la app la cambia por su ruta).
 *   tsx src/autonomia/cli.ts ver               lo vigente y qué significa cada clase
 *   tsx src/autonomia/cli.ts fijar <preset>    cauteloso | equilibrado | piloto (escribe el archivo)
 *   tsx src/autonomia/cli.ts hoy               «Lo que hice solo» de hoy
 *   tsx src/autonomia/cli.ts apagar-freno <AAAA-MM-DDTHH:MM> --por «cita textual del dueño»   apaga el freno ENTERO hasta esa hora local
 *   tsx src/autonomia/cli.ts encender-freno    lo vuelve a encender antes de tiempo
 *   tsx src/autonomia/cli.ts decidir --titulo «…» --recomienda si|no --recomendacion «…» [--detalle «texto exacto»] [--categoria enviar|pagar|borrar|publicar|otra] [--expira 13:00|2026-11-04T13:00] [--persona Fulano]
 *   tsx src/autonomia/cli.ts decision <cf_id>  cómo quedó una decisión
 *   tsx src/autonomia/cli.ts anotar --clase configurar --que «…» [--deshacer «…»]   una línea en «Lo que hice solo»
 *   tsx src/autonomia/cli.ts soporte --url <hilo de la plataforma de la cohorte> --persona Fulano --texto «…» [--pregunta «…»] [--recomendacion «…»]
 *     responder una duda técnica o de uso de un alumno en la plataforma de la cohorte: sale sola si la clase «soporte» está en «hacer»;
 *     si no, o si toca algo de la persona, sube la tarjeta de contactar (autonomia/soporte.ts)
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diaCivil } from '../zona.js'
import { anotarHechoSolo, apagarFreno, archivoLegible, DIR_HECHO_SOLO, encenderFreno, esClase, esPreset, fijarPolitica, frenoApagado, politicaVigente, PRESETS, RUTA_POLITICA } from './politica.js'
import { DECISION_DESCRIPTION, ejecutarDecision, llamarDaemon } from './decision-tool.js'
import { publicarConComunidad, responderSoporte } from './soporte.js'

const [orden, arg] = process.argv.slice(2)
/** `--clave valor` → { clave: valor }. */
const opciones = (args: string[]) => { const o: Record<string, string> = {}; for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[i + 1]?.startsWith('--') ? 'true' : (args[++i] ?? 'true'); return o }
if (orden === 'decidir' || orden === 'decision') {
  const o = opciones(process.argv.slice(3))
  if (o.ayuda) { console.log(DECISION_DESCRIPTION); process.exit(0) }
  const r = await ejecutarDecision(orden === 'decision' ? { accion: 'ver', id: arg } : { ...o, accion: 'pedir' }, null)
  console.log(r.text)
  process.exit(r.error ? 1 : 0)
} else if (orden === 'soporte') {
  const o = opciones(process.argv.slice(3))
  const llamar = await llamarDaemon()
  if (!llamar) { console.error('No hay token del servidor para preguntar a la bandeja.'); process.exit(1) }
  const r = await responderSoporte({ url: o.url, texto: o.texto, persona: o.persona, ...(o.pregunta ? { pregunta: o.pregunta } : {}), ...(o.recomendacion ? { recomendacion: o.recomendacion } : {}), ...(process.env.CLAUDE_CODE_SESSION_ID ? { sesion: process.env.CLAUDE_CODE_SESSION_ID } : {}) }, { pedir: cuerpo => llamar('/decisiones/pedir', cuerpo), publicar: publicarConComunidad })
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
} else if (orden === 'apagar-freno') {
  const o = opciones(process.argv.slice(4))
  if (!arg || !o.por || o.por === 'true') { console.error('apagar-freno <AAAA-MM-DDTHH:MM> --por «cita textual del dueño»'); process.exit(2) }
  try { apagarFreno(arg, o.por) } catch (e) { console.error((e as Error).message); process.exit(2) }
  const f = frenoApagado()
  console.log(`Freno APAGADO hasta ${arg} (${f?.hasta}). Todo pasa y queda en «Lo que hice solo». Encender antes: cli.ts encender-freno`)
} else if (orden === 'encender-freno') {
  encenderFreno('terminal')
  console.log('Freno encendido: rige la política de siempre.')
} else if (orden === 'hoy') {
  const f = join(DIR_HECHO_SOLO(), `${diaCivil(new Date())}.jsonl`)
  const filas = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  if (!filas.length) console.log('Hoy no hice nada solo todavía.')
  for (const h of filas) console.log(`${new Date(h.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${h.que}${h.deshacer ? ` (deshacer: ${h.deshacer})` : ''}`)
} else {
  console.log(`${RUTA_POLITICA()}${existsSync(RUTA_POLITICA()) ? '' : ' (sin archivo: rige el preset por defecto)'}`)
  const f = frenoApagado()
  console.log(f ? `FRENO APAGADO hasta ${new Date(f.hasta).toLocaleString('es-MX')} (${f.hasta}) · por: «${f.por ?? ''}» · todo pasa y se anota en «Lo que hice solo»` : 'Freno encendido: rige lo vigente.')
  console.log(JSON.stringify(archivoLegible(politicaVigente()), null, 2))
}
