// next.config.ts y lo que importa (13 nov 2026, «Arbrain en inglés»): Next carga su config con su propio transpilador,
// sin el alias `@/` del tsconfig. Un `import { tr } from '@/shared/i18n'` en un archivo que llega a la config tumbaba
// `next dev` y `next build` («Cannot find module './src/shared/i18n'»). En la copia del alumno, `instalacion.ts` es la
// plantilla genérica: también se revisa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '../..')

function importesDe(archivo: string): string[] {
  const texto = readFileSync(archivo, 'utf8')
  return [...texto.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
}

function resolver(desde: string, spec: string): string | null {
  const base = resolve(dirname(desde), spec)
  for (const ext of ['', '.ts', '.tsx', '/index.ts']) if (existsSync(base + ext) && /\.tsx?$/.test(base + ext)) return base + ext
  return null
}

test('lo que carga next.config.ts no usa el alias @/ (tampoco la plantilla que en la copia del alumno es instalacion.ts)', () => {
  const pendientes = [join(RAIZ, 'next.config.ts'), join(RAIZ, 'src/config/instalacion.plantilla.ts')]
  const vistos = new Set<string>()
  const malos: string[] = []
  while (pendientes.length) {
    const f = pendientes.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const spec of importesDe(f)) {
      if (spec.startsWith('@/')) malos.push(`${f.slice(RAIZ.length + 1)} → ${spec}`)
      else if (spec.startsWith('.')) { const r = resolver(f, spec); if (r) pendientes.push(r) }
    }
  }
  assert.ok(vistos.size >= 4, `recorrió ${vistos.size} archivos`)
  assert.deepEqual(malos, [])
})

test('los módulos del daemon que importa la web no importan nada (webpack de Next no resuelve los .js del daemon)', () => {
  // 13 nov 2026: server/src/live/transcribe.ts importó ../i18n/tr.js y `next build` falló en /api/chat/transcribe.
  const salida = execFileSync('rg', ['-l', '--glob', '!*.test.ts', "from '[./]*server/src/", join(RAIZ, 'src')], { encoding: 'utf8' })
  const daemon = new Set<string>()
  for (const f of salida.trim().split('\n').filter(Boolean)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([./]*server\/src\/[^']+\.ts)'/g)) daemon.add(resolve(dirname(f), m[1]))
  }
  assert.ok(daemon.size >= 3, `módulos del daemon importados por la web: ${daemon.size}`)
  const malos = [...daemon].filter((f) => importesDe(f).length > 0).map((f) => f.slice(RAIZ.length + 1))
  assert.deepEqual(malos, [])
})
