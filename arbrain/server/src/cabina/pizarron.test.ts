import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import * as marcasServidor from './pizarron-marcas.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = mkdtempSync(path.join(tmpdir(), 'pizarron-test-'))
process.env.PIZARRON_DIR = raiz
const pz = await import('./pizarron.js')

const OBJETO = `export default function montar(pz) {
  const s = pz.ejes({ x: [-2, 2], y: [-1, 4] })
  const x0 = pz.param('x0', 1, { min: -2, max: 2 })
  pz.asa('x0', { lugar: v => ({ x: s.x(v), y: s.y(v * v) }), valorDe: (x) => s.u(x) })
  pz.ancla('vertice', () => ({ x: s.x(0), y: s.y(0) }))
  pz.dibujar(c => { s.dibujar(c); s.curva(c, u => u * u); s.punto(c, x0.valor, x0.valor ** 2) })
  pz.metodo('salta', () => x0.poner(-x0.valor, 1))
}`

describe('acotaciones', () => {
  it('el espejo del servidor es idéntico al de la app', async () => {
    const app = readFileSync(path.join(aqui, '../../../src/features/pizarron/marcas.ts'), 'utf8')
    const srv = readFileSync(path.join(aqui, 'pizarron-marcas.ts'), 'utf8')
    const cuerpo = (t: string) => t.slice(t.indexOf('export interface Marca'))
    expect(cuerpo(srv)).toBe(cuerpo(app))
  })
  it('parte la voz y ubica cada acción en el texto hablado', () => {
    const { segmentos, errores } = marcasServidor.partirVoz('Mira [[encierra curva.vertice color=oro]] este punto. [[pausa 1.5]] Y ahora [[pon curva.x0=2 dur=1]] muévelo. [[espera curva.x0 "Jálalo tú"]] Listo.')
    expect(errores).toEqual([])
    expect(segmentos.map(s => s.tipo)).toEqual(['voz', 'pausa', 'voz', 'espera', 'voz'])
    const t0 = segmentos[0] as marcasServidor.Tramo
    expect(t0.hablado).toBe('Mira este punto.')
    expect(t0.marcas[0]).toMatchObject({ en: 5, marca: { verbo: 'encierra', args: ['curva.vertice'], opts: { color: 'oro' } } })
    const t2 = segmentos[2] as marcasServidor.Tramo
    expect(t2.marcas[0].marca.opts).toEqual({ 'curva.x0': '2', dur: '1' })
    expect((segmentos[3] as marcasServidor.Espera).marca.texto).toBe('Jálalo tú')
  })
  it('acepta señala con tilde y avisa verbos desconocidos', () => {
    expect(marcasServidor.leerMarca('señala a.b').verbo).toBe('senala')
    expect(marcasServidor.partirVoz('hola [[baila x]]').errores[0]).toMatch(/No conozco/)
  })
})

