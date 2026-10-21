// Red team M5 (11 oct 2026): la ruta `crudo` sirve HTML y SVG del workspace; si alguien abre la URL a nivel superior
// (fuera del iframe con sandbox), la cabecera CSP `sandbox` los deja en origen opaco: sin la cookie de la app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cspCrudo } from '../../src/features/cabina/documento/csp-crudo'

test('HTML y SVG llevan CSP sandbox sin allow-same-origin', () => {
  for (const ext of ['html', 'htm', 'HTML', 'svg']) {
    const csp = cspCrudo(ext) ?? ''
    assert.match(csp, /^sandbox\b/, ext)
    assert.match(csp, /allow-scripts/, ext)
    assert.doesNotMatch(csp, /allow-same-origin/, ext)
  }
})

test('los assets inertes no la llevan', () => {
  for (const ext of ['css', 'png', 'mp4', 'js', 'woff2']) assert.equal(cspCrudo(ext), null, ext)
})

test('la ruta crudo aplica la cabecera a toda respuesta (también la de HTML con tema)', () => {
  const fuente = readFileSync(join(__dirname, '../../src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts'), 'utf8')
  assert.match(fuente, /const csp = cspCrudo\(ext\)\s*\n\s*if \(csp\) headers\['Content-Security-Policy'\] = csp/)
  // La cabecera se fija antes de la rama HTML, que reusa `headers`.
  assert.ok(fuente.indexOf('cspCrudo(ext)') < fuente.indexOf("if (ext === 'html'"))
  assert.match(fuente, /\{ \.\.\.headers, 'Content-Length'/)
})
