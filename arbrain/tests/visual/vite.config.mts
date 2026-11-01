import { defineConfig } from '../../../agent-server/node_modules/vite/dist/node/index.js'
import { fileURLToPath } from 'node:url'
const dir = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
export default defineConfig({
  plugins: [{
    name: 'chat-persistence-test-delay', enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/lib/local-first/runtime.ts')) return
      const start = code.indexOf('export async function queueChatPrompt(')
      const end = code.indexOf('\nexport ', start + 1)
      if (start < 0 || end < 0) return
      // Test-only scheduling seam after actual persistence, before its caller
      // resumes. Never present in a production source or build route.
      const part = code.slice(start, end).replace('  return item', '  await (globalThis as any).__chatFixtureDelay?.(input)\n  return item')
      return code.slice(0, start) + part + code.slice(end)
    },
  }, {
    name: 'chat-render-counter', enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/features/chat/components/ChatPanel.tsx')) return
      // Test-only: cuenta renders de MessageBubble (composer-teclear: una tecla no re-renderiza la lista).
      return code.replace('}: MessageBubbleProps) {', '}: MessageBubbleProps) {\n  ;(globalThis as any).__burbujas = ((globalThis as any).__burbujas ?? 0) + 1')
    },
  }],
  root: dir('./'),
  resolve: { alias: { '@/hooks/useAuth': dir('./auth-fixture.ts'), '@': dir('../../src') }, dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  css: { postcss: dir('../../') },
  server: { host: '127.0.0.1', port: 3429, strictPort: true, fs: { allow: [dir('../../../')] } },
})
