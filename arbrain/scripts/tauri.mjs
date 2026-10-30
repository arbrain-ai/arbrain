#!/usr/bin/env node
/**
 * La CLI de Tauri con la configuración de la instalación original cuando existe.
 *
 * `src-tauri/tauri.conf.json` es la app del alumno (ai.arbrain.app, la que viaja). La instalación original agrega
 * encima `src-tauri/tauri.original.conf.json` (su identificador, sin Node embebido ni daemon, sin CSP), que solo existe
 * en su repo. Los scripts `desktop:*` pasan por aquí: en su repo construyen su app como siempre; en la copia del
 * alumno ese archivo no existe y construyen la del alumno.
 *
 * Uso: node scripts/tauri.mjs <args de tauri…>
 *
 * Guardia del Studio (25 oct 2026, scripts/compilacion-pesada.mjs): `dev`/`build`/`bundle` de la app original solo
 * en el checkout designado, con 15 GB libres como piso, CARGO_TARGET_DIR único y `build` por el semáforo (una
 * compilación pesada a la vez; las demás esperan).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARGO_TARGET_COMPARTIDO, GuardiaError, correrPesado, guardiaCheckout, guardiaDisco } from './compilacion-pesada.mjs'

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)))
const original = join(raiz, 'src-tauri', 'tauri.original.conf.json')
const args = process.argv.slice(2)
const cliente = (process.env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'
const conConfig = existsSync(original) && !cliente && ['dev', 'build', 'bundle'].includes(args[0])
const final = conConfig ? [args[0], '--config', original, ...args.slice(1)] : args
const tauri = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
const compila = ['dev', 'build', 'bundle'].includes(args[0])
if (!compila) {
  const r = spawnSync(tauri, final, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' })
  process.exit(r.status ?? 1)
}
try {
  guardiaCheckout(raiz)
  guardiaDisco(`compilar Tauri (${args[0]})`)
} catch (e) {
  console.error(`\n${e.message}\n`)
  process.exit(75)
}
const env = { ...process.env }
if (conConfig && !env.CARGO_TARGET_DIR) env.CARGO_TARGET_DIR = CARGO_TARGET_COMPARTIDO
if (args[0] === 'dev') {
  // dev es una sesión larga: no retiene el semáforo (bloquearía a todos), solo pasa las guardias.
  const r = spawnSync(tauri, final, { cwd: raiz, env, stdio: 'inherit', shell: process.platform === 'win32' })
  process.exit(r.status ?? 1)
}
correrPesado(tauri, final, { etiqueta: `tauri ${args[0]}`, cwd: raiz, env })
  .then((c) => process.exit(c))
  .catch((e) => { console.error(e instanceof GuardiaError ? `\n${e.message}\n` : e); process.exit(e instanceof GuardiaError ? 75 : 1) })
