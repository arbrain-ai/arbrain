import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: {
    '@': fileURLToPath(new URL('../../arbrain/src', import.meta.url)),
    'server-only': fileURLToPath(new URL('./server-only-stub.mjs', import.meta.url)),
  } },
  test: { include: ['tests/chat-routes.test.ts', 'tests/chat-recovery.test.ts', 'tests/chat-upstream-error.test.ts'] },
})
