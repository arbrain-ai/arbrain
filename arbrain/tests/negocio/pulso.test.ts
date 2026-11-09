// Tu negocio › El pulso (7 nov 2026, Daniel: «el libro no debería verlo… luce aburrido… prefiero un lienzo… un botón que
// abra y redirija al lienzo en una nueva pestaña»; 15:05: «sistema nervioso de todas las interconexiones»). Fija que cada
// órgano pinta un número SOLO con una fuente real (Cohorte, Finanzas, el Taller, la voz del cliente), que sin sensor dice
// qué falta, que nada se vuelve 0 por falta de dato, que Finanzas no dice SAT ni «te queda», que la voz del cliente se lee
// con tolerancia y se vela en directo, y que el libro ya no es una pestaña del dueño.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { RUTA_EMBUDO, validarEmbudo, type Embudo } from '../../src/features/negocio/embudo'
import {
  canalesDe, FUENTES_COMPRADOR, leerVoz, lienzoSistema, ORGANOS, piezaDe, pulsoComprador, pulsoEntrega, pulsoFinanzas,
  pulsoMarketing, pulsoSistemas, pulsoVenta, velarVoz, type CohortePulso, type RespuestaComprador,
} from '../../src/features/negocio/pulso'
import { velo } from '../../src/lib/modo-directo/reglas'
import type { FinancesPayload } from '../../src/features/finances/types/finances'
import type { CronSnapshot } from '../../src/features/planning/types'
import type { Trabajos } from '../../src/features/cabina/trabajos-modelo'

const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const raiz = (p: string) => new URL(`../../../${p}`, import.meta.url)

const cohorte = (n: Partial<CohortePulso['numeros']>, fundadores: Partial<CohortePulso['fundadores'][number]>[] = []) => ({
  cupo: 10, numeros: { cuposPagados: null, llamadas: null, ...n }, fundadores,
}) as unknown as CohortePulso

