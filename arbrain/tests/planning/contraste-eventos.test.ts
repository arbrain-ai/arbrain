// Contraste de los colores de evento (3 oct 2026): cada color de Google (11 de evento, 24 de calendario, los de Daniel)
// y de Todoist, en claro y oscuro, sobre las superficies reales. Imprime la tabla antes/después.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AA_GRAFICO, AA_TEXTO, GOOGLE_CALENDARIO, GOOGLE_EVENTO, TEMAS, TODOIST, colorEvento, contraste, estiloEvento, mezcla, type Tema } from '../../src/lib/calendar/contraste'

const DANIEL: Record<string, string> = {
  'Objetivo del día': '#ffe894', 'Objetivo de la semana': '#a48b00', 'Trabajo Duro': '#6b6c6d', 'Trabajo Compartido': '#cd74e6', 'EJERCICIO (Gym)': '#ffa1a1',
  Comidas: '#c8edf7', Transporte: '#ffcfa6', 'Personal / Gmail': '#330e81', 'Correo de negocio': '#9fe1e7', 'Tiempo con la segunda persona': '#d7c2ff', 'Meta del día (oro)': '#ffac3d', 'Desconocido (slate)': '#64748b',
}
const PALETA: [string, string][] = [
  ...Object.entries(GOOGLE_EVENTO), ...GOOGLE_CALENDARIO.map(c => [`calendario ${c}`, c] as [string, string]),
  ...Object.entries(DANIEL), ...Object.entries(TODOIST).map(([n, c]) => [`todoist ${n}`, c] as [string, string]),
]
const TEMAS_LISTA: Tema[] = ['claro', 'oscuro']
const SUPERFICIES = (t: Tema) => [TEMAS[t].fondo, TEMAS[t].tarjeta]

/** Lo que había: el relleno al 23 % y el texto que heredaba FullCalendar (#fff) en ambos temas. */
const antes = (c: string, _t: Tema, base: string) => contraste('#ffffff', mezcla(c, base, 0.23))

test('toda la paleta cumple AA (4.5:1 texto, 4.5:1 metadatos, 3:1 acento) en claro y oscuro', () => {
  const filas: string[] = ['color'.padEnd(34) + 'hex      claro antes→después (meta)(acento)  oscuro antes→después (meta)(acento)']
  let malos = 0
  for (const [nombre, hex] of PALETA) {
    let linea = nombre.padEnd(34) + hex + '  '
    for (const t of TEMAS_LISTA) {
      for (const base of SUPERFICIES(t)) {
        const r = colorEvento(hex, t, base)
        const tx = contraste(r.texto, r.fondo), mt = contraste(r.meta, r.fondo), ac = contraste(r.acento, base)
        if (tx < AA_TEXTO || mt < AA_TEXTO || ac < AA_GRAFICO) { malos++; console.log('FALLA', nombre, t, base, tx.toFixed(2), mt.toFixed(2), ac.toFixed(2)) }
        assert.ok(tx >= AA_TEXTO, `${nombre} ${t} texto ${tx.toFixed(2)}`)
        assert.ok(mt >= AA_TEXTO, `${nombre} ${t} meta ${mt.toFixed(2)}`)
        assert.ok(ac >= AA_GRAFICO, `${nombre} ${t} acento ${ac.toFixed(2)}`)
      }
      const r = colorEvento(hex, t), base = TEMAS[t].fondo
      linea += `${antes(hex, t, base).toFixed(2).padStart(5)}→${contraste(r.texto, r.fondo).toFixed(1).padStart(4)} (${contraste(r.meta, r.fondo).toFixed(1)})(${contraste(r.acento, base).toFixed(1)})   `
    }
    filas.push(linea)
  }
  console.log(filas.join('\n'))
  assert.equal(malos, 0)
})

test('conserva la identidad: el relleno sigue siendo del color del calendario', () => {
  const r = colorEvento('#ffa1a1', 'claro')
  const [rr, gg, bb] = [1, 3, 5].map(i => parseInt(r.fondo.slice(i, i + 2), 16))
  assert.ok(rr > gg + 10 && rr > bb + 10, `Gym debe verse rosa: ${r.fondo}`)
  assert.equal(colorEvento('#ffa1a1', 'oscuro').texto, TEMAS.oscuro.texto)
  assert.equal(colorEvento('#ffa1a1', 'claro').texto, TEMAS.claro.texto)
})

test('colores ausentes o ilegibles caen al neutro y también cumplen', () => {
  for (const c of [null, undefined, '', 'no-es-color', 'var(--brand)', '#zzz']) for (const t of TEMAS_LISTA) {
    const r = colorEvento(c, t); assert.ok(contraste(r.texto, r.fondo) >= AA_TEXTO)
  }
})

test('estiloEvento da las variables de ambos temas', () => {
  const e = estiloEvento('#6b6c6d')
  for (const k of ['bg', 'fg', 'meta', 'ac']) for (const s of ['l', 'd']) assert.match(e[`--ev-${k}-${s}`], /^#[0-9a-f]{6}$/)
  assert.ok(contraste(e['--ev-fg-l'], e['--ev-bg-l']) >= AA_TEXTO && contraste(e['--ev-fg-d'], e['--ev-bg-d']) >= AA_TEXTO)
})
