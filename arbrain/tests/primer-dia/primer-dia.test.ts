// Tu primer día (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga; docs/builds/onboarding-taller-2026-11-05/). El avance se
// lee del disco y del daemon, nunca se da por hecho: sin archivo no hay paso, sin daemon es «sin dato», y una habilidad de
// Arbrain no cuenta como tuya. La guía que se siembra trae un embudo que pasa el mismo validador del panel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validarEmbudo, ETAPAS, type Embudo } from '../../src/features/negocio/embudo'
import {
  debeOfrecer, ESTADO_VACIO, estadoPrimerDia, evaluar, HABILIDADES_DE_ARBRAIN, habilidadesPropias, leerEmbudo, mensajeOferta, mensajePaso,
  MINIMO_FICHA, PASOS, primerDiaEncendido, RUTA_EMBUDO, RUTA_GUIA, RUTA_NEGOCIO, RUTA_OFERTA, RUTA_OFERTA_COMPLETA, type Senales,
} from '../../src/features/primer-dia/modelo'
import { EJEMPLO_EMBUDO, textoGuia } from '../../src/features/primer-dia/guia'
import { leerSenales, rutinasDe, sembrarGuia } from '../../src/features/primer-dia/servidor'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

const VACIO: Senales = { negocio: null, oferta: null, embudo: { estado: 'falta' }, rutinas: { activas: [], manana: 'pausada' }, skillsEnDisco: [] }
const embudoCon = (skills: string[]): Embudo => {
  const e = structuredClone(EJEMPLO_EMBUDO) as unknown as Embudo
  e.etapas[0].skills = skills.map(nombre => ({ nombre, ruta: `.claude/skills/${nombre}/SKILL.md` }))
  return e
}
const COMPLETO: Senales = {
  negocio: MINIMO_FICHA, oferta: 900, embudo: { estado: 'ok', embudo: embudoCon(['diagnostico-clinica']) },
  rutinas: { activas: [{ id: 'arbrain-reporte-manana', titulo: 'Reporte de la mañana' }, { id: 'loop-leads', titulo: 'Leads sin responder' }], manana: 'activa' },
  skillsEnDisco: ['diagnostico-clinica'],
}
const estado = (s: Senales) => Object.fromEntries(evaluar(s).pasos.map(p => [p.id, p.estado]))

test('el interruptor: encendido en la edición del alumno, =0 lo apaga; en la de Daniel solo =1', () => {
  // Alumno sin variable → encendido; con =0 → apagado.
  assert.equal(primerDiaEncendido({ ARBRAIN_EDICION: 'cliente' }), true)
  assert.equal(primerDiaEncendido({ ARBRAIN_EDICION: 'cliente', ARBRAIN_PRIMER_DIA: '' }), true)
  assert.equal(primerDiaEncendido({ ARBRAIN_EDICION: 'cliente', ARBRAIN_PRIMER_DIA: '0' }), false)
  assert.equal(primerDiaEncendido({ ARBRAIN_EDICION: 'cliente', ARBRAIN_PRIMER_DIA: ' 0 ' }), false)
  // Instalación original → apagado, salvo =1 explícito.
  assert.equal(primerDiaEncendido({}), false)
  assert.equal(primerDiaEncendido({ ARBRAIN_PRIMER_DIA: '0' }), false)
  assert.equal(primerDiaEncendido({ ARBRAIN_PRIMER_DIA: 'true' }), false)
  assert.equal(primerDiaEncendido({ ARBRAIN_PRIMER_DIA: '1' }), true)
})

test('cinco pasos en el orden del recorrido: negocio, oferta, embudo, rutinas, habilidades', () => {
  assert.deepEqual(PASOS.map(p => p.id), ['negocio', 'oferta', 'embudo', 'rutinas', 'habilidades'])
  for (const p of PASOS) assert.ok(p.titulo && p.que && p.deja, p.id)
})

test('un cerebro vacío: el paso 1 sigue, nada está hecho', () => {
  const a = evaluar(VACIO)
  assert.equal(a.hechos, 0)
  assert.equal(a.completo, false)
  assert.equal(a.siguiente, 'negocio')
  assert.deepEqual(estado(VACIO), { negocio: 'siguiente', oferta: 'pendiente', embudo: 'pendiente', rutinas: 'pendiente', habilidades: 'pendiente' })
})

