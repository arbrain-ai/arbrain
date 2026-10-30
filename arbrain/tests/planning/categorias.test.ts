import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIAS, DEF, POR_COLOR_ID, bloquesDeCalendarios, categoriaDe, esCompromiso, formatoHoras, grupoDeCalendario, horasPorCategoria } from '../../src/features/planning/categorias'
import { diasQueCaben } from '../../src/features/planning/semana-horas'
import { tramoDia } from '../../src/features/planning/dia-vivo'
import { AA_GRAFICO, AA_TEXTO, colorEvento, contraste, TEMAS } from '../../src/lib/calendar/contraste'
// Los calendarios con nombre de persona o correo salen de la configuración de la instalación (src/config).
import { instalacion, NOMBRE_SEGUNDA } from '../../src/config'

const TIEMPO_CON = `Tiempo con ${NOMBRE_SEGUNDA()} 🫶🏽`

const cat = (title: string, cal = 'Trabajo Duro', extra: { description?: string; colorId?: string | null } = {}) => categoriaDe({ title, ...extra }, cal)

test('los 11 colorId de Google tienen categoría y el que escribe cada categoría vuelve a ella', () => {
  for (let i = 1; i <= 11; i++) assert.ok(POR_COLOR_ID[String(i)], `colorId ${i}`)
  for (const c of CATEGORIAS) assert.equal(POR_COLOR_ID[c.colorId], c.id)
})

test('el colorId de Google manda sobre el título', () => {
  assert.deepEqual(cat('🏋️ Gym · pierna', 'Trabajo Duro', { colorId: '9' }), { categoria: 'construir', origen: 'color' })
  assert.equal(cat('🏋️ Gym · pierna', 'Trabajo Duro', { colorId: null }).categoria, 'vida')
})

test('una semana de ejemplo se reparte en las cinco categorías', () => {
  const casos: [string, string][] = [
    ['🎥 Vlog crudo: tu historia en 3 min', 'crear'], ['🎙️ Masterclass: esqueleto y apertura', 'crear'], ['🎬 Ver la masterclass en video y firmar el guion', 'crear'],
    ['💬 Mensajes 1 a 1: invitación a la masterclass', 'vender'], ['📣 Prospección: invitar a la masterclass', 'vender'], ['📣 Anunciar la masterclass del 17 (portada nueva + post)', 'vender'],
    ['🎓 Preparar la clase: Supernova', 'ensenar'], ['Videollamada de comunidad · Producto y Arquitectura', 'ensenar'], ['Prospección en Frío con IA · Nivel 7', 'ensenar'],
    ['🧠 Preparar Nivel 7: enseñar el cerebro artificial y escuchar', 'ensenar'],
    ['🧠 Arbrain para la comunidad: limpiar y empaquetar', 'construir'], ['🛠️ Mejorar la UI/UX del producto', 'construir'], ['🧭 Blueprint: estudiar el Customer Journey', 'construir'],
    ['🏋️ Gym · brazo, espalda y abs', 'vida'], ['🍳 Desayuno', 'vida'], ['☕ Café · Publicar la masterclass 12 pm', 'vida'], ['👨‍👩‍👧 Comida familiar', 'vida'], ['🫶🏽 Paseo', 'vida'],
  ]
  for (const [titulo, esperada] of casos) assert.equal(cat(titulo).categoria, esperada, titulo)
})

test('palabras completas con acentos, sin emoji', () => {
  assert.equal(cat('Natación con papá').categoria, 'vida')
  assert.equal(cat('Grabación del curso').categoria, 'crear')
  assert.equal(cat('Revisar las aplicaciones de /aplicar').categoria, 'vender')
  // «plantilla» no es «plan»; «cenar» no es «cena»: solo palabras completas.
  assert.equal(cat('Plantilla nueva', 'Sin nombre').origen, 'defecto')
})

test('sin pistas en el título: la descripción, luego el calendario, luego Construir', () => {
  assert.deepEqual(cat('Bloque', 'X', { description: 'Grabar el video 4 [habit-system]' }), { categoria: 'crear', origen: 'descripcion' })
  assert.deepEqual(cat('Bloque', TIEMPO_CON), { categoria: 'vida', origen: 'calendario' })
  assert.deepEqual(cat('Bloque', 'Clases en vivo'), { categoria: 'ensenar', origen: 'calendario' })
  assert.deepEqual(cat('Bloque', 'ejemplo@gmail.com'), { categoria: 'vida', origen: 'calendario' })
  assert.deepEqual(cat('Bloque', 'Trabajo Duro'), { categoria: 'construir', origen: 'calendario' })
  assert.deepEqual(cat('Bloque', null as unknown as string), { categoria: 'construir', origen: 'defecto' })
})

