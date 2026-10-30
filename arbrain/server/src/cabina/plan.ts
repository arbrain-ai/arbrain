/**
 * El encargo como plan versionado en git (29 oct 2026, idea 4 de /tmp/warp-investigacion/REPORTE.md §3; reimplementado
 * desde la descripción del `/plan` de Warp, sin su código).
 *
 * Hasta hoy la doctrina de Daniel (Definición de Terminado verificable, 1:3:1, 25 oct) vivía dentro de un string del
 * registro. Ahora un encargo caro puede nacer como ARCHIVO del repo, `docs/planes/<fecha>-<slug>.md`:
 *
 *  · `delegar {plan: true, …}` escribe el plan (frontmatter con harness, perfil, cwd… y el encargo tal cual), lo
 *    commitea en el checkout principal SOLO con ese archivo (`git commit -- <ruta>`: lo demás que haya en el índice no
 *    viaja) y NO lanza nada. Levy espera el «va».
 *  · Daniel lo abre en el Taller, lo edita (el editor de documentos, con guarda de concurrencia) y ve sus cambios contra
 *    lo propuesto (`compararCon: HEAD`).
 *  · «Correr» (botón del Taller o `delegar {plan: "<ruta>"}`) relee el archivo, commitea la versión editada como
 *    «aprobada» y lanza el subagente con ESE texto. El registro guarda ruta y commit.
 *  · El juez lee la Definición de Terminado del archivo en el commit aprobado (`git show <commit>:<ruta>`), no la que el
 *    modelo recuerde ni la que alguien edite después.
 *
 * Sin commit posible (merge a medias en el checkout, índice ocupado) el plan igual se escribe y corre: `commit` queda
 * null y la respuesta lo dice. Nada aquí empuja (push): el commit sale con el siguiente push del checkout.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { repoPrincipal } from './aislamiento.js'
import { esPerfil, type Perfil } from './perfiles.js'

const run = promisify(execFile)
export const DIR_PLANES = 'docs/planes'

export interface DatosPlan {
  nombre: string; harness: string; cwd: string
  perfil?: Perfil; modelo?: string; esfuerzo?: string; aislamiento?: 'worktree' | 'carpeta'
  /** La conversación que lo propuso («owner|account|conversationId»): al correrlo desde el Taller, su aviso vuelve ahí. */
  avisar?: string
}
export interface Plan extends DatosPlan {
  /** Relativa al repo (`docs/planes/…`). */
  ruta: string
  encargo: string
  propuesto?: string
  descartado?: string
}

export type Git = (args: string[], cwd: string) => Promise<string>
const gitReal: Git = async (args, cwd) => (await run('git', args, { cwd, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })).stdout

/** «Revisar la cohorte de Fulana» → «revisar-la-cohorte-de-fulana» (sin acentos, 60 caracteres). */
export function slugPlan(nombre: string): string {
  const s = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return s || 'plan'
}

const CAMPOS: (keyof DatosPlan | 'propuesto' | 'descartado')[] = ['nombre', 'harness', 'perfil', 'cwd', 'aislamiento', 'modelo', 'esfuerzo', 'avisar', 'propuesto', 'descartado']
/** Un valor de frontmatter en una línea (sin saltos ni «---»). */
const linea = (v: string) => v.replace(/\s*\n\s*/g, ' ').trim()

export function textoPlan(p: Omit<Plan, 'ruta'>): string {
  const datos = CAMPOS.map(k => [k, (p as unknown as Record<string, string | undefined>)[k]] as const).filter(([, v]) => v != null && v !== '')
  return `---\ntipo: plan-de-encargo\n${datos.map(([k, v]) => `${k}: ${linea(String(v))}`).join('\n')}\n---\n${p.encargo.trim()}\n`
}

/** El plan desde su texto. null si no es un plan de encargo. */
export function leerPlan(texto: string, ruta: string): Plan | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(texto.replace(/\r\n/g, '\n'))
  if (!m) return null
  const datos: Record<string, string> = {}
  for (const l of m[1].split('\n')) { const k = /^([a-zA-Z]+):\s*(.*)$/.exec(l); if (k) datos[k[1]] = k[2].trim() }
  if (datos.tipo !== 'plan-de-encargo' || !datos.nombre || !datos.harness || !datos.cwd) return null
  const encargo = m[2].trim()
  return {
    ruta, nombre: datos.nombre, harness: datos.harness, cwd: datos.cwd, encargo,
    ...(esPerfil(datos.perfil) ? { perfil: datos.perfil } : {}),
    ...(datos.aislamiento === 'worktree' || datos.aislamiento === 'carpeta' ? { aislamiento: datos.aislamiento } : {}),
    ...(datos.modelo ? { modelo: datos.modelo } : {}), ...(datos.esfuerzo ? { esfuerzo: datos.esfuerzo } : {}),
    ...(datos.avisar ? { avisar: datos.avisar } : {}), ...(datos.propuesto ? { propuesto: datos.propuesto } : {}), ...(datos.descartado ? { descartado: datos.descartado } : {}),
  }
}

