// Plegar y desplegar el panel derecho: además de ⌘B, `]` (simétrico a `[` de las conversaciones). Ctrl+B en Windows y
// Linux ya lo atiende el manejador de ⌘B (teclas-plataforma › modPrincipal), así que esta mejora no trae el suyo. El
// atajo se lista en la ayuda y el panel trae su asa en el borde.
// Todo detrás de Ajustes › Mejoras › «Panel derecho que se pliega»: apagada, como antes (solo ⌘B, sin asas).
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ATAJOS_SHELL, conMejoras, filtrarAtajos } from '../../src/shared/navigation/atajos'

const raiz = join(__dirname, '..', '..')
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8')
const teclasDe = (prendida: boolean) => conMejoras(ATAJOS_SHELL, () => prendida).find((g) => g.id === 'barras')!.atajos.map((a) => a.teclas.join('+'))

test('prendida: la ayuda lista `]` para plegar el panel derecho (Ctrl+B es el ⌘B de siempre fuera de Mac)', () => {
  const teclas = teclasDe(true)
  assert.ok(teclas.includes(']'))
  assert.ok(!teclas.includes('Ctrl+B'))
  const encontrados = filtrarAtajos(conMejoras(ATAJOS_SHELL, () => true), 'plegar o desplegar el panel').flatMap((g) => g.atajos)
  assert.equal(encontrados.length, 1)
})

test('apagada: la ayuda queda como antes, sin `]` ni Ctrl+B', () => {
  const teclas = teclasDe(false)
  assert.ok(!teclas.includes(']'))
  assert.ok(!teclas.includes('Ctrl+B'))
  assert.equal(filtrarAtajos(conMejoras(ATAJOS_SHELL, () => false), 'plegar o desplegar el panel').length, 0)
})

test('el atajo global atiende `]` solo con la mejora prendida (también con AltGr) y no trae un Ctrl+B propio', () => {
  const src = leer('src/shared/hooks/useGlobalShortcuts.ts')
  assert.match(src, /case '\]':[\s\S]{0,300}\(!e\.ctrlKey \|\| esAltGr\(e, mac\)\)[\s\S]{0,80}mejoraActiva\('panel-plegable'\)[\s\S]{0,120}alternarPanelDerecho\(\)/)
  assert.doesNotMatch(src, /e\.code === 'KeyB' && e\.ctrlKey && !e\.metaKey/)
})

test('las asas del panel solo salen con la mejora prendida', () => {
  const src = leer('src/features/cabina/panel/PanelDerecho.tsx')
  assert.match(src, /useMejora\('panel-plegable'\)/)
  assert.match(src, /\{plegable && <button onClick=\{onCerrar\}[\s\S]{0,300}tr\('Esconder el panel'\)/)
  assert.match(src, /\{plegable && !isMobile[\s\S]{0,300}tr\('Mostrar el panel'\)/)
})
