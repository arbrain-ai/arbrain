import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { declaracionDecision, documentoDelResultado, esHiloRutina, HILOS_RUTINAS, hiloDeRutina, hiloDeSesion, IDS_HILOS_RUTINAS, IDS_HILOS_RUTINAS_RETIRADOS } from '../../src/shared/constants/rutinas-hilos'
import { horaDelUltimo, ordenarRecientes, pideDecision, resumenRutinas, sacarReportes } from '../../src/features/chat/lib/recientes-lista'
import { opcionesMenu } from '../../src/features/chat/lib/atajos-conversacion'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const ISO = '2026-10-04T12:00:00.000Z'
const ses = (extra: Partial<ChatSession> = {}): ChatSession => ({
  id: 'x', title: 'Hola', is_favorite: false, profile_id: null, created_at: ISO, updated_at: ISO, last_message_at: ISO,
  last_role: 'assistant', last_read_at: ISO, ...extra,
})

test('el mapa manda cada cron a Reportes (suena) o Información (silencio); lo no mapeado devuelve null', () => {
  const de = (j: string) => hiloDeRutina(j)?.id ?? null
  for (const j of ['morning-briefing', 'business-council', 'monthly-review', 'snapshot-finanzas', 'ritual-noche']) assert.equal(de(j), 'reportes', j)
  for (const j of ['os-audit', 'twitter-monitor', 'system-consciousness', 'intel-youtube-scan', 'intel-enrich']) assert.equal(de(j), 'informacion', j)
  assert.equal(de('evening-reflection'), null)
  assert.equal(de('workspace-backup'), null)
  assert.equal(de('cron'), null)
})

test('solo dos hilos: Reportes (el de siempre, sin id fijo) e Información (id fijo); los de la v1 se ocultan por id', () => {
  assert.deepEqual(HILOS_RUTINAS.map((h) => h.id), ['reportes', 'informacion'])
  assert.equal(HILOS_RUTINAS[0].sesionId, null)
  assert.equal(IDS_HILOS_RUTINAS.length, 1)
  const info = HILOS_RUTINAS[1]
  assert.equal(hiloDeSesion(info.sesionId!)?.id, 'informacion')
  assert.ok(esHiloRutina({ id: info.sesionId!, title: 'renombrado' }))
  for (const id of IDS_HILOS_RUTINAS_RETIRADOS) assert.ok(esHiloRutina({ id, title: 'x' }), 'retirado oculto')
  assert.ok(esHiloRutina({ title: 'Rutinas · Diario' }))
  assert.equal(esHiloRutina({ id: 'otro', title: 'Automatizaciones' }), false)
})

test('Recientes no muestra los hilos de Rutinas; Reportes sale de Fijadas hacia la carpeta sin perderse', () => {
  const diario = ses({ id: IDS_HILOS_RUTINAS_RETIRADOS[0], title: 'Rutinas · Diario' })
  const normal = ses({ id: 'n', title: 'Plan' })
  assert.deepEqual(ordenarRecientes([diario, normal]).map((s) => s.id), ['n'])
  const reportes = ses({ id: 'r', title: 'Automatizaciones', is_favorite: true })
  const fija = ses({ id: 'f', title: 'Otra', is_favorite: true })
  const { fijadas, reportes: r } = sacarReportes([reportes, fija])
  assert.deepEqual(fijadas.map((s) => s.id), ['f'])
  assert.equal(r?.id, 'r')
  assert.equal(sacarReportes([fija]).reportes, null)
})

test('el menú de Información solo deja marcar leído/no leído', () => {
  const hilo = ses({ id: HILOS_RUTINAS[1].sesionId!, title: HILOS_RUTINAS[1].titulo })
  assert.deepEqual(opcionesMenu(hilo).map((o) => o.id), ['no-leida'])
  assert.equal(opcionesMenu(ses({ ...hilo, last_read_at: null }))[0].etiqueta, 'Marcar como leído')
})

test('hora del último: HH:mm si es de hoy, día corto si no, nada sin mensaje', () => {
  const ahora = new Date(2026, 9, 4, 18, 0).getTime()
  assert.match(horaDelUltimo(new Date(2026, 9, 4, 6, 5).getTime(), ahora), /^06:05$/)
  assert.equal(horaDelUltimo(new Date(2026, 9, 3, 6, 5).getTime(), ahora), 'ayer')
  assert.equal(horaDelUltimo(0, ahora), '')
})

test('el documento del resultado: primera ruta .md/.html del repo o de ~; sin ruta, nada', () => {
  assert.equal(documentoDelResultado('Listo. Reporte en .claude/audits/os-audit-2026-10-04.md.'), '.claude/audits/os-audit-2026-10-04.md')
  assert.equal(documentoDelResultado('ver ~/Developer/x/reporte.html y más'), '~/Developer/x/reporte.html')
  assert.equal(documentoDelResultado('sin rutas aquí, solo texto.md'), null)
})

test('morado = el cron declaró una decisión y aún no la ves; abrir o contestar lo pasa a gris; sin declarar es gris', () => {
  const nuevo = ses({ ends_question: true, last_role: 'assistant', last_message_at: '2026-10-04T12:00:00Z', last_read_at: '2026-10-04T11:00:00Z' })
  assert.equal(pideDecision(nuevo), true)
  assert.equal(pideDecision({ ...nuevo, last_read_at: '2026-10-04T12:05:00Z' }), false, 'abrirlo = gris')
  assert.equal(pideDecision({ ...nuevo, last_role: 'user' }), false, 'contestarlo = gris')
  assert.equal(pideDecision({ ...nuevo, ends_question: false }), false, 'sin declarar, gris aunque no se haya leído')
  assert.equal(pideDecision({ ...nuevo, ends_question: null }), false)
})

test('cabecera de la carpeta: «N te necesitan» con morados, «al día» si todo está gris', () => {
  assert.deepEqual(resumenRutinas(0), { texto: 'al día', alDia: true })
  assert.equal(resumenRutinas(1).texto, '1 te necesita')
  assert.equal(resumenRutinas(2).texto, '2 te necesitan')
})

test('la declaración del cron: línea [pide_decision] se quita del texto y marca el morado', () => {
  const a = declaracionDecision('Resumen.\n[pide_decision: elegir precio del HT]\nMás texto.')
  assert.equal(a.pide, true)
  assert.equal(a.motivo, 'elegir precio del HT')
  assert.ok(!a.texto.includes('pide_decision'))
  assert.equal(declaracionDecision('[pide_decision]\nHola').pide, true)
  assert.equal(declaracionDecision('[pide_decision: false]\nHola').pide, false)
  const sin = declaracionDecision('Solo un reporte. ¿Todo bien?')
  assert.deepEqual(sin, { texto: 'Solo un reporte. ¿Todo bien?', pide: false, motivo: null })
})
