/**
 * Canario de las manos: 5 tareas reversibles que avisan si algo que funcionaba se rompe
 * (una actualización de macOS o de una app que cambia la accesibilidad).
 *
 *   1. dock         Configuración › Escritorio y Dock: el interruptor de ocultar el Dock se lee
 *                   y coincide con `defaults read com.apple.dock autohide`. Solo lectura; el panel
 *                   vuelve al que estaba.
 *   2. calculadora  12 × 3 = 36 leído de la pantalla; la pantalla vuelve al número que tenía.
 *   3. textedit     ⌘N, escribir, leer de vuelta, ⌘W y descartar. Prueba además el freno:
 *                   «Eliminar» sin pedido se bloquea; con la confirmación del canario pasa. Sin archivo.
 *   4. chrome       Búsqueda en YouTube en una ventana propia en segundo plano; se cierra al final.
 *   5. chat         WhatsApp: el árbol se lee (sin guardar su contenido) y el freno juzga como
 *                   envío un Enter en el compositor. NUNCA se actúa sobre WhatsApp.
 *
 * Corre con `caffeinate` temporal (la Mac bloqueada no responde nada gráfico) y escribe a la
 * bitácora, no a la campana. Solo alerta (exit 2) si una tarea que pasó en la corrida anterior
 * ahora falla. Estado en ~/.config/arbrain/manos/canario-estado.json.
 *
 * Uso: `npx tsx src/manos/canario.ts [--corto] [--solo=dock,chrome]`. `--corto` = calculadora + textedit.
 * Cron (escrito, NO cargado): arbrain/server/manos-casa/launchd/ai.arbrain.manos-canario.plist.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN } from '../edicion.js'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Adaptador, Observacion } from './contrato.js'
import { cargarEntornoManos, componerManos } from './registro.js'
import { Registro, escribir } from './bitacora.js'
import { Freno, juzgar } from './freno.js'
import { capa, ejecutarManos, Frescura } from './herramientas.js'
import { AlmacenRecetas } from './recetas.js'

const ESTADO = () => join(dirname(process.env.MANOS_BITACORA_DIR || join(DIR_ARBRAIN(), 'manos', 'bitacora')), 'canario-estado.json')
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
async function esperar(f: () => Promise<boolean>, ms: number, paso = 100): Promise<boolean> {
  const fin = Date.now() + ms
  while (Date.now() < fin) { if (await f().catch(() => false)) return true; await dormir(paso) }
  return false
}

export interface ResultadoTarea { tarea: string; ok: boolean; ms: number; detalle: string; omitida?: boolean }
type Tarea = (m: Adaptador, r: Registro) => Promise<{ ok: boolean; detalle: string; omitida?: boolean }>

const pidDe = async (m: Adaptador, bundle: string) => (await m.apps()).find(a => a.bundle === bundle)?.pid
const boton = (o: Observacion, re: RegExp) => o.elementos.find(e => e.rol === 'AXButton' && re.test(e.etiqueta ?? ''))

// ---------- 1. Dock (solo lectura) ----------
const SETTINGS = 'com.apple.systempreferences'
/** El Dock leído desde su propia accesibilidad: vive en todos los escritorios. Solo lectura. */
async function dockPropio(m: Adaptador): Promise<{ ok: boolean; detalle: string }> {
  const pid = await pidDe(m, 'com.apple.dock') ?? (await m.apps().catch(() => [])).find(a => a.nombre === 'Dock')?.pid
  const o = await m.observar({ ...(pid ? { pid } : { app: 'com.apple.dock' }), raiz_app: true, max_elementos: 300 })
  const items = o.elementos.filter(e => /dockitem|AXDockItem/i.test(e.rol))
  const finder = items.some(e => /^Finder$/.test(e.etiqueta ?? ''))
  return { ok: finder && items.length >= 3, detalle: `Configuración en otro escritorio: leí el Dock directo · ${items.length} elementos · Finder ${finder}` }
}

