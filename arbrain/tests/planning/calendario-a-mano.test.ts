// Un fundador de la cohorte (v0.2.6): «no logré desplegar todos los objetivos del día en el calendario». Levy escribe
// calendario.json a mano; un evento con un detalle fuera del instructivo se descartaba en silencio. La lectura ahora
// completa lo evidente y avisa con su título lo que no entiende.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlumaLocal, RUTA_CALENDARIO, normalizarEvento } from '../../src/lib/planning/local'

const ZONA = 'America/Mexico_City'
const DIA = { action: 'snapshot', from: '2026-10-22T06:00:00.000Z', to: '2026-10-23T06:00:00.000Z' }

function conEventos(eventos: unknown[]) {
  const raiz = mkdtempSync(join(tmpdir(), 'cal-a-mano-'))
  mkdirSync(join(raiz, '.claude', 'plan'), { recursive: true })
  const texto = JSON.stringify({ version: 1, zona: ZONA, eventos, tareas: [] }, null, 2)
  writeFileSync(join(raiz, RUTA_CALENDARIO), texto)
  return { pluma: new PlumaLocal(raiz), raiz, texto }
}

test('los objetivos del día que Levy escribe a mano aparecen todos, aunque falten detalles', () => {
  const { pluma, raiz, texto } = conEventos([
    { id: 'ok', titulo: 'Escribir la oferta', inicio: '2026-10-22T09:00:00-06:00', fin: '2026-10-22T10:00:00-06:00' },
    { id: 'sin-fin', titulo: 'Mandar 10 mensajes', inicio: '2026-10-22T10:30:00-06:00' },
    { id: 'sin-zona', titulo: 'Grabar el video', inicio: '2026-10-22T12:00', fin: '2026-10-22T12:45' },
    { id: 'fin-igual', titulo: 'Gym', inicio: '2026-10-22', fin: '2026-10-22', todoElDia: true },
    { id: 'dia-con-hora', titulo: 'Día de enfoque', inicio: '2026-10-22T00:00:00-06:00', todoElDia: true },
    { id: 'en-ingles', title: 'Llamada con un cliente', start: '2026-10-22T17:00:00-06:00', end: '2026-10-22T17:30:00-06:00' },
    { id: 'solo-fecha', titulo: 'Revisar métricas', inicio: '2026-10-22' },
    { id: 'con-duracion', titulo: 'Leer', inicio: '2026-10-22T20:00:00-06:00', duracionMin: 30 },
  ])
  const s = pluma.snapshot(DIA)
  const por = Object.fromEntries(s.events.map(e => [e.externalId, e]))
  assert.deepEqual(Object.keys(por).sort(), ['con-duracion', 'dia-con-hora', 'en-ingles', 'fin-igual', 'ok', 'sin-fin', 'sin-zona', 'solo-fecha'])
  assert.equal(Date.parse(por['sin-fin'].end) - Date.parse(por['sin-fin'].start), 60 * 60_000, 'sin fin: una hora')
  assert.equal(new Date(por['sin-zona'].start).toISOString(), '2026-10-22T18:00:00.000Z', 'hora sin zona = hora de su calendario')
  assert.deepEqual([por['fin-igual'].allDay, por['fin-igual'].start, por['fin-igual'].end], [true, '2026-10-22', '2026-10-23'])
  assert.deepEqual([por['dia-con-hora'].allDay, por['dia-con-hora'].start], [true, '2026-10-22'])
  assert.equal(por['en-ingles'].title, 'Llamada con un cliente')
  assert.equal(por['solo-fecha'].allDay, true)
  assert.equal(Date.parse(por['con-duracion'].end) - Date.parse(por['con-duracion'].start), 30 * 60_000)
  assert.ok(s.health.every(h => h.state === 'fresh'))
  // Leer no reescribe lo que Levy o la persona escribieron.
  assert.equal(readFileSync(join(raiz, RUTA_CALENDARIO), 'utf8'), texto)
})