/** La ruta del plan dentro del repo, validada: solo `docs/planes/*.md`, sin salirse con `..`. */
export function rutaDePlan(pedida: string, repo = repoPrincipal()): { rel: string; abs: string } {
  const abs = resolve(repo, pedida.replace(/^~\/Developer\/(artificial-brain|business-os)\//, ''))
  const rel = relative(repo, abs).split(sep).join('/')
  if (rel.startsWith('..') || !/^docs\/planes\/[^/]+\.md$/.test(rel)) throw new Error(`Un plan vive en ${DIR_PLANES}/<archivo>.md del repo (me pasaste ${pedida}).`)
  return { rel, abs }
}

const TRAILER = (nombre: string) => `\n\nSubagente: ${linea(nombre).slice(0, 80)}`

/** Commitea SOLO ese archivo. Devuelve el commit o null (no había cambios o git no pudo; el plan sigue valiendo). */
export async function commitearPlan(rel: string, mensaje: string, o: { repo?: string; git?: Git } = {}): Promise<{ commit: string | null; aviso?: string }> {
  const repo = o.repo ?? repoPrincipal(), git = o.git ?? gitReal
  for (let intento = 0; intento < 2; intento++) {
    try {
      await git(['add', '--', rel], repo)
      const cambios = (await git(['diff', '--cached', '--name-only', '--', rel], repo)).trim()
      if (cambios) await git(['commit', '--no-verify', '-q', '-m', mensaje, '--', rel], repo)
      return { commit: (await git(['log', '-1', '--format=%H', '--', rel], repo)).trim() || null }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (intento === 0 && /index\.lock/.test(m)) { await new Promise(r => setTimeout(r, 1500)); continue }
      return { commit: null, aviso: `no pude commitearlo (${m.split('\n')[0].slice(0, 160)}); el archivo quedó escrito` }
    }
  }
  return { commit: null, aviso: 'el índice de git siguió ocupado; el archivo quedó escrito' }
}

/** Escribe el plan propuesto y lo commitea. No lanza nada. */
export async function proponerPlan(p: DatosPlan & { encargo: string }, o: { repo?: string; git?: Git; ahora?: Date } = {}): Promise<Plan & { commit: string | null; aviso?: string }> {
  const repo = o.repo ?? repoPrincipal()
  const ahora = o.ahora ?? new Date()
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
  const base = `${DIR_PLANES}/${fecha}-${slugPlan(p.nombre)}`
  let rel = `${base}.md`
  for (let n = 2; existsSync(join(repo, rel)); n++) rel = `${base}-${n}.md`
  const plan: Plan = { ...p, ruta: rel, propuesto: ahora.toISOString() }
  mkdirSync(join(repo, DIR_PLANES), { recursive: true })
  writeFileSync(join(repo, rel), textoPlan(plan))
  const c = await commitearPlan(rel, `Plan propuesto: ${linea(p.nombre).slice(0, 70)}${TRAILER(p.nombre)}`, { repo, ...(o.git ? { git: o.git } : {}) })
  return { ...plan, ...c }
}

/** Lee el plan del disco (la versión que Daniel dejó, editada o no). */
export function planEnDisco(pedida: string, repo = repoPrincipal()): Plan {
  const { rel, abs } = rutaDePlan(pedida, repo)
  if (!existsSync(abs)) throw new Error(`No existe el plan ${rel}.`)
  const plan = leerPlan(readFileSync(abs, 'utf8'), rel)
  if (!plan) throw new Error(`${rel} no es un plan de encargo (le falta el frontmatter «tipo: plan-de-encargo» con nombre, harness y cwd).`)
  return plan
}

/** «Correr»: la versión actual queda como aprobada (commit si cambió) y se devuelve para lanzarla. */
export async function aprobarPlan(pedida: string, o: { repo?: string; git?: Git } = {}): Promise<Plan & { commit: string | null; aviso?: string }> {
  const repo = o.repo ?? repoPrincipal()
  const plan = planEnDisco(pedida, repo)
  if (plan.descartado) throw new Error(`El plan ${plan.ruta} está descartado.`)
  if (!plan.encargo) throw new Error(`El plan ${plan.ruta} no trae encargo.`)
  const c = await commitearPlan(plan.ruta, `Plan aprobado: ${plan.nombre.slice(0, 70)}${TRAILER(plan.nombre)}`, { repo, ...(o.git ? { git: o.git } : {}) })
  return { ...plan, ...c }
}

/** Descartar: queda en el archivo (con su fecha) y en git; nunca se borra. */
export async function descartarPlan(pedida: string, o: { repo?: string; git?: Git; ahora?: Date } = {}): Promise<Plan & { commit: string | null }> {
  const repo = o.repo ?? repoPrincipal()
  const plan = planEnDisco(pedida, repo)
  const nuevo = { ...plan, descartado: (o.ahora ?? new Date()).toISOString() }
  writeFileSync(join(repo, plan.ruta), textoPlan(nuevo))
  const c = await commitearPlan(plan.ruta, `Plan descartado: ${plan.nombre.slice(0, 70)}${TRAILER(plan.nombre)}`, { repo, ...(o.git ? { git: o.git } : {}) })
  return { ...nuevo, ...c }
}

/** La Definición de Terminado que vale para el juez: el plan en su commit aprobado (o el archivo, si no hubo commit). */
export async function textoAprobado(plan: { ruta: string; commit: string | null }, o: { repo?: string; git?: Git } = {}): Promise<string | null> {
  const repo = o.repo ?? repoPrincipal(), git = o.git ?? gitReal
  try {
    const texto = plan.commit ? await git(['show', `${plan.commit}:${plan.ruta}`], repo) : readFileSync(rutaDePlan(plan.ruta, repo).abs, 'utf8')
    return leerPlan(texto, plan.ruta)?.encargo ?? null
  } catch { return null }
}

export interface PlanPendiente { ruta: string; abs: string; nombre: string; harness: string; perfil: Perfil; propuesto: string | null; resumen: string }

/** Planes por correr: en `docs/planes`, sin descartar y sin subagente que haya salido de ellos. */
export function planesPendientes(usados: Set<string>, o: { repo?: string; max?: number } = {}): PlanPendiente[] {
  const repo = o.repo ?? repoPrincipal()
  const dir = join(repo, DIR_PLANES)
  let archivos: string[] = []
  try { archivos = readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse() } catch { return [] }
  const fuera: PlanPendiente[] = []
  for (const f of archivos) {
    const rel = `${DIR_PLANES}/${f}`
    if (usados.has(rel)) continue
    let plan: Plan | null = null
    try { plan = leerPlan(readFileSync(join(dir, f), 'utf8'), rel) } catch { /* ilegible: no es plan */ }
    if (!plan || plan.descartado) continue
    const primera = plan.encargo.split('\n').map(l => l.replace(/^[#>*\s-]+/, '').trim()).find(Boolean) ?? ''
    fuera.push({ ruta: rel, abs: join(repo, rel), nombre: plan.nombre, harness: plan.harness, perfil: plan.perfil ?? 'total', propuesto: plan.propuesto ?? null, resumen: primera.slice(0, 160) })
    if (fuera.length >= (o.max ?? 12)) break
  }
  return fuera
}

/** «owner|account|conversationId» ↔ el origen de un subagente. */
export const origenATexto = (o: { owner: string; account: string; conversationId: string }) => [o.owner, o.account, o.conversationId].join('|')
export function textoAOrigen(t: string | undefined): { owner: string; account: string; conversationId: string } | undefined {
  const [owner, account, conversationId] = (t ?? '').split('|')
  return owner && account && conversationId ? { owner, account, conversationId } : undefined
}

type Delegar = (p: import('./sin-pantalla.js').PedidoDelegar) => Promise<import('./cuerpo.js').Subagente>

/**
 * Correr un plan (botón del Taller o `delegar {plan: "<ruta>"}`): lo aprueba (commit de la versión de hoy) y lanza el
 * subagente con ESE texto por la vía de siempre. `avisarA` explícito gana; si no, la conversación que lo propuso.
 */
export async function correrPlan(pedida: string, o: { avisarA?: { owner: string; account: string; conversationId: string }; repo?: string; git?: Git; delegar?: Delegar } = {}): Promise<{ sub: import('./cuerpo.js').Subagente; plan: Plan & { commit: string | null; aviso?: string } }> {
  const plan = await aprobarPlan(pedida, { ...(o.repo ? { repo: o.repo } : {}), ...(o.git ? { git: o.git } : {}) })
  const delegar = o.delegar ?? (await import('./cuerpo.js')).delegar
  const avisarA = o.avisarA ?? textoAOrigen(plan.avisar)
  const sub = await delegar({
    nombre: plan.nombre, harness: plan.harness, encargo: plan.encargo, cwd: plan.cwd,
    ...(plan.modelo ? { modelo: plan.modelo } : {}), ...(plan.esfuerzo ? { esfuerzo: plan.esfuerzo } : {}),
    ...(plan.aislamiento ? { aislamiento: plan.aislamiento } : {}), ...(plan.perfil ? { perfil: plan.perfil } : {}),
    ...(avisarA ? { avisarA } : {}), plan: { ruta: plan.ruta, commit: plan.commit },
  })
  return { sub, plan }
}