const dock: Tarea = async (m, r) => {
  const enOtro = await (async () => { const p = await pidDe(m, SETTINGS); if (!p) return false; const vs = (await m.ventanas({ pid: p })).filter(w => w.marco.h > 150); return vs.length > 0 && !vs.some(w => w.en_pantalla) })()
  if (enOtro) return dockPropio(m)
  const yaCorria = !!(await pidDe(m, SETTINGS))
  const { pid } = await m.abrir(SETTINGS)
  const ventanaDe = async () => (await m.ventanas({ pid })).find(w => w.en_pantalla && w.marco.h > 150)
  await esperar(async () => !!(await ventanaDe()), 5000)
  const w = await ventanaDe()
  if (!w) return { ok: false, detalle: 'Configuración no mostró ventana' }
  const tituloAntes = w.titulo ?? ''
  const panel = /Dock/i
  let o = await m.observar({ pid, ventana: w.id, max_elementos: 600 })
  if (!panel.test(o.titulo ?? tituloAntes)) {
    const b = o.elementos.find(e => /^(Escritorio y Dock|Desktop & Dock)$/i.test(e.etiqueta ?? ''))
    if (!b) return { ok: false, detalle: 'no encontré «Escritorio y Dock» en la barra lateral' }
    const a = await m.actuar({ pid, ventana: w.id, accion: 'click', ref: b.ref })
    r.paso({ herramienta: 'actuar', accion: 'click', app: SETTINGS, rol: b.rol, etiqueta: b.etiqueta, decidio: 'guion', resultado: a.ok ? 'ok' : 'fallo', ms: 0 })
    await esperar(async () => panel.test((await ventanaDe())?.titulo ?? ''), 8000)
  }
  let sw: Observacion['elementos'][number] | undefined
  await esperar(async () => {
    o = await m.observar({ pid, ventana: w.id, max_elementos: 800 })
    sw = o.elementos.find(e => /CheckBox|Switch/.test(e.rol) && /Ocultar y mostrar el Dock|hide and show the Dock/i.test(e.etiqueta ?? ''))
    return !!sw
  }, 8000, 200)
  const real = execFileSync('defaults', ['read', 'com.apple.dock', 'autohide'], { encoding: 'utf8' }).trim()
  const leido = String(sw?.valor ?? '?')
  // Dejar todo como estaba: el panel original (si era otro) o cerrar Configuración si la abrió el canario.
  if (!yaCorria) await m.actuar({ pid, ventana: w.id, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] })
  else if (tituloAntes && !panel.test(tituloAntes)) {
    const ob = await m.observar({ pid, ventana: w.id, max_elementos: 600 })
    const b = ob.elementos.find(e => e.rol !== 'AXStaticText' && (e.etiqueta ?? '') === tituloAntes)
    if (b) { await m.actuar({ pid, ventana: w.id, accion: 'click', ref: b.ref }); await esperar(async () => (await ventanaDe())?.titulo === tituloAntes, 6000) }
  }
  const restaurado = !yaCorria || (await ventanaDe())?.titulo === tituloAntes || !tituloAntes
  return { ok: !!sw && leido === real && restaurado, detalle: `interruptor=${leido} defaults=${real} · panel ${restaurado ? 'restaurado' : `NO restaurado (estaba en «${tituloAntes}»)`}` }
}

