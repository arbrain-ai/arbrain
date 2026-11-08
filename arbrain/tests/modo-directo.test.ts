import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import * as web from '../src/lib/modo-directo/reglas'
import * as daemon from '../server/src/cabina/directo-reglas'
import { esAtajoDirecto } from '../src/lib/modo-directo/atajo'
import { cubrirDirectoScript, CLAVE_DIRECTO } from '../src/lib/modo-directo/cubrir'
import { GRUPOS, SECCIONES, buscarAjustes, seccionDeUrl } from '../src/features/configuracion/secciones'
import { ATAJOS_SHELL } from '../src/shared/navigation/atajos'

// Modo directo (7 nov 2026). Personas, correos, teléfonos y llaves INVENTADOS: un test viaja en git y al repo del alumno.
const { enmascarar, velo, taparDinero, taparSecretos, taparTelefonos, taparCorreos, iniciales, rutaSensibleDirecto, vistaVetadaDirecto, rutaAppVetadaDirecto, invocacionVetadaDirecto, velarHtml } = web
// Armados por partes: el escáner de fugas (con razón) no deja viajar un JWT ni una PEM literales, aunque sean de mentira.
const JWT_FALSO = ['ey' + 'JhbGciOiJIUzI1NiJ9', 'ey' + 'JzdWIiOiIxMTExIn0', 'abcdEFGHijkl'].join('.')
const PEM_FALSA = ['-----BEGIN OPENSSH ' + 'PRIVATE KEY-----', 'AAAA', '-----END OPENSSH ' + 'PRIVATE KEY-----'].join('\n')
const V = velo({ nombres: ['Rosaura Quintanilla', 'Rosaura', 'Quintanilla', 'Teodoro Bastidas', 'Teodoro', 'Bastidas', 'Panadería Sol'], literales: ['rosaura.prueba@example.com'] })

test('nombres de clientes → iniciales, con o sin acentos, sin tocar palabras que los contienen', () => {
  assert.equal(enmascarar('Rosaura Quintanilla pagó y Teodoro respondió.', V), 'R. Q. pagó y T. respondió.')
  assert.equal(enmascarar('Habló con rosaura quintanilla y con Panaderia Sol.', V), 'Habló con R. Q. y con P. S..')
  assert.equal(enmascarar('Teodorovich y Bastidasito no son clientes.', V), 'Teodorovich y Bastidasito no son clientes.')
  assert.equal(iniciales('Rosaura Quintanilla'), 'R. Q.')
})

test('el nombre del dueño se excluye; su homónimo con apellido sí se tapa', () => {
  const v = velo({ nombres: ['Fulano Mengano', 'Fulano', 'Mengano'] }, ['Fulano'])
  assert.equal(enmascarar('Fulano le escribe a Fulano Mengano.', v), 'Fulano le escribe a F. M..')
})

test('correos y teléfonos', () => {
  assert.equal(taparCorreos('escríbele a rosaura.prueba@example.com hoy'), 'escríbele a r•••@••• hoy')
  assert.equal(taparTelefonos('WhatsApp +52 999 000 1111'), 'WhatsApp +•• ••• ••• ••••')
  assert.equal(taparTelefonos('+34 600 00 00 00 y (55) 1234-5678 y 33 3000 0000'), '+•• ••• ••• •••• y ••• ••• •••• y ••• ••• ••••')
  // Fechas, horas, versiones y conteos no son teléfonos.
  const neutro = 'Hoy 2026-11-07 a las 12:00, v0.2.23, 3 de 10 lugares, commit 939981437, día 1 de 90.'
  assert.equal(enmascarar(neutro, V), neutro)
})

test('dinero en sus formas, conservando la moneda y la puntuación', () => {
  assert.equal(taparDinero('Cobró $1,111 EUR; quedan 2,222 EUR y MXN 33,333.'), 'Cobró $••• EUR; quedan ••• EUR y MXN •••.')
  assert.equal(taparDinero('5 mil pesos, US$ 99, €12.50, 100K USD'), '••• pesos, US$••• , €•••, ••• USD'.replace('US$••• ,', 'US$•••,'))
  assert.equal(taparDinero('$500 Mensual'), '$••• Mensual')
  // Sin moneda al lado, una cifra con miles también se tapa; los números sin separador (fechas, conteos, ids) no.
  assert.equal(taparDinero('Completos: 5 × 2,222; pidieron 1,111. Quedan 12 lugares, sub 5c12f645, año 2026.'), 'Completos: 5 × •••; pidieron •••. Quedan 12 lugares, sub 5c12f645, año 2026.')
})

