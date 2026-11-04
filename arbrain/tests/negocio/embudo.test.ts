// Tu negocio › El sistema (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). El esquema estándar
// (docs/embudo/embudo.schema.json), el validador del panel (features/negocio/embudo.ts) y el primer ejemplo (el embudo de
// Daniel en su memoria) se mantienen de acuerdo; el panel nunca pinta un número sin fuente ni un 0 por falta de dato.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  agrupar, corridaInactiva, corridaLaunchd, cuelloDe, ESQUEMA_EMBUDO, etapasDeSkill, fechaCorta, motorDe, nombreEmbudo,
  numero, panelNegocioEncendido, puentes, quien, RUTA_EMBUDO, skillDeRuta, validarEmbudo, type Embudo, type Etapa,
} from '../../src/features/negocio/embudo'

const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const esquema = JSON.parse(leer('docs/embudo/embudo.schema.json'))
const EJEMPLO = new URL(`../../../${RUTA_EMBUDO}`, import.meta.url)
const hayEjemplo = existsSync(EJEMPLO)
const ejemplo = () => JSON.parse(readFileSync(EJEMPLO, 'utf8'))
const minimo = () => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(leer('docs/embudo/README.md'))![1])

test('el esquema y el validador hablan del mismo formato', () => {
  assert.equal(esquema.properties.esquema.const, ESQUEMA_EMBUDO)
  assert.deepEqual(esquema.$defs.etapa.properties.etapa.enum, ['Adquisición', 'Nutrición', 'Conversión', 'Bienvenida', 'Entrega', 'Expansión'])
  // Cada campo que el esquema exige, el validador también lo exige.
  for (const campo of esquema.required as string[]) {
    const x = minimo(); delete x[campo]
    assert.equal(validarEmbudo(x).ok, false, `sin «${campo}» debería fallar`)
  }
  for (const campo of esquema.$defs.etapa.required as string[]) {
    const x = minimo(); delete x.etapas[0][campo]
    assert.equal(validarEmbudo(x).ok, false, `una etapa sin «${campo}» debería fallar`)
  }
  for (const campo of esquema.$defs.etapa.properties.mide.required as string[]) {
    const x = minimo(); delete x.etapas[0].mide[campo]
    assert.equal(validarEmbudo(x).ok, false, `un número sin «${campo}» debería fallar`)
  }
})

test('el ejemplo mínimo del README es válido', () => {
  const v = validarEmbudo(minimo())
  assert.ok(v.ok, v.ok ? '' : v.errores.join('\n'))
})

test('el embudo de Daniel, primer ejemplo del estándar, es válido y se lee como el lienzo', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const v = validarEmbudo(ejemplo())
  assert.ok(v.ok, v.ok ? '' : v.errores.join('\n'))
  const e = v.embudo
  const grupos = agrupar(e)
  assert.deepEqual(grupos.map(g => g.info.nombre), ['SaaS Factory', 'Acompañamiento Arbrain'])
  assert.deepEqual(grupos.map(g => g.etapas.length), [6, 6])
  assert.deepEqual(grupos[0].etapas.map(et => et.orden), [1, 2, 3, 4, 5, 6])
  assert.equal(cuelloDe(e)?.id, 'ht.expansion')
  assert.equal(puentes(e).upsell.length, 1)
  assert.equal(puentes(e).volante[0].estado, 'por construir')
  // Cada número trae fuente, y ninguno trae cifra sin fecha.
  for (const et of e.etapas) {
    assert.ok(et.mide.fuente.trim(), `${et.id} sin fuente`)
    assert.ok(et.mide.valor === null || et.mide.medido_en, `${et.id} con cifra sin fecha`)
  }
  // La copia del lienzo y la de la memoria salen del mismo exportador.
  const lienzo = JSON.parse(readFileSync(new URL('../../../docs/builds/lienzo-embudo-2026-11-04/embudo.json', import.meta.url), 'utf8'))
  const { $schema: _, ...memoria } = ejemplo()
  assert.deepEqual(memoria, lienzo)
})

test('el validador explica en palabras lo que hay que corregir', () => {
  const dos = minimo(); dos.etapas.push({ ...dos.etapas[0], id: 'consulta.nutricion', orden: 2, etapa: 'Nutrición' })
  dos.etapas.forEach((et: Etapa) => { et.cuello = { es: true, frase: 'x', evidencia: { ruta: 'a.md', fecha: '2026-11-01' } } })
  assert.match((validarEmbudo(dos) as { errores: string[] }).errores.join(' '), /se marca uno solo/)

  const sinFecha = minimo(); sinFecha.etapas[0].mide.valor = 42
  assert.match((validarEmbudo(sinFecha) as { errores: string[] }).errores.join(' '), /medido_en/)

  const cuelloSinEvidencia = minimo(); cuelloSinEvidencia.etapas[0].cuello = { es: true }
  assert.match((validarEmbudo(cuelloSinEvidencia) as { errores: string[] }).errores.join(' '), /evidencia/)

  const arista = minimo(); arista.aristas = [{ desde: 'consulta.adquisicion', hacia: 'otro.lado', tipo: 'flujo', estado: 'opera' }]
  assert.match((validarEmbudo(arista) as { errores: string[] }).errores.join(' '), /no existen/)

  assert.equal(validarEmbudo(null).ok, false)
  assert.equal(validarEmbudo([]).ok, false)
})

