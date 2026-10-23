import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AIRE, DESPIERTA, TERCIO, destinoScroll, encuadreDe } from '../../src/features/planning/encuadre'
import { calendarAction, CALENDAR_SHORTCUTS } from '../../src/features/planning/shortcuts'

const fuente = (ruta: string) => readFileSync(new URL(`../../src/features/planning/${ruta}`, import.meta.url), 'utf8')
const tecla = (key: string) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })

test('hoy: el ahora queda a un tercio de lo visible', () => {
  assert.deepEqual(encuadreDe(14 * 60 + 20, [6 * 60]), { minuto: 14 * 60 + 20, fraccion: TERCIO, aire: 0 })
})

test('otro día: la hora entera de su primer evento, o las 5:30 si no tiene', () => {
  assert.equal(DESPIERTA, 5 * 60 + 30)
  assert.deepEqual(encuadreDe(null, [16 * 60 + 45, 9 * 60 + 15]), { minuto: 9 * 60, fraccion: 0, aire: AIRE })
  assert.deepEqual(encuadreDe(null, []), { minuto: DESPIERTA, fraccion: 0, aire: AIRE })
})

test('el destino deja la marca a un tercio de lo visible, bajo lo pegajoso', () => {
  // Contenedor de 900 px que empieza en y=0; la barra y la cabecera tapan 100 px arriba. La línea está 1500 px abajo.
  const destino = destinoScroll({ actual: 0, marca: 1500, arriba: 100, alto: 800, maximo: 5000, fraccion: TERCIO })
  assert.equal(destino, Math.round(1500 - 100 - 800 / 3))
  // Ya desplazado: el destino es absoluto, no depende de dónde estaba.
  assert.equal(destinoScroll({ actual: 600, marca: 900, arriba: 100, alto: 800, maximo: 5000, fraccion: TERCIO }), destino)
})

test('se recorta al rango posible: temprano no sube de 0 y de noche llega al pie sin pasarse', () => {
  assert.equal(destinoScroll({ actual: 0, marca: 150, arriba: 42, alto: 700, maximo: 2000, fraccion: TERCIO }), 0)
  assert.equal(destinoScroll({ actual: 0, marca: 9000, arriba: 42, alto: 700, maximo: 1200, fraccion: TERCIO }), 1200)
  assert.equal(destinoScroll({ actual: 0, marca: 900, arriba: 0, alto: 700, maximo: -5, fraccion: 0 }), 0)
})

test('el aire separa la primera hora del borde cuando no es hoy', () => {
  assert.equal(destinoScroll({ actual: 0, marca: 500, arriba: 42, alto: 700, maximo: 2000, fraccion: 0, aire: AIRE }), 500 - 42 - AIRE)
})

test('«Hoy» y la T siguen siendo ir a hoy, y ahora también a la hora', () => {
  assert.deepEqual(calendarAction(tecla('t')), { type: 'today' })
  assert.deepEqual(calendarAction(tecla('.')), { type: 'today' })
  assert.ok(CALENDAR_SHORTCUTS.some(a => a.teclas.includes('T') && /hora actual/.test(a.accion)))
  const cal = fuente('PlanningCalendar.tsx')
  assert.match(cal, /const goToday = useCallback\(\(\) => \{\n\s+const today = new Date\(\)\n\s+setPulsoHoy\(n => n \+ 1\)/)
  assert.match(cal, /<PulsoHoy\.Provider value=\{pulsoHoy\}>/)
})

test('solo encuadra al abrir, al cambiar de día o con «Hoy»: ni los datos ni el reloj mueven el scroll', () => {
  const hook = fuente('useEncuadre.ts')
  // Las dos únicas causas: otra clave o otro pulso. Lo demás (lectura, reloj) solo se lee al desplazar.
  assert.match(hook, /if \(o\.clave !== v\.clave\)/)
  assert.match(hook, /if \(pulso !== v\.pulso\)/)
  assert.match(hook, /prefers-reduced-motion: reduce/)
  assert.match(hook, /if \(p\.suave && !movimientoReducido\(\)\) \{[^\n]*s\.scrollTo\(\{ top: destino, behavior: 'smooth' \}\)/)
  // Si Daniel se mueve mientras espera la lectura o mientras se sostiene, el encuadre se suelta.
  assert.match(hook, /const soltar = \(\) => \{ pendiente\.current = null; clearTimeout\(espera\.current\); cancelAnimationFrame\(afinando\.current\) \}/)
  for (const ev of ['wheel', 'touchmove', 'pointerdown', 'keydown']) assert.match(hook, new RegExp(`addEventListener\\('${ev}'`))
  // El Día: la clave es el día y solo la hoja central del carril encuadra.
  assert.match(fuente('AgendaMini.tsx'), /clave: central \? dia : null/)
  assert.match(fuente('PlanningCalendar.tsx'), /render=\{\(f, central\) => <DiaVivo fecha=\{f\} central=\{central\}/)
  // La Semana: solo en el calendario (ventana deslizante) y su clave es hoy (medianoche); en el chat el scroll es del hilo.
  assert.match(fuente('SemanaHoras.tsx'), /clave: desliza \? hoy : null/)
})