test('secretos: llaves conocidas, env, JSON, Bearer, URLs con contraseña, JWT y llaves privadas', () => {
  const casos: Array<[string, string]> = [
    ['ANTHROPIC_API_KEY=sk-ant-api03-ABCDEFGHIJKLMNOP', 'ANTHROPIC_API_KEY=••••'],
    ['POLAR_ACCESS_TOKEN="polar_oat_ABCDEFGHIJKLMNOPQRST"', 'POLAR_ACCESS_TOKEN="••••"'],
    ['DB_PASSWORD: hunter2hunter2', 'DB_PASSWORD: ••••'],
    ['{"apiKey": "AIzaSyD-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"}', '{"apiKey": "••••"}'],
    ['curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwx"', 'curl -H "Authorization: Bearer ••••"'],
    ['postgres://postgres:superSecreta123@db.example.com:5432/x', 'postgres://postgres:••••@db.example.com:5432/x'],
    [`token ${JWT_FALSO}`, 'token ••••'],
    ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123 y sk-proj-ABCDEFGHIJKLMNOPQRSTUV', '•••• y ••••'],
    [PEM_FALSA, '[llave privada tapada]'],
  ]
  for (const [entra, sale] of casos) assert.equal(taparSecretos(entra), sale, entra)
  // Lo que no es secreto se queda.
  for (const x of ['PATH=/usr/bin', 'PWD=/Users/x', 'NODE_ENV=production', 'el token de acceso venció']) assert.equal(taparSecretos(x), x)
})

test('enmascarar es idempotente (el velo vuelve a pasar sobre lo ya tapado sin cambiarlo)', () => {
  const textos = [
    'Rosaura Quintanilla (rosaura.prueba@example.com, +52 999 000 1111) pagó $1,111 EUR. ANTHROPIC_API_KEY=sk-ant-api03-ABCDEFGHIJKLMNOP',
    'Bearer abcdefghijklmnopqrstuvwx y postgres://u:p4ssw0rd99@h/x',
  ]
  for (const t of textos) { const a = enmascarar(t, V); assert.notEqual(a, t); assert.equal(enmascarar(a, V), a) }
})

test('rutas sensibles del visor: .env, llaves, carpetas de credenciales, fichas de clientes', () => {
  for (const r of ['arbrain/server/.env', '.env.local', '~/.ssh/id_ed25519', '/Users/x/.aws/credentials', '~/.config/arbrain/llaves.json', '.claude/memory/reference/credenciales-operativas.md', '.claude/memory/project/fundadores/INDICE.md', 'docs/cliente/server.pem', 'notas/secret-plan.md', 'tmp/tokens.txt', 'user/expediente-x.md'])
    assert.equal(rutaSensibleDirecto(r), true, r)
  for (const r of ['docs/business-os/README.md', '/tmp/demo.md', 'contenido/youtube/videos/tokenizer.md', 'Movies/grabacion.mp4'])
    assert.equal(rutaSensibleDirecto(r), false, r)
})

test('vistas y páginas vetadas: Finanzas, Cohorte, Casa y Perro (y «centro», que es Finanzas)', () => {
  for (const v of ['finanzas', 'centro', 'cohorte', 'casa', 'perro']) assert.equal(vistaVetadaDirecto(v), true, v)
  for (const v of ['calendario', 'documento', 'lienzo', 'trabajos', 'memoria']) assert.equal(vistaVetadaDirecto(v), false, v)
  for (const p of ['/finanzas', '/finanzas/cobros', '/cohorte', '/casa/panel', '/perro', '/command-center']) assert.equal(rutaAppVetadaDirecto(p), true, p)
  for (const p of ['/chat', '/casas', '/calendar', '/']) assert.equal(rutaAppVetadaDirecto(p), false, p)
  assert.equal(invocacionVetadaDirecto({ vista: 'cohorte' }), 'vista')
  assert.equal(invocacionVetadaDirecto({ vista: 'documento', ruta: 'docs/a.md', versiones: ['arbrain/server/.env'] }), 'ruta')
  assert.equal(invocacionVetadaDirecto({ vista: 'documento', ruta: 'docs/a.md' }), null)
})

test('HTML de un documento: se tapa el texto; scripts, estilos y atributos quedan intactos', () => {
  const html = '<html><head><style>.a{color:red}</style><script>var k="Rosaura Quintanilla"</script></head><body><p class="x" data-n="Rosaura">Rosaura Quintanilla debe $2,222 EUR</p></body></html>'
  const sale = velarHtml(html, V)
  assert.match(sale, /<p class="x" data-n="Rosaura">R\. Q\. debe \$••• EUR<\/p>/)
  assert.match(sale, /<script>var k="Rosaura Quintanilla"<\/script>/)
  assert.match(sale, /<style>\.a\{color:red\}<\/style>/)
})