test('compromiso = invitados que no son Daniel o enlace de Meet', () => {
  assert.equal(esCompromiso({}), false)
  assert.equal(esCompromiso({ attendees: [{ self: true }] }), false)
  assert.equal(esCompromiso({ attendees: [{ self: true }, { self: false }] }), true)
  assert.equal(esCompromiso({ meetUrl: 'https://meet.google.com/x' }), true)
})

test('horas por categoría recortadas al periodo', () => {
  const h = (n: number) => n * 3_600_000
  const r = horasPorCategoria([{ inicio: h(-1), fin: h(2), categoria: 'crear' }, { inicio: h(3), fin: h(4.5), categoria: 'vida' }, { inicio: h(30), fin: h(31), categoria: 'vender' }], 0, h(24))
  assert.deepEqual([r.crear, r.vida, r.vender, r.ensenar], [2, 1.5, 0, 0])
  assert.deepEqual([formatoHoras(0), formatoHoras(0.75), formatoHoras(1.5), formatoHoras(12)], ['—', '45 min', '1,5 h', '12 h'])
})

test('cada color de categoría se lee en claro y oscuro: texto ≥ 4.5:1 y acento ≥ 3:1', () => {
  for (const c of CATEGORIAS) for (const tema of ['claro', 'oscuro'] as const) {
    const e = colorEvento(c.color, tema)
    assert.ok(contraste(e.texto, e.fondo) >= AA_TEXTO, `${c.id} ${tema} texto`)
    assert.ok(contraste(e.acento, TEMAS[tema].fondo) >= AA_GRAFICO, `${c.id} ${tema} acento`)
  }
})

test('3 · 4 · 7: por defecto los días que caben con ≥ 110 px por columna', () => {
  assert.equal(diasQueCaben(482), 4) // panel de 520 px menos el canal de horas
  assert.equal(diasQueCaben(352), 3) // iPhone
  assert.equal(diasQueCaben(800), 7)
  assert.equal(diasQueCaben(200), 3)
})

test('el Día muestra siempre 05–22, y más si algo cae fuera', () => {
  const dia = new Date(2026, 9, 10)
  const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m).getTime()
  assert.deepEqual(tramoDia([], dia), { desde: 300, hasta: 1320 })
  assert.deepEqual(tramoDia([{ inicio: at(11), fin: at(12) }], dia), { desde: 300, hasta: 1320 })
  assert.deepEqual(tramoDia([{ inicio: at(4, 15), fin: at(5) }, { inicio: at(22, 30), fin: at(23, 10) }], dia), { desde: 240, hasta: 1440 })
})

// 10 oct 2026: Trabajo y Vida en el menú «Calendarios»; lo de Vida, siempre gris de Vida.
test('los calendarios caen en Trabajo o Vida por su título, con emoji al final o en mayúsculas', () => {
  assert.equal(grupoDeCalendario('Trabajo Duro'), 'trabajo')
  // El calendario principal (el correo de la persona dueña) es de Trabajo.
  assert.equal(grupoDeCalendario(instalacion().correoDueno), 'trabajo')
  assert.equal(grupoDeCalendario(TIEMPO_CON), 'vida')
  assert.equal(grupoDeCalendario('EJERCICIO'), 'vida')
  assert.equal(grupoDeCalendario('Tareas · Todoist'), null)
  assert.equal(grupoDeCalendario('Comidas raras'), 'vida')
  assert.equal(grupoDeCalendario('Comidasx'), null)
})

test('un evento de un calendario de Vida es Vida aunque traiga color propio de Google o palabras de trabajo', () => {
  assert.deepEqual(categoriaDe({ title: '🎥 Grabar', colorId: '6' }, 'Comidas'), { categoria: 'vida', origen: 'calendario' })
  assert.equal(categoriaDe({ title: 'Deep work', colorId: '9' }, 'Trabajo Duro').categoria, 'construir')
})

test('el menú agrupa Trabajo, Vida y Otros, y pinta Vida con su gris', () => {
  const cal = (titulo: string, color: string | null = '#ff0000') => ({ id: titulo, titulo, color, activo: true })
  const b = bloquesDeCalendarios([cal('Transporte'), cal('Trabajo Duro'), cal('Tareas · Todoist'), cal('Comidas', '#00ff00')])
  assert.deepEqual(b.map(x => [x.id, x.calendarios.map(c => c.titulo)]), [['trabajo', ['Trabajo Duro']], ['vida', ['Transporte', 'Comidas']], ['otros', ['Tareas · Todoist']]])
  assert.ok(b[1].calendarios.every(c => c.color === DEF.vida.color))
  assert.equal(b[0].calendarios[0].color, '#ff0000')
})