// ---------- 2. Calculadora ----------
const CALC = 'com.apple.calculator'
export function pantallaCalc(o: Observacion): string {
  const campo = o.elementos.find(e => /campo de edición|edit field|main display/i.test(e.etiqueta ?? ''))
  if (campo) return String(campo.valor ?? '').replace(/[^\d.,-]/g, '')
  const nums = o.elementos.filter(e => /AXStaticText|AXScrollArea|AXGroup/.test(e.rol)).map(e => `${e.valor ?? ''} ${e.etiqueta ?? ''}`.replace(/[^\d]/g, '')).filter(Boolean).sort((a, b) => b.length - a.length)
  return nums[0] ?? ''
}
/** Si la Calculadora de Daniel está en otro escritorio, el canario abre SU instancia (aquí) y la cierra al final. */
async function calcPropia(m: Adaptador): Promise<number | null> {
  const antes = new Set((await m.apps()).filter(a => a.bundle === CALC).map(a => a.pid))
  execFileSync('open', ['-g', '-n', '-a', 'Calculator'])
  let pid: number | undefined
  await esperar(async () => { pid = (await m.apps()).find(a => a.bundle === CALC && !antes.has(a.pid))?.pid; return !!pid && (await m.ventanas({ pid })).some(w => w.en_pantalla && w.marco.h > 150) }, 6000, 150)
  return pid ?? null
}

const calculadora: Tarea = async (m, r) => {
  const dePropio = await (async () => { const p = await pidDe(m, CALC); if (!p) return false; const vs = (await m.ventanas({ pid: p })).filter(w => w.marco.h > 150); return vs.length > 0 && !vs.some(w => w.en_pantalla) })()
  const propia = dePropio ? await calcPropia(m) : null
  if (dePropio && !propia) return { ok: false, detalle: 'no pude abrir una Calculadora propia' }
  const pid = propia ?? (await m.abrir(CALC)).pid
  await dormir(300)
  let o = await m.observar({ pid, max_elementos: 400 })
  const antes = pantallaCalc(o).replace(/[.,]/g, '')
  const tecla = async (re: RegExp) => {
    o = await m.observar({ pid, max_elementos: 400 })
    const b = boton(o, re)
    if (!b) throw new Error(`no encontré el botón ${re}`)
    const a = await m.actuar({ pid, ventana: o.ventana, accion: 'click', ref: b.ref, asentar: false })
    r.paso({ herramienta: 'actuar', accion: 'click', app: CALC, rol: b.rol, etiqueta: b.etiqueta, decidio: 'guion', resultado: a.ok ? 'ok' : a.efecto === 'bloqueado' ? 'bloqueado' : 'fallo', ms: 0 })
    if (!a.ok) throw new Error(`${b.etiqueta}: ${a.detalle}`)
  }
  let ok = false
  try {
    // Dos limpiezas: «Borrar» solo quita la entrada y deja pendiente una operación a medias; la segunda es «Borrar todo».
    const LIMPIAR = /^(borrar todo|all clear|ac|borrar|clear|c)$/i
    await tecla(LIMPIAR); await tecla(LIMPIAR)
    for (const re of [/^1$/, /^2$/, /^(multiplicar|multiply|×)$/i, /^3$/, /^(es igual a|igual|equals|=)$/i]) await tecla(re)
    ok = await esperar(async () => pantallaCalc(await m.observar({ pid, max_elementos: 400 })).replace(/[.,]/g, '') === '36', 2000)
  } finally {
    // Volver a la pantalla que tenía (aunque algo falle): borrar y teclear el número anterior (solo dígitos).
    await tecla(/^(borrar todo|all clear|ac|borrar|clear|c)$/i).catch(() => {})
    for (const d of (/^\d+$/.test(antes) && antes !== '0' ? antes : '').slice(0, 12)) await tecla(new RegExp(`^${d}$`)).catch(() => {})
  }
  const despues = pantallaCalc(await m.observar({ pid, max_elementos: 400 })).replace(/[.,]/g, '')
  if (propia) {
    // Su propia instancia: la cierra el canario (el freno exige su confirmación acotada a ESTE proceso).
    const q = await m.actuar({ pid: propia, accion: 'tecla', tecla: 'q', modificadores: ['cmd'], confirmacion: `canario: salir de la Calculadora pid ${propia} que abrió el propio canario` })
    r.paso({ herramienta: 'actuar', accion: 'tecla', tecla: 'cmd+q', app: CALC, decidio: 'guion', resultado: q.ok ? 'ok' : 'fallo', ...(q.freno ? { freno: { categoria: q.freno.categoria, paso: q.freno.paso } } : {}), ms: 0 })
  }
  return { ok, detalle: `${propia ? `instancia propia (la de ${DUENO} está en otro escritorio) · ` : ''}12×3 → ${ok ? '36' : 'no leí 36'} · pantalla antes «${antes}» después «${despues}»` }
}

