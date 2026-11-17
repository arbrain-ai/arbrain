// El arnés de siempre (vite.config.mts) más stubs de node:* y next/* para montar el MemoriaTaller real (habilidades-alumno-fixture.tsx).
import base from './vite.config.mts'
import { fileURLToPath } from 'node:url'
const dir = (r: string) => fileURLToPath(new URL(r, import.meta.url))
export default { ...base, resolve: { ...base.resolve, alias: [
  { find: /^node:[a-z_/]+$/, replacement: dir('./node-stub.ts') },
  { find: /^next\/dynamic$/, replacement: dir('./dynamic-stub.tsx') },
  { find: /^next\/(navigation|link)$/, replacement: dir('./next-stub.tsx') },
  ...Object.entries(base.resolve.alias).map(([find, replacement]) => ({ find, replacement })),
] } }
