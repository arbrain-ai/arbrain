// Modo Autónomo con consentimiento (0.2.15, 29 oct 2026; docs/builds/autonomia-alumno-2026-10-29/SPEC.md), parte web:
// la bienvenida decide el nivel en un paso (Autónomo marcado, casillas vacías), Ajustes ofrece los tres niveles con el
// texto y el retiro, la píldora «Autónomo · Volver a preguntar» y «Pausar todo» regresan a «carpeta», la ruta manda al
// daemon la versión y la huella que recibió (nunca las inventa), y el diálogo de confirmación cierra con Escape sin
// rechazar. La licencia dice Apache-2.0 y los textos legales cambian de versión.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { ETIQUETA, PASOS, pasosVisibles } from '../../src/features/primer-arranque/lib/pasos'
import { LICENCIA, TERMINOS, VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'
import { mensajeBienvenida } from '../../src/features/primer-arranque/textos/bienvenida'
import { avisoAutonomo, consentimientoVigente, cuerpoAceptacion, FICHAS_MODO, NOMBRE_MODO, RED_MINIMA, type TextoAutonomia } from '../../src/features/seguridad/lib/seguridad'
import { listoParaAceptar, CASILLAS_VACIAS } from '../../src/features/seguridad/components/ConsentimientoAutonomia'
import { explicacionComputerUse } from '../../src/features/permisos/lib/disponibilidad'
import { avisarSiTapada } from '../../src/features/permisos/lib/pendientes'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const TEXTO: TextoAutonomia = { version: 'autonomia-v1-borrador-2026-10-29', sha256: 'a'.repeat(64), titulo: 'Qué significa el modo autónomo', cuerpo: 'x', casillas: ['uno', 'dos'], aviso: 'borrador' }

test('tres niveles, Autónomo primero y recomendado; los nombres son los del daemon', () => {
  assert.deepEqual(FICHAS_MODO.map(f => f.modo), ['autonomo', 'carpeta', 'preguntar'])
  assert.equal(FICHAS_MODO[0].recomendado, true)
  assert.equal(FICHAS_MODO.filter(f => f.recomendado).length, 1)
  assert.deepEqual(NOMBRE_MODO, { preguntar: 'Preguntar siempre', carpeta: 'Automático en mi carpeta', autonomo: 'Autónomo' })
  const daemon = fuente('server/src/cliente/modo-permisos.ts')
  for (const [k, v] of Object.entries(NOMBRE_MODO)) assert.match(daemon, new RegExp(`${k}: '${v}'`), k)
  assert.match(daemon, /MODO_RECOMENDADO: ModoPermisos = 'autonomo'/)
  assert.match(RED_MINIMA, /Dinero/)
  assert.match(avisoAutonomo(null), /^Modo Autónomo: Levy actúa sin preguntarte, salvo la red mínima\./)
  // Lo retirado no vuelve por la web: ni frase ni «Sin preguntar».
  const lib = fuente('src/features/seguridad/lib/seguridad.ts')
  assert.ok(!/FRASE_SIN_FRENO|fraseCoincide|nombre: 'Sin preguntar'/.test(lib))
})

test('el consentimiento: casillas vacías por defecto, las dos para aceptar; la app devuelve la versión y la huella del GET', () => {
  assert.deepEqual(CASILLAS_VACIAS, [false, false])
  assert.equal(listoParaAceptar([true, false]), false)
  assert.equal(listoParaAceptar([true, true]), true)
  assert.deepEqual(cuerpoAceptacion(TEXTO, 'bienvenida'), { modo: 'autonomo', acepto: { version: TEXTO.version, sha256: TEXTO.sha256 }, via: 'bienvenida' })
  assert.equal(consentimientoVigente({ texto: TEXTO, consentimiento: { ts: 1, version: TEXTO.version, sha256: TEXTO.sha256, app: '', so: '', via: 'ajustes' } }), true)
  assert.equal(consentimientoVigente({ texto: TEXTO, consentimiento: { ts: 1, version: 'autonomia-v0', sha256: TEXTO.sha256, app: '', so: '', via: 'ajustes' } }), false)
  assert.equal(consentimientoVigente({ texto: TEXTO, consentimiento: null }), false)
  // El componente: el texto viene de fuera, las casillas nacen vacías, el botón solo con las dos.
  const c = fuente('src/features/seguridad/components/ConsentimientoAutonomia.tsx')
  assert.match(c, /texto\.casillas\.map/)
  assert.match(c, /Leer qué significa/)
  assert.ok(!/version: '|sha256: '/.test(c), 'la app no trae versión ni huella propias')
})

test('la bienvenida: paso «autonomia» en vez de «computer», Autónomo marcado, Continuar bloqueado sin las dos casillas', () => {
  assert.deepEqual([...PASOS], ['bienvenida', 'legal', 'llaves', 'autonomia', 'monitoreo', 'donde', 'listo'])
  assert.equal(ETIQUETA.autonomia, 'Autonomía')
  assert.deepEqual(pasosVisibles(true, false), [...PASOS])
  assert.deepEqual(pasosVisibles(false, true), ['bienvenida', 'legal', 'llaves', 'autonomia', 'donde', 'listo'])
  const c = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(c, /useState<ModoPermisos>\('autonomo'\)/, 'Autónomo preseleccionado')
  assert.match(c, /useState<Casillas>\(CASILLAS_VACIAS\)/, 'casillas sin marcar')
  assert.match(c, /paso === 'autonomia' \? \(modo !== 'autonomo' \|\| vigente \|\| \(listoParaAceptar\(casillas\) && !!permisos\?\.texto\)\)/, 'Continuar solo con las dos casillas')
  assert.match(c, /cuerpoAceptacion\(permisos\.texto, 'bienvenida'\)/)
  assert.match(c, /'Empezar en modo autónomo'/)
  assert.match(c, /¿Cómo quieres que trabaje tu cerebro\?/)
  assert.match(c, /En Windows no hay caja de arena: Autónomo corre comandos directo en tu computadora\./)
  assert.match(c, /fetch\('\/api\/seguridad\/permisos', \{ cache: 'no-store' \}\)/, 'el texto viene del daemon')
  assert.match(c, /Que también use tu pantalla \(computer use\)/)
  assert.ok(!/paso === 'computer'/.test(c))
})

test('la ruta: aflojar lleva el secreto; aceptar manda versión y huella; retirar y decidir después no llevan secreto', () => {
  assert.ok(apiPermitidaEnCliente('/api/seguridad/permisos'))
  const r = fuente('src/app/api/seguridad/permisos/route.ts')
  assert.match(r, /soloAppCliente\(request, true\)/)
  assert.match(r, /const MODOS = new Set\(\['preguntar', 'carpeta', 'autonomo'\]\)/)
  assert.match(r, /confirmar: body\.modo !== 'preguntar'/)
  assert.match(r, /acepto = a && typeof a\.version === 'string' && typeof a\.sha256 === 'string'/)
  assert.match(r, /if \(body\.retirar === true\) return alDaemon\('\/permisos', \{ method: 'POST', body: JSON\.stringify\(\{ retirar: true, via \}\) \}\)/)
  assert.match(r, /if \(body\.decidirDespues === true\) return alDaemon/)
  assert.ok(!/sinFreno|frase/.test(r))
})

test('Ajustes, la píldora y «Pausar todo» vuelven a «carpeta» en un clic y lo registran por su vía; el consentimiento se retira', () => {
  const ui = fuente('src/features/seguridad/components/Seguridad.tsx')
  assert.match(ui, /data-pildora-autonomo/)
  assert.match(ui, /volver\('pildora'\)/)
  assert.match(ui, /volver\('pausa'\)/)
  assert.match(ui, /Volver a que me pregunte/)
  assert.match(ui, /mandar\(\{ modo: 'carpeta', via: 'ajustes' \}\)/)
  assert.match(ui, /mandar\(\{ retirar: true, via: 'ajustes' \}\)/)
  assert.match(ui, /Retirar mi consentimiento/)
  assert.match(ui, /cuerpoAceptacion\(estado\.texto, 'ajustes'\)/)
  // La migración (venir de «Sin preguntar» o del freno quitado, o un texto nuevo) se ofrece una vez y se puede decidir después.
  assert.match(ui, /data-tarjeta-migracion/)
  assert.match(ui, /mandar\(\{ decidirDespues: true \}\)/)
  assert.match(ui, /estado\.reaceptar \? 'version' : 'migracion'/)
  // Los avisos del daemon (Windows sin Python) se ven.
  assert.match(ui, /data-aviso-permisos/)
  assert.ok(!/QuitarFreno|FRASE_SIN_FRENO|useSinFrenoGlobal|Poner el freno/.test(ui))
  assert.match(fuente('src/app/(main)/dashboard-shell.tsx'), /<FrenoGeneral \/>/)
})

test('el diálogo de confirmación: Escape cierra sin rechazar (A7), nada «se rechaza sola» (A3) y el botón dice lo que hace (A8)', () => {
  const d = fuente('src/features/permisos/components/ConfirmacionesHumanas.tsx')
  assert.match(d, /e\.key === 'Escape' && !ocupado\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); \(alCerrar \?\? alResolver\)\(\) \}/)
  assert.ok(!/resolver\('rechazar'\) \}\n/.test(d.slice(d.indexOf("e.key === 'Escape'"), d.indexOf("e.key === 'Escape'") + 200)), 'Escape ya no rechaza')
  assert.ok(!/se rechaza sola/.test(d))
  assert.match(d, /Si no decides ahora, queda en tu cola: nada pasa sin tu clic\. Escape cierra sin decidir\./)
  assert.match(d, /\(c\.botonSi \|\| 'Permitir esta acción'\)/)
  // En el daemon: abrir una página dice «Abrir <host>», no «Sí, enviarlo».
  assert.match(fuente('server/src/cliente/frase-humana.ts'), /return `Abrir \$\{host/)
})

test('A6: el sondeo sigue con la ventana tapada y avisa una vez por pendiente nueva', () => {
  const p = fuente('src/features/permisos/lib/pendientes.ts')
  assert.match(p, /const SONDEO_OCULTO_MS = 5000/)
  assert.match(p, /timer = window\.setInterval\(tic, SONDEO_MS\)/)
  const base = { categoria: 'otra' as const, origen: 'manos' as const, resumen: 'clic', creada: 1, expira: 9e15, estado: 'pendiente' as const }
  assert.deepEqual(avisarSiTapada([{ ...base, id: 'cf_1' }], true), [], 'visible: no avisa')
  assert.deepEqual(avisarSiTapada([{ ...base, id: 'cf_2' }], false), ['cf_2'], 'tapada: avisa')
  assert.deepEqual(avisarSiTapada([{ ...base, id: 'cf_2' }], false), [], 'la misma, no dos veces')
  // Y el daemon manda la del sistema al crear la pendiente.
  assert.match(fuente('server/src/server.ts'), /if \(tipo === 'pendiente'\) \{\n\s+const r = avisarSistema\(c\.id, 'Levy espera tu clic'/)
})

test('textos: la licencia es Apache-2.0 (no «no es una venta del código»), los términos nombran los niveles, y la versión sube', () => {
  assert.equal(VERSION_TEXTOS, 'borrador-2026-10-29')
  assert.match(LICENCIA.cuerpo, /Apache License 2\.0/)
  assert.match(LICENCIA.cuerpo, /redistribuirlo/)
  assert.ok(!/No es una venta del código|no puedes redistribuirlo|Revenderlo, sublicenciarlo/.test(LICENCIA.cuerpo))
  assert.match(LICENCIA.resumen, /Apache-2\.0/)
  assert.match(TERMINOS.cuerpo, /«Preguntar siempre», «Automático en mi carpeta» \(.*\) o «Autónomo»/)
  assert.match(TERMINOS.cuerpo, /en «Autónomo» queda como lo dejaste/)
  // El LICENSE.txt que viaja al alumno es la Apache-2.0.
  assert.match(fuente('empaquetado/generador/plantillas/LICENSE.txt'), /Apache License/)
})

test('la bienvenida de Levy y computer use dicen el nivel elegido', () => {
  assert.match(mensajeBienvenida('Fulano', { modo: 'autonomo' }), /Elegiste el modo Autónomo: hago lo que me pides sin pedirte un clic en cada paso/)
  assert.match(mensajeBienvenida('Fulano', { modo: 'carpeta' }), /Elegiste «Automático en mi carpeta»/)
  assert.match(mensajeBienvenida('Fulano', { modo: 'preguntar' }), /Antes de enviar, pagar, borrar o publicar algo te pido confirmación con un clic/)
  assert.match(mensajeBienvenida('Fulano'), /te pido confirmación con un clic/)
  assert.match(explicacionComputerUse('darwin', true), /En modo Autónomo queda como lo dejes/)
  assert.match(explicacionComputerUse('darwin'), /se apaga cada vez que cierras Arbrain/)
  assert.match(fuente('src/app/api/primer-arranque/route.ts'), /alDaemon\('\/permisos', \{ plazoMs: 2_000 \}\)/)
})

test('CHANGELOG: la 0.2.15 sigue (bajo las versiones nuevas), con el texto legal como borrador y Windows por probar, y la 0.2.14 sigue', () => {
  const c = fuente('empaquetado/distribucion/CHANGELOG.md')
  const v15 = c.slice(c.indexOf('## v0.2.15'), c.indexOf('## v0.2.14'))
  assert.ok(c.indexOf('## v0.2.15') < c.indexOf('## v0.2.14'))
  assert.match(v15, /Modo Autónomo/)
  assert.match(v15, /La red mínima/)
  assert.match(v15, /Licencia/)
  assert.match(v15, /es un borrador/)
  assert.match(v15, /Windows real/)
  assert.match(c, /Tu primera skill/)
  // Desde la 0.2.16, VERSION ya no es 0.2.15: la entrada de la 0.2.15 se queda debajo de la nueva.
  assert.ok(c.indexOf('## v0.2.16') < c.indexOf('## v0.2.15'))
})