// ---------- 3. TextEdit + freno ----------
const TEXTEDIT = 'com.apple.TextEdit'
const DIRS = [join(homedir(), 'Library/Mobile Documents/com~apple~TextEdit/Documents'), join(homedir(), 'Library/Containers/com.apple.TextEdit/Data/Documents'), join(homedir(), 'Documents'), join(homedir(), 'Desktop')]
const archivosDesde = (t: number) => DIRS.filter(existsSync).flatMap(d => { try { return readdirSync(d).filter(f => { try { return statSync(join(d, f)).mtimeMs >= t && /\.(rtf|rtfd|txt)$/i.test(f) } catch { return false } }) } catch { return [] } })
const textedit: Tarea = async (m, r) => {
  const inicio = Date.now() - 1000
  const yaCorria = !!(await pidDe(m, TEXTEDIT))
  if (!yaCorria) return { ok: true, omitida: true, detalle: 'TextEdit no estaba abierto: el canario no abre apps de documentos (abriría el panel de iCloud)' }
  const pid = (await pidDe(m, TEXTEDIT))!
  const freno = capa(m, Freno)!
  const antes = new Set((await m.ventanas({ pid })).map(w => w.id))
  const n = await m.actuar({ pid, accion: 'tecla', tecla: 'n', modificadores: ['cmd'] })
  r.paso({ herramienta: 'actuar', accion: 'tecla', tecla: 'cmd+n', app: TEXTEDIT, decidio: 'guion', resultado: n.ok ? 'ok' : 'fallo', ms: 0 })
  let nueva: number | undefined
  await esperar(async () => { nueva = (await m.ventanas({ pid })).find(w => !antes.has(w.id) && w.en_pantalla && w.marco.h > 150)?.id; return nueva != null }, 4000)
  if (nueva == null) return { ok: false, detalle: '⌘N no abrió documento' }
  const frase = `canario de manos ${Math.random().toString(36).slice(2, 7)}`
  let o = await m.observar({ pid, ventana: nueva, max_elementos: 200 })
  const area = o.elementos.find(e => e.rol === 'AXTextArea')
  if (!area) return { ok: false, detalle: 'sin área de texto' }
  const w = await m.actuar({ pid, ventana: nueva, accion: 'escribir', ref: area.ref, texto: frase })
  r.paso({ herramienta: 'actuar', accion: 'escribir', app: TEXTEDIT, rol: 'AXTextArea', escrito: frase.length, decidio: 'guion', resultado: w.ok ? 'ok' : 'fallo', ms: 0 })
  o = await m.observar({ pid, ventana: nueva, max_elementos: 200 })
  const leido = String(o.elementos.find(e => e.rol === 'AXTextArea')?.valor ?? '').includes(frase)
  const propia = freno.propias.has(nueva)
  await m.actuar({ pid, ventana: nueva, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] })
  let bloqueoSin = false, pasoCon = false
  const descartar = /^(eliminar|borrar|no guardar|don.t save|delete)$/i
  const conHoja = await esperar(async () => !!boton(await m.observar({ pid, ventana: nueva, max_elementos: 200 }), descartar), 2500)
  if (conHoja) {
    o = await m.observar({ pid, ventana: nueva, max_elementos: 200 })
    const b = boton(o, descartar)!
    const sin = await m.actuar({ pid, ventana: nueva, accion: 'click', ref: b.ref })
    bloqueoSin = sin.efecto === 'bloqueado'
    r.paso({ herramienta: 'actuar', accion: 'click', app: TEXTEDIT, rol: b.rol, etiqueta: b.etiqueta, decidio: 'guion', resultado: sin.efecto === 'bloqueado' ? 'bloqueado' : sin.ok ? 'ok' : 'fallo', ...(sin.freno ? { freno: { categoria: sin.freno.categoria, paso: sin.freno.paso } } : {}), ms: 0 })
    o = await m.observar({ pid, ventana: nueva, max_elementos: 200 })
    const b2 = boton(o, descartar)!
    const con = await m.actuar({ pid, ventana: nueva, accion: 'click', ref: b2.ref, confirmacion: 'canario: descartar el borrador de prueba que el propio canario abrió en TextEdit' })
    pasoCon = con.ok
    r.paso({ herramienta: 'actuar', accion: 'click', app: TEXTEDIT, rol: b2.rol, etiqueta: b2.etiqueta, decidio: 'guion', resultado: con.ok ? 'ok' : 'fallo', ...(con.freno ? { freno: { categoria: con.freno.categoria, paso: con.freno.paso } } : {}), ms: 0 })
  }
  const cerrada = await esperar(async () => !(await m.ventanas({ pid })).some(w => w.id === nueva && w.en_pantalla), 3000)
  const archivos = archivosDesde(inicio)
  const frenoOk = !conHoja || (bloqueoSin && pasoCon)
  return { ok: leido && propia && cerrada && archivos.length === 0 && frenoOk, detalle: `escrito y leído ${leido} · ventana propia ${propia} · hoja ${conHoja ? `sí (sin pedido: ${bloqueoSin ? 'bloqueado' : 'PASÓ'}, con pedido: ${pasoCon ? 'pasó' : 'falló'})` : 'no salió'} · cerrada ${cerrada} · archivos nuevos ${archivos.length}` }
}