describe('sesión, pasos y objetos', () => {
  let id = ''
  beforeEach(() => { id = pz.abrirSesion({ tema: `Prueba ${Math.random().toString(36).slice(2, 7)}` }).sesion.id })

  it('el ensayo en seco atrapa errores antes de que Daniel los vea', () => {
    expect(pz.ensayar('export default function montar(pz) { pz.dibujar(c => { noExiste.x = 1 }) }').errores[0]).toMatch(/noExiste/)
    expect(pz.ensayar('import x from "y"\nexport default function m(pz) {}').errores[0]).toMatch(/import/)
    expect(pz.ensayar('export default function m(pz) { pz.asa("a", {}) }').errores[0]).toMatch(/declara antes/)
    expect(pz.ensayar('export default function m(pz) { pz.cada(() => { while (true) {} }) }').errores[0]).toMatch(/timed out|tiempo/i)
    const ok = pz.ensayar(OBJETO)
    expect(ok.errores).toEqual([])
    expect(ok.declarado).toMatchObject({ asas: ['x0'], anclas: ['vertice'], metodos: ['salta'] })
    expect(ok.declarado.params.x0).toMatchObject({ inicial: 1, min: -2, max: 2 })
  })

  it('valida referencias contra lo que habrá en el pizarrón', () => {
    pz.guardarObjeto({ id: 'parabola-test', nombre: 'Parábola', ensena: 'una parábola con un punto que se jala', codigo: OBJETO })
    expect(() => pz.agregarPasos(id, [{ voz: 'Mira [[encierra curva]] esto.' }])).toThrow(/«curva», que no está/)
    expect(() => pz.agregarPasos(id, [{ pon: [{ id: 'curva', tipo: 'objeto', objeto: 'no-existe' }] }])).toThrow(/no está en la biblioteca/)
    expect(() => pz.agregarPasos(id, [{ pon: [{ id: 'curva', tipo: 'objeto', objeto: 'parabola-test' }], voz: 'Así [[pon curva.k=1]].' }])).toThrow(/no tiene el parámetro «k»/)
    const r = pz.agregarPasos(id, [
      { pon: [{ id: 'curva', tipo: 'objeto', objeto: 'parabola-test' }, { id: 't', tipo: 'texto', texto: 'la pendiente cambia', estilo: 'grande' }], voz: 'Mira [[encierra curva.vertice]] el fondo y [[subraya t.pendiente]] esto. [[espera curva.x0]] Bien.' },
      { voz: 'Ahora tú.', predice: { pregunta: '¿Dónde?', modo: 'arrastra', en: 'curva', revela: 'Aquí [[llama curva.salta]].' } },
    ])
    expect(r.nuevos.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(r.avisos).toEqual([])
    expect(pz.leerFicha('parabola-test')?.usos).toBe(1)
    expect(() => pz.agregarPasos(id, [{ quita: ['curva'] }, { voz: '[[mira curva]]' }])).toThrow(/«curva», que no está/)
  })

  it('lee lo que hizo el alumno y escribe de vuelta en el documento y su mapa', () => {
    const doc = path.join(raiz, 'tema.md'); writeFileSync(doc, '# Tema\n\nEl documento.\n')
    const s = pz.abrirSesion({ tema: 'Derivadas de prueba', documento: doc }).sesion
    const dir = path.join(raiz, 'sesiones', s.id); mkdirSync(path.join(dir, 'fotos'), { recursive: true })
    writeFileSync(path.join(dir, 'fotos', 'p1-x.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    const ev = (o: object) => appendFileSync(path.join(dir, 'eventos.jsonl'), JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n')
    ev({ tipo: 'inicio-paso', paso: 'p1' }); ev({ tipo: 'gesto', gesto: { tipo: 'param', el: 'curva', param: 'x0', valor: 0.5 } }); ev({ tipo: 'gesto', gesto: { tipo: 'param', el: 'curva', param: 'x0', valor: 1.75 } })
    ev({ tipo: 'respuesta', paso: 'p1', modo: 'numero', valor: 3, foto: 'fotos/p1-x.png' }); ev({ tipo: 'fin-paso', paso: 'p1' })
    const l = pz.leerAlumno(s.id)
    expect(l.text).toMatch(/PREDICCIÓN en p1 \(numero\): 3/)
    expect(l.text).toMatch(/MOVIÓ curva\.x0: 2 cambio\(s\), de 0\.5 a 1\.75/)
    expect(l.imagenes).toHaveLength(1)
    expect(pz.leerAlumno(s.id).text).toMatch(/Sin gestos nuevos|ya vistos/)
    const t = pz.escribirDeVuelta({ sesion: s.id, entendido: ['La derivada es la pendiente en un punto'], palabras: 'es qué tan rápido sube justo ahí', domina: ['pendiente de una recta'], fragil: ['límite'], siguiente: 'regla de la cadena' })
    expect(t).toMatch(/tema\.md/)
    const md = readFileSync(doc, 'utf8')
    expect(md).toMatch(/^# Tema\n\nEl documento\.\n\n<!-- pizarron:/)
    expect(md).toMatch(/> «es qué tan rápido sube justo ahí»/)
    expect(readFileSync(path.join(raiz, 'alumnos', `${PERSONA_DUENO}.md`), 'utf8')).toMatch(/## Derivadas de prueba\n- .* · domina: pendiente de una recta · frágil: límite · siguiente: regla de la cadena/)
    expect(pz.mapaDelAlumno(PERSONA_DUENO, 'derivadas')).toMatch(/pendiente de una recta/)
    pz.escribirDeVuelta({ sesion: s.id, entendido: ['otra cosa'] })
    expect(readFileSync(doc, 'utf8').match(/<!-- pizarron:/g)).toHaveLength(1)
    expect(readFileSync(path.join(raiz, 'alumnos', `${PERSONA_DUENO}.md`), 'utf8').match(/derivadas-de-prueba\/sesion/g)).toHaveLength(1)
    expect(pz.leerSesion(s.id).cierre?.entendido).toEqual(['otra cosa'])
  })
})
