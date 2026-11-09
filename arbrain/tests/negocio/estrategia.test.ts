// Tu negocio › El pulso › Estrategia (8 nov 2026, Daniel: «al final actua como coordinador para crear un panel de esto…
// deberia estar dentro del negocio»). Fija que la tarjeta lee mercado.json sin reinterpretar: cada pieza sin fuente o
// sin fecha se descarta y se cuenta, un borrador solo es «firmado» con su firma, el modo directo saca los números propios
// y la tarjeta va encima de los seis órganos. Si el archivo real existe en este cerebro, valida su contrato.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  ESQUEMA_MERCADO, fechaHumana, fraseRumbo, iniciales, leerMercado, lineaDe, marcaDe, nombreCorto, ocultarEnDirecto, ofertasDePago, RUTA_MERCADO, sinFirmar, titularDe, tramos, VISTAS,
} from '../../src/features/negocio/estrategia'

const raiz = (p: string) => new URL(`../../../${p}`, import.meta.url)
const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const F = { fuente: 'Fuente de prueba', fecha: '2026-11-08' }

const ejemplo = () => ({
  esquema: ESQUEMA_MERCADO, actualizado: '2026-11-08',
  cabeza: { ...F, lineas: [
    { pregunta: '¿A quién sirves hoy?', respuesta: 'A quien ya tiene oficio.', ...F, propia: true },
    { pregunta: '¿Contra qué te comparan?', respuesta: 'Contra membresías de 59 USD/mes.', ...F },
  ] },
  quien_compra: { ...F, escalones: [{ id: 'comunidad', nombre: 'Comunidad', segmentos: [
    { nombre: 'El anual', quien: 'Paga por adelantado.', tamano: { valor: 120, unidad: 'clientes', ...F }, evidencia: [{ tipo: 'dato', texto: '120 anuales.', ...F }, { tipo: 'cita', texto: 'sin fuente' }] },
  ], separa: [{ texto: 'Pagar por adelantado.' }] }], huecos: ['La renovación aún no llega.'] },
  contra_quien: { ...F,
    escalera: { ...F, peldanos: [
      { id: 'gratis', nombre: 'Gratis', rango: '0', quienes: [{ nombre: 'Competidor A', precio: '0', mercado: 'hispano', ...F }] },
      { id: 'hueco', nombre: 'Acompañamiento', rango: '100–5,000', hueco: true, quienes: [], tu: { texto: 'Tu programa', ...F } },
    ] },
    hispanos: [{ nombre: 'Competidor A', grupo: 'directo', canales: [{ tipo: 'YouTube', valor: '100K', ...F }], ofertas: [{ oferta: 'Curso', precio: '0' }, { oferta: 'Membresía', precio: '59 USD/mes' }] }],
    anglos: [{ nombre: 'Referente B', nivel: 'primera fila', canales: [], ofertas: [] }],
  },
  hacia_donde: { ...F, tendencias: [{ tendencia: 'La palabra se vuelve commodity.', en_espanol: 'Llega en 6 a 12 meses.', fuentes: ['https://ejemplo.com/a'] }] },
  lo_que_decides: { ...F, estado: 'firmado', avatares: [
    { escalon: 'Comunidad', estado: 'firmado', borrador: 'El que se compromete un año.', evidencia: [{ texto: '120 anuales.', ...F }] },
  ], posicionamiento: { borrador: 'Una frase.', evidencia: [] } },
})

test('cuatro vistas, en el orden del encargo', () => {
  assert.deepEqual(VISTAS.map(v => v.nombre), ['Quién compra', 'Contra quién', 'Hacia dónde va', 'Lo que decides'])
})

test('lee el archivo sin reinterpretar y descarta lo que no trae fuente o fecha', () => {
  const { mercado: m, errores } = leerMercado(ejemplo())
  assert.ok(m)
  assert.equal(m.cabeza?.lineas.length, 2)
  const seg = m.quien_compra!.escalones[0].segmentos[0]
  assert.equal(seg.tamano?.valor, 120)
  assert.equal(seg.evidencia.length, 1, 'la cita sin fuente ni fecha no se pinta')
  assert.ok(errores.some(x => /fuente/.test(x)), 'y se cuenta como error')
  assert.equal(m.contra_quien?.escalera?.peldanos[1].hueco, true)
  assert.equal(m.contra_quien?.escalera?.peldanos[1].tu?.texto, 'Tu programa')
  assert.equal(m.hacia_donde?.tendencias[0].en_espanol, 'Llega en 6 a 12 meses.')
})

