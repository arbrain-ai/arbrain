/**
 * Tu negocio, Estrategia y Business Intelligence en la app instalada del alumno (16 nov 2026). Next corre en
 * `resources/next/standalone` y la app solo le pasa `ARBRAIN_HOME`: antes las seis rutas buscaban el cerebro en
 * `BUSINESS_OS_ROOT` o en `cwd/..` y los paneles salían vacíos («No se encontró la raíz del cerebro») en Mac y en Windows.
 * La primera prueba usa el entorno con el que la app lanza Next; la segunda, que las seis rutas la usen (falla con el código viejo).
 */
import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const WEB = path.resolve(import.meta.dirname, '../..')
const cerebro = mkdtempSync(path.join(tmpdir(), 'cerebro-alumno-'))
mkdirSync(path.join(cerebro, '.claude', 'memory'), { recursive: true })
writeFileSync(path.join(cerebro, '.claude', 'memory', 'MEMORY.md'), '# memoria\n')
after(() => rmSync(cerebro, { recursive: true, force: true }))

test('edición cliente: el cerebro del alumno es ARBRAIN_HOME (el que pasa la app), no la carpeta del servidor web', async () => {
  // Así arranca Next la app instalada: edición cliente, ARBRAIN_HOME y cwd en resources/next/standalone (sin cerebro arriba).
  const standalone = path.join(cerebro, '..', 'resources-de-prueba', 'next', 'standalone')
  const env = { ARBRAIN_EDICION: 'cliente', ARBRAIN_HOME: cerebro }
  const { raizCerebro, raicesCerebro } = await import('../../src/lib/raiz-cerebro')
  assert.equal(raizCerebro(env, standalone), cerebro)
  assert.equal(raicesCerebro(env, standalone)[0], cerebro)
  // La instalación original no cambia: ARBRAIN_HOME no se mira fuera de la edición cliente.
  assert.notEqual(raicesCerebro({ ARBRAIN_EDICION: 'original', ARBRAIN_HOME: cerebro }, standalone)[0], cerebro)
})

test('las seis lecturas del negocio usan la misma raíz (ninguna vuelve a la lista vieja)', () => {
  for (const f of ['src/features/bi/servidor.ts', ...['comprador', 'estrategia', 'marcador-levy', 'marketing', 'embudo'].map(n => `src/app/api/negocio/${n}/route.ts`)]) {
    const s = readFileSync(path.join(WEB, f), 'utf8')
    assert.doesNotMatch(s, /const RAICES = \(\) => \[process\.env\.BUSINESS_OS_ROOT/, f)
    assert.match(s, /@\/lib\/raiz-cerebro/, f)
  }
})