test('una ficha empezada no cuenta; con lo esencial, sí', () => {
  assert.equal(estado({ ...VACIO, negocio: MINIMO_FICHA - 1 }).negocio, 'siguiente')
  assert.equal(evaluar({ ...VACIO, negocio: 20 }).pasos[0].detalle, 'Empezada: le falta lo esencial.')
  const a = evaluar({ ...VACIO, negocio: MINIMO_FICHA })
  assert.equal(a.pasos[0].estado, 'hecho')
  assert.equal(a.siguiente, 'oferta')
})

test('un embudo inválido pide corrección con sus errores, nunca cuenta como hecho', () => {
  const s: Senales = { ...VACIO, negocio: 500, oferta: 500, embudo: leerEmbudo('{"esquema":"otro"}') }
  const p = evaluar(s).pasos.find(x => x.id === 'embudo')!
  assert.equal(p.estado, 'revisar')
  assert.ok(p.errores!.length > 0)
  assert.equal(evaluar(s).siguiente, 'embudo')
  assert.equal(leerEmbudo('no es json').estado, 'invalido')
  assert.equal(leerEmbudo(null).estado, 'falta')
})

test('sin respuesta del daemon, las rutinas son «sin dato», no cero ni hecho', () => {
  const p = evaluar({ ...VACIO, rutinas: null }).pasos.find(x => x.id === 'rutinas')!
  assert.equal(p.estado, 'sin-dato')
  assert.match(p.detalle!, /no respondió/)
})

test('las rutinas cuentan al llegar a dos activas', () => {
  const una = evaluar({ ...VACIO, rutinas: { activas: [{ id: 'a', titulo: 'Reporte de la mañana' }], manana: 'activa' } }).pasos[3]
  assert.equal(una.estado, 'pendiente')
  assert.match(una.detalle!, /1 de 2/)
  assert.equal(evaluar(COMPLETO).pasos[3].estado, 'hecho')
})

test('la habilidad tiene que ser tuya, existir y colgar del embudo', () => {
  assert.deepEqual(habilidadesPropias(embudoCon(['clientes', 'skill-creator']), ['clientes', 'skill-creator']), [], 'las de Arbrain no cuentan')
  assert.deepEqual(habilidadesPropias(embudoCon(['reporte-cliente']), []), [], 'nombrada pero no escrita no cuenta')
  assert.deepEqual(habilidadesPropias(embudoCon(['reporte-cliente', 'clientes']), ['reporte-cliente', 'clientes']), ['reporte-cliente'])
  assert.deepEqual(habilidadesPropias(null, ['reporte-cliente']), [])
})

test('todo escrito: completo y sin siguiente', () => {
  const a = evaluar(COMPLETO)
  assert.equal(a.completo, true)
  assert.equal(a.hechos, 5)
  assert.equal(a.siguiente, null)
  assert.match(a.pasos[2].detalle!, /1 etapa · sin cuello marcado/)
})

test('las habilidades de Arbrain son las que trae la plantilla del alumno', () => {
  // En el repo original viven en empaquetado/plantillas/skills; en la copia del alumno ya son las .claude/skills de la raíz.
  const enRepo = new URL('../../empaquetado/plantillas/skills/', import.meta.url)
  const dir = existsSync(enRepo) ? enRepo : new URL('../../../.claude/skills/', import.meta.url)
  const enPlantilla = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  assert.deepEqual([...HABILIDADES_DE_ARBRAIN].sort(), enPlantilla)
})

test('la guía trae un embudo que pasa el validador del panel y nombra cada archivo que se lee', () => {
  assert.equal(validarEmbudo(EJEMPLO_EMBUDO).ok, true, JSON.stringify(validarEmbudo(EJEMPLO_EMBUDO)))
  const g = textoGuia()
  for (const r of [RUTA_NEGOCIO, RUTA_OFERTA, RUTA_EMBUDO]) assert.ok(g.includes(r), r)
  assert.ok(g.includes(ETAPAS.join(' → ')))
  const json = /```json\n([\s\S]*?)\n```/.exec(g)![1]
  assert.equal(validarEmbudo(JSON.parse(json)).ok, true)
})

