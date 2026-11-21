/**
 * Extensiones · la tienda en el daemon (21 nov 2026, fase 2 del SPEC `docs/builds/extensiones-2026-11-20/SPEC.md` §3).
 *
 * Arbrain no reimplementa nada: llama al CLI de Claude Code (`claude plugin …`) con la carpeta del cerebro como carpeta
 * de trabajo y la configuración de Claude Code del dueño (la misma con que el daemon abre sus conversaciones), en el
 * ámbito `local`. Vive en el daemon y no en la web porque el daemon es quien sabe esa carpeta y es dueño del scheduler:
 * así la instalación de Daniel y la del alumno son la misma (y la web, aunque viva en otra máquina, solo pinta).
 *
 *   GET  /extensiones                        catálogo + lo instalado + requisitos + llaves (si están, nunca su valor) + tareas
 *   POST /extensiones/<id>/instalar          {consentimiento?, llaves?}  requisitos → permisos → install → alta de tareas
 *   POST /extensiones/<id>/actualizar        marketplace update → plugin update → tareas al día
 *   POST /extensiones/<id>/quitar            baja de tareas → uninstall (los datos del dueño se quedan en su cerebro)
 *   POST /extensiones/<id>/llaves            {llaves: {clave: valor}}  guarda solo las que la extensión declara
 *   GET  /extensiones/<id>/fuente?f=ext:…    la fuente `ext:` del panel (solo lo declarado; lo demás `negado`)
 *   GET  /extensiones/<id>/panel/<ruta>      un archivo de `panel/` de la versión instalada (la web lo sirve aislado)
 *
 * Freno (SPEC §3.3): una extensión con `permisos.programa` (tareas que corren solas) exige `consentimiento: true`, el «Sí»
 * del dueño en la tienda; sin él no se instala (409). Solo la app llega aquí (el pase de agente no: server.ts).
 */
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  archivoDelPanel, carpetaCatalogoConocida, catalogoDeclarado, dirDatos, fuenteCatalogo, guardarLlaves, leerCatalogo,
  leerInstaladas, llavesGuardadas, manifiestoDe, resolverFuenteExt, skillsDelCerebro, type EntradaCatalogo, type FuenteCatalogo,
} from './disco.js'
import { cumpleVersion, esNombreExtension, idTarea, MARKETPLACE, type Manifiesto } from './modelo.js'
import { buscarPrograma, darDeAlta, darDeBaja, rutaDeBusqueda, type AlmacenTareas } from './tareas.js'
import { tr } from '../i18n/tr.js'

type Env = Record<string, string | undefined>

export interface SalidaCli { codigo: number; salida: string }
export interface DepsTienda {
  cerebro: string
  configDir: string
  archivoLlaves: string
  env: Env
  /** Dónde se busca una fuente relativa del catálogo (el cerebro y el repo de Arbrain). */
  raicesCatalogo: string[]
  versionArbrain: string | null
  claude: (args: string[]) => Promise<SalidaCli>
  tareas: AlmacenTareas
  proxima: (cron: string) => number
  programa?: (nombre: string) => string | null
}

export type Respuesta = { status: number; json: unknown } | { status: number; archivo: { bytes: Buffer; tipo: string; ext: string } }

// ── El CLI de Claude Code ──

