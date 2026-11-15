// «Ver resultados», «Recibido» y «Cerrar» del Taller (11 nov 2026, Daniel: «un visor de sus resultados… evidencia con
// imágenes, gráficas y todo»). La regla que elige la evidencia, el resumen humano y la lista «Recibidos».
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CARPETAS_EVIDENCIA, archivosTocados, candidatas, carpetasEvidencia, claseMedio, comandosDe, commitsDe, ordenarEvidencia, respuestaFinal, resumenHumano, rutasMencionadas, ultimoTurno, type PiezaEvidencia } from '../../src/features/cabina/evidencia-modelo'
import type { Paso } from '../../src/features/cabina/panel/actividad-modelo'
import { armarTablero, cuentas, estaRecibido, terminoSuEncargo, totalTablero } from '../../src/features/cabina/tablero-modelo'
import type { EstadoTablero, Terminal, Trabajos } from '../../src/features/cabina/trabajos-modelo'

// La respuesta real del agente de video-historia-marketing (11 nov), recortada.
const RESPUESTA = `El video está entregado en \`final/\`, a las 08:30, muy antes de las 18:00. Mide 9:57 con las dos sumas de Daniel incluidas, y nada se publicó.

**Qué hay en \`final/\`:**
- \`video.mp4\`: 1920×1080 a 30 cps, −15.0 LUFS.
- \`GUION.md\`: cada párrafo con su minuto.
- \`hoja.jpg\`: un cuadro cada 10 s.
- Las láminas viejas siguen en /Users/usuario/Developer/labs/v/work/laminas/lámina-03.png y en https://ejemplo.com/foto.png`

test('rutasMencionadas: solo medios, en orden, sin URLs ni repetidos, con acentos', () => {
  assert.deepEqual(rutasMencionadas(RESPUESTA), ['video.mp4', 'hoja.jpg', '/Users/usuario/Developer/labs/v/work/laminas/lámina-03.png'])
  assert.deepEqual(rutasMencionadas('Capturas: `capturas/mi captura.png`, ./final/a.webm y final/a.webm otra vez; docs/x.md no.'), ['capturas/mi captura.png', 'final/a.webm'])
  assert.deepEqual(rutasMencionadas('Reporte en ~/Desktop/reporte.pdf y la página en evidencia/panel.html.'), ['~/Desktop/reporte.pdf', 'evidencia/panel.html'])
  assert.deepEqual(rutasMencionadas(''), [])
  assert.deepEqual(rutasMencionadas(null), [])
})

test('claseMedio: imagen, video, pdf y html; lo demás no es evidencia visual', () => {
  assert.equal(claseMedio('a/b.PNG'), 'imagen')
  assert.equal(claseMedio('x.svg'), 'imagen')
  assert.equal(claseMedio('final/video.mp4'), 'video')
  assert.equal(claseMedio('r.pdf'), 'pdf')
  assert.equal(claseMedio('p.htm'), 'html')
  assert.equal(claseMedio('GUION.md'), null)
  assert.equal(claseMedio('src/a.ts'), null)
  assert.equal(claseMedio('final'), null)
})

test('candidatas: absoluta tal cual; relativa contra su carpeta, las de evidencia y dos arriba', () => {
  assert.deepEqual(candidatas('/tmp/a.png', '~/Developer/wt-x'), ['/tmp/a.png'])
  assert.deepEqual(candidatas('~/Desktop/a.png', ''), ['~/Desktop/a.png'])
  assert.deepEqual(candidatas('video.mp4', '~/Developer/labs/v/'), ['~/Developer/labs/v/video.mp4', '~/Developer/labs/v/final/video.mp4', '~/Developer/labs/v/evidencia/video.mp4', '~/Developer/labs/video.mp4'])
  // un worktree con cwd en wt/arbrain nombra arbrain/…: se prueba también desde la raíz del worktree
  assert.deepEqual(candidatas('docs/c.png', '/Users/usuario/Developer/wt-a/arbrain'), ['/Users/usuario/Developer/wt-a/arbrain/docs/c.png', '/Users/usuario/Developer/wt-a/docs/c.png', '/Users/usuario/Developer/docs/c.png'])
  assert.deepEqual(candidatas('a.png', ''), [])
  assert.deepEqual(carpetasEvidencia('~/Developer/labs/v/'), ['~/Developer/labs/v/final', '~/Developer/labs/v/evidencia'])
})

