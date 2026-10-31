// Textos legales finales (31 oct 2026; docs/builds/legal-2026-10-31/REVISION.md): sin aviso de borrador ni huecos
// [COMPLETAR], el aviso de privacidad trae los seis elementos del art. 15 de la LFPDPPP, los términos no eximen de dolo
// ni culpa grave, y la huella fijada obliga a subir VERSION_TEXTOS al cambiar una palabra (la app vuelve a pedirlos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DOCUMENTOS_LEGALES, LICENCIA, PRIVACIDAD, RESPONSABLE, TERMINOS, VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const huella = () => createHash('sha256').update(`${VERSION_TEXTOS}\n${DOCUMENTOS_LEGALES.map(d => `${d.titulo}\n${d.resumen}\n${d.cuerpo}`).join('\n\n')}`).digest('hex')

test('la huella de los textos está fijada a su versión: cambiar una palabra exige subir VERSION_TEXTOS', () => {
  assert.equal(VERSION_TEXTOS, '2026-10-31')
  assert.equal(huella(), 'ce31bd5c06a3175c5c52a10d2f515674e0026b16ba804c6286b56c884a661b22', 'cambiaste un texto legal: sube VERSION_TEXTOS y actualiza esta huella')
})

test('sin borrador ni huecos: ni [COMPLETAR], ni «revisión legal», ni el aviso amarillo', () => {
  for (const d of DOCUMENTOS_LEGALES) assert.ok(!/\[COMPLETAR|\[NOMBRE|revisión legal|BORRADOR/i.test(`${d.resumen}\n${d.cuerpo}`), d.id)
  const ui = fuente('src/features/primer-arranque/components/DocumentosLegales.tsx')
  assert.match(ui, /\{AVISO_VERSION\}/)
  assert.ok(!/AVISO_BORRADOR|bg-warning/.test(ui))
  assert.ok(!/bg-warning/.test(fuente('src/features/seguridad/components/ConsentimientoAutonomia.tsx')))
  assert.ok(!/Borrador pendiente de revisión legal/.test(fuente('src/features/primer-arranque/components/PrimerArranque.tsx')))
})

test('aviso de privacidad: los seis elementos del art. 15 LFPDPPP', () => {
  const c = PRIVACIDAD.cuerpo
  assert.ok(c.includes(`${RESPONSABLE.nombre}, persona física`), 'I. identidad del responsable')
  if (RESPONSABLE.domicilio) assert.ok(c.includes(RESPONSABLE.domicilio), 'I. domicilio')
  assert.match(c, /## Lo que sí nos llega, solo si lo activas/, 'II. datos')
  assert.match(c, /## Datos sensibles\nNo te pedimos datos sensibles/, 'II. sensibles identificados')
  assert.match(c, /Finalidad necesaria: [^\n]+\n\nFinalidades secundarias: ninguna/, 'III. finalidades')
  assert.match(c, /## Cómo limitar su uso/, 'IV. limitar uso o divulgación')
  assert.match(c, /20 días hábiles[^\n]+15 días hábiles[^\n]+Es gratis/, 'V. derechos ARCO (arts. 31 y 34)')
  assert.match(c, /## Cambios a este aviso\nSi cambia, Arbrain te muestra la versión nueva/, 'VI. cambios')
  assert.match(c, /No transferimos tus datos a terceros/, 'art. 35')
  assert.match(c, /consentimiento expreso/, 'art. 7: datos patrimoniales')
  // Lo que de verdad sale (server/src/cliente/progreso.ts) está dicho: la conexión con arbrain.ai, no solo el monitoreo viejo.
  assert.match(c, /Conectar con arbrain\.ai \(apagado por defecto\)/)
  assert.match(c, /expediente y tu camino/)
  assert.match(c, /Agencia Española de Protección de Datos/)
  if (RESPONSABLE.correo) assert.ok(c.includes(RESPONSABLE.correo), 'V. correo para derechos')
})

test('términos y licencia: sin exención de dolo, sin tribunal inventado y sin ostentar una marca como registrada', () => {
  assert.match(TERMINOS.cuerpo, /Nada de esto limita nuestra responsabilidad por dolo o culpa grave/)
  assert.match(TERMINOS.cuerpo, /Procuraduría Federal del Consumidor/)
  assert.ok(!/renunciando a cualquier otro fuero|se limita a/.test(TERMINOS.cuerpo))
  assert.match(TERMINOS.cuerpo, /SECURITY\.md/)
  assert.match(LICENCIA.cuerpo, /signos distintivos de /)
  assert.ok(!/registrad[ao]|IMPI/.test(LICENCIA.cuerpo), 'LFPPI art. 386-XVI: no decir «registrada» sin registro')
  assert.match(LICENCIA.cuerpo, /archivo NOTICE/)
  assert.match(LICENCIA.cuerpo, /de buena fe, que tu trabajo se basa en Arbrain/)
})
