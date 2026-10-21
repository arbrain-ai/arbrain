#!/usr/bin/env node
/**
 * `npm test` de la web (carril T, 11 oct 2026). Igual que `arbrain/server/vitest.config.ts` (carril M2): la copia del
 * alumno trae `arbrain/EDICION` = cliente y, sin esto, todas las pruebas correrían como cliente y fallarían las que
 * describen la instalación original. Aquí la edición por defecto es `original`; la variable del que corre manda
 * (`ARBRAIN_EDICION=cliente npm test` corre todo como cliente). Las pruebas de cliente fijan su edición ellas mismas
 * (`esEdicionCliente({ ARBRAIN_EDICION: 'cliente' })`, `process.env.ARBRAIN_EDICION = 'cliente'`), así que no pierden
 * cobertura. Argumentos extra reemplazan el patrón: `npm test -- tests/edicion/edicion.test.ts`.
 */
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const env = { ...process.env, ARBRAIN_EDICION: process.env.ARBRAIN_EDICION || 'original' }
const hijo = spawn('npx', ['--yes', 'tsx', '--test', ...(args.length ? args : ['tests/**/*.test.ts'])], {
  env,
  stdio: 'inherit',
  // Windows: npx es un .cmd; cmd no expande el patrón, lo expande el corredor de pruebas de Node igual que en Unix.
  shell: process.platform === 'win32',
})
hijo.on('exit', (codigo, senal) => process.exit(senal ? 1 : codigo ?? 1))
