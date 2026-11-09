// Tu negocio › El sistema (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). El esquema estándar
// (docs/embudo/embudo.schema.json), el validador del panel (features/negocio/embudo.ts) y el primer ejemplo (el embudo de
// Daniel en su memoria) se mantienen de acuerdo; el panel nunca pinta un número sin fuente ni un 0 por falta de dato.
// 5 nov: pisos arriba (canales, repo, comunidad gratuita), escalera de valor como aristas, cada número con frecuencia y
// dueño, una sola dirección (el archivo manda; el lienzo se dibuja desde él) y plantillas vacías para el consultor.
// 5 nov (noche): una sola vista. El panel pinta el embudo como grafo (tests/negocio/grafo.test.ts), el lienzo «Mi negocio»
// quedó archivado y la etapa de cada skill vive en el embudo: o cuelga de una etapa o va en skills_sin_etapa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import {
  agrupar, corridaInactiva, corridaLaunchd, cuelloDe, esPiso, ESQUEMA_EMBUDO, etapasDeSkill, fechaCorta, motorDe,
  nombreEmbudo, numero, panelNegocioEncendido, porConstruir, puentes, quien, resumenGrupos, RUTA_EMBUDO, rutaSkill, skillDeRuta,
  skillsPorEtapa, subidasDe, validarEmbudo, type Embudo, type Etapa,
} from '../../src/features/negocio/embudo'

const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const esquema = JSON.parse(leer('docs/embudo/embudo.schema.json'))
const EJEMPLO = new URL(`../../../${RUTA_EMBUDO}`, import.meta.url)
const hayEjemplo = existsSync(EJEMPLO)
const ejemplo = () => JSON.parse(readFileSync(EJEMPLO, 'utf8'))
const minimo = () => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(leer('docs/embudo/README.md'))![1])
const PLANTILLAS = ['consultor', 'cliente'].map(n => [n, JSON.parse(leer(`docs/embudo/plantillas/${n}.embudo.json`))] as const)

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

test('el embudo de Daniel, primer ejemplo del estándar: pisos arriba, escalera como aristas, cada número bajado a tierra', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const v = validarEmbudo(ejemplo())
  assert.ok(v.ok, v.ok ? '' : v.errores.join('\n'))
  const e = v.embudo
  const grupos = agrupar(e)
  assert.deepEqual(grupos.map(g => g.info.nombre), ['Canal de Levy', 'Canal de Daniel', 'Repo Arbrain', 'Comunidad gratuita', 'SaaS Factory', 'Acompañamiento Arbrain'])
  assert.deepEqual(grupos.map(g => esPiso(g.info)), [true, true, true, true, false, false])
  assert.ok(grupos.filter(g => esPiso(g.info)).every(g => porConstruir(g.info)), 'los cuatro pisos van marcados por construir')
  assert.equal(resumenGrupos(grupos), '4 pisos y 2 embudos encadenados')
  assert.deepEqual(grupos.slice(4).map(g => g.etapas.length), [6, 6])
  assert.deepEqual(grupos[4].etapas.map(et => et.orden), [1, 2, 3, 4, 5, 6])
  assert.equal(cuelloDe(e)?.id, 'ht.expansion')
  // La escalera de valor: la gratuita sube a las dos ofertas; SaaS Factory, al Acompañamiento.
  assert.deepEqual(subidasDe(e, grupos[3]).map(s => s.hacia), ['SaaS Factory', 'Acompañamiento Arbrain'])
  assert.deepEqual(subidasDe(e, grupos[4]).map(s => s.hacia), ['Acompañamiento Arbrain'])
  assert.deepEqual(subidasDe(e, grupos[0]).map(s => s.hacia), ['Repo Arbrain'])
  assert.equal(puentes(e).volante[0].estado, 'por construir')
  // Cada número: fuente, frecuencia y dueño; sin cifra sin fecha; sin medición, qué lo mediría.
  for (const et of e.etapas) {
    assert.ok(et.mide.fuente.trim(), `${et.id} sin fuente`)
    assert.ok(et.mide.frecuencia.trim(), `${et.id} sin frecuencia`)
    assert.ok(['levy', 'rutina', 'persona'].includes(et.mide.dueno.tipo), `${et.id} sin dueño`)
    assert.equal(et.mide.valor, null, `${et.id}: el archivo no guarda cifras`)
    if (!et.mide.hay_numero) assert.ok(et.mide.como_medirlo?.trim(), `${et.id} sin número y sin qué lo mediría`)
  }
  // Las skills que Daniel colgó de los pisos (5 nov) cuelgan de verdad.
  const enPisos = new Set(grupos.filter(g => esPiso(g.info)).flatMap(g => g.etapas.flatMap(et => et.skills.map(s => s.nombre))))
  for (const s of ['youtube-os', 'god-animation', 'youtube-comments-agent', 'comunidad', 'business-intelligence']) assert.ok(enPisos.has(s), `falta ${s} en los pisos`)
})

