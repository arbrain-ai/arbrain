/**
 * «La historia de tu cerebro», lado servidor (27 oct 2026): lo único que habla con git. Todo con `spawn` y argumentos
 * (sin shell), con tope de tiempo y de tamaño. Recibe la raíz del repo ya resuelta (raiz.ts) para poder probarse contra
 * un repo temporal (tests/historia).
 *
 * Escribe en un solo caso: «Volver», que crea un commit NUEVO con el archivo como estaba antes del cambio elegido. Nunca
 * reset, force, checkout de rama ni borrar historia; solo memoria y skills; nunca sobre un archivo con cambios sin guardar.
 */
import { spawn } from 'node:child_process'
import { chmod, lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { visible } from '@/features/cabina/explorador/arbol'
import {
  carrilDe, esMain, eventoDe, fraseDe, nombreCarril, fraseJunta, nombreTrabajo, ordenarHecho, sinGuardarPorArea, tipoHecho, tituloHecho, FORMATO_LOG, mensajeVolver, motivoNoRegresable, ordenarCarriles, parsearDiff, parsearLog, resumenCodigo,
  resumenTexto, tipoArchivo, tituloVolver, areaDe, type ArchivoDiff, type Hecho, type Lugar, type Tira, type Carril, type CarrilCrudo, type DiffCambio, type Evento, type Historia, type PreviaVolver,
} from './modelo'
import { carriles as carrilesGrafo, refsPorCommit, type CommitGrafo, type Grafo } from './grafo'

export class ErrorHistoria extends Error { constructor(msg: string, public status = 400) { super(msg) } }

const VACIO = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const SHA = /^[0-9a-f]{7,40}$/

interface OpcionesGit { timeout?: number; max?: number; entrada?: string; binario?: boolean }

function correr(raiz: string, args: string[], o: OpcionesGit = {}): Promise<{ codigo: number; salida: Buffer; error: string }> {
  return new Promise(resolve => {
    const hijo = spawn('git', ['-C', raiz, '-c', 'core.quotepath=off', '-c', 'color.ui=false', ...args], {
      shell: false, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    })
    const trozos: Buffer[] = []
    let largo = 0, error = '', cortado = false
    const max = o.max ?? 24 * 1024 * 1024
    const reloj = setTimeout(() => { cortado = true; hijo.kill('SIGKILL') }, o.timeout ?? 15_000)
    hijo.stdout.on('data', (b: Buffer) => { largo += b.length; if (largo > max) { cortado = true; hijo.kill('SIGKILL'); return } trozos.push(b) })
    hijo.stderr.on('data', (b: Buffer) => { if (error.length < 4000) error += b.toString('utf8') })
    hijo.on('error', e => { clearTimeout(reloj); resolve({ codigo: -1, salida: Buffer.alloc(0), error: e.message }) })
    hijo.on('close', c => { clearTimeout(reloj); resolve({ codigo: cortado ? -2 : c ?? -1, salida: Buffer.concat(trozos), error }) })
    if (o.entrada != null) hijo.stdin.end(o.entrada)
    else hijo.stdin.end()
  })
}

/** git que falla lanza ErrorHistoria con lo que dijo git (sin rutas absolutas de más). */
export async function git(raiz: string, args: string[], o: OpcionesGit = {}): Promise<string> {
  const r = await correr(raiz, args, o)
  if (r.codigo !== 0) throw new ErrorHistoria(r.codigo === -2 ? 'git tardó demasiado o respondió de más.' : `git ${args[0]} falló: ${r.error.trim().split('\n')[0] || `código ${r.codigo}`}`, 503)
  return r.salida.toString('utf8')
}
const gitQuizas = (raiz: string, args: string[], o: OpcionesGit = {}) => git(raiz, args, o).catch(() => null)

/** Cuántas promesas a la vez (37 copias de trabajo no deben lanzar 37 `git status` juntos). */
async function enTandas<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await fn(xs[k]) } }))
  return out
}