test('un archivo roto no inventa nada', () => {
  assert.equal(leerMercado(null).mercado, null)
  assert.equal(leerMercado([]).mercado, null)
  const r = leerMercado({ esquema: 'otro/v9', quien_compra: { escalones: [] } })
  assert.equal(r.mercado, null, 'sin fuente ni fecha, ningún bloque se lee')
  assert.ok(r.errores.some(x => /esquema/.test(x)))
  assert.ok(r.errores.some(x => /Ningún bloque/.test(x)))
})

test('un tamaño que no es número no se vuelve 0', () => {
  const x = ejemplo()
  ;(x.quien_compra.escalones[0].segmentos[0].tamano as { valor: unknown }).valor = 'muchos'
  const { mercado: m, errores } = leerMercado(x)
  assert.equal(m!.quien_compra!.escalones[0].segmentos[0].tamano, null)
  assert.ok(errores.some(e => /no es un número/.test(e)))
})

test('«firmado» solo con su firma: sin fecha de firma sigue siendo borrador', () => {
  const { mercado: m } = leerMercado(ejemplo())
  const d = m!.lo_que_decides!
  assert.equal(d.avatares[0].estado, 'borrador', 'estado «firmado» sin bloque firmado no cuenta')
  assert.equal(d.estado, 'borrador')
  assert.equal(sinFirmar(d), 2)
  const x = ejemplo()
  Object.assign(x.lo_que_decides.avatares[0], { firmado: { fecha: '2026-11-09', texto: 'Mis palabras.' } })
  Object.assign(x.lo_que_decides.posicionamiento, { estado: 'firmado', firmado: { fecha: '2026-11-09' } })
  const f = leerMercado(x).mercado!.lo_que_decides!
  assert.equal(f.avatares[0].estado, 'firmado')
  assert.equal(f.estado, 'firmado')
  assert.equal(sinFirmar(f), 0)
})

test('modo directo: fuera quién compra, los borradores y la cabeza propia; lo público se queda', () => {
  const { mercado: m } = leerMercado(ejemplo())
  const { mercado: v, oculto } = ocultarEnDirecto(m!)
  assert.deepEqual(oculto, ['compra', 'decides'])
  assert.equal(v.quien_compra, null)
  assert.equal(v.lo_que_decides, null)
  assert.deepEqual(v.cabeza?.lineas.map(l => l.pregunta), ['¿Contra qué te comparan?'])
  assert.ok(v.contra_quien && v.hacia_donde)
})

test('fechas humanas y ofertas de pago', () => {
  assert.equal(fechaHumana('2026-11-08', '2026-11-08'), '8 nov')
  assert.equal(fechaHumana('2026-06-20', '2026-11-08'), '20 jun')
  assert.equal(fechaHumana('2026-10'), 'oct 2026')
  assert.equal(fechaHumana('2025-03-01', '2026-11-08'), '1 mar 2025')
  const { mercado: m } = leerMercado(ejemplo())
  assert.deepEqual(ofertasDePago(m!.contra_quien!.hispanos[0]).map(o => o.precio), ['59 USD/mes'])
})

test('la tarjeta va en El pulso, encima de los seis órganos', () => {
  const src = leer('src/features/negocio/ElPulso.tsx')
  const tarjeta = src.indexOf('<TarjetaEstrategia'), organos = src.indexOf('aria-label="Los seis órganos"')
  assert.ok(tarjeta > 0 && organos > tarjeta)
  const tarjeta_ = leer('src/features/negocio/TarjetaEstrategia.tsx')
  assert.match(tarjeta_, /Conecta tu investigación/)
  assert.match(tarjeta_, /abrirSeccion\(\{ vista: 'estrategia' \}\)/, 'la tarjeta es la entrada a la sección')
})