const pasos: Paso[] = [
  { k: 'encargo', texto: 'haz el video', n: 1 },
  { k: 'texto', texto: 'Empiezo.' },
  { k: 'herramienta', id: 'w0', nombre: 'Write', que: 'Escribe', detalle: '~/viejo/turno1.png' },
  { k: 'entrada', texto: 'ahora la versión 2' },
  { k: 'herramienta', id: 'w1', nombre: 'Write', que: 'Escribe', detalle: '~/Developer/labs/v/final/portada.png' },
  { k: 'herramienta', id: 'e1', nombre: 'Edit', que: 'Edita', detalle: '~/Developer/labs/v/scripts/render.py' },
  { k: 'herramienta', id: 'e2', nombre: 'Edit', que: 'Edita', detalle: '~/Developer/labs/v/scripts/render.py' },
  { k: 'herramienta', id: 'b1', nombre: 'Bash', que: 'Corre las pruebas', detalle: 'npm test 2>&1 | tail -3' },
  { k: 'resultado', id: 'b1', ok: true, salida: 'ok', lineas: 1 },
  { k: 'herramienta', id: 'b2', nombre: 'Bash', que: 'Codifica', detalle: 'ffmpeg -i a.mov final/video.mp4' },
  { k: 'resultado', id: 'b2', ok: false, salida: 'error', lineas: 1, codigo: 1 },
  { k: 'texto', texto: 'nota de un ayudante', sub: true },
  { k: 'texto', texto: RESPUESTA },
  { k: 'fin', codigo: 0 },
]

test('la bitácora: último turno, su respuesta final (no la de un ayudante), lo que tocó y sus comandos', () => {
  assert.equal(ultimoTurno(pasos)[0].k, 'herramienta')
  assert.equal(respuestaFinal(pasos), RESPUESTA)
  assert.equal(respuestaFinal([{ k: 'encargo', texto: 'x', n: 1 }]), null)
  assert.deepEqual(archivosTocados(pasos), ['~/Developer/labs/v/final/portada.png', '~/Developer/labs/v/scripts/render.py'])
  const c = comandosDe(pasos)
  assert.deepEqual(c.map(x => [x.comando, x.ok, x.codigo, x.prueba]), [['npm test 2>&1 | tail -3', true, null, true], ['ffmpeg -i a.mov final/video.mp4', false, 1, false]])
  assert.deepEqual(commitsDe('Quedó en el commit 3f2a1c9e y en commits `abc1234`.'), ['3f2a1c9e', 'abc1234'])
})

test('ordenarEvidencia: lo que nombró primero, luego sus carpetas, luego lo que escribió; sin repetir la misma ruta real', () => {
  const p = (ruta: string, de: PiezaEvidencia['de']): PiezaEvidencia => ({ ruta, nombre: ruta.split('/').pop()!, clase: 'imagen', url: `/u${ruta}`, bytes: 1, mtime: '', de })
  const r = ordenarEvidencia({ mencion: [p('/a/final/video.mp4', 'mencion')], carpeta: [p('/a/final/hoja.jpg', 'carpeta'), p('/a/final/video.mp4', 'carpeta')], escrito: [p('/a/final/hoja.jpg', 'escrito'), p('/a/x.png', 'escrito')] })
  assert.deepEqual(r.map(x => [x.ruta, x.de]), [['/a/final/video.mp4', 'mencion'], ['/a/final/hoja.jpg', 'carpeta'], ['/a/x.png', 'escrito']])
  assert.equal(ordenarEvidencia({ mencion: [], carpeta: Array.from({ length: 80 }, (_, i) => p(`/c/${i}.png`, 'carpeta')), escrito: [] }).length, 60)
})

test('resumenHumano: una o dos frases del primer párrafo, sin rutas, código, enlaces ni Markdown', () => {
  assert.equal(resumenHumano(RESPUESTA), 'El video está entregado, a las 08:30, muy antes de las 18:00. Mide 9:57 con las dos sumas de Daniel incluidas, y nada se publicó.')
  assert.equal(resumenHumano('## Listo\n\nDejé **tres capturas** en `/tmp/taller-evidencia/a.png` y el diff en src/a.ts. Todo pasa.'), 'Dejé tres capturas y el diff. Todo pasa.')
  assert.equal(resumenHumano('- solo viñetas\n- y más'), 'solo viñetas - y más')
  assert.equal(resumenHumano('Borré 29 GB y quedó en 97 GB libres (`df -h /`, 18:41).'), 'Borré 29 GB y quedó en 97 GB libres (18:41).')
  assert.equal(resumenHumano(''), null)
  assert.ok((resumenHumano('a'.repeat(50) + ' ' + 'palabra '.repeat(80)) ?? '').length <= 300)
})