test('espejo: la copia del daemon es idéntica a la de la app y se comporta igual', () => {
  const desde = (f: string) => { const s = readFileSync(new URL(f, import.meta.url), 'utf8'); return s.slice(s.indexOf('/** Vistas de la Cabina y secciones que no se abren en directo.')) }
  assert.equal(desde('../server/src/cabina/directo-reglas.ts'), desde('../src/lib/modo-directo/reglas.ts'))
  const muestra = 'Rosaura Quintanilla, +52 999 000 1111, $1,111 EUR, ANTHROPIC_API_KEY=sk-ant-api03-ABCDEFGHIJKLMNOP'
  assert.equal(daemon.enmascarar(muestra, daemon.velo({ nombres: ['Rosaura Quintanilla'] })), web.enmascarar(muestra, web.velo({ nombres: ['Rosaura Quintanilla'] })))
  assert.deepEqual([...daemon.VISTAS_VETADAS_DIRECTO], [...web.VISTAS_VETADAS_DIRECTO])
})

test('interruptor: sección «Modo directo» en Ajustes (también se encuentra al buscar «stream») y atajo ⌘⇧D', () => {
  assert.ok(SECCIONES.some(s => s.id === 'directo'))
  assert.ok(GRUPOS.some(g => g.secciones.includes('directo')))
  assert.equal(seccionDeUrl('directo'), 'directo')
  assert.equal(seccionDeUrl('stream'), 'directo')
  assert.ok(buscarAjustes('transmitir').some(g => g.secciones.some(s => s.seccion.id === 'directo')))
  assert.equal(esAtajoDirecto({ metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, code: 'KeyD' }), true)
  assert.equal(esAtajoDirecto({ metaKey: false, ctrlKey: true, shiftKey: true, altKey: false, code: 'KeyD' }), true)
  assert.equal(esAtajoDirecto({ metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, code: 'KeyD' }), false, 'Ctrl+D sigue siendo del calendario')
  assert.equal(esAtajoDirecto({ metaKey: true, ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyD' }), false)
  assert.ok(ATAJOS_SHELL.flatMap(g => g.atajos).some(a => a.teclas.join('') === '⌘⇧D' && /modo directo/.test(a.accion)))
})

test('primer cuadro: la página nace cubierta si este equipo recuerda el modo prendido', () => {
  assert.match(cubrirDirectoScript, new RegExp(CLAVE_DIRECTO.replace('.', '\\.')))
  assert.match(cubrirDirectoScript, /data-directo-cubre/)
  assert.match(readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8'), /html\[data-directo-cubre\] body \{ visibility: hidden; \}/)
  assert.match(readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8'), /cubrirDirectoScript[\s\S]*<ModoDirecto \/>/)
})

test('cableado: rutas de datos vetadas, visor, Cabina, chat y aviso por turno', () => {
  const f = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  for (const r of ['src/app/api/finanzas/route.ts', 'src/app/api/cohorte/route.ts', 'src/app/api/cohorte/estratega/route.ts', 'src/app/api/casa/[accion]/route.ts', 'src/app/api/casa/planta/route.ts', 'src/app/api/casa/geometria/route.ts', 'src/app/api/casa/recorrido/route.ts', 'src/app/api/casa/recorrido/foto/route.ts', 'src/app/api/perro/[accion]/route.ts'])
    assert.match(f(r), /export async function GET\([^\n]*\{\n[^\n]*\n\s*\{ const veto = await vetoDirecto\(/, r)
  assert.match(f('src/app/api/cabina/documento/route.ts'), /rutaSensibleDirecto\(pedida\)[\s\S]*respuestaOculta/)
  assert.match(f('src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts'), /velarHtml\(/)
  assert.match(f('src/features/cabina/Cabina.tsx'), /<Aislada><CuerpoDirecto/)
  assert.match(f('src/app/(main)/dashboard-shell.tsx'), /rutaAppVetadaDirecto\(pathname\) \? <OcultoPorDirecto/)
  for (const c of ['src/features/chat/components/MarkdownMessage.tsx', 'src/features/chat/components/ToolCallCard.tsx', 'src/features/chat/components/TarjetaComando.tsx']) assert.match(f(c), /useTapar\(\)/, c)
  assert.match(f('server/src/chat-runtime/chat-job.ts'), /avisoDirecto\(\)/)
  assert.match(f('server/src/server.ts'), /parsed\.que === 'modo-directo'/)
})
