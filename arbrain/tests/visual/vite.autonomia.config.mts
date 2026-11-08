// El arnés de siempre (vite.config.mts) más un stub de node:* para montar el ModalAjustes real (autonomia-fixture.tsx).
import base from './vite.config.mts'
import { fileURLToPath } from 'node:url'
const stub = fileURLToPath(new URL('./node-stub.ts', import.meta.url))
export default { ...base, resolve: { ...base.resolve, alias: [{ find: /^node:[a-z_/]+$/, replacement: stub }, ...Object.entries(base.resolve.alias).map(([find, replacement]) => ({ find, replacement }))] } }