// Estrategia como Contenido (8 nov 2026): sección propia del panel con el lenguaje de Contenido.
test('la sección Estrategia: vista del panel, del «+» y de la edición del alumno, con las cuatro preguntas', () => {
  const seccion = leer('src/features/negocio/SeccionEstrategia.tsx')
  assert.match(seccion, /Conecta tu investigación/)
  assert.match(seccion, /Propuesta de Levy, sin firmar/)
  assert.match(seccion, /Borrador de Levy · sin firmar/, 'la frase de posicionamiento lleva su sello')
  // Panel v2 (9 nov): una figura y una frase por pregunta, el detalle plegado (sin pestañas).
  for (const id of ['compra', 'contra', 'rumbo', 'decides']) assert.match(seccion, new RegExp(`<Tarjeta id="${id}"`))
  assert.doesNotMatch(seccion, /role="tablist" aria-label="Estrategia"/, 'sin la tira de pestañas de antes')
  assert.match(leer('src/features/cabina/model.ts'), /'negocio', 'estrategia', 'bi'/)
  assert.match(leer('src/features/cabina/panel/menu-orden.ts'), /'negocio', 'estrategia', 'bi'/)
  assert.match(leer('src/lib/edicion.ts'), /'negocio', 'estrategia', 'bi', 'explorador', 'taller'/)
  assert.match(leer('src/lib/edicion.ts'), /'\/negocio', '\/estrategia', '\/bi'/)
})

test('la cara de cada competidor: solo https, con su fuente y su fecha; sin imagen, iniciales', () => {
  const x = ejemplo()
  Object.assign(x.contra_quien.hispanos[0], { imagen: { url: 'https://yt3.googleusercontent.com/abc=s900', de: 'https://www.youtube.com/@a', forma: 'avatar', ...F } })
  Object.assign(x.contra_quien.anglos[0], { imagen: { url: 'http://inseguro.com/a.jpg', ...F } })
  const { mercado: m, errores } = leerMercado(x)
  assert.equal(m!.contra_quien!.hispanos[0].imagen?.url, 'https://yt3.googleusercontent.com/abc=s900')
  assert.equal(m!.contra_quien!.hispanos[0].imagen?.forma, 'avatar')
  assert.equal(m!.contra_quien!.anglos[0].imagen, null, 'una imagen por http no se carga')
  assert.ok(errores.some(e => /imagen.*https/.test(e)))
  const sinFuente = ejemplo()
  Object.assign(sinFuente.contra_quien.hispanos[0], { imagen: { url: 'https://a.com/x.jpg' } })
  assert.equal(leerMercado(sinFuente).mercado!.contra_quien!.hispanos[0].imagen, null, 'sin fuente ni fecha, no hay cara')
  assert.equal(iniciales('Fulano Pérez · Escuela de IA – Vende con IA (Marca)'), 'FP')
  assert.equal(iniciales('zutano y Mengano (contraste dev)'), 'M')
  assert.equal(nombreCorto('Fulano Pérez · Escuela de IA'), 'Fulano Pérez')
  assert.equal(marcaDe('Fulano Pérez · Escuela de IA'), 'Escuela de IA')
  assert.equal(nombreCorto('Zutano IA (Zutano Gómez)'), 'Zutano IA')
})

const REAL = raiz(RUTA_MERCADO)
test('el archivo real, si está en este cerebro: legible entero, con fuente y fecha en cada pieza', { skip: !existsSync(REAL) && 'sin mercado.json en esta copia' }, () => {
  const crudo = JSON.parse(readFileSync(REAL, 'utf8'))
  const { mercado: m, errores } = leerMercado(crudo)
  assert.deepEqual(errores, [])
  assert.ok(m?.cabeza && m.quien_compra && m.contra_quien && m.hacia_donde && m.lo_que_decides, 'las cuatro vistas y la cabeza')
  // Nada se descartó: lo que el archivo trae es lo que se pinta.
  const ev = (xs: unknown[]) => xs.length
  crudo.quien_compra.escalones.forEach((e: { segmentos: { evidencia: unknown[] }[] }, i: number) => e.segmentos.forEach((s, j) =>
    assert.equal(m.quien_compra!.escalones[i].segmentos[j].evidencia.length, ev(s.evidencia))))
  // Un avatar por escalón y una frase de posicionamiento, cada uno con evidencia al lado.
  const d = m.lo_que_decides
  assert.deepEqual(d.avatares.map(a => a.escalon), m.quien_compra.escalones.map(e => e.nombre))
  assert.ok(d.posicionamiento)
  for (const b of [...d.avatares, d.posicionamiento]) assert.ok(b.evidencia.length >= 3, `${b.borrador.slice(0, 30)}…: evidencia al lado`)
  // La cara pública de cada competidor, con su página de origen (8 nov 2026).
  const fichas = [...m.contra_quien.hispanos, ...m.contra_quien.anglos]
  assert.ok(fichas.filter(f => f.imagen).length >= 20, 'la mayoría con su imagen pública')
  for (const f of fichas) if (f.imagen) assert.ok(f.imagen.de && f.imagen.fuente && f.imagen.fecha, `${f.nombre}: imagen con su origen`)
  // Solo patrones: ni correos ni teléfonos.
  const texto = readFileSync(REAL, 'utf8')
  assert.doesNotMatch(texto, /[\w.+-]+@[\w-]+\.[\w.]+/)
  assert.doesNotMatch(texto, /\+?\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}/)
})