test('la convención de carpetas es la misma en la app y en el agent-server (la nota que viaja en cada encargo)', () => {
  const servidor = readFileSync(path.join(__dirname, '../../server/src/cabina/evidencia.ts'), 'utf8')
  const lista = /CARPETAS_EVIDENCIA = \[([^\]]*)\]/.exec(servidor)?.[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''))
  assert.deepEqual(lista, [...CARPETAS_EVIDENCIA])
  for (const c of CARPETAS_EVIDENCIA) assert.ok(new RegExp(`\\b${c}/`).test(/NOTA_EVIDENCIA = `([^`]*)`/.exec(servidor)?.[1] ?? ''), `la nota nombra ${c}/`)
})

// ── Recibido y Cerrar en el tablero ──
const T = Date.parse('2026-11-11T16:00:00Z')
const tab = (columna: EstadoTablero['columna'], min: number): EstadoTablero => ({ columna, motivo: 'x', latido: { ultimaEscritura: T - min * 60_000, procesoVivo: columna === 'trabajando', edadMs: min * 60_000, umbralMs: 20 * 60_000 } })
const term = (id: number, columna: EstadoTablero['columna'], min: number, recibido?: number): Terminal => ({ id, titulo: `a${id}`, cwd: '~/Developer/wt-x', proc: 'claude', estado: columna === 'trabajando' ? 'trabajando' : 'esperando', actividad: null, ultimaAccion: null, ultimas: [], origen: 'sin-pantalla', tablero: tab(columna, min),
  subagente: { id, nombre: `agente ${id}`, harness: 'claude', encargo: 'e', cwd: '/tmp', creado: new Date(T - 3_600_000).toISOString(), origen: 'chat-a', ...(recibido != null ? { recibido: new Date(T - recibido * 60_000).toISOString() } : {}) } })
const datos = (terminales: Terminal[]): Trabajos => ({ sfterm: false, terminales, internas: [], servidores: [], servicios: [], leidoEn: '' })

test('«Recibido» saca lo terminado de su grupo y lo deja en «Recibidos» (en «Más actividad»); si vuelve a trabajar, regresa', () => {
  const t = armarTablero(datos([
    term(1, 'listo', 30, 10),     // terminó hace 30 min, recibido hace 10: Recibidos
    term(2, 'listo', 30),         // terminado sin marca: Listo
    term(3, 'listo', 5, 20),      // escribió después de la marca (un turno nuevo): vuelve a Listo
    term(4, 'trabajando', 1, 30), // trabaja otra vez: Trabajando, aunque tenga marca
    term(5, 'falló', 60, 2),      // lo que no pudo terminar también se puede dar por recibido
  ]), undefined, T)
  assert.deepEqual(t.recibidos.map(f => f.id), [5, 1])
  assert.deepEqual(t.listo.map(f => f.id).sort(), [2, 3])
  assert.deepEqual(t.trabajando.map(f => f.id), [4])
  assert.equal(t['falló'].length, 0)
  const c = cuentas(t)
  assert.equal(c.recibidos, 2)
  assert.equal(c.listos, 2)
  assert.equal(c.mas, 2)
  assert.equal(totalTablero(t), c.espera + c.trabajando + c.listos + c.mas)
})

test('Recibido, Cerrar y Ver resultados solo en un encargo que ya no trabaja ni pregunta', () => {
  const t = armarTablero(datos([term(1, 'listo', 3), term(2, 'trabajando', 1), term(3, 'te-espera', 2), term(4, 'murió', 40)]), undefined, T)
  const todas = [...t.listo, ...t.trabajando, ...t['te-espera'], ...t['murió']]
  assert.deepEqual(todas.filter(terminoSuEncargo).map(f => f.id).sort(), [1, 4])
  assert.equal(estaRecibido({ recibido: null, columna: 'listo', fin: 0 }), false)
  assert.equal(estaRecibido({ recibido: T, columna: 'te-espera', fin: T - 1 }), false)
  // la marca guarda la respuesta para el visor
  assert.equal(t.listo[0].respuesta, null)
})