test('lo que no se entiende no desaparece en silencio: la vista lo nombra', () => {
  const { pluma } = conEventos([
    { id: 'bueno', titulo: 'Bloque', inicio: '2026-10-22T09:00:00-06:00', fin: '2026-10-22T10:00:00-06:00' },
    { id: 'malo', titulo: 'Objetivo sin hora', inicio: 'mañana temprano' },
    { titulo: 'Sin inicio' },
    'no soy un evento',
  ])
  const s = pluma.snapshot(DIA)
  assert.deepEqual(s.events.map(e => e.externalId), ['bueno'])
  const aviso = s.health.find(h => h.id === 'calendario-json')
  assert.equal(aviso?.state, 'error')
  assert.match(aviso!.message!, /3 eventos de calendario\.json no se pudieron leer/)
  assert.match(aviso!.message!, /«Objetivo sin hora»/)
  // La fuente sigue fresca: los demás eventos no se ocultan como «lectura vieja».
  assert.equal(s.health.find(h => h.id === 'local:mi-calendario')?.state, 'fresh')
})

test('normalizarEvento conserva el texto exacto cuando ya venía bien', () => {
  const e = normalizarEvento({ id: 'x', titulo: 'T', inicio: '2026-10-22T09:00:00-06:00', fin: '2026-10-22T10:00:00-06:00' }, ZONA)
  assert.deepEqual([e?.inicio, e?.fin, e?.todoElDia], ['2026-10-22T09:00:00-06:00', '2026-10-22T10:00:00-06:00', false])
  assert.equal(normalizarEvento(null, ZONA), null)
  assert.match(normalizarEvento({ titulo: 'sin id', inicio: '2026-10-22' }, ZONA)!.id, /^sin-id-1-/)
})

// El dato exacto del reporte: «solo mostró 1 objetivo, no los 3 que definimos». La caja del Día elegía uno solo.
test('el Día muestra los 3 objetivos del día, vengan de casillas, del registro o de tareas', async () => {
  const { objetivosDelDia } = await import('../../src/features/planning/dia-vivo')
  const { vistaObjetivos } = await import('../../src/lib/planning/local')
  const md = `# Objetivos\n\n## Octubre 2026\n**Mes:** Tres clientes\n\n### Semana 19-25\n**Foco:** Entregar\n\n#### Jue 22\n- [ ] Documentación del API para la empresa de las gorras\n- [ ] Setup de la tienda de los libros\n- [x] Modificación de los productos de Mercado Libre\n`
  const contexto = vistaObjetivos(md).context
  const deCasillas = objetivosDelDia({ dia: '2026-10-22', abiertas: [], completadas: [], diaDe: () => null, contexto })
  assert.deepEqual(deCasillas.map(o => o.titulo), ['Documentación del API para la empresa de las gorras', 'Setup de la tienda de los libros', 'Modificación de los productos de Mercado Libre'])
  const goal = (id: string, title: string, status = 'agreed') => ({ id, scope: 'day', start: '2026-10-22', end: '2026-10-23', title, success: 'x', notes: '', status, parentId: null }) as never
  const tarea = (id: string, title: string) => ({ id, title, labels: ['objetivo'], completed: false, priority: 1, due: '2026-10-22' }) as never
  const mezclados = objetivosDelDia({ dia: '2026-10-22', abiertas: [tarea('t1', 'Documentación del API para la empresa de las gorras')], completadas: [], diaDe: () => '2026-10-22',
    goals: [goal('g1', 'Setup de la tienda de los libros'), goal('g2', 'documentacion del api para la empresa de las gorras')], contexto })
  assert.equal(mezclados.length, 3, 'sin duplicados por título (acentos y mayúsculas no cuentan)')
  assert.equal(mezclados[0].origen, 'tarea')
  assert.deepEqual(objetivosDelDia({ dia: '2026-10-23', abiertas: [], completadas: [], diaDe: () => null, contexto }), [], 'otro día no hereda')
})
