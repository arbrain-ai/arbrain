/**
 * Cerca del modo espejo antes de cada rutina (edición cliente, beta, apagado por defecto). La lógica vive en
 * `arbrain/scripts/espejo/` (lib/cerca.mjs); aquí solo se consulta. Con el espejo apagado el supervisor no pasa
 * `ARBRAIN_ESPEJO_GUARDA` y esto devuelve { correr: true } sin lanzar nada: el scheduler se comporta como hoy.
 *
 * La llave con que correría la rutina viaja a la cerca por stdin (nunca por argv ni entorno) para verificar su tope.
 * Diseño: docs/builds/cerebro-24-7-2026-10-23/DISENO.md §2.2–2.3. Contrato: docs/builds/modo-espejo-2026-10-23/motor/CONTRATO.md.
 */
import { spawn } from 'node:child_process'
import { secreto } from './cofre.js'

export interface VeredictoEspejo {
  correr: boolean
  /** `omitir`: no es un error (ya salió hoy); `aviso`: la persona tiene que enterarse (sin tope, ya no manda…). */
  tipo?: 'omitir' | 'aviso'
  codigo?: string
  motivo?: string
  folio?: string
}

const PASAN = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'XDG_CONFIG_HOME', 'GIT_SSH_COMMAND']

export function entornoCerca(env: NodeJS.ProcessEnv): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') continue
    if (PASAN.includes(k) || (k.startsWith('ARBRAIN_ESPEJO_') && k !== 'ARBRAIN_ESPEJO_GUARDA')) o[k] = v
  }
  return o
}

export function cercaEspejo(rutina: string, env: NodeJS.ProcessEnv = process.env, llave: string = secreto('OPENROUTER_API_KEY') ?? secreto('ANTHROPIC_API_KEY') ?? '', plazoMs = 120_000): Promise<VeredictoEspejo> {
  const guarda = env.ARBRAIN_ESPEJO_GUARDA?.trim()
  if (!guarda) return Promise.resolve({ correr: true })
  const args = [guarda, 'cerca', '--rutina', rutina, '--json', '--llave-stdin', ...(env.ARBRAIN_HOME ? ['--cerebro', env.ARBRAIN_HOME] : [])]
  return new Promise((ok) => {
    let salida = ''
    let listo = false
    const fallo = (motivo: string) => { if (!listo) { listo = true; ok({ correr: false, tipo: 'aviso', codigo: 'cerca_fallo', motivo }) } }
    const hijo = spawn(env.ARBRAIN_NODE_BINARY || process.execPath, args, { cwd: env.ARBRAIN_HOME || undefined, env: entornoCerca(env), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    const reloj = setTimeout(() => { hijo.kill(); fallo('La cerca del espejo no respondió a tiempo; la rutina no corrió.') }, plazoMs)
    hijo.stdout.setEncoding('utf8')
    hijo.stdout.on('data', (c: string) => { salida += c })
    hijo.on('error', () => { clearTimeout(reloj); fallo('No pude consultar la cerca del espejo; la rutina no corrió.') })
    hijo.on('close', () => {
      clearTimeout(reloj)
      if (listo) return
      try {
        const r = JSON.parse(salida.trim().split('\n').pop() ?? '') as VeredictoEspejo
        listo = true
        ok({ correr: r.correr === true, tipo: r.tipo, codigo: r.codigo, motivo: r.motivo, folio: r.folio })
      } catch { fallo('La cerca del espejo respondió algo que no entiendo; la rutina no corrió.') }
    })
    hijo.stdin.on('error', () => { /* la cerca terminó antes de leer */ })
    hijo.stdin.end(llave + '\n')
  })
}
