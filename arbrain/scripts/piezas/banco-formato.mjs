#!/usr/bin/env node
// Lienzo v17 · genera `docs/builds/lienzo-v17/banco-formato.mjs`: el lector de piezas (`piezas/formato.ts` + `model/doc.ts`)
// como un solo módulo de navegador para el banco. Lo comprueba tests/canvas/piezas-formato.test.ts (si está viejo, falla).
//   cd arbrain && node scripts/piezas/banco-formato.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(AQUI, '../..')
export function generar() {
  const js = f => ts.transpileModule(readFileSync(path.join(WEB, f), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const doc = js('src/features/canvas/model/doc.ts').replace(/^export /gm, '')
  const formato = js('src/features/canvas/piezas/formato.ts').replace(/^import .*$/m, '')
  return `// GENERADO por arbrain/scripts/piezas/banco-formato.mjs desde piezas/formato.ts y model/doc.ts. No editar a mano.\n${doc}\n${formato}`
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(path.resolve(WEB, '../docs/builds/lienzo-v17/banco-formato.mjs'), generar())
  console.log('banco-formato.mjs al día')
}