test('el pedido a Levy nombra el paso y la guía, y lleva los errores del embudo', () => {
  const m = mensajePaso('negocio')
  assert.match(m, /^Empecemos mi primer día, paso 1 de 5/)
  assert.ok(m.includes(RUTA_GUIA))
  assert.match(mensajePaso('rutinas'), /^Sigamos con mi primer día, paso 4 de 5/)
  assert.match(mensajePaso('embudo', { errores: ['Falta «negocio».'] }), /Falta «negocio»\. Corrígelo\./)
  const o = mensajeOferta('Zutana')
  assert.match(o, /^Zutana, ya conoces la app/)
  for (const p of PASOS) assert.ok(o.includes(p.titulo), p.id)
})

test('se ofrece una sola vez, después del recorrido, y nunca si se ocultó', () => {
  const base = { bienvenidaCompleta: true, tourPendiente: false, primerDia: ESTADO_VACIO }
  assert.equal(debeOfrecer(base), true)
  assert.equal(debeOfrecer({ ...base, bienvenidaCompleta: false }), false)
  assert.equal(debeOfrecer({ ...base, tourPendiente: true }), false)
  assert.equal(debeOfrecer({ ...base, primerDia: { ofrecido: '2026-11-05T10:00:00Z', oculto: null } }), false)
  assert.equal(debeOfrecer({ ...base, primerDia: { ofrecido: null, oculto: '2026-11-05T10:00:00Z' } }), false)
  assert.deepEqual(estadoPrimerDia('basura'), ESTADO_VACIO)
  assert.deepEqual(estadoPrimerDia({ ofrecido: 3, oculto: '2026-11-05' }), { ofrecido: null, oculto: '2026-11-05' })
})

test('del disco: fichas, embudo y skills que existen; la guía se siembra una vez y no se pisa', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'arbrain-primer-dia-'))
  const escribir = (rel: string, texto: string) => { mkdirSync(join(raiz, rel, '..'), { recursive: true }); writeFileSync(join(raiz, rel), texto) }
  assert.deepEqual(leerSenales(null, raiz), { negocio: null, oferta: null, embudo: { estado: 'falta' }, rutinas: null, skillsEnDisco: [] })
  escribir(RUTA_NEGOCIO, `# Mi negocio\n\n${'Agencia de anuncios para negocios de servicio. '.repeat(6)}`)
  escribir(RUTA_EMBUDO, JSON.stringify(embudoCon(['reporte-cliente', 'otra'])))
  escribir('.claude/skills/reporte-cliente/SKILL.md', '---\nname: reporte-cliente\n---\n')
  const s = leerSenales(null, raiz)
  assert.ok(s.negocio! >= MINIMO_FICHA)
  assert.equal(s.oferta, null)
  escribir(RUTA_OFERTA_COMPLETA, `# Mi oferta\n\n${'Avatar, promesa y vehículo en borrador. '.repeat(8)}`)
  assert.ok(leerSenales(null, raiz).oferta! >= MINIMO_FICHA, 'la oferta de 11 piezas (skill oferta) también cumple el paso 2')
  assert.equal(s.embudo.estado, 'ok')
  assert.deepEqual(s.skillsEnDisco, ['reporte-cliente'])
  assert.equal(sembrarGuia(raiz), true)
  writeFileSync(join(raiz, RUTA_GUIA), 'mi versión')
  assert.equal(sembrarGuia(raiz), false)
  assert.equal(readFileSync(join(raiz, RUTA_GUIA), 'utf8'), 'mi versión')
})

test('las rutinas del daemon: activas por nombre y el estado del Reporte de la mañana', () => {
  assert.equal(rutinasDe(null), null)
  assert.equal(rutinasDe({}), null)
  const r = rutinasDe({
    tasks: [
      { id: 'arbrain-reporte-manana', prompt: 'x', schedule: '0 7 * * 1-5', status: 'paused', next_run: null, last_run: null, last_result: null },
      { id: 'r1', prompt: 'Revisa los leads sin responder', schedule: '0 9 * * *', status: 'active', next_run: null, last_run: null, last_result: null },
    ],
    precargadas: { 'arbrain-reporte-manana': { nombre: 'Reporte de la mañana', paraQue: 'x', carpeta: '.claude/reportes/diario/' } },
  })!
  assert.equal(r.manana, 'pausada')
  assert.deepEqual(r.activas.map(x => x.id), ['r1'])
})

test('la ruta existe en la edición del alumno (apagada responde { activo: false })', () => {
  assert.equal(apiPermitidaEnCliente('/api/primer-dia'), true)
})
