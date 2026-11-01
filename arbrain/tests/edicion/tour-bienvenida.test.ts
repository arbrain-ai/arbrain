// Tour de bienvenida de Levy (1 nov 2026, Daniel: «obvio solo se mira una vez, en futuras actualizaciones si el usuario
// ya lo vio no se lo vuelve a mostrar»). Primera vez se muestra; segunda no; una actualización con capítulo nuevo muestra
// solo la novedad, una vez; saltar cuenta como visto. Más: el guion de la plantilla es el incorporado, lee manuales y
// rutinas en vivo y el chat esconde los pedidos mientras el recorrido está abierto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DESTINOS_MOSTRAR, estadoTourDe, FUENTE_TOUR, manualesDelIndice, parsearGuion, pausarTour, planTour, saltarTour,
  siguienteCapitulo, textoCapitulo, textoManuales, textoRutinas, tourDe, type EstadoTour, type Guion,
} from '../../src/features/primer-arranque/lib/tour'
import { GUION_INCORPORADO } from '../../src/features/primer-arranque/textos/tour-guion'
import { entregarSiguiente, leerGuion, leerManuales, pausar, planActual, resumenRutinas, RUTA_GUION, saltar } from '../../src/features/primer-arranque/lib/tour-servidor'
import { guardarPrimerArranque, leerPrimerArranque } from '../../src/features/primer-arranque/lib/estado'
import { FUENTE_BIENVENIDA, soloBienvenida } from '../../src/features/primer-arranque/textos/bienvenida'
import { VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'

const repo = (r: string) => new URL(`../../${r}`, import.meta.url)
const fuente = (r: string) => readFileSync(repo(r), 'utf8')
const PLANTILLA = 'empaquetado/plantillas/skills/tour-bienvenida/guion.md'
const AHORA = '2026-11-01T12:00:00.000Z'

/** Recorre el tour completo con «siguiente» y devuelve los ids entregados y el estado final. */
function recorrer(t: EstadoTour | null, g: Guion) {
  const ids: string[] = []
  let e = t
  for (let i = 0; i < 50; i++) {
    const r = siguienteCapitulo(e, g, AHORA)
    e = r.estado
    if (!r.capitulo) break
    ids.push(r.capitulo.id)
    if (r.ultimo) break
  }
  return { ids, estado: e! }
}

const v1 = parsearGuion(GUION_INCORPORADO)
const v2: Guion = { version: 2, conocidos: v1.conocidos, capitulos: [...v1.capitulos.slice(0, 3), { id: 'voz', titulo: 'Tu voz', mostrar: 'ajustes:voz', texto: 'Ahora me puedes dictar.' }, ...v1.capitulos.slice(3)] }

test('el guion de la plantilla es el incorporado y trae todos los capítulos que pidió Daniel', () => {
  // Fuente única: si editas guion.md de la plantilla, copia el mismo texto a textos/tour-guion.ts.
  if (existsSync(repo(PLANTILLA))) assert.equal(GUION_INCORPORADO, fuente(PLANTILLA))
  const ids = v1.capitulos.map(c => c.id)
  for (const id of ['inicio', 'app', 'personalidad', 'meta', 'retrato', 'contexto', 'memoria', 'manuales', 'rutinas', 'freno']) assert.ok(ids.includes(id), `falta el capítulo ${id}`)
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos')
  assert.equal(v1.version, 1)
  // Cada «mostrar» es un destino que el chat sabe abrir; corto por capítulo.
  for (const c of v1.capitulos) {
    if (c.mostrar) assert.ok((DESTINOS_MOSTRAR as readonly string[]).includes(c.mostrar), `${c.id}: destino ${c.mostrar}`)
    assert.ok(c.texto.length < 1100, `${c.id} es largo (${c.texto.length})`)
  }
  assert.ok(v1.capitulos.find(c => c.id === 'manuales')!.texto.includes('{{manuales}}'))
  assert.ok(v1.capitulos.find(c => c.id === 'rutinas')!.texto.includes('{{rutinas}}'))
  // El botón de las precargadas dice «Activar» (y «Probar una vez»): el guion usa las mismas palabras (1 nov 2026).
  assert.match(v1.capitulos.find(c => c.id === 'rutinas')!.texto, /\*\*Activar\*\*.*\*\*Probar una vez\*\*/)
  for (const c of v1.capitulos) {
    assert.doesNotMatch(c.texto, /Reanudar|Probar ahora/, `${c.id}: botón que no existe en las precargadas`)
    // Avatar de 40 a 55 años, poco técnico: sin nombres de archivo ni rutas.
    assert.doesNotMatch(c.texto, /\.md\b|\.claude|now\.md|`/, `${c.id}: nombra un archivo`)
    assert.ok(c.texto.length < 700, `${c.id}: sin muros de texto (${c.texto.length})`)
  }
  // Quien ya usaba Arbrain antes del recorrido da por vistos estos; todos existen.
  assert.deepEqual(v1.conocidos, ['inicio', 'app', 'meta', 'memoria', 'freno'])
  // La cabecera del guion es para quien lo edita: no es capítulo.
  assert.ok(!v1.capitulos.some(c => /Cómo se escribe/.test(c.texto)))
})

test('primera vez: se muestra entero, en orden; al terminar queda visto con la versión', () => {
  const p = planTour(null, v1)!
  assert.equal(p.modo, 'completo'); assert.equal(p.enCurso, false); assert.equal(p.total, v1.capitulos.length)
  const { ids, estado } = recorrer(null, v1)
  assert.deepEqual(ids, v1.capitulos.map(c => c.id))
  assert.equal(estado.curso, null)
  assert.equal(estado.version, 1)
  assert.deepEqual([...estado.vistos].sort(), v1.capitulos.map(c => c.id).sort())
  assert.equal(estado.fecha, AHORA)
})

test('segunda vez: ya visto, no vuelve (ni con el mismo guion en otra versión del app)', () => {
  const { estado } = recorrer(null, v1)
  assert.equal(planTour(estado, v1), null)
  assert.equal(siguienteCapitulo(estado, v1, AHORA).capitulo, null)
  // Solo cambia el texto de un capítulo (mismo id): no es novedad.
  const retocado: Guion = { version: 3, conocidos: [], capitulos: v1.capitulos.map(c => c.id === 'app' ? { ...c, texto: 'Otro texto.' } : c) }
  assert.equal(planTour(estado, retocado), null)
})

test('actualización con un capítulo nuevo: solo «Novedades» de ese, una vez', () => {
  const { estado } = recorrer(null, v1)
  const p = planTour(estado, v2)!
  assert.equal(p.modo, 'novedades'); assert.equal(p.total, 1); assert.deepEqual(p.pendientes, ['Tu voz'])
  const r = siguienteCapitulo(estado, v2, AHORA)
  assert.equal(r.capitulo?.id, 'voz'); assert.ok(r.novedades && r.primero && r.ultimo)
  const texto = textoCapitulo(r.capitulo!, {}, r)
  assert.match(texto, /^\*\*Novedades de esta versión/)
  assert.match(texto, /Eso es todo lo nuevo\.$/)
  assert.equal(r.estado.version, 2)
  assert.equal(planTour(r.estado, v2), null, 'una sola vez')
})

test('saltar cuenta como visto: en la primera vez, a medias y en las novedades', () => {
  const s = saltarTour(null, v1, AHORA)
  assert.equal(planTour(s, v1), null)
  assert.equal(s.version, 1)
  // A medias: lo que faltaba también queda visto.
  const medio = siguienteCapitulo(siguienteCapitulo(null, v1, AHORA).estado, v1, AHORA).estado
  assert.equal(planTour(medio, v1)?.hechos, 2)
  assert.equal(planTour(saltarTour(medio, v1, AHORA), v1), null)
  // Novedades saltadas: no vuelven.
  const nov = saltarTour(s, v2, AHORA)
  assert.equal(planTour(nov, v2), null)
  assert.equal(nov.version, 2)
})

test('pausar y retomar: el recorrido sigue donde iba', () => {
  let e = siguienteCapitulo(null, v1, AHORA).estado
  e = siguienteCapitulo(e, v1, AHORA).estado
  const pausado = pausarTour(e)
  const p = planTour(pausado, v1)!
  assert.ok(p.enCurso && p.pausado)
  assert.equal(p.siguiente?.id, v1.capitulos[2].id)
  assert.equal(p.ultimo?.id, v1.capitulos[1].id)
  const r = siguienteCapitulo(pausado, v1, AHORA)
  assert.equal(r.capitulo?.id, v1.capitulos[2].id)
  assert.equal(planTour(r.estado, v1)?.pausado, false)
  // Pausar sin recorrido abierto no inventa uno.
  assert.equal(pausarTour(null).curso, null)
})

test('lo leído del archivo se normaliza (editado a mano o de otra versión)', () => {
  assert.equal(estadoTourDe(undefined), null)
  assert.equal(estadoTourDe('x'), null)
  const e = estadoTourDe({ vistos: ['app', 3], curso: { modo: 'raro', pendientes: ['meta'], hechos: [] } })!
  assert.deepEqual(e.vistos, ['app'])
  assert.equal(e.curso?.modo, 'completo')
  assert.equal(e.curso?.pausado, false)
})

test('datos vivos: índice de manuales y rutinas reales (precargadas en pausa)', () => {
  const indice = fuente('empaquetado/plantillas/cerebro/manuales/README.md')
  const m = manualesDelIndice(indice)
  assert.ok(m.some(x => x.archivo === 'rutinas.md' && /Rutinas/.test(x.para)))
  assert.ok(m.some(x => x.archivo === 'google-calendar-gmail.md'))
  assert.equal(new Set(m.map(x => x.archivo)).size, m.length, 'sin repetir')
  assert.ok(!m.some(x => x.archivo === 'README.md'))
  // Al dueño, el título en español (el texto del enlace), nunca el archivo.
  assert.equal(m.find(x => x.archivo === 'rutinas.md')?.titulo, 'Tus rutinas')
  for (const a of ['estratega.md', 'now-sincronizado.md', 'retrato.md', 'memoria.md']) assert.ok(m.some(x => x.archivo === a), `el índice no trae ${a}`)
  const lista = textoManuales(m)
  assert.doesNotMatch(lista, /\.md|`/)
  assert.match(lista, /^- Google Calendar y Gmail$/m)
  // Un manual nuevo en el índice aparece sin tocar código; un índice viejo (enlace = archivo) usa su primera celda.
  assert.ok(manualesDelIndice('| Mi estratega | [estratega.md](estratega.md) | sí |').some(x => x.archivo === 'estratega.md' && x.para === 'Mi estratega' && x.titulo === 'Mi estratega'))
  assert.equal(manualesDelIndice('- [modo-monje.md](modo-monje.md)')[0].titulo, 'Modo monje')
  const r = resumenRutinas({ tasks: [
    { id: 'a', prompt: 'Resúmeme mi día', schedule: '0 7 * * *', status: 'paused', next_run: null, last_run: null, last_result: null },
    { id: 'b', prompt: 'Revisa mis metas', schedule: '0 9 * * 1', status: 'active', next_run: null, last_run: null, last_result: null },
  ] })!
  const t = textoRutinas(r)
  assert.match(t, /Resúmeme mi día\*\* · Cada día a las 7:00 · en pausa/)
  assert.match(t, /Revisa mis metas\*\* · Cada lunes a las 9:00 · activa/)
  // Las «De Arbrain» salen por su nombre, después de las tuyas: su prompt es para el modelo (empieza con rutas).
  const conPrecargada = resumenRutinas({
    tasks: [
      { id: 'arbrain-reporte-manana', prompt: 'Reporte de la mañana\n\nLee primero, si existen: .claude/now.md…', schedule: '0 7 * * 1-5', status: 'paused', next_run: null, last_run: null, last_result: null },
      { id: 'mia', prompt: 'Resúmeme mi día', schedule: '0 7 * * *', status: 'active', next_run: null, last_run: null, last_result: null },
    ],
    precargadas: { 'arbrain-reporte-manana': { nombre: 'Reporte de la mañana', paraQue: 'Tu día en una página.', carpeta: '.claude/reportes/diario/' } },
  })!
  assert.deepEqual(conPrecargada.map(x => x.titulo), ['Resúmeme mi día', 'Reporte de la mañana'])
  assert.doesNotMatch(textoRutinas(conPrecargada), /\.claude|\.md/)
  assert.match(textoRutinas([]), /Aún no tienes rutinas/)
  assert.match(textoRutinas(null), /Taller › Rutinas/)
  assert.equal(resumenRutinas(null), null)
})

test('el chat: los capítulos son de Levy, los pedidos esperan al final y la barra tiene sus mandos', () => {
  const b = { role: 'assistant', metadata: { source: FUENTE_BIENVENIDA } }
  const c = { role: 'assistant', metadata: { source: FUENTE_TOUR } }
  assert.ok(soloBienvenida([b, c, c]), 'bienvenida + capítulos sigue siendo «solo bienvenida»')
  assert.ok(!soloBienvenida([b, c, { role: 'user' }]))
  assert.ok(!soloBienvenida([c]))
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /soloBienvenida\(messages\) && !tourEnCurso/)
  assert.match(chat, /<BarraTour sesionId=/)
  const barra = fuente('src/features/primer-arranque/components/BarraTour.tsx')
  for (const x of ['Siguiente', 'Muéstramelo', 'Pausar', 'Saltar el recorrido', 'Retomar el recorrido', 'Ver las novedades']) assert.ok(barra.includes(x), x)
  // Al terminar la bienvenida, Levy abre el recorrido en la misma conversación.
  assert.match(fuente('src/app/api/primer-arranque/route.ts'), /entregarSiguiente\(\)/)
})

function conCopia(fn: (dirs: { datos: string; home: string }) => void | Promise<void>) {
  const datos = mkdtempSync(join(tmpdir(), 'arbrain-tour-datos-'))
  const home = mkdtempSync(join(tmpdir(), 'arbrain-tour-home-'))
  const antes = { d: process.env.ARBRAIN_DATA_DIR, h: process.env.ARBRAIN_HOME, e: process.env.ARBRAIN_EDICION }
  process.env.ARBRAIN_DATA_DIR = datos; process.env.ARBRAIN_HOME = home; process.env.ARBRAIN_EDICION = 'cliente'
  const fin = () => {
    for (const [k, v] of [['ARBRAIN_DATA_DIR', antes.d], ['ARBRAIN_HOME', antes.h], ['ARBRAIN_EDICION', antes.e]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    rmSync(datos, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true })
  }
  return Promise.resolve(fn({ datos, home })).finally(fin)
}
// Alumno nuevo: la bienvenida deja `tour: null`. Sin ese campo es alguien que ya usaba Arbrain antes del recorrido.
const completar = () => guardarPrimerArranque({ aceptado: { version: VERSION_TEXTOS, fecha: AHORA }, nombre: 'Fulano de Tal', completado: AHORA, sesionBienvenida: null, tour: null })
const completarAntes = () => guardarPrimerArranque({ aceptado: { version: VERSION_TEXTOS, fecha: AHORA }, nombre: 'Fulano de Tal', completado: '2026-10-20T12:00:00.000Z', sesionBienvenida: null })

test('en disco: antes de «Listo» no hay tour; después, primera vez entera, segunda nada; saltar es visto', async () => {
  await conCopia(async ({ home, datos }) => {
    assert.equal(planActual(), null, 'sin terminar la bienvenida, nada')
    completar()
    assert.equal(planActual()?.modo, 'completo')
    // El guion editable de la copia manda; con su índice de manuales y las rutinas del daemon.
    mkdirSync(join(home, '.claude', 'skills', 'tour-bienvenida'), { recursive: true })
    writeFileSync(join(home, RUTA_GUION), '---\nversion: 7\n---\n## uno · Uno\nHola {{nombre}}.\n\n## manuales · Manuales\n<!-- mostrar: taller -->\n{{manuales}}\n\n## rutinas · Rutinas\n{{rutinas}}\n')
    mkdirSync(join(home, 'arbrain', 'cerebro', 'manuales'), { recursive: true })
    writeFileSync(join(home, 'arbrain', 'cerebro', 'manuales', 'README.md'), '| Quiere… | Manual |\n|---|---|\n| Mi estratega | [estratega.md](estratega.md) |\n')
    assert.equal(leerGuion().version, 7)
    assert.deepEqual(leerManuales(), [{ archivo: 'estratega.md', titulo: 'Mi estratega', para: 'Mi estratega' }])
    const e1 = await entregarSiguiente({ ahora: AHORA })
    assert.equal(e1?.texto, '**Uno**\n\nHola Fulano.')
    const e2 = await entregarSiguiente({ ahora: AHORA })
    assert.match(e2!.texto, /^- Mi estratega$/m)
    assert.doesNotMatch(e2!.texto, /estratega\.md/)
    assert.equal(e2?.capitulo.mostrar, 'taller')
    pausar()
    assert.equal(planActual()?.pausado, true)
    const e3 = await entregarSiguiente({ ahora: AHORA, rutinas: async () => [{ titulo: 'Resúmeme mi día', cuando: 'Cada día a las 7:00', activa: false }] })
    assert.match(e3!.texto, /Resúmeme mi día\*\* · Cada día a las 7:00 · en pausa/)
    assert.equal(e3?.plan, null)
    const t = leerPrimerArranque().tour as EstadoTour
    assert.equal(t.version, 7); assert.deepEqual(t.vistos, ['uno', 'manuales', 'rutinas'])
    // Segunda vez: nada (otra apertura de la app lee el mismo archivo).
    assert.equal(planActual(), null)
    assert.equal(await entregarSiguiente({ ahora: AHORA }), null)
    // Actualización con un capítulo nuevo: solo ese.
    writeFileSync(join(home, RUTA_GUION), readFileSync(join(home, RUTA_GUION), 'utf8').replace('---\nversion: 7', '---\nversion: 8') + '\n## voz · Tu voz\nDíctame.\n')
    assert.deepEqual(planActual()?.pendientes, ['Tu voz'])
    saltar()
    assert.equal(planActual(), null, 'saltar las novedades también es visto')
    assert.equal((leerPrimerArranque().tour as EstadoTour).version, 8)
    assert.ok(existsSync(join(datos, 'primer-arranque.json')))
  })
})

test('sin guion en la copia: entra el incorporado; saltar en la primera vez no vuelve', async () => {
  await conCopia(async () => {
    completar()
    assert.equal(leerGuion().capitulos[0].id, 'inicio')
    assert.equal(planActual()?.total, v1.capitulos.length)
    saltar()
    assert.equal(planActual(), null)
    assert.equal(await entregarSiguiente(), null)
  })
})

test('alumno que actualiza (ya usaba Arbrain antes del recorrido): solo Novedades, una vez; el nuevo ve todo', async () => {
  await conCopia(async () => {
    completarAntes()
    const p = planActual()!
    assert.equal(p.modo, 'novedades')
    const nuevos = v1.capitulos.filter(c => !v1.conocidos.includes(c.id))
    assert.deepEqual(p.pendientes, nuevos.map(c => c.titulo))
    assert.ok(!p.pendientes.includes('Antes de empezar') && !p.pendientes.includes('El freno'))
    const ids: string[] = []
    let primero = ''
    for (let i = 0; i < 20; i++) {
      const e = await entregarSiguiente({ ahora: AHORA, rutinas: async () => [] })
      if (!e) break
      if (!ids.length) primero = e.texto
      ids.push(e.capitulo.id)
    }
    assert.deepEqual(ids, nuevos.map(c => c.id))
    assert.match(primero, /^\*\*Novedades de esta versión de tu Arbrain\.\*\*/)
    assert.equal(planActual(), null, 'una sola vez')
    const t = leerPrimerArranque().tour as EstadoTour
    assert.deepEqual([...t.vistos].sort(), v1.capitulos.map(c => c.id).sort())
  })
  // Saltar las novedades también es visto.
  await conCopia(async () => {
    completarAntes()
    saltar()
    assert.equal(planActual(), null)
  })
  // Lógica pura: sin campo `tour` y con la bienvenida hecha, los conocidos cuentan como vistos; con `tour: null`, nada.
  assert.deepEqual(tourDe({ completado: AHORA }, v1)?.vistos, v1.conocidos)
  assert.equal(tourDe({ completado: AHORA, tour: null }, v1), null)
  assert.equal(tourDe({ completado: null }, v1), null)
  assert.match(fuente('src/app/api/primer-arranque/route.ts'), /nueva && estado\.tour === undefined \? \{ tour: null \}/)
})

test('los párrafos del guion se unen (el chat pinta cada salto de línea); viñetas y datos vivos se respetan', () => {
  const g = parsearGuion('## a · A\nUna línea\nque sigue.\n\n- viñeta\n  que sigue\n- otra\n\n{{rutinas}}\n')
  assert.equal(g.capitulos[0].texto, 'Una línea que sigue.\n\n- viñeta que sigue\n- otra\n\n{{rutinas}}')
  for (const c of v1.capitulos) for (const l of c.texto.split('\n')) assert.ok(!/^\s{2,}\S/.test(l), `${c.id}: línea suelta «${l}»`)
})