test('el número: «sin dato» si nadie lo leyó, nunca 0; un cero leído sí es cero', () => {
  const m = (x: Partial<Etapa['mide']>) => ({ nombre: 'Citas', fuente: 'Agenda', hay_numero: true, valor: null, ...x })
  assert.deepEqual(numero(m({})), { texto: 'sin dato', sinDato: true, cuando: null })
  assert.equal(numero(m({ hay_numero: false })).texto, 'sin número todavía')
  assert.equal(numero(m({ valor: 7 })).texto, 'sin dato') // sin fecha no se pinta
  assert.deepEqual(numero(m({ valor: 0, medido_en: '2026-11-03T10:00:00Z', ventana: 'últimos 7 días' })), { texto: '0', sinDato: false, cuando: 'últimos 7 días · 3 nov 2026' })
  assert.equal(numero(m({ valor: 12500, medido_en: '2026-11-03' })).texto, '12,500')
})

test('quién la mueve, en palabras del dueño', () => {
  assert.equal(quien({ tipo: 'levy' }), 'Levy')
  assert.equal(quien({ tipo: 'rutina' }), 'Una rutina')
  assert.equal(quien({ tipo: 'persona', rol: 'fundador', nombre: 'Fulano' }), 'Tú')
  assert.equal(quien({ tipo: 'persona', rol: 'secretaria y setter', nombre: 'Mengano' }), 'Mengano')
  assert.equal(quien({ tipo: 'persona', rol: 'recepción' }), 'Recepción')
})

test('rutinas: de dónde se lee la corrida y cómo se dice, sin estados inventados', () => {
  assert.equal(motorDe({ id: 'polar-sync', que_hace: 'x', activa: true, motor: 'scheduler agent-server' }), 'scheduler')
  assert.equal(motorDe({ id: 'com.arbrain.ht-pipeline', que_hace: 'x', activa: true, motor: 'launchd' }), 'launchd')
  assert.equal(motorDe({ id: null, que_hace: 'x', activa: false, motor: null }), null)
  assert.deepEqual(corridaLaunchd(undefined), { tono: 'sin-dato', texto: 'Sin dato aquí' })
  assert.deepEqual(corridaLaunchd({ semaforo: 'gris', texto: 'sin dato aquí' }), { tono: 'sin-dato', texto: 'Sin dato aquí' })
  assert.deepEqual(corridaLaunchd({ semaforo: 'verde', texto: 'hace 3 min' }), { tono: 'ok', texto: 'Corrió hace 3 min' })
  assert.deepEqual(corridaLaunchd({ semaforo: 'verde', texto: 'corriendo ahora' }), { tono: 'curso', texto: 'Trabajando ahora' })
  assert.equal(corridaLaunchd({ semaforo: 'ambar', texto: 'sin correr desde hace 2 días' }).texto, 'Sin correr desde hace 2 días')
  assert.equal(corridaLaunchd({ semaforo: 'rojo', texto: 'falló (código 1)' }).texto, 'Falló en su última corrida')
  assert.equal(corridaLaunchd({ semaforo: 'rojo', texto: 'no está cargada' }).tono, 'error')
  assert.deepEqual(corridaInactiva({ id: null, que_hace: 'Fábrica de casos', activa: false, nota: 'se decide en diciembre' }), { tono: 'por-construir', texto: 'Se decide en diciembre' })
  assert.equal(corridaInactiva({ id: 'x', que_hace: 'y', activa: false }).texto, 'En pausa')
})

test('Habilidades: de qué etapas cuelga cada skill', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const e = ejemplo() as Embudo
  assert.deepEqual(etapasDeSkill(e, 'polar').map(et => et.id), ['lt.conversion', 'ht.conversion'])
  assert.deepEqual(etapasDeSkill(e, 'perro'), [])
  assert.deepEqual(etapasDeSkill(null, 'polar'), [])
  assert.equal(nombreEmbudo(e, 'SFC'), 'SaaS Factory')
  assert.equal(skillDeRuta('.claude/skills/polar/SKILL.md'), 'polar')
  assert.equal(skillDeRuta('.claude/skills/polar/references/x.md'), null)
})

test('el interruptor solo se enciende con ARBRAIN_PANEL_NEGOCIO=1', () => {
  assert.equal(panelNegocioEncendido({}), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: '0' }), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: 'true' }), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: '1' }), true)
  assert.equal(fechaCorta('2026-10-23'), '23 oct 2026')
})

test('apagado, la API responde { activo: false } antes de leer nada, y la vista queda como estaba', () => {
  // La ruta importa `server-only` (no corre fuera de Next): se vigila su forma. Lo primero del GET es el interruptor.
  const ruta = leer('src/app/api/negocio/embudo/route.ts')
  assert.match(ruta, /export async function GET\(\) \{\n {2}if \(!panelNegocioEncendido\(\) \|\| esEdicionCliente\(\)\) return APAGADO\(\)/)
  assert.match(ruta, /const APAGADO = \(\) => Response\.json\(\{ activo: false \}/)
  // La vista: sin `activo`, devuelve el libro de siempre antes de pintar nada nuevo.
  assert.match(leer('src/features/cabina/vistas/Negocio.tsx'), /if \(!sistema\?\.activo\) return <LibroNegocio seccion=\{seccion\} grande=\{grande\} \/>/)
})
