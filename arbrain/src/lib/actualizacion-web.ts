import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * «Reiniciar» despliega (4 oct 2026, «asegúrate que pase cada que presiono Reiniciar»).
 *
 * El webview de escritorio muestra la web del Studio (~/Servers/arbrain-web, slots a/b). Un commit de arbrain/ en
 * origin/main no aparecía al pulsar «Reiniciar» porque el vigilante (deploy.sh --si-cambio, cada 5 min) aún no
 * había compilado. Aquí se expone el estado «hay commits sin desplegar» y la orden «despliega ya».
 *
 * La orden NO compila desde este proceso: el cambio de slot reinicia este mismo servidor (launchctl kickstart -k) y
 * se llevaría a su hijo. Se deja una bandera (`.deploy-ahora`) y se despierta al job independiente
 * `com.levy.arbrain-web-deploy`, que ejecuta deploy.sh en modo manual (sin esperar turnos para compilar, tope de
 * pocos segundos para el cambio de slot). deploy.sh tiene su propio candado: nunca compilan dos a la vez.
 */

export type FaseDespliegue = 'compilando' | 'esperando' | 'cambiando' | 'listo' | 'fallo'

export interface EstadoDespliegue {
  /** Este servidor sabe desplegarse (existe el directorio de despliegue del Studio). */
  disponible: boolean
  /** origin/main trae un árbol arbrain/ distinto al desplegado. */
  pendiente: boolean
  /** Un deploy.sh está compilando/cambiando ahora. */
  desplegando: boolean
  fase: FaseDespliegue | null
  /** El último deploy de ESTE árbol de origin/main no compiló (sigue sirviendo la versión anterior). Hasta que entre
   *  otro commit no hay nada que aplicar: la píldora no se muestra. */
  fallo: boolean
  /** Cuándo escribió deploy.sh la fase (ms). La pantalla ignora un «fallo» anterior a su propio «Reiniciar». */
  faseTs: number | null
}

export interface InsumosEstado {
  nuevo: string | null
  hecho: string | null
  lockVivo: boolean
  /** `arbol` = el árbol arbrain/ que intentaba desplegar (deploy.sh desde el 5 oct; antes no venía). */
  marca: { fase?: string; ts?: number; arbol?: string } | null
  ahora: number
}

const FASES: readonly string[] = ['compilando', 'esperando', 'cambiando', 'listo', 'fallo']
/** Una marca de fase más vieja que esto no describe un deploy en curso (script muerto sin limpiar). */
export const VIGENCIA_FASE_MS = 20 * 60_000

/** Lógica pura: del estado en disco y del repo al estado que ve la pantalla. */
export function decidirEstado(i: InsumosEstado): Omit<EstadoDespliegue, 'disponible'> {
  const vigente = !!i.marca && typeof i.marca.ts === 'number' && i.ahora - i.marca.ts < VIGENCIA_FASE_MS
  const fase = vigente && i.marca?.fase && FASES.includes(i.marca.fase) ? (i.marca.fase as FaseDespliegue) : null
  const pendiente = !!i.nuevo && i.nuevo !== i.hecho
  const desplegando = i.lockVivo
  // «fallo» solo cuenta mientras siga habiendo algo por desplegar y nadie esté intentándolo. Si la marca dice qué árbol
  // falló, vale mientras ese siga siendo el de origin (sin caducar: reintentar un build roto no cambia nada) y deja de
  // valer en cuanto entra otro commit. Sin árbol (deploy.sh anterior), solo mientras la marca esté vigente.
  const arbolRoto = i.marca?.fase === 'fallo' && !!i.marca.arbol && i.marca.arbol === i.nuevo
  const fallo = pendiente && !desplegando && (i.marca?.arbol ? arbolRoto : fase === 'fallo')
  return {
    pendiente, desplegando, fase: desplegando ? (fase === 'listo' || fase === 'fallo' ? 'compilando' : fase) : fase, fallo,
    faseTs: typeof i.marca?.ts === 'number' ? i.marca.ts : null,
  }
}

export function dirDespliegue(): string {
  return process.env.ARBRAIN_WEB_DEPLOY_DIR || join(homedir(), 'Servers/arbrain-web')
}

function git(dir: string, args: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/usr/bin/git', ['-C', dir, ...args], { timeout: timeoutMs }, (err, out) => resolve(err ? null : out.trim()))
  })
}

function leerJson<T>(ruta: string): T | null {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) as T } catch { return null }
}

function lockVivo(dir: string): boolean {
  try {
    const pid = Number(readFileSync(join(dir, '.deploy.lock.d/pid'), 'utf8').trim())
    if (!Number.isInteger(pid) || pid <= 0) return false
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

let ultimoFetch = 0
let fetchEnCurso: Promise<void> | null = null
const VIGENCIA_FETCH_MS = 20_000

/** `git fetch` con enfriamiento: la pantalla pregunta cada ~20 s y el vigilante ya hace el suyo. */
async function refrescarOrigin(dir: string): Promise<void> {
  if (Date.now() - ultimoFetch < VIGENCIA_FETCH_MS) return
  fetchEnCurso ??= git(dir, ['fetch', '-q', 'origin', 'main'], 10_000).then(() => {
    ultimoFetch = Date.now()
  }).finally(() => { fetchEnCurso = null })
  await fetchEnCurso
}

export async function estadoDespliegue(opts: { fresco?: boolean } = {}): Promise<EstadoDespliegue> {
  const dir = dirDespliegue()
  if (!existsSync(join(dir, 'deploy.sh'))) {
    return { disponible: false, pendiente: false, desplegando: false, fase: null, fallo: false, faseTs: null }
  }
  if (opts.fresco) ultimoFetch = 0
  await refrescarOrigin(dir)
  const nuevo = await git(dir, ['rev-parse', 'origin/main:arbrain'], 5_000)
  const hecho = (() => { try { return readFileSync(join(dir, '.desplegado'), 'utf8').trim() || null } catch { return null } })()
  return {
    disponible: true,
    ...decidirEstado({
      nuevo, hecho, lockVivo: lockVivo(dir),
      marca: leerJson(join(dir, '.deploy-estado.json')), ahora: Date.now(),
    }),
  }
}

/** Deja la orden manual y despierta al job de deploy. Idempotente: si ya hay uno corriendo, solo queda la bandera. */
export async function pedirDespliegue(): Promise<EstadoDespliegue> {
  const dir = dirDespliegue()
  if (!existsSync(join(dir, 'deploy.sh'))) return estadoDespliegue()
  const antes = await estadoDespliegue({ fresco: true })
  if (!antes.pendiente) return antes
  writeFileSync(join(dir, '.deploy-ahora'), `${Date.now()}\n`)
  if (!antes.desplegando) {
    const uid = process.getuid?.() ?? 501
    // Sin -k: si el job ya está corriendo no lo mata (un deploy a medias jamás se interrumpe).
    await new Promise<void>((resolve) => {
      execFile('/bin/launchctl', ['kickstart', `gui/${uid}/com.levy.arbrain-web-deploy`], { timeout: 5_000 }, () => resolve())
    })
  }
  return { ...antes, desplegando: true, fase: 'compilando', fallo: false }
}