export async function ramaPrincipal(raiz: string): Promise<string> {
  for (const r of ['main', 'master']) if (await gitQuizas(raiz, ['rev-parse', '--verify', '-q', `refs/heads/${r}`])) return r
  return (await git(raiz, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
}

// ── Copias de trabajo ──

interface Copia { ruta: string; head: string; rama: string | null }

export function parsearWorktrees(texto: string): Copia[] {
  const out: Copia[] = []
  for (const bloque of texto.split('\n\n')) {
    const ruta = /^worktree (.+)$/m.exec(bloque)?.[1]
    if (!ruta || /^bare$/m.test(bloque)) continue
    out.push({ ruta, head: /^HEAD ([0-9a-f]+)$/m.exec(bloque)?.[1] ?? '', rama: /^branch refs\/heads\/(.+)$/m.exec(bloque)?.[1] ?? null })
  }
  return out
}

/** Lo que no es trabajo: los enlaces que cada copia de trabajo crea al nacer (dependencias, llaves locales, compilados). */
const RUIDO = /(^|\/)(node_modules|\.next|\.turbo|\.env[^/]*|\.DS_Store)\/?$/

/** Cambios sin guardar de una copia: lo tocado y lo nuevo, sin el ruido. 37 copias tardan ~6 s: se recuerda 90 s. */
export function rutasSinGuardar(porcelana: string): string[] {
  return porcelana.split('\0').filter(e => e && !(e.startsWith('?? ') && RUIDO.test(e.slice(3)))).filter(e => /^[ MADRCU?!]{2} /.test(e)).map(e => e.slice(3))
}
export const contarSinGuardar = (porcelana: string): number => rutasSinGuardar(porcelana).length
const estados = new Map<string, { en: number; r: Promise<string[] | null> }>()
const rutasSinGuardarEn = (ruta: string) => {
  const m = estados.get(ruta)
  if (m && Date.now() - m.en < 90_000) return m.r
  const r = gitQuizas(ruta, ['status', '--porcelain=v1', '-z'], { timeout: 8_000 }).then(s => s == null ? null : rutasSinGuardar(s))
  estados.set(ruta, { en: Date.now(), r })
  return r
}
const sinGuardarEn = (ruta: string) => rutasSinGuardarEn(ruta).then(r => r == null ? null : r.length)

// ── Nombres de los trabajos ──

/** Las notas de encargo (`docs/builds/<obra>/nodos/<nombre>.md`): su primera línea es el nombre legible del trabajo. */
let titulos: { en: number; raiz: string; m: Promise<Map<string, string>> } | null = null
export function titulosEncargos(raiz: string): Promise<Map<string, string>> {
  if (titulos && titulos.raiz === raiz && Date.now() - titulos.en < 60_000) return titulos.m
  const m = (async () => {
    const out = new Map<string, string>()
    const obras = await readdir(path.join(raiz, 'docs', 'builds')).catch(() => [] as string[])
    const primeraDe = async (f: string) => (await readFile(f, 'utf8').catch(() => '')).slice(0, 2000).split('\n').find(l => l.trim())
    const deObras = new Map<string, string>()
    for (const obra of obras.sort()) {
      // La obra completa (`perro-telemetria-2026-10-27/SPEC.md` → «perro-telemetria»): vale si ningún encargo usa ese nombre.
      const spec = await primeraDe(path.join(raiz, 'docs', 'builds', obra, 'SPEC.md'))
      if (spec) deObras.set(obra.replace(/-\d{4}-\d{2}-\d{2}$/, ''), spec)
      // Un documento de la obra con nombre propio (`COMPETENCIA.md`) nombra al trabajo que lo escribió (`hn-competencia`).
      for (const f of await readdir(path.join(raiz, 'docs', 'builds', obra)).catch(() => [] as string[])) {
        const k = /^([A-Za-z]+(?:-[A-Za-z]+)*)\.md$/.exec(f)?.[1]?.toLowerCase()
        if (!k || /^(spec|readme|indice|index|reporte|brief|notas)$/.test(k) || deObras.has(k)) continue
        const primera = await primeraDe(path.join(raiz, 'docs', 'builds', obra, f))
        if (primera) deObras.set(k, primera)
      }
      const dir = path.join(raiz, 'docs', 'builds', obra, 'nodos')
      for (const f of await readdir(dir).catch(() => [] as string[])) {
        if (!/^[a-z0-9-]+\.md$/i.test(f)) continue
        const primera = await primeraDe(path.join(dir, f))
        if (primera) out.set(f.replace(/\.md$/i, ''), primera)
      }
    }
    for (const [k, v] of deObras) if (!out.has(k)) out.set(k, v)
    return out
  })()
  titulos = { en: Date.now(), raiz, m }
  return m
}
const sufijo = (rama: string) => rama.replace(/^(origin\/)?(wt|hn)[-_]/, '')

// ── La historia ──

export interface OpcionesHistoria { ahora?: number; limite?: number; dirDespliegue?: string | null }

/** La línea del tiempo de main (rápida: ~1 s). Los carriles van aparte (`leerCarriles`): leer 37 copias tarda más. */
export async function leerHistoria(raiz: string, o: OpcionesHistoria = {}): Promise<Historia> {
  const ahora = o.ahora ?? Date.now(), limite = Math.min(Math.max(o.limite ?? 60, 5), 200)
  const avisos: string[] = []
  const principal = await ramaPrincipal(raiz)
  const crudo = parsearLog(await git(raiz, ['log', '--first-parent', '--diff-merges=first-parent', '--numstat', `--format=${FORMATO_LOG}`, '-n', String(limite), principal]))

  // Lo que sirve el Studio: la copia de despliegue (ARBRAIN_WEB_DEPLOY_DIR o ~/Servers/arbrain-web) comparte objetos con este repo.
  let corriendo: Historia['corriendo'] = null
  let desplegados: Set<string> | null = null
  if (o.dirDespliegue) {
    const d = (await gitQuizas(o.dirDespliegue, ['rev-parse', 'HEAD']))?.trim()
    if (d && SHA.test(d) && await gitQuizas(raiz, ['cat-file', '-e', `${d}^{commit}`]) != null) {
      desplegados = new Set((await git(raiz, ['rev-list', '-n', '5000', d])).split('\n').filter(Boolean))
      const [c] = parsearLog(await git(raiz, ['show', '-s', `--format=${FORMATO_LOG}`, d]))
      if (c) corriendo = { sha: c.sha, corto: c.sha.slice(0, 7), cuando: c.fecha, frase: fraseDe(c.mensaje).frase }
    } else avisos.push('No encontré la copia que sirve la app: no puedo decir qué cambios de la app ya corren.')
  }

  const encargos = await titulosEncargos(raiz)
  const eventos: Evento[] = await enTandas(crudo, 6, async c => {
    const ev = eventoDe(c, { carril: principal, desplegados })
    if (c.padres.length > 1 && (ev.tipo === 'junta' || ev.tipo === 'sincroniza')) {
      const rango = `${c.padres[0]}..${c.padres[1]}`
      const [dentro, total, asuntos] = await Promise.all([
        gitQuizas(raiz, ['log', '--no-merges', '--numstat', `--format=${FORMATO_LOG}`, '-n', '6', rango]),
        gitQuizas(raiz, ['rev-list', '--no-merges', '--count', rango]),
        ev.tipo === 'junta' ? gitQuizas(raiz, ['log', '--no-merges', '-n', '30', '--format=%s', rango]) : Promise.resolve(null),
      ])
      const f = fraseDe(c.mensaje)
      const carril = ev.tipo === 'junta' ? f.rama ?? null : principal
      let nombres: Map<string, string> | null = null
      if (ev.tipo === 'junta' && f.rama) {
        // El nombre del trabajo, legible: su nota de encargo o el tema de sus cambios; nunca la carpeta cruda.
        const nombre = nombreTrabajo(f.rama, { titulo: encargos.get(sufijo(f.rama)), asuntos: (asuntos ?? '').split('\n').filter(Boolean) })
        const detalle = /:\s*(.+)$/.exec(f.frase.replace(/^Se incorporó «[^»]*»/, ''))?.[1] ?? ''
        ev.frase = fraseJunta(nombre, detalle)
        nombres = new Map([[f.rama, nombre]])
      }
      ev.dentro = parsearLog(dentro ?? '').map(x => eventoDe(x, { carril, desplegados, nombres }))
      ev.dentroTotal = Number(total ?? ev.dentro.length) || ev.dentro.length
      const agente = ev.dentro.find(x => x.quien === 'subagente')
      if (ev.tipo === 'junta' && agente) { ev.quien = 'subagente'; ev.quienNombre = agente.quienNombre }
    }
    return ev
  })

  const copias = parsearWorktrees(await git(raiz, ['worktree', 'list', '--porcelain']))
  const deMain = copias.find(c => c.rama === principal)
  const rutas = deMain ? (await rutasSinGuardarEn(deMain.ruta)) ?? [] : []
  const [tira, hecho] = await Promise.all([
    leerTira(raiz, principal, eventos[0], o).catch(() => undefined),
    leerHecho(raiz, principal, eventos).catch(() => [] as Hecho[]),
  ])
  return {
    repo: path.basename(raiz), rama: principal, corriendo, sinGuardar: rutas.length, sinGuardarAreas: sinGuardarPorArea(rutas),
    ...(tira ? { tira } : {}), hecho, eventos, carriles: [], leidoEn: new Date(ahora).toISOString(), avisos,
  }
}

/** Lo que es de la app web (lo que sirve el Studio): `arbrain/` sin el servidor de Levy ni el escritorio. */
const RUTAS_WEB = ['arbrain', ':(exclude)arbrain/server', ':(exclude)arbrain/src-tauri', ':(exclude)arbrain/escritorio', ':(exclude)arbrain/empaquetado']
const RUTAS_SERVIDOR = ['arbrain/server', 'agent-server']
const RUTAS_ESCRITORIO = ['arbrain']
const contar = async (raiz: string, args: string[]) => Number((await gitQuizas(raiz, ['rev-list', '--count', ...args]))?.trim()) || 0
const mtime = async (ruta: string) => { const st = await stat(ruta).catch(() => null); return st ? st.mtime.toISOString() : null }

/**
 * La tira de Daniel. La web se VERIFICA contra la copia de despliegue (qué cambios de la app faltan). El servidor de
 * Levy y la app de escritorio no dejan marca de qué versión corren: se dicen «sin verificar» y lo que se cuenta es una
 * estimación por fecha (cuántos cambios suyos llegaron después de su última compilación o instalación).
 */
async function leerTira(raiz: string, principal: string, cabeza: Evento | undefined, o: OpcionesHistoria): Promise<Tira | undefined> {
  if (!cabeza) return undefined
  let web: Lugar = { estado: 'sin-verificar', nota: 'No encontré la copia que sirve la app.' }
  if (o.dirDespliegue) {
    const d = (await gitQuizas(o.dirDespliegue, ['rev-parse', 'HEAD']))?.trim()
    if (d && SHA.test(d) && await gitQuizas(raiz, ['cat-file', '-e', `${d}^{commit}`]) != null) {
      const faltan = await contar(raiz, [`${d}..${principal}`, '--', ...RUTAS_WEB])
      const cuando = (await gitQuizas(raiz, ['show', '-s', '--format=%aI', d]))?.trim()
      web = { estado: faltan ? 'faltan' : 'al-dia', faltan, corto: d.slice(0, 7), ...(cuando ? { cuando } : {}) }
    }
  }
  const compilado = await mtime(process.env.ARBRAIN_SERVER_DIST || path.join(raiz, 'arbrain', 'server', 'dist'))
  const servidor: Lugar = compilado
    ? { estado: 'sin-verificar', estimado: true, cuando: compilado, faltan: await contar(raiz, [`--since=${compilado}`, principal, '--', ...RUTAS_SERVIDOR]), nota: 'Sin marca de versión: se estima por la fecha de su última compilación.' }
    : { estado: 'sin-verificar', nota: 'Sin marca de versión ni compilación en esta copia.' }
  const instalada = await mtime(process.env.ARBRAIN_APP_ESCRITORIO || '/Applications/Arbrain.app')
  const escritorio: Lugar = instalada
    ? { estado: 'sin-verificar', estimado: true, cuando: instalada, faltan: await contar(raiz, [`--since=${instalada}`, principal, '--', ...RUTAS_ESCRITORIO]), nota: 'Sin marca de versión: se estima por la fecha de instalación.' }
    : { estado: 'sin-verificar', nota: 'No encontré la app de escritorio instalada.' }
  return { principal: { corto: cabeza.corto, cuando: cabeza.cuando, frase: cabeza.frase }, web, servidor, escritorio }
}

/** «Hecho»: documentos de obra y secciones nuevas que llegaron al cerebro principal, más los trabajos incorporados. */
async function leerHecho(raiz: string, principal: string, eventos: Evento[]): Promise<Hecho[]> {
  // Sin --first-parent: el entregable se atribuye a quien lo escribió, no a la junta o la sincronía que lo trajo.
  const [txt, encargos] = await Promise.all([
    gitQuizas(raiz, ['log', '--no-merges', '--diff-filter=A', '--numstat', `--format=${FORMATO_LOG}`, '-n', '120', principal, '--', 'docs/builds', 'arbrain/src/app/(main)']),
    titulosEncargos(raiz),
  ])
  const out: Hecho[] = []
  for (const c of parsearLog(txt ?? '')) {
    const ev = eventoDe(c)
    for (const a of c.archivos) {
      const tipo = tipoHecho(a.ruta)
      if (!tipo || !visible(a.ruta)) continue
      const texto = await readFile(path.join(raiz, a.ruta), 'utf8').then(t => t.slice(0, 4000)).catch(() => null)
      let titulo = tituloHecho(a.ruta, texto)
      // «# REPORTE» solo no dice de qué: lleva el nombre de su obra.
      const obra = /^docs\/builds\/([^/]+)\//.exec(a.ruta)?.[1]?.replace(/-\d{4}-\d{2}-\d{2}$/, '')
      if (obra && /^[A-ZÁÉÍÓÚÑ0-9 _-]{3,30}$/.test(titulo)) titulo = `${titulo.charAt(0)}${titulo.slice(1).toLowerCase()} · ${nombreTrabajo(obra, { titulo: encargos.get(obra) })}`
      out.push({ tipo, titulo, cuando: c.fecha, quienNombre: ev.quienNombre, sha: c.sha, ruta: a.ruta })
    }
  }
  for (const e of eventos) if (e.tipo === 'junta') {
    const nombre = /«([^»]+)»/.exec(e.frase)?.[1]
    if (nombre) out.push({ tipo: 'trabajo', titulo: nombre, cuando: e.cuando, quienNombre: e.quienNombre, sha: e.sha })
  }
  return ordenarHecho(out).slice(0, 60)
}

/** Los trabajos en paralelo: cada copia de trabajo de un agente y las ramas con movimiento de los últimos 3 días. */
export async function leerCarriles(raiz: string, o: { ahora?: number } = {}): Promise<{ carriles: Carril[]; avisos: string[] }> {
  const ahora = o.ahora ?? Date.now()
  const avisos: string[] = []
  const principal = await ramaPrincipal(raiz)
  const [lp, wt, refsTxt, juntasTxt] = await Promise.all([
    git(raiz, ['rev-list', '--first-parent', '-n', '2000', principal]),
    git(raiz, ['worktree', 'list', '--porcelain']),
    git(raiz, ['for-each-ref', '--sort=-committerdate', '--count=200', '--format=%(refname:short)%09%(committerdate:iso-strict)', 'refs/heads']),
    git(raiz, ['log', '--first-parent', '--merges', '-n', '300', '--format=%aI%x1f%s%x1f%P', principal]),
  ])
  const encargos = await titulosEncargos(raiz)
  const lineaPrincipal = new Set(lp.split('\n').filter(Boolean))
  const copias = parsearWorktrees(wt)
  const enCopia = new Map(copias.filter(c => c.rama && c.rama !== principal).map(c => [c.rama!, c]))
  const recientes = refsTxt.split('\n').filter(Boolean).map(l => l.split('\t')).filter(([r, f]) => r !== principal && !enCopia.has(r) && ahora - Date.parse(f) < 3 * 864e5).map(([r]) => r).slice(0, 12)
  const ramas = [...enCopia.keys(), ...recientes].slice(0, 48)

  const juntas = juntasTxt.split('\n').filter(Boolean).map(l => { const [cuando, asunto, padres] = l.split('\x1f'); return { cuando, rama: fraseDe(asunto ?? '').rama, padres: (padres ?? '').split(' ').filter(Boolean) } })
  const fechaDe = async (rev: string | null | undefined) => rev ? (await gitQuizas(raiz, ['show', '-s', '--format=%aI', rev]))?.trim() || undefined : undefined
  type Crudo = CarrilCrudo & { recienCreado: boolean; asuntos: { cuando: string; asunto: string }[]; salio?: string }
  const crudos = await enTandas(ramas, 8, async (rama): Promise<Crudo | null> => {
    const copia = enCopia.get(rama)
    const j = juntas.find(x => x.rama === rama)
    const [cuenta, sg, u, puntaTxt, propios, base] = await Promise.all([
      gitQuizas(raiz, ['rev-list', '--left-right', '--count', `${principal}...${rama}`]),
      copia ? sinGuardarEn(copia.ruta) : Promise.resolve(0),
      gitQuizas(raiz, ['log', '-1', '--format=%aI%x1f%an%x1f%ae%x1f%B', rama]),
      gitQuizas(raiz, ['rev-parse', rama]),
      j && j.padres.length > 1
        ? gitQuizas(raiz, ['log', '--no-merges', '-n', '12', '--format=%aI%x1f%s', j.padres[1], `^${j.padres[0]}`])
        : gitQuizas(raiz, ['log', '--first-parent', '--no-merges', '-n', '12', '--format=%aI%x1f%s', rama, `^${principal}`]),
      // De dónde salió: el punto común con main (para uno ya incorporado, el de su junta).
      j && j.padres.length > 1 ? gitQuizas(raiz, ['merge-base', j.padres[0], j.padres[1]]) : gitQuizas(raiz, ['merge-base', principal, rama]),
    ])
    let lineas = (propios ?? '').split('\n').filter(Boolean)
    // Ya en main sin junta (avance rápido): de lo suyo solo se sabe con certeza su último cambio.
    if (!lineas.length) lineas = ((await gitQuizas(raiz, ['log', '--no-merges', '-n', '1', '--format=%aI%x1f%s', rama])) ?? '').split('\n').filter(Boolean)
    const asuntos = lineas.map(l => { const [cuando, ...a] = l.split('\x1f'); return { cuando, asunto: a.join('\x1f') } })
    const salio = await fechaDe(base?.trim())
    if (!cuenta) return null
    const [atras, adelante] = cuenta.trim().split(/\s+/).map(Number)
    if (sg == null) avisos.push('Una copia de trabajo tardó en responder: cuenta como sin cambios abiertos.')
    const [cuando, autor, correo, ...msg] = (u ?? '').split('\x1f')
    const punta = puntaTxt?.trim() ?? ''
    // Una rama cuya punta es un commit de la línea de main pudo no haber hecho nada (recién creada) o haberse juntado por
    // avance rápido. Su registro lo dice: una sola entrada = nació y no guardó nada propio.
    const registro = !adelante && lineaPrincipal.has(punta) ? (await gitQuizas(raiz, ['reflog', 'show', '--format=%H', '-n', '3', `refs/heads/${rama}`]))?.split('\n').filter(Boolean).length ?? 1 : 2
    return {
      rama, ...(copia ? { copia: path.basename(copia.ruta) } : {}), adelante: adelante || 0, atras: atras || 0, sinGuardar: sg ?? 0,
      ultimo: u ? { cuando, autor, correo, mensaje: msg.join('\x1f').trim() } : null,
      recienCreado: registro <= 1, asuntos, ...(salio ? { salio } : {}),
    }
  })
  const carriles = ordenarCarriles(crudos.flatMap(c => {
    if (!c) return []
    const nombre = nombreTrabajo(c.rama, { titulo: encargos.get(sufijo(c.rama)), asuntos: c.asuntos.map(a => a.asunto) })
    const carril = carrilDe(c, ahora, nombre)
    if (c.salio) carril.salio = c.salio
    carril.recientes = c.recienCreado ? [] : c.asuntos.slice(0, 3).map(a => ({ cuando: a.cuando, frase: fraseDe(a.asunto).frase }))
    if (c.recienCreado) { carril.ultimo = carril.ultimo && { ...carril.ultimo, frase: 'Recién empezado: todavía no guarda cambios propios' }; if (carril.estado === 'en-main') carril.estado = 'esperando' }
    const j = juntas.find(x => x.rama === c.rama)
    if (j) carril.juntado = j.cuando
    return [carril]
  }))
  // «Se puso al día con…» dicho con el nombre legible del otro trabajo, no con su carpeta.
  const nombres = new Map(carriles.map(c => [c.rama, c.nombre]))
  const alDia = (asunto: string) => { const f = fraseDe(asunto); return f.tipo === 'trae' && f.rama ? `Se puso al día con ${esMain(f.rama) ? 'tu cerebro principal' : `«${nombres.get(f.rama) ?? nombreCarril(f.rama)}»`}` : null }
  for (const c of carriles) {
    const crudo = crudos.find(x => x?.rama === c.rama)
    const t = crudo?.ultimo ? alDia(crudo.ultimo.mensaje) : null
    if (t && c.ultimo) c.ultimo = { ...c.ultimo, frase: t }
  }
  return { carriles, avisos }
}

// ── El grafo técnico (Taller › Historia, 28 oct 2026) ──

/**
 * El historial como lo pinta VS Code: los últimos commits de main y de las ramas vivas (las de un worktree y las que se movieron
 * en 3 días), en orden de fecha, con sus padres para dibujar los carriles y sus +/− y archivos (de un merge, contra su primer
 * padre: lo que trajo). Solo lee.
 */
export async function leerGrafo(raiz: string, o: { ahora?: number; limite?: number } = {}): Promise<Grafo> {
  const ahora = o.ahora ?? Date.now(), limite = Math.min(Math.max(o.limite ?? 80, 10), 300)
  const principal = await ramaPrincipal(raiz)
  const [wt, refsTxt] = await Promise.all([
    git(raiz, ['worktree', 'list', '--porcelain']),
    git(raiz, ['for-each-ref', '--sort=-committerdate', '--count=300', '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)', 'refs/heads']),
  ])
  const copias = parsearWorktrees(wt)
  const carpetas = new Map(copias.filter(c => c.rama).map(c => [c.rama!, path.basename(c.ruta)]))
  const puntas = refsTxt.split('\n').filter(Boolean).map(l => { const [rama, sha, fecha] = l.split('\t'); return { rama, sha, fecha } })
  // Las ramas que se dibujan: main, las que viven en un worktree y las que se movieron en 3 días (tope 24 para que se lea).
  const vivas = puntas.filter(p => p.rama === principal || carpetas.has(p.rama) || ahora - Date.parse(p.fecha) < 3 * 864e5).slice(0, 25)
  if (!vivas.some(p => p.rama === principal)) { const m = puntas.find(p => p.rama === principal); if (m) vivas.unshift(m) }
  const crudo = parsearLog(await git(raiz, ['log', '--date-order', '--diff-merges=first-parent', '--numstat', `--format=${FORMATO_LOG}`, '-n', String(limite), ...vivas.map(p => p.sha)], { timeout: 30_000 }))
  const refs = refsPorCommit(vivas, principal, carpetas)
  const commits: CommitGrafo[] = crudo.map(c => {
    const ev = eventoDe(c)
    return {
      sha: c.sha, corto: c.sha.slice(0, 7), padres: c.padres, asunto: c.mensaje.split('\n').find(l => l.trim())?.trim() ?? '',
      quien: ev.quien, quienNombre: ev.quienNombre, cuando: c.fecha,
      archivos: c.archivos.length, mas: c.archivos.reduce((s, a) => s + a.mas, 0), menos: c.archivos.reduce((s, a) => s + a.menos, 0),
      refs: refs.get(c.sha) ?? [],
    }
  })
  const { filas, ancho } = carrilesGrafo(commits)
  const dibujadas = vivas.filter(p => p.rama !== principal)
  return {
    commits, filas, ancho, ramas: dibujadas.length, worktrees: dibujadas.filter(p => carpetas.has(p.rama)).length,
    leidoEn: new Date(ahora).toISOString(), avisos: [],
  }
}

// ── Un cambio por dentro ──

async function commitDe(raiz: string, sha: string) {
  if (!SHA.test(sha)) throw new ErrorHistoria('Ese cambio no existe.', 404)
  const completo = (await gitQuizas(raiz, ['rev-parse', '--verify', '-q', `${sha}^{commit}`]))?.trim()
  if (!completo) throw new ErrorHistoria('Ese cambio no existe en este repo.', 404)
  const [c] = parsearLog(await git(raiz, ['show', '-s', `--format=${FORMATO_LOG}`, completo]))
  if (!c) throw new ErrorHistoria('No pude leer ese cambio.', 503)
  return { c, padre: c.padres[0] ?? VACIO }
}

interface Cambiado { ruta: string; estado: 'nuevo' | 'borrado' | 'cambiado'; mas: number; menos: number; binario: boolean }

async function cambiados(raiz: string, desde: string, hasta: string): Promise<Cambiado[]> {
  const [ns, num] = await Promise.all([
    git(raiz, ['diff', '--name-status', '--no-renames', '-z', desde, hasta]),
    git(raiz, ['diff', '--numstat', '--no-renames', '-z', desde, hasta]),
  ])
  const estados = new Map<string, Cambiado['estado']>()
  const p = ns.split('\0')
  for (let i = 0; i + 1 < p.length; i += 2) estados.set(p[i + 1], p[i] === 'A' ? 'nuevo' : p[i] === 'D' ? 'borrado' : 'cambiado')
  const out: Cambiado[] = []
  for (const reg of num.split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t([^]+)$/.exec(reg)
    if (!m) continue
    out.push({ ruta: m[3], estado: estados.get(m[3]) ?? 'cambiado', mas: m[1] === '-' ? 0 : Number(m[1]), menos: m[2] === '-' ? 0 : Number(m[2]), binario: m[1] === '-' })
  }
  return out
}

const TOPE_TEXTO = 30
const TOPE_LINEAS = 600

export async function leerDiff(raiz: string, sha: string): Promise<DiffCambio> {
  const { c, padre } = await commitDe(raiz, sha)
  const lista = await cambiados(raiz, padre, c.sha)
  let textos = 0, recortado = false
  const archivos: ArchivoDiff[] = await enTandas(lista, 6, async a => {
    const tipo = tipoArchivo(a.ruta, a.binario)
    const protegido = !visible(a.ruta)
    const motivo = protegido ? 'Archivo protegido: no se muestra ni se regresa desde aquí.' : motivoNoRegresable(a.ruta) ?? undefined
    const base: ArchivoDiff = { ruta: a.ruta, area: areaDe(a.ruta), tipo, estado: a.estado, mas: a.mas, menos: a.menos, regresable: !motivo, ...(motivo ? { motivo } : {}), ...(protegido ? { protegido } : {}) }
    if (tipo !== 'texto' || protegido) return base
    if (++textos > TOPE_TEXTO) { recortado = true; return base }
    const bloques = parsearDiff(await git(raiz, ['diff', '-U3', '--no-renames', padre, c.sha, '--', a.ruta]))
    return { ...base, bloques: recortar(bloques), resumen: resumenTexto(bloques) }
  })
  const ev = eventoDe(c)
  return { sha: c.sha, corto: c.sha.slice(0, 7), frase: ev.frase, cuando: c.fecha, quienNombre: ev.quienNombre, archivos, ...(recortado ? { recortado } : {}) }
}

function recortar(bloques: ReturnType<typeof parsearDiff>) {
  let n = 0
  const out = []
  for (const b of bloques) { if (n >= TOPE_LINEAS) break; const l = b.lineas.slice(0, TOPE_LINEAS - n); n += l.length; out.push({ ...b, lineas: l }) }
  return out
}

/** El diff de UN archivo de código, cuando se despliega. */
export async function leerDiffArchivo(raiz: string, sha: string, ruta: string): Promise<{ bloques: ReturnType<typeof parsearDiff>; resumen: string }> {
  const { c, padre } = await commitDe(raiz, sha)
  const a = (await cambiados(raiz, padre, c.sha)).find(x => x.ruta === ruta)
  if (!a) throw new ErrorHistoria('Ese archivo no cambió en este cambio.', 404)
  if (!visible(ruta)) throw new ErrorHistoria('Archivo protegido: no se muestra desde aquí.', 403)
  if (a.binario) return { bloques: [], resumen: 'Archivo binario (imagen u otro): no se muestra como texto.' }
  return { bloques: recortar(parsearDiff(await git(raiz, ['diff', '-U3', '--no-renames', padre, c.sha, '--', ruta]))), resumen: resumenCodigo([a]) }
}

// ── Volver ──

type Plan = { previa: PreviaVolver; c: Awaited<ReturnType<typeof commitDe>>['c']; padre: string; acciones: { ruta: string; accion: 'restaura' | 'borra' | 'crea'; modo: string | null }[] }

async function modoEn(raiz: string, rev: string, ruta: string): Promise<string | null> {
  const s = (await git(raiz, ['ls-tree', '-z', rev, '--', ruta])).split('\0')[0]
  return s ? s.split(' ')[0] : null
}

async function planVolver(raiz: string, sha: string, rutas?: string[]): Promise<Plan> {
  const { c, padre } = await commitDe(raiz, sha)
  const lista = await cambiados(raiz, padre, c.sha)
  const pedidas = rutas?.length ? [...new Set(rutas)] : lista.map(a => a.ruta)
  if (pedidas.length > 50) throw new ErrorHistoria('Demasiados archivos para volver de una vez.', 400)
  const raizReal = await realpath(raiz)
  const rechazados: PreviaVolver['rechazados'] = []
  const archivos: PreviaVolver['archivos'] = []
  const acciones: Plan['acciones'] = []
  for (const ruta of pedidas) {
    const no = (motivo: string) => { rechazados.push({ ruta, motivo }) }
    const motivo = motivoNoRegresable(ruta)
    if (motivo) { no(motivo); continue }
    if (!visible(ruta)) { no('Archivo protegido: no se regresa desde aquí.'); continue }
    if (!lista.some(a => a.ruta === ruta)) { no('Ese archivo no cambió en este cambio.'); continue }
    // Ni enlaces ni carpetas que salgan del repo.
    const abs = path.resolve(raizReal, ruta)
    if (!abs.startsWith(raizReal + path.sep)) { no('Ruta fuera del repo.'); continue }
    const dirReal = await realpath(path.dirname(abs)).catch(() => null)
    if (dirReal && !(dirReal + path.sep).startsWith(raizReal + path.sep)) { no('La carpeta apunta fuera del repo.'); continue }
    const st = await lstat(abs).catch(() => null)
    if (st?.isSymbolicLink()) { no('Es un enlace: no se regresa desde aquí.'); continue }
    const sucio = await git(raiz, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ruta])
    if (sucio.replace(/\0/g, '').trim()) { no('Tiene cambios sin guardar. Espera a que se guarden antes de volver.'); continue }
    const [modoAntes, modoAhora] = await Promise.all([modoEn(raiz, padre, ruta), modoEn(raiz, 'HEAD', ruta)])
    if ([modoAntes, modoAhora].some(m => m && m !== '100644' && m !== '100755')) { no('No es un archivo de texto normal.'); continue }
    if (!modoAntes && !modoAhora) { no('Ya está como estaba antes de ese cambio.'); continue }
    if (modoAntes && modoAhora) {
      const [a, b] = await Promise.all([git(raiz, ['rev-parse', `${padre}:${ruta}`]), git(raiz, ['rev-parse', `HEAD:${ruta}`])])
      if (a.trim() === b.trim()) { no('Ya está como estaba antes de ese cambio.'); continue }
    }
    const accion = !modoAntes ? 'borra' : !modoAhora ? 'crea' : 'restaura'
    const diff = accion === 'crea'
      ? await git(raiz, ['diff', '-U3', VACIO, padre, '--', ruta])
      : await git(raiz, ['diff', '-U3', 'HEAD', ...(accion === 'borra' ? [VACIO] : [padre]), '--', ruta])
    const bloques = parsearDiff(diff)
    archivos.push({ ruta, accion, bloques: recortar(bloques), resumen: accion === 'borra' ? 'Este archivo no existía antes: se quita.' : accion === 'crea' ? 'Este archivo se había borrado: vuelve.' : resumenTexto(bloques) })
    acciones.push({ ruta, accion, modo: modoAntes })
  }
  const frase = eventoDe(c).frase
  return { previa: { sha: c.sha, frase, titulo: tituloVolver(frase), archivos, rechazados }, c, padre, acciones }
}

export async function previaVolver(raiz: string, sha: string, rutas?: string[]): Promise<PreviaVolver> {
  return (await planVolver(raiz, sha, rutas)).previa
}

let candado: Promise<unknown> = Promise.resolve()

/** Crea el commit «Volver: …». Todo o nada: si un archivo no se puede, no se toca ninguno. */
export function hacerVolver(raiz: string, sha: string, rutas?: string[]): Promise<{ sha: string; corto: string; titulo: string; rutas: string[] }> {
  const turno = candado.then(() => volverAhora(raiz, sha, rutas))
  candado = turno.catch(() => undefined)
  return turno
}

async function volverAhora(raiz: string, sha: string, rutas?: string[]) {
  const plan = await planVolver(raiz, sha, rutas)
  if (plan.previa.rechazados.length) throw new ErrorHistoria(plan.previa.rechazados.map(r => `${r.ruta}: ${r.motivo}`).join(' '), 409)
  if (!plan.acciones.length) throw new ErrorHistoria('No hay nada que regresar.', 409)
  if (!(await gitQuizas(raiz, ['symbolic-ref', '-q', 'HEAD']))) throw new ErrorHistoria('Tu cerebro principal no está en un trabajo con nombre ahora mismo: no se puede guardar el regreso.', 409)
  const raizReal = await realpath(raiz)
  const hechas: typeof plan.acciones = []
  try {
    for (const a of plan.acciones) {
      const abs = path.join(raizReal, a.ruta)
      if (a.accion === 'borra') await git(raiz, ['rm', '-q', '--', a.ruta])
      else {
        const r = await correr(raiz, ['cat-file', 'blob', `${plan.padre}:${a.ruta}`])
        if (r.codigo !== 0) throw new ErrorHistoria('No pude leer la versión anterior.', 503)
        await mkdir(path.dirname(abs), { recursive: true })
        await writeFile(abs, r.salida)
        await chmod(abs, a.modo === '100755' ? 0o755 : 0o644)
        await git(raiz, ['add', '--', a.ruta])
      }
      hechas.push(a)
    }
    const mensaje = mensajeVolver({ frase: plan.previa.frase, sha: plan.c.sha, cuando: plan.c.fecha, rutas: plan.acciones.map(a => a.ruta) })
    await git(raiz, ['commit', '-q', '-F', '-', '--', ...plan.acciones.map(a => a.ruta)], { entrada: mensaje, timeout: 60_000 })
  } catch (e) {
    // Deja los archivos exactamente como estaban (estaban limpios: HEAD es su verdad).
    for (const a of hechas) {
      if (a.accion === 'crea') { await gitQuizas(raiz, ['rm', '-q', '--cached', '--', a.ruta]); await rm(path.join(raizReal, a.ruta), { force: true }) }
      else await gitQuizas(raiz, ['restore', '--source=HEAD', '--staged', '--worktree', '--', a.ruta])
    }
    throw e instanceof ErrorHistoria ? e : new ErrorHistoria(e instanceof Error ? e.message : 'No se pudo guardar el regreso.', 503)
  }
  const nuevo = (await git(raiz, ['rev-parse', 'HEAD'])).trim()
  return { sha: nuevo, corto: nuevo.slice(0, 7), titulo: plan.previa.titulo, rutas: plan.acciones.map(a => a.ruta) }
}