/** El binario de Claude Code: `CLAUDE_BIN`, el del SDK que usa el daemon (misma versión que sus conversaciones) o el del PATH. */
export function binarioClaude(env: Env = process.env): string | null {
  if (env.CLAUDE_BIN && existsSync(env.CLAUDE_BIN)) return env.CLAUDE_BIN
  try {
    const req = createRequire(import.meta.url)
    const p = req.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`).replace(/package\.json$/, '')
    const b = join(p, process.platform === 'win32' ? 'claude.exe' : 'claude')
    if (existsSync(b)) return b
  } catch { /* sin el paquete nativo del SDK */ }
  return buscarPrograma('claude', env as NodeJS.ProcessEnv)
}

/** `claude plugin <args>` en la carpeta del cerebro, con un entorno mínimo (sin tokens del daemon ni llaves). */
export function cliReal(cerebro: string, configDir: string | null, env: Env = process.env): (args: string[]) => Promise<SalidaCli> {
  return args => new Promise(resolve => {
    const bin = binarioClaude(env)
    if (!bin) return resolve({ codigo: 127, salida: tr('No encuentro Claude Code en esta computadora.') })
    const hijo: Record<string, string> = { PATH: rutaDeBusqueda(env as NodeJS.ProcessEnv).join(process.platform === 'win32' ? ';' : ':') }
    for (const k of ['HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) if (env[k]) hijo[k] = env[k]!
    if (configDir) hijo.CLAUDE_CONFIG_DIR = configDir
    hijo.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    execFile(bin, ['plugin', ...args], { cwd: cerebro, env: hijo, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const salida = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`.trim()
      resolve({ codigo: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0, salida })
    })
  })
}