// Panel v2 (9 nov 2026, «tan bonito visualmente como business intelligence… es mucho texto»).
test('v2: cada tarjeta toma su frase de la cabeza, por su pregunta o por su lugar', () => {
  const cabeza = { ...F, lineas: [
    { pregunta: '¿A quién sirves hoy?', respuesta: 'A', ...F, propia: true },
    { pregunta: '¿Contra qué te comparan?', respuesta: 'B', ...F, propia: false },
    { pregunta: '¿A qué precio?', respuesta: 'C', ...F, propia: false },
  ] }
  assert.equal(lineaDe(cabeza, 'compra')?.respuesta, 'A')
  assert.equal(lineaDe(cabeza, 'contra')?.respuesta, 'B')
  assert.equal(lineaDe(cabeza, 'precio')?.respuesta, 'C')
  const sinNombre = { ...F, lineas: cabeza.lineas.map((x, i) => ({ ...x, pregunta: `Pregunta ${i}` })) }
  assert.deepEqual((['compra', 'contra', 'precio'] as const).map(t => lineaDe(sinNombre, t)?.respuesta), ['A', 'B', 'C'])
  assert.equal(lineaDe(null, 'compra'), null)
  // En directo la línea propia se va: la tarjeta queda sin frase, no con la de otra pregunta.
  const directo = { ...F, lineas: cabeza.lineas.filter(x => !x.propia) }
  assert.equal(lineaDe(directo, 'contra')?.respuesta, 'B')
  assert.equal(lineaDe(directo, 'precio')?.respuesta, 'C')
})

test('v2: el titular sale del dato (un peldaño que es el hueco y es tuyo), y la barra no cruza unidades', () => {
  const m = leerMercado(ejemplo()).mercado!
  assert.equal(titularDe(m), 'Estás en el hueco')
  const sinTu = { ...m, contra_quien: { ...m.contra_quien!, escalera: { ...m.contra_quien!.escalera!, peldanos: m.contra_quien!.escalera!.peldanos.map(p => ({ ...p, tu: null })) } } }
  assert.equal(titularDe(sinTu), 'Tu mercado')
  const esc = { id: 'e', nombre: 'E', universo: null, ventana: null, separa: [], segmentos: [
    { nombre: 'a', quien: null, quiere: null, teme: null, intento_antes: null, paga: null, evidencia: [], tamano: { valor: 30, unidad: 'clientes', que: null, ...F } },
    { nombre: 'b', quien: null, quiere: null, teme: null, intento_antes: null, paga: null, evidencia: [], tamano: { valor: 10, unidad: 'clientes', que: null, ...F } },
    { nombre: 'c', quien: null, quiere: null, teme: null, intento_antes: null, paga: null, evidencia: [], tamano: null },
  ] }
  assert.deepEqual(tramos(esc).map(t => [t.valor, t.parte]), [[30, 0.75], [10, 0.25], [null, 0]], 'sin dato no se vuelve 0 ni se reparte')
  assert.match(fraseRumbo(m.hacia_donde!), /^1 tendencia ya pasa en inglés/)
})

test('v2: nada nace invisible (la captura de las 10:26 salió en blanco antes de pintar)', () => {
  const seccion = leer('src/features/negocio/SeccionEstrategia.tsx')
  assert.doesNotMatch(seccion, /l\.entra|mov\.entra|escalon\(/, 'sin entradas escalonadas desde opacidad 0')
  assert.doesNotMatch(seccion, /key=\{vista\}/, 'nada se vuelve a montar al cambiar de pregunta')
  for (const f of ['src/features/negocio/estrategia-panel.module.css', 'src/features/negocio/estrategia-seccion.module.css']) {
    for (const [, cuerpo] of leer(f).matchAll(/@keyframes\s+\w+\s*\{([^@]*?)\}\s*\}/g)) assert.doesNotMatch(cuerpo, /opacity:\s*0[;\s}]/, `${f}: un keyframe parte de opacidad 0`)
  }
})
