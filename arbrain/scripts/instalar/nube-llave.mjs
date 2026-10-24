#!/usr/bin/env node
/**
 * La llave de OpenRouter de TU NUBE, con tope (23 oct 2026, modo espejo N3). La usa `nube.sh llave`; también sirve sola:
 *
 *   node arbrain/scripts/instalar/nube-llave.mjs guardar [--datos <carpeta>]   (la llave entra por stdin, nunca por argv)
 *   node arbrain/scripts/instalar/nube-llave.mjs estado  [--datos <carpeta>]
 *
 * Reglas (DISENO cerebro-24-7 §1.2 y §1.4): las rutinas de la nube corren con una llave de API a nombre de la persona y
 * con techo de gasto, nunca con su suscripción de Claude ni con la llave de su laptop. Por eso aquí:
 *   - solo se acepta una llave `sk-or-` (nunca un token `sk-ant-oat…` de suscripción);
 *   - se pregunta a OpenRouter (`GET /api/v1/key`) y se exige `limit` numérico > 0: sin tope, no se guarda;
 *   - se guarda en `<datos>/daemon/config/llaves.json` (0600, el mismo almacén del modo servidor) y el tope, sin la
 *     llave, en `<datos>/daemon/config/nube-llave.json` para que `nube.sh estado` lo muestre.
 * Nunca imprime la llave: a la pantalla sale solo «sk-or-v…wxyz». Salida: una línea final
 *   NUBE_LLAVE_OK tope=<usd> restante=<usd>   ·   NUBE_LLAVE_FALTA <motivo>   ·   NUBE_LLAVE estado=<falta|tope:<usd>>
 * `NUBE_OPENROUTER_API` cambia la dirección de OpenRouter SOLO hacia http://127.0.0.1 (pruebas con un OpenRouter falso).
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dirDatosPorDefecto, enmascarar, errorDeLlave, limpiarLlave, rutasDe } from '../servidor/rutas.mjs'

export const API_OPENROUTER = 'https://openrouter.ai'

/**
 * Dirección de OpenRouter: la real, o una de prueba solo si es 127.0.0.1. Pura.
 * @param {Record<string, string | undefined>} [env]
 */
export function baseOpenRouter(env = process.env) {
  const v = String(env.NUBE_OPENROUTER_API ?? '').trim().replace(/\/+$/, '')
  if (!v) return API_OPENROUTER
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(v)) return v
  throw new Error('NUBE_OPENROUTER_API solo puede apuntar a http://127.0.0.1:<puerto> (pruebas)')
}

/** Lee la respuesta de `GET /api/v1/key` y decide. Pura: la prueban los tests. */
export function decidirTope(json) {
  const d = json?.data ?? json
  if (!d || typeof d !== 'object') return { ok: false, motivo: 'OpenRouter no contestó con los datos de la llave' }
  const limite = d.limit
  if (limite === null || limite === undefined) {
    return { ok: false, motivo: 'esa llave no tiene tope de gasto. En openrouter.ai › Keys crea una nueva para tu nube con «Credit limit» (por ejemplo US$10) y pégala' }
  }
  const n = Number(limite)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, motivo: `el tope de esa llave no sirve (${limite}); ponle un «Credit limit» mayor que cero` }
  const restante = d.limit_remaining == null ? null : Number(d.limit_remaining)
  return { ok: true, tope: n, restante: Number.isFinite(restante) ? restante : null, libre: !!d.is_free_tier }
}

function escribirPrivado(ruta, texto) {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 })
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, texto, { mode: 0o600 })
  renameSync(tmp, ruta)
  chmodSync(ruta, 0o600)
}
const leerJson = (ruta) => { try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null } }

async function leerStdin() {
  let s = ''
  for await (const c of process.stdin) { s += c; if (s.length > 8192) break }
  return s
}

export async function consultarTope(llave, { base = baseOpenRouter(), fetchFn = fetch } = {}) {
  let r
  try {
    r = await fetchFn(`${base}/api/v1/key`, { headers: { Authorization: `Bearer ${llave}` }, signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    return { ok: false, motivo: `no pude hablar con OpenRouter (${e?.cause?.code ?? e?.name ?? 'red'}); revisa el internet del servidor y vuelve a intentarlo` }
  }
  if (r.status === 401 || r.status === 403) return { ok: false, motivo: 'OpenRouter no reconoce esa llave (¿la copiaste completa?)' }
  if (r.status !== 200) return { ok: false, motivo: `OpenRouter respondió ${r.status}; vuelve a intentarlo en un minuto` }
  let j = null
  try { j = await r.json() } catch { /* */ }
  return decidirTope(j)
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--datos')
  const datos = resolve(i >= 0 ? argv[i + 1] : dirDatosPorDefecto(process.platform, process.env, homedir()))
  const R = rutasDe(datos, tmpdir())
  const marca = join(R.config, 'nube-llave.json')
  const orden = argv[0] ?? 'estado'

  if (orden === 'estado') {
    const hay = typeof leerJson(R.llaves)?.OPENROUTER_API_KEY === 'string'
    const m = leerJson(marca)
    console.log(`NUBE_LLAVE estado=${hay && m?.tope ? `tope:${m.tope}` : hay ? 'sin-tope-verificado' : 'falta'}`)
    return
  }
  if (orden !== 'guardar') { console.log(`NUBE_LLAVE_FALTA orden desconocida: ${orden}`); process.exitCode = 2; return }

  const llave = limpiarLlave(await leerStdin())
  const error = errorDeLlave('OPENROUTER_API_KEY', llave)
  if (error) { console.log(`NUBE_LLAVE_FALTA ${error}`); process.exitCode = 4; return }
  const d = await consultarTope(llave)
  if (!d.ok) { console.log(`NUBE_LLAVE_FALTA ${d.motivo}`); process.exitCode = 4; return }
  const actuales = leerJson(R.llaves) ?? {}
  escribirPrivado(R.llaves, JSON.stringify({ ...actuales, OPENROUTER_API_KEY: llave }, null, 1) + '\n')
  escribirPrivado(marca, JSON.stringify({ tope: d.tope, restante: d.restante, vista: enmascarar(llave), verificada: new Date().toISOString() }, null, 1) + '\n')
  console.log(`· Llave ${enmascarar(llave)} guardada en tu nube (solo en este servidor; nunca viaja a GitHub).`)
  console.log(`NUBE_LLAVE_OK tope=${d.tope} restante=${d.restante ?? 'desconocido'}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.log(`NUBE_LLAVE_FALTA ${e?.message ?? e}`); process.exitCode = 1 })
}