// ---------- 4. Chrome ----------
const chrome: Tarea = async (m, r) => {
  const freno = capa(m, Freno)!
  const fres = new Frescura()
  const sink = { paso: (p: any) => r.paso({ ...p, decidio: 'guion' }) }
  const nav = JSON.parse((await ejecutarManos('navegar', { url: 'https://www.youtube.com/results?search_query=Prankedy' }, m, () => { throw new Error('sin decisor') }, new AlmacenRecetas(), { bitacora: sink, frescura: fres })).text)
  if (!nav.ok) return { ok: false, detalle: `navegar: ${nav.detalle}` }
  let hallado = false
  await esperar(async () => {
    const o = await m.observar({ pid: nav.pid, ventana: nav.ventana, consulta: 'Prankedy', max_elementos: 3000 })
    hallado = o.elementos.some(e => e.rol === 'AXLink' && /Prankedy/i.test(e.etiqueta ?? ''))
    return hallado
  }, 8000, 300)
  const propia = freno.propias.has(nav.ventana)
  const c = await m.actuar({ pid: nav.pid, ventana: nav.ventana, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] })
  r.paso({ herramienta: 'actuar', accion: 'tecla', tecla: 'cmd+w', app: 'com.google.Chrome', decidio: 'guion', resultado: c.ok ? 'ok' : 'fallo', ms: 0 })
  const cerrada = await esperar(async () => !(await m.ventanas({ pid: nav.pid })).some(w => w.id === nav.ventana && w.en_pantalla), 3000)
  return { ok: hallado && propia && cerrada, detalle: `árbol web con enlace a Prankedy ${hallado} · ventana propia ${propia} · cerrada ${cerrada}` }
}

