import { defineConfig } from '../../../agent-server/node_modules/vite/dist/node/index.js'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
const dir = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
export default defineConfig({
  plugins: [{ name: 'verified-build-styles', transformIndexHtml(html) {
    // Use the compiled production CSS, avoiding a second Tailwind scan of the
    // entire monorepo. Hashes follow each new build automatically.
    const folder = dir('../../.next/static/css')
    // Sin build de Next (worktree limpio): los tokens de color salen de globals.css, que alcanza para el banco aislado.
    if (!existsSync(folder)) return html.replace('</head>', `<link rel="stylesheet" href="/@fs${dir('../../src/app/globals.css')}"></head>`)
    const links = readdirSync(folder).filter(f => f.endsWith('.css')).map(f => `<link rel="stylesheet" href="/@fs${folder}/${f}">`).join('')
    return html.replace('</head>', links + '</head>')
  } }],
  root: dir('./'), resolve: { alias: { '@': dir('../../src') }, dedupe: ['react', 'react-dom'] },
  // next/link (GoalsBand) lee process.env en el navegador: sin esto el banco aislado no monta.
  define: { 'process.env': '{}' }, optimizeDeps: { rolldownOptions: { transform: { define: { 'process.env': '{}' } } } },
  esbuild: { jsx: 'automatic' }, css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 3437, strictPort: true, fs: { allow: [dir('../../../')] } },
})