/** Lo que dice el CLI, sin rutas de la máquina ni colores, para mostrarlo en una línea. */
const limpiar = (s: string, d: DepsTienda) =>
  s.replace(/\x1b\[[0-9;]*m/g, '').split(d.cerebro).join('<cerebro>').split(d.configDir).join('<config>').replace(/[✔✘]\s*/g, '').trim().slice(-600)

// ── Estado ──

interface Requisito { tipo: 'arbrain' | 'skill' | 'programa' | 'extension'; nombre: string; ok: boolean | null; ayuda?: string }

function catalogo(d: DepsTienda): { fuente: FuenteCatalogo | null; dir: string | null; declarado: boolean } {
  const fuente = fuenteCatalogo(d.env, d.raicesCatalogo)
  const declarado = !!catalogoDeclarado(d.cerebro)
  const dir = fuente?.tipo === 'carpeta' ? fuente.ruta : declarado ? carpetaCatalogoConocida(d.configDir) : null
  return { fuente, dir, declarado }
}

function requisitos(m: Manifiesto, d: DepsTienda, instaladas: Set<string>, enCatalogo: Set<string>): Requisito[] {
  const prog = d.programa ?? ((n: string) => buscarPrograma(n, d.env as NodeJS.ProcessEnv))
  const skills = skillsDelCerebro(d.cerebro)
  const out: Requisito[] = []
  if (m.requiere.arbrain) {
    const ok = cumpleVersion(m.requiere.arbrain, d.versionArbrain)
    out.push({ tipo: 'arbrain', nombre: m.requiere.arbrain, ok, ...(ok === false ? { ayuda: tr('Actualiza Arbrain para instalarla.') } : {}) })
  }
  for (const s of m.requiere.skills_base) out.push({ tipo: 'skill', nombre: s, ok: skills.has(s), ...(skills.has(s) ? {} : { ayuda: tr('Tu cerebro ya no tiene esta skill de la base.') }) })
  for (const p of m.requiere.programas) {
    const ok = !!prog(p)
    out.push({ tipo: 'programa', nombre: p, ok, ...(ok ? {} : { ayuda: AYUDA_PROGRAMA[p] ? tr(AYUDA_PROGRAMA[p]) : tr('Instálalo y vuelve a intentar.') }) })
  }
  for (const e of m.requiere.extensiones) {
    const ok = instaladas.has(e) || enCatalogo.has(e)
    out.push({ tipo: 'extension', nombre: e, ok, ...(ok ? {} : { ayuda: tr('No está en el catálogo.') }) })
  }
  return out
}
const AYUDA_PROGRAMA: Record<string, string> = {
  python3: 'Instala Python 3 (python.org o, en Mac, «brew install python»).',
  'yt-dlp': 'Instala yt-dlp («brew install yt-dlp» en Mac o «pip install yt-dlp»).',
}


function vista(e: EntradaCatalogo | null, id: string, d: DepsTienda, inst: ReturnType<typeof leerInstaladas>, enCatalogo: Set<string>) {
  const instalada = inst.get(id) ?? null
  const mInst = instalada ? manifiestoDe(instalada.installPath) : null
  const m = mInst ?? e?.manifiesto ?? null
  const filas = d.tareas.listar()
  const llaves = m ? llavesGuardadas(m, d.archivoLlaves, d.env) : {}
  return {
    id,
    nombre: e?.nombre ?? m?.nombre ?? id,
    descripcion: e?.descripcion ?? m?.resumen ?? '',
    acerca: e?.acerca ?? null,
    categoria: e?.categoria ?? null,
    etiquetas: e?.etiquetas ?? [],
    enCatalogo: !!e,
    version: e?.version ?? null,
    valida: !!m,
    instalada: instalada ? { version: instalada.version, desde: instalada.instaladaEn, ambito: instalada.scope } : null,
    actualizable: !!(instalada && e?.version && instalada.version && e.version !== instalada.version),
    manifiesto: m,
    requisitos: m ? requisitos(m, d, new Set(inst.keys()), enCatalogo) : [],
    llaves: (m?.requiere.llaves ?? []).map(l => ({ ...l, guardada: !!llaves[l.clave] })),
    tareas: (m?.tareas ?? []).map(t => {
      const f = filas.find(x => x.id === idTarea(id, t.id))
      return { id: t.id, cada: t.cada, alta: !!f, estado: f?.status ?? null, proxima: f?.next_run ?? null, ultima: f?.last_run ?? null, resultado: f?.last_result ? f.last_result.slice(0, 300) : null }
    }),
  }
}

export function estado(d: DepsTienda) {
  const c = catalogo(d)
  const cat = c.dir ? leerCatalogo(c.dir) : null
  const inst = leerInstaladas(d.configDir, d.cerebro)
  const enCatalogo = new Set((cat?.entradas ?? []).map(e => e.id))
  const extensiones = (cat?.entradas ?? []).map(e => vista(e, e.id, d, inst, enCatalogo))
  // Lo instalado que ya no está en el catálogo también se ve (para poder quitarlo).
  for (const id of inst.keys()) if (!enCatalogo.has(id)) extensiones.push(vista(null, id, d, inst, enCatalogo))
  return {
    catalogo: {
      fuente: c.fuente?.dicha ?? null,
      tipo: c.fuente?.tipo ?? null,
      conectado: c.declarado,
      disponible: !!cat,
      version: cat?.version ?? null,
      ...(!c.fuente ? { error: tr('No encuentro el catálogo de extensiones en esta instalación.') } : !cat && c.fuente.tipo === 'remoto' ? { error: tr('El catálogo se descarga al conectarlo.') } : {}),
    },
    arbrain: { version: d.versionArbrain },
    extensiones,
  }
}

// ── Acciones ──

const NO = (status: number, error: string, extra: Record<string, unknown> = {}): Respuesta => ({ status, json: { ok: false, error, ...extra } })

async function conectar(d: DepsTienda): Promise<Respuesta | null> {
  const c = catalogo(d)
  if (c.declarado) return null
  if (!c.fuente) return NO(503, tr('No encuentro el catálogo de extensiones en esta instalación.'))
  const r = await d.claude(['marketplace', 'add', c.fuente.tipo === 'carpeta' ? c.fuente.ruta : c.fuente.spec, '--scope', 'local'])
  if (r.codigo !== 0) return NO(502, tr('Claude Code no pudo conectar el catálogo: {detalle}', { detalle: limpiar(r.salida, d) }))
  return null
}

function altaTareas(id: string, d: DepsTienda) {
  const inst = leerInstaladas(d.configDir, d.cerebro).get(id)
  const m = inst ? manifiestoDe(inst.installPath) : null
  if (!m) return { altas: [], iguales: [], bajas: darDeBaja(id, d.tareas), invalidas: [] }
  return darDeAlta(id, m, d.tareas, d.proxima)
}

async function instalar(id: string, cuerpo: Record<string, unknown>, d: DepsTienda, cadena: string[] = []): Promise<Respuesta> {
  const c = catalogo(d)
  const cat = c.dir ? leerCatalogo(c.dir) : null
  if (!cat && !c.declarado && c.fuente?.tipo === 'remoto') {
    const e = await conectar(d); if (e) return e
    return instalar(id, cuerpo, d, cadena)
  }
  const entrada = cat?.entradas.find(e => e.id === id)
  if (!entrada) return NO(404, tr('Esa extensión no está en el catálogo.'))
  const m = entrada.manifiesto
  if (!m) return NO(422, tr('Esa extensión no trae un arbrain.json válido: no se instala.'))
  const inst = leerInstaladas(d.configDir, d.cerebro)
  const faltan = requisitos(m, d, new Set(inst.keys()), new Set(cat!.entradas.map(e => e.id))).filter(r => r.ok === false)
  if (faltan.length) return NO(422, tr('Falta algo para instalar «{nombre}».', { nombre: m.nombre }), { faltan })
  const nuevas = (cuerpo.llaves && typeof cuerpo.llaves === 'object' && !Array.isArray(cuerpo.llaves) ? cuerpo.llaves : {}) as Record<string, unknown>
  const guardadas = llavesGuardadas(m, d.archivoLlaves, d.env)
  const sinLlave = m.requiere.llaves.filter(l => !l.opcional && !guardadas[l.clave] && !(typeof nuevas[l.clave] === 'string' && (nuevas[l.clave] as string).trim()))
  if (sinLlave.length) return NO(422, tr('Falta la llave que pide «{nombre}».', { nombre: m.nombre }), { faltanLlaves: sinLlave.map(l => l.clave) })
  if (m.permisos.programa && cuerpo.consentimiento !== true) {
    return NO(409, tr('«{nombre}» trae tareas que corren solas: necesita tu «Sí» en la tienda.', { nombre: m.nombre }), { necesitaConsentimiento: true })
  }
  // Primero las extensiones de las que depende (una vez cada una; sin ciclos).
  for (const dep of m.requiere.extensiones) {
    if (inst.has(dep) || cadena.includes(dep)) continue
    const r = await instalar(dep, { consentimiento: cuerpo.consentimiento }, d, [...cadena, id])
    if (r.status !== 200) return NO(r.status, tr('No pude instalar «{dep}», de la que depende.', { dep }), { causa: 'json' in r ? r.json : null })
  }
  guardarLlaves(d.archivoLlaves, m, nuevas)
  const e = await conectar(d); if (e) return e
  const r = await d.claude(['install', `${id}@${MARKETPLACE}`, '--scope', 'local'])
  if (r.codigo !== 0) return NO(502, tr('Claude Code no pudo instalarla: {detalle}', { detalle: limpiar(r.salida, d) }))
  const tareas = altaTareas(id, d)
  return { status: 200, json: { ok: true, id, tareas, nota: tr('Entra en tu siguiente conversación con Levy.') } }
}

async function actualizar(id: string, d: DepsTienda): Promise<Respuesta> {
  if (!leerInstaladas(d.configDir, d.cerebro).has(id)) return NO(404, tr('Esa extensión no está instalada.'))
  const e = await conectar(d); if (e) return e
  const a = await d.claude(['marketplace', 'update', MARKETPLACE])
  if (a.codigo !== 0) return NO(502, tr('Claude Code no pudo leer el catálogo: {detalle}', { detalle: limpiar(a.salida, d) }))
  const r = await d.claude(['update', `${id}@${MARKETPLACE}`, '--scope', 'local'])
  if (r.codigo !== 0) return NO(502, tr('Claude Code no pudo actualizarla: {detalle}', { detalle: limpiar(r.salida, d) }))
  return { status: 200, json: { ok: true, id, version: leerInstaladas(d.configDir, d.cerebro).get(id)?.version ?? null, tareas: altaTareas(id, d) } }
}

async function quitar(id: string, d: DepsTienda): Promise<Respuesta> {
  const bajas = darDeBaja(id, d.tareas)
  if (!leerInstaladas(d.configDir, d.cerebro).has(id)) return { status: 200, json: { ok: true, id, bajas, yaNoEstaba: true } }
  const r = await d.claude(['uninstall', `${id}@${MARKETPLACE}`, '--scope', 'local', '-y'])
  if (r.codigo !== 0 && leerInstaladas(d.configDir, d.cerebro).has(id)) return NO(502, tr('Claude Code no pudo quitarla: {detalle}', { detalle: limpiar(r.salida, d) }), { bajas })
  return { status: 200, json: { ok: true, id, bajas, nota: tr('Tus datos se quedan en tu cerebro.') } }
}

// ── HTTP ──

let fila: Promise<unknown> = Promise.resolve()
/** Una mutación a la vez: dos clics seguidos no corren dos `claude plugin` sobre el mismo settings.local.json. */
function enFila<T>(f: () => Promise<T>): Promise<T> {
  const p = fila.then(f, f)
  fila = p.catch(() => undefined)
  return p
}

/** El router de `/extensiones*`. null = no es una ruta de extensiones. */
export async function atenderExtensiones(metodo: string, ruta: string, query: URLSearchParams, cuerpo: Record<string, unknown>, d: DepsTienda): Promise<Respuesta | null> {
  if (ruta === '/extensiones') return metodo === 'GET' ? { status: 200, json: estado(d) } : NO(405, tr('Método no permitido.'))
  const m = /^\/extensiones\/([^/]+)\/(instalar|actualizar|quitar|llaves|fuente|panel)(?:\/(.+))?$/.exec(ruta)
  if (!m) return null
  const [, id, accion, resto] = m
  if (!esNombreExtension(id)) return NO(400, tr('Nombre de extensión inválido.'))
  if (accion === 'fuente' || accion === 'panel') {
    if (metodo !== 'GET') return NO(405, tr('Método no permitido.'))
    const inst = leerInstaladas(d.configDir, d.cerebro).get(id)
    if (!inst) return NO(404, tr('Esa extensión no está instalada.'))
    if (accion === 'panel') {
      const a = resto ? archivoDelPanel(inst.installPath, decodeURIComponent(resto)) : null
      return a ? { status: 200, archivo: a } : NO(404, tr('No existe.'))
    }
    return { status: 200, json: resolverFuenteExt(query.get('f'), manifiestoDe(inst.installPath), { cerebro: d.cerebro, datos: dirDatos(d.configDir, id) }) }
  }
  if (metodo !== 'POST' || resto) return NO(405, tr('Método no permitido.'))
  return enFila(async () => {
    if (accion === 'instalar') return instalar(id, cuerpo, d)
    if (accion === 'actualizar') return actualizar(id, d)
    if (accion === 'quitar') return quitar(id, d)
    // llaves
    const c = catalogo(d)
    const inst = leerInstaladas(d.configDir, d.cerebro).get(id)
    const man = inst ? manifiestoDe(inst.installPath) : (c.dir ? leerCatalogo(c.dir).entradas.find(e => e.id === id)?.manifiesto : null) ?? null
    if (!man) return NO(404, tr('Esa extensión no está en el catálogo.'))
    const llaves = cuerpo.llaves && typeof cuerpo.llaves === 'object' && !Array.isArray(cuerpo.llaves) ? cuerpo.llaves as Record<string, unknown> : {}
    return { status: 200, json: { ok: true, guardadas: guardarLlaves(d.archivoLlaves, man, llaves) } }
  })
}
