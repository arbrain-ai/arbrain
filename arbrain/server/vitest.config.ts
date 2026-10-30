import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// Pruebas que importan rutas de la web (Next) de verdad: necesitan `arbrain/node_modules` instalado. En la copia del
// alumno, con solo `server/` instalado (`npm ci` del daemon), se excluyen en vez de fallar al cargar `next/server`.
const WEB_INSTALADA = existsSync(fileURLToPath(new URL('../node_modules/next/package.json', import.meta.url)))
const PRUEBAS_CON_WEB = ['tests/chat-routes.test.ts']

export default defineConfig({
  test: {
    // La copia del alumno trae `arbrain/EDICION` = cliente (carril O): sin esto, sus pruebas correrían como cliente y
    // las que describen la instalación original fallarían. Las pruebas fijan su edición; la variable del que corre manda.
    env: { ARBRAIN_EDICION: process.env.ARBRAIN_EDICION || 'original' },
    exclude: [...configDefaults.exclude, ...(WEB_INSTALADA ? [] : PRUEBAS_CON_WEB)],
  },
  // PostCSS en línea (vacío): sin esto Vite busca `arbrain/postcss.config.js` y exige las dependencias de la web
  // (`@tailwindcss/postcss`) aunque el daemon no tenga CSS; en la copia del alumno, con solo `server/` instalado, fallaba.
  css: { postcss: {} },
  // Algunas pruebas ejercitan rutas de arbrain (Next) desde aquí: resuelven su alias `@/` y el marcador
  // `server-only`, que en Node no existe.
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('../src/', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
})
