// «La historia de tu cerebro», ronda 4 (27 oct 2026): sin jerga de programador en lo visible. Los asuntos son reales,
// sacados de `git log main` de este repo. Contrato: docs/builds/harness-noche-2026-10-27/nodos/historia.md.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { eventoDe, fraseDe, nombreTrabajo, piezasProsa, sinTecnicismos, sinVersalitas } from '../../src/features/historia/modelo'

const IA = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const yo = { autor: 'Autora Ejemplo', correo: 'd@example.com', sha: 'a', padres: ['p'], fecha: '2026-10-27T10:00:00-06:00' }
const TECNICO = /--[a-z]|~\/|\/api\/|\.(md|ts|tsx|py|sh|jsonl)\b|\b[0-9a-f]{8,}\b|loopback|127\.0\.0\.1|\s\/[a-z]/i

test('ronda 4: los títulos reales del repo salen sin opciones de comando, rutas, ids ni «loopback»', () => {
  const casos: [string, RegExp][] = [
    ['Capturas: capturar-dueno --ancho-panel (arrastra el divisor del panel derecho al ancho pedido)', /^Capturar dueño \(arrastra el divisor/],
    ['Capturas: capturar-dueno con pasos en orden (--foto, --pausa, --clic-derecho, --clic-popup, --tamano)', /^Capturar dueño con pasos en orden$/],
    ['Teléfono: /perro y /casa ya no regresan al chat y tienen botón visible', /^Las secciones Perro y Casa ya no regresan/],
    ['Perro: el script de captura real acepta --clic y lista los accesos Perro/Casa', /acepta una opción nueva y lista/],
    ['Chat por navegador fuera de loopback (un fundador): el composer vuelve a aparecer', /desde otros equipos/],
    ['Arbrain web: las pantallas de error dejan stack y componentStack en ~/Library/Logs/Arbrain/errores-pantalla.jsonl', /^Las pantallas de error dejan el rastro del error$/],
    ['Casa 3D: contrato entre piezas, geometría (/api/casa/geometria), capturas de la casa', /^Contrato entre piezas, geometría, capturas de la casa$/],
    ['Perro: capturas reales de :10000/perro con la tarjeta Control reaccionando al simulador (390 y 1440)', /^Capturas reales de la sección Perro con/],
    ['Casa: la carga de /casa también como loading.tsx de la ruta (nunca negro en la entrada)', /^La carga de la sección Casa también como loading de la ruta/],
    ['Edición cliente: el panel no pide fuentes fuera de APIS_CLIENTE (adiós a los 404 de /api/cabina/trabajos cada pulso, reporte de fundador en el teléfono)', /fuera de la lista permitida \(adiós a los 404 de cada pulso/],
  ]
  for (const [asunto, espera] of casos) {
    const f = fraseDe(asunto).frase
    assert.match(f, espera, `${asunto}\n  → ${f}`)
    assert.doesNotMatch(f, TECNICO, `queda jerga en: ${f}`)
  }
})

test('ronda 4: lo que no es técnico se queda (unidades, siglas, «a/b» de texto, versiones)', () => {
  assert.equal(sinTecnicismos('marcha atrás a 0.2 m/s, evasión ON/OFF y título/selector'), 'marcha atrás a 0.2 m/s, evasión ON/OFF y título/selector')
  assert.match(fraseDe('Primer arranque v1.1: «Conectar con OpenRouter» en un clic (OAuth PKCE)').frase, /OpenRouter.*OAuth PKCE/)
  assert.match(fraseDe('Merge origin/main en entorno-panel; Casa solo en «Entorno físico»').frase, /^«Entorno panel» se puso al día con tu cerebro principal: casa solo/)
})

test('ronda 4: si tras limpiar no queda frase, va una genérica por sección o por parte del cerebro', () => {
  const archivos = [{ ruta: '.claude/skills/perro/SKILL.md', mas: 2, menos: 1, binario: false }]
  assert.equal(eventoDe({ ...yo, archivos, mensaje: `Perro HUD: --x --y\n\n${IA}` }).frase, 'Ajustes en Perro HUD')
  assert.equal(eventoDe({ ...yo, archivos, mensaje: `/perro --clic --pausa\n\n${IA}` }).frase, 'Ajustes en la sección Perro')
  assert.equal(eventoDe({ ...yo, archivos, mensaje: `fix: 61df618d e2a4\n\n${IA}` }).frase, 'Ajustes en las habilidades')
  // Una frase corta sin nada técnico es decisión de quien la escribió: se respeta.
  assert.equal(eventoDe({ ...yo, archivos, mensaje: 'Bitácora 6 AZUL: Verificación de v0.2.5' }).frase, 'Verificación de v0.2.5')
})

test('ronda 4: el nombre de un trabajo tampoco trae jerga', () => {
  assert.equal(nombreTrabajo('fundador-chat-navegador', { asuntos: ['Chat por navegador fuera de loopback (un fundador): el composer vuelve a aparecer'] }), 'Chat por navegador desde otros equipos')
})

test('ronda 4: en la prosa de memoria, los ids y las rutas largas van tras «ver id» / «ver ubicación»; los archivos, por su nombre', () => {
  const r = piezasProsa('sesión Claude 12345678-1234-4abc-8def-123456789abc (~/.claude/projects/-Users-x/12345678-1234-4abc-8def-123456789abc.jsonl), 27 oct')
  assert.deepEqual(r.map(p => p.tipo), ['texto', 'id', 'texto', 'ubicacion', 'texto'])
  const a = piezasProsa('ver user/mi-meta-del-trimestre-2026-10-14.md hoy')
  assert.deepEqual(a[1], { tipo: 'archivo', nombre: 'Mi meta del trimestre', texto: 'user/mi-meta-del-trimestre-2026-10-14.md' })
  assert.deepEqual(piezasProsa('a 0.2 m/s y A-1 → B-2'), [{ tipo: 'texto', texto: 'a 0.2 m/s y A-1 → B-2' }])
})

test('ronda 4: una barra suelta entre palabras o una sección no se pliega', () => {
  assert.deepEqual(piezasProsa('Ciudad de México / Bajío y /perro'), [{ tipo: 'texto', texto: 'Ciudad de México / Bajío y /perro' }])
})

test('pulido final: versalitas de commit a frase normal y «skill» como habilidad', () => {
  assert.equal(sinVersalitas('Leyenda del joystick; LENGUAJE, CONTRASTE, REPORTE, capturas'), 'Leyenda del joystick; lenguaje, contraste, reporte, capturas')
  assert.equal(sinVersalitas('Leer LO FIRMADO del HT'), 'Leer lo firmado del HT')
  assert.equal(sinVersalitas('VPS y API nuevas en HTML'), 'VPS y API nuevas en HTML')
  assert.equal(eventoDe({ ...yo, archivos: [{ ruta: '.claude/skills/clientes/SKILL.md', mas: 2, menos: 1, binario: false }], mensaje: `Aprendizajes del 27 oct en la skill\n\n${IA}` }).frase, 'Aprendizajes del 27 oct en la habilidad')
})