test('una sola vista: el lienzo «Mi negocio» quedó archivado con su lápida y el panel ya no lo enlaza', () => {
  const raiz = (p: string) => new URL(`../../../${p}`, import.meta.url)
  // Se movió, no se borró: la carpeta vieja ya no está en builds y la archivada trae lápida, generador y capturas.
  assert.equal(existsSync(raiz('docs/builds/lienzo-embudo-2026-11-04')), false, 'el lienzo ya no vive en docs/builds')
  const archivo = raiz('docs/archivo/lienzo-mi-negocio-2026-11-04/')
  if (existsSync(raiz('docs/archivo'))) {
    const lapida = readFileSync(new URL('LAPIDA.md', archivo), 'utf8')
    assert.match(lapida, /Tu negocio › El sistema/)
    assert.match(lapida, /mi-negocio\/embudo\.json/)
    for (const f of ['embudo.py', 'contenido.py', 'README.md', '_retirado/exportar_json.py']) assert.ok(existsSync(new URL(f, archivo)), `se conserva ${f}`)
    // Ni el exportador ni una segunda copia del embudo vuelven junto al lienzo.
    assert.equal(existsSync(new URL('embudo.json', archivo)), false)
  }
  // El archivo del dueño ya no apunta a un lienzo y el panel no tiene un botón «Ver el lienzo».
  if (hayEjemplo) assert.equal('lienzo' in ejemplo(), false, 'embudo.json sin «lienzo»: el panel es la única vista')
  const panel = leer('src/features/negocio/PanelEmbudo.tsx')
  assert.doesNotMatch(panel, /Ver el lienzo|destino: 'lienzo'/)
  assert.match(panel, /<GrafoEmbudo /)
})

test('las plantillas vacías del consultor y de su cliente son válidas y no traen datos', () => {
  for (const [nombre, p] of PLANTILLAS) {
    const v = validarEmbudo(p)
    assert.ok(v.ok, `${nombre}: ${v.ok ? '' : v.errores.join('\n')}`)
    assert.ok(p.etapas.every((et: Etapa) => et.mide.valor === null), `${nombre}: una plantilla no trae cifras`)
    // Las personas van por su rol, nunca por su nombre; y nada del embudo real del dueño se cuela en la plantilla.
    assert.ok(p.etapas.every((et: Etapa) => [...et.ejecuta, et.mide.dueno].every(q => !q.nombre)), `${nombre}: personas sin nombre`)
    if (hayEjemplo) {
      const real = ejemplo() as Embudo
      const propios = [...real.etapas.flatMap(et => [...et.ejecuta, et.mide.dueno].map(q => q.nombre)), ...(real.embudos ?? []).map(b => b.nombre)]
      for (const x of new Set(propios.filter((n): n is string => !!n))) assert.ok(!JSON.stringify(p).includes(x), `${nombre}: trae «${x}» del embudo real`)
    }
  }
  const consultor = validarEmbudo(PLANTILLAS[0][1])
  assert.ok(consultor.ok)
  const grupos = agrupar(consultor.embudo)
  assert.deepEqual(grupos.map(g => g.info.tipo), ['piso', 'piso', 'oferta', 'oferta'])
  assert.deepEqual(grupos.filter(g => !esPiso(g.info)).map(g => g.etapas.length), [6, 6])
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

  const sinFrecuencia = minimo(); delete sinFrecuencia.etapas[0].mide.frecuencia
  assert.match((validarEmbudo(sinFrecuencia) as { errores: string[] }).errores.join(' '), /frecuencia/)

  const sinDueno = minimo(); sinDueno.etapas[0].mide.dueno = { tipo: 'jefe' }
  assert.match((validarEmbudo(sinDueno) as { errores: string[] }).errores.join(' '), /dueno/)

  const sinCamino = minimo(); sinCamino.etapas[0].mide.hay_numero = false
  assert.match((validarEmbudo(sinCamino) as { errores: string[] }).errores.join(' '), /como_medirlo/)
  sinCamino.etapas[0].mide.como_medirlo = 'Un contador en la agenda.'
  assert.ok(validarEmbudo(sinCamino).ok)

  const piso = minimo(); piso.embudos[0].tipo = 'sótano'
  assert.match((validarEmbudo(piso) as { errores: string[] }).errores.join(' '), /piso u oferta/)

  assert.equal(validarEmbudo(null).ok, false)
  assert.equal(validarEmbudo([]).ok, false)
})