// ---------- 5. Chat (solo lectura + juicio del freno) ----------
const WHATSAPP = 'net.whatsapp.WhatsApp'
/** Chat de prueba local (la página de prueba-freno) en ventana propia: lectura + juicio del freno en seco. */
async function chatDePrueba(m: Adaptador): Promise<{ ok: boolean; detalle: string }> {
  const dir = join(dirname(new URL(import.meta.url).pathname), '../../../../docs/builds/manos-v1-estable-2026-10-02/prueba-freno')
  const puerto = 8765 + Math.floor(Math.random() * 200)
  const srv = spawn('python3', ['-m', 'http.server', String(puerto), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' })
  try {
    await dormir(400)
    const nav = JSON.parse((await ejecutarManos('navegar', { url: `http://127.0.0.1:${puerto}/chat.html` }, m, () => { throw new Error('sin decisor') }, new AlmacenRecetas(), {})).text)
    if (!nav.ok) return { ok: false, detalle: `navegar: ${nav.detalle}` }
    let o: Observacion | undefined
    await esperar(async () => { o = await m.observar({ pid: nav.pid, ventana: nav.ventana, max_elementos: 300 }); return o.elementos.some(e => e.rol === 'AXTextArea') }, 6000, 200)
    const caja = o?.elementos.find(e => e.rol === 'AXTextArea')
    const ctx = caja && m.contexto ? await m.contexto({ pid: nav.pid, ventana: nav.ventana, ref: caja.ref }) : {}
    const j = juzgar({ pid: nav.pid, ventana: nav.ventana, accion: 'tecla', tecla: 'return', ...(caja ? { ref: caja.ref } : {}) }, ctx, new Set([nav.ventana]))
    await m.actuar({ pid: nav.pid, ventana: nav.ventana, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] })
    return { ok: !!caja && j.categoria === 'enviar', detalle: `WhatsApp en otro escritorio: chat de prueba local · compositor ${!!caja} · Enter juzgado: ${j.categoria ?? 'pasa'}` }
  } finally { srv.kill() }
}

const chat: Tarea = async (m) => {
  const pid = await pidDe(m, WHATSAPP)
  const enOtro = pid ? (await m.ventanas({ pid })).filter(w => w.marco.h > 150).every(w => !w.en_pantalla) : true
  if (!pid || enOtro) return chatDePrueba(m)
  const o = await m.observar({ pid, max_elementos: 300 })
  const legible = o.elementos.length >= 5
  const compositor = o.elementos.find(e => /AXTextArea|AXTextField/.test(e.rol) && !/buscar|search/i.test(e.etiqueta ?? ''))
  // El freno se prueba en seco: se juzga el contexto real del compositor; nunca se envía una tecla a WhatsApp.
  const ctx = compositor && m.contexto ? await m.contexto({ pid, ventana: o.ventana, ref: compositor.ref }).catch(() => ({ bundle: WHATSAPP })) : { bundle: WHATSAPP }
  const j = juzgar({ pid, ventana: o.ventana, accion: 'tecla', tecla: 'return', ...(compositor ? { ref: compositor.ref } : {}) }, ctx)
  return { ok: legible && j.irreversible && j.categoria === 'enviar', detalle: `árbol legible (${o.elementos.length} elementos, contenido no guardado) · compositor ${compositor ? 'encontrado' : 'no visible'} · Enter juzgado: ${j.categoria ?? 'pasa'}` }
}

export const TAREAS: Record<string, Tarea> = { dock, calculadora, textedit, chrome, chat }
const BUNDLE_DE: Record<string, string> = { dock: SETTINGS, calculadora: CALC, textedit: TEXTEDIT, chrome: 'com.google.Chrome', chat: WHATSAPP }

/**
 * ¿La falla es del entorno y no de las manos? La accesibilidad no alcanza ventanas de otro escritorio (Space)
 * ni responde con la Mac bloqueada. Eso no es una regresión: es «no evaluable» y no dispara alerta.
 */
export async function noEvaluable(m: Adaptador, tarea: string, error: string): Promise<string | null> {
  if (/bloqueada/i.test(error)) return 'la Mac está bloqueada'
  if (!/no tiene ventanas|no es de la app|ya se cerró|no mostró ventana/i.test(error)) return null
  const pid = await pidDe(m, BUNDLE_DE[tarea] ?? '')
  if (!pid) return null
  const vs = (await m.ventanas({ pid })).filter(w => w.marco.h > 150)
  return vs.length && !vs.some(w => w.en_pantalla) ? 'su ventana está en otro escritorio (Space): la accesibilidad no la alcanza' : null
}

export async function correrCanario(nombres = Object.keys(TAREAS), manos: Adaptador = componerManos()): Promise<{ resultados: ResultadoTarea[]; regresiones: string[] }> {
  // caffeinate temporal: mientras viva este proceso, la pantalla no duerme.
  const cafe = spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore', detached: false })
  const previo: Record<string, { ok: boolean; en: string }> = existsSync(ESTADO()) ? JSON.parse(readFileSync(ESTADO(), 'utf8')) : {}
  const resultados: ResultadoTarea[] = []
  try {
    for (const n of nombres) {
      const reg = new Registro('canario', `canario: ${n}`)
      const t0 = performance.now()
      let res: { ok: boolean; detalle: string; omitida?: boolean }
      try { res = await TAREAS[n](manos, reg) } catch (e) {
        const msg = (e as Error).message
        const entorno = await noEvaluable(manos, n, msg).catch(() => null)
        res = entorno ? { ok: true, omitida: true, detalle: `NO EVALUABLE: ${entorno}` } : { ok: false, detalle: `error: ${msg.slice(0, 200)}` }
      }
      if (!res.ok && !res.omitida) {
        const entorno = await noEvaluable(manos, n, res.detalle).catch(() => null)
        if (entorno) res = { ok: true, omitida: true, detalle: `NO EVALUABLE: ${entorno} (${res.detalle})` }
      }
      const ms = Math.round(performance.now() - t0)
      reg.verificacion = { ok: res.ok, como: res.detalle }
      reg.cerrar(res.ok, { falla: res.ok ? undefined : `canario ${n}: ${res.detalle}` })
      resultados.push({ tarea: n, ok: res.ok, ms, detalle: res.detalle, ...(res.omitida ? { omitida: true } : {}) })
      console.log(`${res.ok ? (res.omitida ? 'OMITIDA' : 'VERDE') : 'ROJO '} ${n.padEnd(12)} ${String(ms).padStart(6)} ms · ${res.detalle}`)
    }
  } finally {
    await capa(manos, Freno)?.soltar?.()
    cafe.kill()
  }
  const regresiones = resultados.filter(r => !r.ok && previo[r.tarea]?.ok).map(r => r.tarea)
  const estado = { ...previo }
  for (const r of resultados) if (!r.omitida) estado[r.tarea] = { ok: r.ok, en: new Date().toISOString() }
  mkdirSync(dirname(ESTADO()), { recursive: true })
  writeFileSync(ESTADO(), JSON.stringify(estado, null, 2))
  escribir({ tipo: 'canario', en: new Date().toISOString(), resultados, regresiones })
  return { resultados, regresiones }
}

if (process.argv[1] && /canario\.(ts|js)$/.test(process.argv[1])) {
  cargarEntornoManos()
  process.env.MANOS_QUIEN ??= 'canario'
  const solo = process.argv.find(a => a.startsWith('--solo='))?.slice(7).split(',')
  const nombres = solo ?? (process.argv.includes('--corto') ? ['calculadora', 'textedit'] : Object.keys(TAREAS))
  const manos = componerManos()
  correrCanario(nombres, manos).then(async ({ resultados, regresiones }) => {
    await manos.cerrar()
    const rojas = resultados.filter(r => !r.ok)
    console.log(rojas.length ? `CANARIO_ROJO (${rojas.map(r => r.tarea).join(', ')})${regresiones.length ? ` · REGRESIÓN: ${regresiones.join(', ')}` : ''}` : 'CANARIO_VERDE')
    process.exit(regresiones.length ? 2 : rojas.length ? 1 : 0)
  })
}
