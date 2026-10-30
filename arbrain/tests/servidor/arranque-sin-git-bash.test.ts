// Arranque sin Git Bash (29 oct 2026, soporte de un fundador en Windows: bienvenida en bucle al encender desde la app de
// escritorio, el VBS de Inicio o PowerShell). Esos arranques heredan el PATH de Windows, no el de `~/.arbrain/entorno.sh`.
// Sin `git` ahí, programa.mjs no puede verificar la firma del programa ya compilado y el supervisor caía a la web de
// `.next/standalone`: con la huella «sin-git» la reutilizaba para siempre aunque fuera de otra versión. Visto en el CI de
// Windows (arbrain-ai/e2e-instalacion, «E2E bienvenida · Windows», corrida 40896935659 con sin_git=true): «Compilo aquí
// en vez de usar el programa ya compilado: la copia no tiene la etiqueta v0.2.10» y el siguiente arranque la reutilizó
// sin compilar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { carpetasGitWindows, huellaSinGit, reutilizarCompilado } from '../../scripts/servidor/rutas.mjs'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

/** La regla de antes (servidor.mjs › compilarWeb hasta el 29 oct), para dejar escrito el caso que fallaba. */
const reglaVieja = ({ hay, forzar, huella, marca }: { hay: boolean; forzar: boolean; huella: string; marca: { huella?: string } | null }) =>
  (hay && !forzar && marca?.huella === huella && huella !== 'sin-git') || (hay && !forzar && huella === 'sin-git')

test('sin git: una web compilada en otra versión NO se reutiliza (antes sí, para siempre)', () => {
  // Compilada aquí en la 0.2.14 (con git, huella de commit); hoy la copia es 0.2.15 y el arranque no ve git.
  const marca = { huella: '3f9c2a1b7d004e11', version: '0.2.14' }
  assert.equal(reglaVieja({ hay: true, forzar: false, huella: 'sin-git', marca }), true, 'así quedaba la web vieja')
  assert.equal(reutilizarCompilado({ hay: true, forzar: false, huella: huellaSinGit('0.2.15'), marca }), false)
  // También si la vieja se compiló sin git en otra versión.
  assert.equal(reutilizarCompilado({ hay: true, forzar: false, huella: huellaSinGit('0.2.15'), marca: { huella: huellaSinGit('0.2.14') } }), false)
})

test('sin git y misma versión: se reutiliza (no recompila en cada arranque)', () => {
  const h = huellaSinGit('0.2.15')
  assert.equal(h, 'sin-git-0.2.15')
  assert.equal(reutilizarCompilado({ hay: true, forzar: false, huella: h, marca: { huella: h } }), true)
  assert.equal(reutilizarCompilado({ hay: true, forzar: true, huella: h, marca: { huella: h } }), false)
  assert.equal(reutilizarCompilado({ hay: false, forzar: false, huella: h, marca: { huella: h } }), false)
})

test('Windows: git se busca donde lo deja su instalador aunque el PATH heredado no lo tenga', () => {
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\Fulano de Tal\\AppData\\Local', Path: 'C:\\Windows\\system32' }
  assert.deepEqual(carpetasGitWindows(env), [
    'C:\\Program Files\\Git\\cmd', 'C:\\Program Files (x86)\\Git\\cmd', 'C:\\Users\\Fulano de Tal\\AppData\\Local\\Programs\\Git\\cmd',
  ])
  // Sin variables, el lugar de siempre.
  assert.deepEqual(carpetasGitWindows({}), ['C:\\Program Files\\Git\\cmd'])
  // Windows no distingue mayúsculas en el entorno.
  assert.ok(carpetasGitWindows({ PROGRAMFILES: 'D:\\Apps' }).includes('D:\\Apps\\Git\\cmd'))
})

test('servidor.mjs: asegura git antes de verificar el programa, usa la regla nueva y dice qué web corre', () => {
  const s = fuente('scripts/servidor.mjs')
  assert.doesNotMatch(s, /h === 'sin-git'\) return/, 'ya no se reutiliza cualquier compilación sin git')
  assert.match(s, /if \(reutilizarCompilado\(\{ hay, forzar, huella: h, marca: leerJson\(marca\) \}\)\) return/)
  assert.ok(s.indexOf('if (!asegurarGit())') > 0 && s.indexOf('if (!asegurarGit())') < s.indexOf('await programaYaCompilado({'), 'git antes de la firma')
  assert.match(s, /registrar\(`Web: \$\{S\.webDir\} \(\$\{listo \? 'programa ya compilado' : 'compilado aquí'\}\) · Node: \$\{S\.node\}/)
  assert.match(s, /return huellaSinGit\(versionRepo\(\) \|\| versionArbrain\(\)\)/)
})