test('el número: «sin dato» si nadie lo leyó, nunca 0; un cero leído sí es cero', () => {
  const m = (x: Partial<Etapa['mide']>): Etapa['mide'] => ({ nombre: 'Citas', fuente: 'Agenda', frecuencia: 'en vivo', dueno: { tipo: 'levy' }, hay_numero: true, valor: null, ...x })
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
  assert.equal(rutaSkill('polar'), '.claude/skills/polar/SKILL.md')
  assert.deepEqual(etapasDeSkill(null, 'polar'), [])
  assert.equal(nombreEmbudo(e, 'SFC'), 'SaaS Factory')
  assert.equal(skillDeRuta('.claude/skills/polar/SKILL.md'), 'polar')
  assert.equal(skillDeRuta('.claude/skills/polar/references/x.md'), null)
})

test('skills por etapa: la etapa vive en el embudo; lo que no cuelga de nada se dice por qué o sale «sin revisar»', () => {
  const x = minimo()
  x.etapas[0].skills = [{ nombre: 'contenido', ruta: rutaSkill('contenido') }, { nombre: 'contenido', ruta: rutaSkill('contenido') }]
  x.skills_sin_etapa = [
    { nombre: 'memoria', ruta: rutaSkill('memoria'), tipo: 'sistema', por_que: 'Sirve a todas las etapas.' },
    { nombre: 'cocina', ruta: rutaSkill('cocina'), tipo: 'personal', por_que: 'La casa.' },
  ]
  const v = validarEmbudo(x)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('\n'))
  const s = skillsPorEtapa(v.embudo, ['agenda', 'cocina', 'contenido', 'memoria'])
  assert.deepEqual(s.grupos[0].etapas[0].skills, ['contenido'], 'una skill repetida en la misma etapa sale una vez')
  assert.deepEqual(s.sistema.map(k => k.nombre), ['memoria'])
  assert.deepEqual(s.personal.map(k => k.nombre), ['cocina'])
  assert.deepEqual(s.sinRevisar, ['agenda'], 'la skill que nadie ubicó sale marcada')
  assert.deepEqual(s.noExisten, [])
  assert.equal(s.enEtapas, 1)
  // Sin inventario no se inventa: «sin revisar» queda en null, no en cero.
  assert.equal(skillsPorEtapa(v.embudo, null).sinRevisar, null)
  // Lo nombrado que ya no existe en la carpeta sale aparte.
  assert.deepEqual(skillsPorEtapa(v.embudo, ['contenido']).noExisten, ['cocina', 'memoria'])

  // Una skill va en un solo lado, con tipo y porqué.
  const doble = minimo(); doble.skills_sin_etapa = [{ nombre: 'contenido', ruta: rutaSkill('contenido'), tipo: 'sistema', por_que: 'x' }]
  assert.match((validarEmbudo(doble) as { errores: string[] }).errores.join(' '), /en un solo lado/)
  const sinPorque = minimo(); sinPorque.skills_sin_etapa = [{ nombre: 'memoria', ruta: rutaSkill('memoria'), tipo: 'otro', por_que: '' }]
  assert.match((validarEmbudo(sinPorque) as { errores: string[] }).errores.join(' '), /sistema o personal/)
  assert.deepEqual(esquema.properties.skills_sin_etapa.items.properties.tipo.enum, ['sistema', 'personal'])
})

