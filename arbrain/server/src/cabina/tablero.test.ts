// Tablero por estado con latido verificado (27 oct 2026): la columna sale del proceso y de la última escritura, no de
// lo que crea Levy. Incluye «murió»: proceso muerto sin cierre o vivo sin latido más allá del umbral.
import { describe, it, expect } from 'vitest'
import { estadoTablero, pasoEnHumano, UMBRAL_LATIDO_MS, type Hechos } from './tablero.js'

const T = Date.parse('2026-10-27T20:00:00Z')
const MIN = 60_000
const base: Hechos = { hayTurno: true, cerroTurno: false, procesoVivo: true, ultimaEscritura: T - 30_000, creado: T - 10 * MIN, error: null, detenido: false, pregunta: null, entregaFallo: false }
const col = (h: Partial<Hechos>, ahora = T, umbral = 20 * MIN) => estadoTablero({ ...base, ...h }, ahora, umbral)

describe('tablero: columna por hechos medidos', () => {
  it('trabajando con latido reciente, y el latido viaja con su edad', () => {
    const e = col({})
    expect(e.columna).toBe('trabajando')
    expect(e.latido).toEqual({ ultimaEscritura: T - 30_000, procesoVivo: true, edadMs: 30_000, umbralMs: 20 * MIN })
    expect(e.motivo).toBe('Trabajando')
  })

  it('murió: el proceso ya no está y el turno no cerró (el caso del compacto del 26 oct)', () => {
    const e = col({ procesoVivo: false })
    expect(e.columna).toBe('murió')
    expect(e.motivo).toMatch(/sin terminar su turno/)
  })

  it('murió: proceso vivo pero mudo más allá del umbral; justo en el umbral sigue trabajando', () => {
    expect(col({ ultimaEscritura: T - 21 * MIN }).columna).toBe('murió')
    expect(col({ ultimaEscritura: T - 21 * MIN }).motivo).toMatch(/no escribe nada hace 21 min/)
    expect(col({ ultimaEscritura: T - 20 * MIN }).columna).toBe('trabajando')
  })

  it('murió: nunca arrancó (sin bitácora ni proceso tras 3 min); recién nacido cuenta como arrancando', () => {
    expect(col({ hayTurno: false, procesoVivo: false, ultimaEscritura: null, creado: T - 5 * MIN }).columna).toBe('murió')
    expect(col({ hayTurno: false, procesoVivo: false, ultimaEscritura: null, creado: T - 60_000 }).columna).toBe('trabajando')
    expect(col({ hayTurno: false, procesoVivo: true, ultimaEscritura: null }).motivo).toBe('Arrancando')
  })

  it('te espera: pregunta abierta en curso, cerró con pregunta o lo detuvieron', () => {
    expect(col({ pregunta: '¿Rama A o B?' }).columna).toBe('te-espera')
    expect(col({ cerroTurno: true, procesoVivo: false, pregunta: '¿Sigo?' }).columna).toBe('te-espera')
    expect(col({ cerroTurno: true, procesoVivo: false, detenido: true }).motivo).toMatch(/un mensaje lo reanuda/)
  })

  it('detenido y cerrado con error es «falló», no «te espera» (28 oct: el Pizarrón 21 días con Responder)', () => {
    expect(col({ cerroTurno: true, procesoVivo: false, detenido: true, error: 'Lo detuvieron y su proceso salió con código 1' }))
      .toMatchObject({ columna: 'falló', motivo: 'Lo detuvieron y su proceso salió con código 1' })
    // detenido sin error (salió con código 0): sigue esperando un mensaje que lo reanude
    expect(col({ cerroTurno: true, procesoVivo: false, detenido: true }).columna).toBe('te-espera')
  })

  it('listo para revisar al cerrar bien; falló con error o si el encargo no llegó', () => {
    expect(col({ cerroTurno: true, procesoVivo: false, ultimaEscritura: T - 3 * 60 * MIN }).columna).toBe('listo')
    expect(col({ cerroTurno: true, procesoVivo: false, error: 'el CLI salió con código 1' })).toMatchObject({ columna: 'falló', motivo: 'el CLI salió con código 1' })
    expect(col({ entregaFallo: true }).columna).toBe('falló')
    // un turno cerrado no «muere» por antigüedad: está listo, esperando revisión
    expect(col({ cerroTurno: true, procesoVivo: false, ultimaEscritura: T - 48 * 60 * MIN }).columna).toBe('listo')
  })

  it('el umbral se configura por entorno', () => {
    expect(UMBRAL_LATIDO_MS({})).toBe(20 * MIN)
    expect(UMBRAL_LATIDO_MS({ ARBRAIN_LATIDO_MS: '60000' })).toBe(MIN)
  })
})

describe('tablero: último paso en humano (sin modelo)', () => {
  it('traduce la herramienta y lo que tocó a una frase en español', () => {
    expect(pasoEnHumano('Bash', 'cd arbrain/server && npm run typecheck && npm test')).toBe('Corriendo las pruebas')
    expect(pasoEnHumano('Bash', 'npx tsc --noEmit')).toBe('Revisando que el código compile')
    expect(pasoEnHumano('Bash', 'git commit -m "x"')).toBe('Guardando su avance en git')
    expect(pasoEnHumano('Bash', 'git log --oneline')).toBe('Revisando la historia en git')
    expect(pasoEnHumano('Bash', 'node capturar-subagentes.mjs despues')).toBe('Tomando capturas')
    expect(pasoEnHumano('Bash')).toBe('Corriendo un comando')
    expect(pasoEnHumano('Edit', '/Users/x/arbrain/src/tablero.ts')).toBe('Editando tablero.ts')
    expect(pasoEnHumano('Read', '/a/SPEC.md')).toBe('Leyendo SPEC.md')
    expect(pasoEnHumano('Grep', 'foo')).toBe('Buscando en el código')
    expect(pasoEnHumano('mcp__manos__web_abrir')).toBe('Usando la computadora')
    expect(pasoEnHumano('mcp__cabina__mostrar_trabajos')).toBe('Usando mostrar trabajos')
  })
})
