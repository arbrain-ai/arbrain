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
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)))
const original = join(raiz, 'src-tauri', 'tauri.original.conf.json')
const args = process.argv.slice(2)
const cliente = (process.env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente'
const conConfig = existsSync(original) && !cliente && ['dev', 'build', 'bundle'].includes(args[0])
const final = conConfig ? [args[0], '--config', original, ...args.slice(1)] : args
const tauri = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
const r = spawnSync(tauri, final, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