test('el embudo de Daniel categoriza las skills de su cerebro: cada una cuelga de una etapa o dice por qué no', { skip: !hayEjemplo && 'sin el cerebro montado' }, () => {
  const e = ejemplo() as Embudo
  const dir = new URL('../../../.claude/skills/', import.meta.url)
  const vivas = readdirSync(dir).filter(n => !/^[._]/.test(n) && existsSync(new URL(`${n}/SKILL.md`, dir)))
  const s = skillsPorEtapa(e, vivas)
  // Censo de consumidores (regla 10): archivar una skill obliga a sacarla del embudo.
  assert.deepEqual(s.noExisten, [], `el embudo nombra skills que ya no existen: ${s.noExisten.join(', ')}`)
  assert.ok(s.enEtapas >= 18, 'las skills del embudo siguen colgadas de sus etapas')
  assert.ok(e.skills_sin_etapa!.every(k => k.ruta === rutaSkill(k.nombre)), 'ruta estándar en cada skill fuera')
  // intel cuelga de Atraer (su rutina intel-youtube-scan ya vivía ahí); el perro y la nutrición, fuera del negocio.
  assert.ok(etapasDeSkill(e, 'intel').some(et => et.id === 'lt.adquisicion'))
  assert.deepEqual(s.personal.map(k => k.nombre).filter(n => ['perro', 'nutricion'].includes(n)), ['nutricion', 'perro'])
  // Lo que todavía no se ubica sale marcado, no escondido: hoy, a lo más un puñado.
  assert.ok(s.sinRevisar!.length <= 4, `demasiadas skills sin revisar: ${s.sinRevisar!.join(', ')}`)
})

test('el interruptor: en el autor solo con ARBRAIN_PANEL_NEGOCIO=1; en el alumno encendido salvo =0', () => {
  assert.equal(panelNegocioEncendido({}), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: '0' }), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: 'true' }), false)
  assert.equal(panelNegocioEncendido({ ARBRAIN_PANEL_NEGOCIO: '1' }), true)
  // 8 nov 2026: el kit de BI viaja al alumno como motor vacío.
  assert.equal(panelNegocioEncendido({ ARBRAIN_EDICION: 'cliente' }), true)
  assert.equal(panelNegocioEncendido({ ARBRAIN_EDICION: 'cliente', ARBRAIN_PANEL_NEGOCIO: '0' }), false)
  assert.equal(fechaCorta('2026-10-23'), '23 oct 2026')
})

test('apagado, la API responde { activo: false } antes de leer nada, y la vista queda como estaba', () => {
  // La ruta importa `server-only` (no corre fuera de Next): se vigila su forma. Lo primero del GET es el interruptor.
  const ruta = leer('src/app/api/negocio/embudo/route.ts')
  assert.match(ruta, /export async function GET\(\) \{\n {2}if \(!panelNegocioEncendido\(\)\) return APAGADO\(\)/)
  assert.match(ruta, /const APAGADO = \(\) => Response\.json\(\{ activo: false \}/)
  // La vista: sin `activo`, devuelve el libro de siempre antes de pintar nada nuevo (en el alumno, que está apagado).
  assert.match(leer('src/features/cabina/vistas/Negocio.tsx'), /if \(!sistema\?\.activo\) return esEdicionCliente\(\) \? <p[^>]*>Tu negocio está apagado[^<]*<\/p> : <LibroNegocio seccion=\{seccion\} grande=\{grande\} \/>/)
})

test('Tu negocio tiene sección propia: el teléfono y los enlaces directos abren /negocio, no Memoria', async () => {
  const { rutaDe, seccionDe } = await import('../../src/features/cabina/model')
  const { canAccessRoute } = await import('../../src/lib/permissions')
  assert.equal(rutaDe({ destino: 'negocio' }), '/negocio')
  assert.equal(seccionDe({ vista: 'negocio' }), '/negocio')
  assert.equal(canAccessRoute('/negocio', 'owner'), true)
  assert.equal(canAccessRoute('/negocio', 'member'), false)
  assert.match(leer('src/app/(main)/negocio/page.tsx'), /<NegocioSeccion \/>/)
  assert.match(leer('src/features/cabina/vistas/NegocioSeccion.tsx'), /<VistaNegocio grande \/>/)
})