test('seis órganos, en el orden que pidió Daniel', () => {
  assert.deepEqual([...ORGANOS], ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas'])
})

test('marketing: sin sensor, dice qué lo mediría y nunca trae cifra', () => {
  assert.equal(pulsoMarketing().estado, 'leyendo')
  const m = pulsoMarketing({ data: { activo: true, generado: null, canales: [], falta: 'El sensor de marketing todavía no corre en esta máquina.' } })
  assert.equal(m.estado, 'sin-sensor')
  assert.equal(m.cifra, undefined)
  assert.ok(m.falta && m.falta.length > 20)
})

test('venta y entrega salen de Cohorte: leyendo, oculto en directo, error sin cero y números reales', () => {
  assert.equal(pulsoVenta({}).estado, 'leyendo')
  assert.equal(pulsoVenta({ data: cohorte({ cuposPagados: 3 }) }, true).estado, 'oculto')
  const err = pulsoVenta({ error: 'La fuente respondió 500.' })
  assert.equal(err.estado, 'error'); assert.equal(err.cifra, undefined)
  // Polar no respondió: no es 0.
  const sinPolar = pulsoVenta({ data: cohorte({ cuposPagados: null }) })
  assert.equal(sinPolar.estado, 'error'); assert.equal(sinPolar.cifra, undefined)
  const v = pulsoVenta({ data: cohorte({ cuposPagados: 12, llamadas: { total: 20, presento: 15, noLlego: 3, canceladas: 2, porVenir: 0, sinMarca: 0 } }) })
  assert.equal(v.estado, 'numero'); assert.equal(v.cifra, '12'); assert.equal(v.abre, 'cohorte')
  assert.deepEqual(v.detalle, ['Cupo de 10', '15 de 20 llamadas se presentaron'])

  const sinFundadores = pulsoEntrega({ data: cohorte({ cuposPagados: 0 }) })
  assert.equal(sinFundadores.estado, 'sin-sensor')
  const e = pulsoEntrega({ data: cohorte({ cuposPagados: 3 }, [{ cerebro: {} as never, atorado: null }, { cerebro: null, atorado: { paso: 'instalar', desde: '2026-11-01' } }, { cerebro: {} as never, atorado: null }]) })
  assert.equal(e.cifra, '2'); assert.equal(e.unidad, 'cerebros conectados')
  assert.deepEqual(e.detalle, ['De 3 fundadores', '1 atorado en un paso'])
})

test('finanzas es un espejo: entró, salió y tienes; sin SAT ni «te queda»; sin movimientos dice qué falta', () => {
  const base = { accounts: [], snapshots: [], recurring: [], movements: [{ id: 'm' }], summary: { income_range_mxn: 480, burn_range_mxn: 210.4 }, tienes: { mxn: 950, cierre: '2026-11-01', al_dia: false, cobros_despues_mxn: 0, cobros_hasta: null } }
  const f = pulsoFinanzas({ data: base as unknown as FinancesPayload })
  assert.equal(f.estado, 'numero')
  assert.equal(f.cifra, '$480 MXN')
  assert.deepEqual(f.detalle, ['Salió $210 MXN', 'Tienes $950 MXN'])
  assert.doesNotMatch(JSON.stringify(f), /SAT|te queda|impuesto/i)
  const vacia = pulsoFinanzas({ data: { ...base, movements: [], tienes: null } as unknown as FinancesPayload })
  assert.equal(vacia.estado, 'sin-sensor'); assert.equal(vacia.cifra, undefined)
  assert.equal(pulsoFinanzas({ data: base as unknown as FinancesPayload }, true).estado, 'oculto')
})

test('sistemas: las rutinas en pausa no cuentan; las que fallaron se dicen; los agentes del Taller se suman', () => {
  const crons = { timeZone: 'America/Mexico_City', loadedAt: '', scheduleError: null, historyError: null,
    jobs: [
      { id: 'a', schedule: '', status: 'active', next_run: null, last_run: null, last_result: null },
      { id: 'b', schedule: '', status: 'active', next_run: null, last_run: null, last_result: null },
      { id: 'c', schedule: '', status: 'active', next_run: null, last_run: null, last_result: null },
      { id: 'd', schedule: '', status: 'paused', next_run: null, last_run: null, last_result: null },
    ],
    runs: [
      { id: '1', job_id: 'a', status: 'success', created_at: '2026-11-07T10:00:00Z', response: null, error: null },
      { id: '2', job_id: 'b', status: 'failed', created_at: '2026-11-07T10:00:00Z', response: null, error: 'x' },
      { id: '3', job_id: 'c', status: 'running', created_at: '2026-11-07T10:00:00Z', response: null, error: null },
    ] } satisfies CronSnapshot
  const trabajos = { sfterm: false, servidores: [], servicios: [], leidoEn: '', terminales: [
    { id: 1, titulo: 'x', cwd: '', proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [] },
    { id: 2, titulo: 'zsh', cwd: '', proc: 'zsh', estado: 'terminal', actividad: null, ultimaAccion: null, ultimas: [] },
  ] } as unknown as Trabajos
  const s = pulsoSistemas({ data: crons }, { data: trabajos })
  assert.equal(s.estado, 'numero'); assert.equal(s.cifra, '2'); assert.equal(s.abre, 'taller')
  assert.deepEqual(s.detalle, ['De 3 rutinas activas', '1 falló en su última corrida', '1 agente trabajando ahora'])
  assert.equal(pulsoSistemas({ data: { ...crons, jobs: [] } }).estado, 'sin-sensor')
  assert.equal(pulsoSistemas({ error: 'sin daemon' }).estado, 'error')
})

test('la voz del cliente se lee con tolerancia: temas sueltos u objetos, citas sin texto fuera y contadas', () => {
  const { voz, errores } = leerVoz({
    actualizado: '2026-11-07',
    citas: [
      { texto: 'No tengo tiempo para aprender esto', quien: 'Fulano Mengano', tipo: 'objeción', tema: 'tiempo', nivel_conciencia: 'consciente del problema', objecion_tipo: 'tiempo' },
      { quien: 'Sin texto' },
      { texto: 'Quiero que mi negocio funcione sin mí' },
    ],
    resumen: { top_objeciones: ['Tiempo', { texto: 'Precio', veces: 4 }, { tipo: 'confianza', n: 11, cita_ids: ['c003'] }], top_deseos: [{ tema: 'Libertad', n: 3 }], top_dolores: 'no es lista' },
  })
  assert.ok(voz)
  assert.equal(voz.citas.length, 2)
  assert.deepEqual(errores, ['Cita 2: falta «texto».'])
  assert.deepEqual(voz.resumen.top_objeciones, [{ texto: 'Tiempo', veces: null }, { texto: 'Precio', veces: 4 }, { texto: 'confianza', veces: 11 }])
  assert.deepEqual(voz.resumen.top_deseos, [{ texto: 'Libertad', veces: 3 }])
  assert.deepEqual(voz.resumen.top_dolores, [])
  assert.equal(voz.citas[1].quien, null)
  assert.equal(leerVoz({ resumen: {} }).voz, null)
  assert.equal(leerVoz([]).voz, null)
})

test('modo directo: quien en iniciales y el dinero tapado en las citas', () => {
  const { voz } = leerVoz({ citas: [{ texto: 'Pagaría $300 USD si me lo instalan', quien: 'Fulano Mengano' }], resumen: { top_objeciones: ['Cuesta 250 pesos'] } })
  const v = velarVoz(voz!, velo({ nombres: [] }))
  assert.equal(v.citas[0].quien, 'F. M.')
  assert.doesNotMatch(v.citas[0].texto, /300/)
  assert.doesNotMatch(v.resumen.top_objeciones[0].texto, /250/)
})

test('mente del comprador: sin archivo dice que falta el sensor; con citas, cuántas y la objeción nº 1', () => {
  const sin: RespuestaComprador = { activo: true, avatar: null, vehiculo: null, voz: { ruta: 'x', existe: false, datos: null }, directo: false }
  const a = pulsoComprador({ data: sin })
  assert.equal(a.estado, 'sin-sensor'); assert.equal(a.abre, 'comprador'); assert.match(a.falta!, /voz del cliente/i)
  const { voz } = leerVoz({ citas: [{ texto: 'Uno' }, { texto: 'Dos' }], resumen: { top_objeciones: ['Tiempo'] } })
  const b = pulsoComprador({ data: { ...sin, voz: { ruta: 'x', existe: true, datos: voz } } })
  assert.equal(b.cifra, '2'); assert.deepEqual(b.detalle, ['Objeción nº 1: Tiempo'])
  assert.equal(pulsoComprador({}).estado, 'leyendo')
})

test('avatar y vehículo salen de sus canónicos (nombre y una frase entera), nunca inventados', () => {
  const md = '# El vehículo del alumno: consultor de negocios con IA\n\nIntro.\n\n**Qué cambia:** el alumno no vende «IA», vende criterio de negocio (diagnosticar e implementar). Otra frase.\n'
  const v = piezaDe(md, FUENTES_COMPRADOR.vehiculo)
  assert.equal(v.nombre, 'Consultor de negocios con IA')
  assert.equal(v.frase, 'El alumno no vende «IA», vende criterio de negocio (diagnosticar e implementar).')
  // Sin ancla: el nombre y nada más.
  assert.equal(piezaDe('# Algo: otra cosa\n\nNada que ver.\n', FUENTES_COMPRADOR.vehiculo).frase, null)
  for (const f of Object.values(FUENTES_COMPRADOR)) {
    if (!existsSync(raiz(f.ruta))) continue
    const pz = piezaDe(readFileSync(raiz(f.ruta), 'utf8'), f)
    assert.ok(pz.nombre.length > 3, `${f.ruta}: nombre`)
    assert.ok(pz.frase && pz.frase.length > 20, `${f.ruta}: el ancla sigue en el canónico`)
  }
})

test('canal: la Adquisición de cada embudo, lo que opera primero', () => {
  const e = { embudos: [{ id: 'A', nombre: 'Canal' }, { id: 'B', nombre: 'Oferta' }], etapas: [
    { id: 'a.adq', embudo: 'A', etapa: 'Adquisición', nombre: 'Videos', que_pasa: '', opera_hoy: false },
    { id: 'b.adq', embudo: 'B', etapa: 'Adquisición', nombre: 'Atraer', que_pasa: '', opera_hoy: true },
    { id: 'b.conv', embudo: 'B', etapa: 'Conversión', nombre: 'Cobrar', que_pasa: '', opera_hoy: true },
  ] } as unknown as Embudo
  assert.deepEqual(canalesDe(e).map(c => [c.embudo, c.nombre, c.opera]), [['Oferta', 'Atraer', true], ['Canal', 'Videos', false]])
  assert.deepEqual(canalesDe(null), [])
})

test('lienzo_sistema: vacío = «lienzo en camino»; el validador pide texto; el embudo del dueño trae el campo', () => {
  assert.equal(lienzoSistema(null), null)
  assert.equal(lienzoSistema({ lienzo_sistema: '' } as Embudo), null)
  assert.equal(lienzoSistema({ lienzo_sistema: '  pg-123 ' } as Embudo), 'pg-123')
  const esquema = JSON.parse(leer('docs/embudo/embudo.schema.json'))
  assert.equal(esquema.properties.lienzo_sistema.type, 'string')
  const real = raiz(RUTA_EMBUDO)
  if (existsSync(real)) {
    const e = JSON.parse(readFileSync(real, 'utf8'))
    assert.equal(typeof e.lienzo_sistema, 'string')
    assert.ok(lienzoSistema(e), 'el dueño ya llenó lienzo_sistema: el botón queda activo')
    assert.ok(validarEmbudo(e).ok)
    const malo = validarEmbudo({ ...e, lienzo_sistema: 42 })
    assert.equal(malo.ok, false)
  }
})

test('la vista: El pulso manda, el libro ya no es pestaña, el botón abre el lienzo en el panel y nada dice SAT', () => {
  const vista = leer('src/features/cabina/vistas/Negocio.tsx')
  assert.doesNotMatch(vista, />El libro</)
  assert.match(vista, /<ElPulso /)
  const pulso = leer('src/features/negocio/ElPulso.tsx')
  assert.match(pulso, /abrirSeccion\(\{ vista: 'lienzo', paginaId: lienzo/)
  assert.match(pulso, /Abrir el lienzo completo/)
  assert.match(pulso, /Lienzo en camino/)
  assert.doesNotMatch(pulso, /\bSAT\b|te queda/)
  // En directo Cohorte y Finanzas ni se piden (sus rutas están vetadas); en la edición del alumno tampoco (no existen).
  assert.match(pulso, /useFuente<CohortePulso>\(directo \|\| cliente \? null/)
  assert.match(pulso, /useFuente<FinancesPayload>\(directo \|\| cliente \? null/)
  assert.match(pulso, /useFuente<RespuestaMarketing>\(cliente \? null/)
  assert.match(pulso, /const pulsos: Pulso\[\] = pulsosCliente \?\? \[/)
})

test('la voz del cliente real (si está en este checkout) se lee entera, sin errores, con sus tres tops', () => {
  const real = raiz('.claude/memory/project/mi-negocio/voz-del-cliente.json')
  if (!existsSync(real)) return
  const crudo = JSON.parse(readFileSync(real, 'utf8'))
  const { voz, errores } = leerVoz(crudo)
  assert.deepEqual(errores, [])
  assert.equal(voz!.citas.length, crudo.citas.length)
  assert.equal(voz!.resumen.top_objeciones.length, crudo.resumen.top_objeciones.length)
  assert.ok(voz!.resumen.top_objeciones.every(t => t.texto && t.veces !== null))
  assert.ok(voz!.resumen.top_deseos.length > 0 && voz!.resumen.top_dolores.length > 0)
})

test('una respuesta inesperada ({}) nunca tumba la vista: cada órgano dice que no se pudo leer', () => {
  const vacio = { data: {} as never }
  for (const x of [pulsoVenta(vacio), pulsoEntrega(vacio), pulsoFinanzas(vacio), pulsoSistemas(vacio)]) {
    assert.equal(x.estado, 'error', x.organo); assert.equal(x.cifra, undefined)
  }
  assert.equal(pulsoComprador(vacio).estado, 'sin-sensor')
})
