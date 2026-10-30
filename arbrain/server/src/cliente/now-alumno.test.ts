/**
 * `now.md` del alumno (29 oct 2026): el daemon de la edición cliente lo arma con su calendario, sus objetivos, su meta y
 * sus hábitos; respeta lo editado a mano; no ensucia git si solo cambia la hora; y en la instalación del autor no corre.
 * Datos inventados: nunca de un alumno real.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escribirNow, esNuestro, eventosEntre, generarNow, hitosDe, iniciarNowAlumno, metaDe, RUTA_NOW } from './now-alumno.js'

const EDICION = process.env.ARBRAIN_EDICION
beforeEach(() => { process.env.ARBRAIN_EDICION = 'cliente' })
afterEach(() => { if (EDICION === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = EDICION })

const OBJETIVOS = `<!--
  comentario de la plantilla con un ejemplo que NO debe leerse:
  ## Octubre 2026
  **Mes:** objetivo del ejemplo
-->

# Objetivos

## Octubre 2026
**Mes:** cerrar 2 clientes del diagnóstico

### Semana 26-31
**Foco:** 10 conversaciones con prospectos

#### Jue 29
- [x] Lista de 20 prospectos
- [ ] Guion de la primera llamada

#### Vie 30
- [ ] Algo de mañana
`

function cerebro(calendario: unknown, extra: Record<string, string> = {}): string {
  const raiz = mkdtempSync(join(tmpdir(), 'now-alumno-'))
  mkdirSync(join(raiz, '.claude/plan'), { recursive: true })
  mkdirSync(join(raiz, '.claude/memory/project'), { recursive: true })
  writeFileSync(join(raiz, '.claude/plan/calendario.json'), JSON.stringify(calendario))
  writeFileSync(join(raiz, '.claude/plan/objetivos.md'), OBJETIVOS)
  writeFileSync(join(raiz, '.claude/plan/habitos.json'), JSON.stringify({
    version: 1,
    habitos: [{ clave: 'objetivo_dia', nombre: 'Objetivo del día', orden: 0, activo: true }, { clave: 'abs', nombre: 'Abdominales', orden: 1, activo: true }, { clave: 'viejo', nombre: 'Ya no', orden: 2, activo: false }],
    registro: { '2026-10-29': { abs: { hecho: true } } },
  }))
  writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias.md'), '<!-- arbrain:expediente sha256=' + '0'.repeat(64) + ' -->\n# Mi meta\n\n- **Meta a 90 días:** 900 USD al mes para el 2027-01-24.\n')
  for (const [rel, t] of Object.entries(extra)) { mkdirSync(join(raiz, rel, '..'), { recursive: true }); writeFileSync(join(raiz, rel), t) }
  return raiz
}

const CAL = (zona: string) => ({
  version: 1, zona,
  eventos: [
    { id: 'a', titulo: 'Clase del programa', inicio: '2026-10-29T12:00:00', fin: '2026-10-29T13:30:00' },
    { id: 'b', titulo: 'Gimnasio', inicio: '2026-10-26T07:00:00', fin: '2026-10-26T08:00:00', repetir: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
    { id: 'c', titulo: 'Viaje', inicio: '2026-11-01', todoElDia: true },
    { id: 'd', titulo: 'Llamada con zona', inicio: '2026-10-29T16:00:00Z', fin: '2026-10-29T16:30:00Z' },
    { titulo: 'ilegible sin inicio' },
  ],
  tareas: [
    { id: 't1', titulo: 'Mandar propuesta', fecha: '2026-10-29' },
    { id: 't2', titulo: 'Factura vieja', fecha: '2026-10-27' },
    { id: 't3', titulo: 'Ya hecha', fecha: '2026-10-29', hecha: true },
    { id: 't4', titulo: 'Preparar demo', fecha: '2026-10-31' },
    { id: 't5', titulo: 'Sin fecha', fecha: null },
  ],
})

describe('generarNow', () => {
  it('Ciudad de México: fecha, hitos, meta, hoy, hábitos y la semana', () => {
    const raiz = cerebro(CAL('America/Mexico_City'))
    // 29 oct 2026 15:00 UTC = 09:00 en Ciudad de México.
    const t = generarNow(raiz, new Date('2026-10-29T15:00:00Z'), 'America/Mexico_City')
    expect(t).toContain('> **Jueves 29 de octubre 2026** (America/Mexico_City)')
    expect(t).toContain('- **Meta a 90 días:** 900 USD al mes para el 2027-01-24.')
    expect(t).toContain('- **Mes:** cerrar 2 clientes del diagnóstico')
    expect(t).not.toContain('objetivo del ejemplo')
    expect(t).toContain('- **Semana:** 10 conversaciones con prospectos')
    expect(t).toContain('    - [x] Lista de 20 prospectos')
    expect(t).toContain('    - [ ] Guion de la primera llamada')
    expect(t).not.toContain('Algo de mañana')
    expect(t).toContain('- `12:00` Clase del programa (hasta 13:30)')
    expect(t).toContain('- `10:00` Llamada con zona (hasta 10:30)')
    expect(t).toContain('- [ ] Mandar propuesta')
    expect(t).toContain('- [ ] Factura vieja _(venció el mar 27)_')
    expect(t).not.toContain('Ya hecha')
    expect(t).not.toContain('Sin fecha')
    expect(t).toContain('- Hábitos: Objetivo del día (pendiente) · Abdominales (hecho)')
    expect(t).not.toContain('Ya no')
    expect(t).toContain('- **Vie 30:** `07:00` Gimnasio')
    expect(t).toContain('- **Sáb 31:** tarea: Preparar demo')
    expect(t).toContain('- **Dom 1:** `todo el día` Viaje')
    expect(t).toContain('- **Lun 2:** `07:00` Gimnasio')
    expect(t).toMatch(/> Generado por Arbrain el 29 oct 2026, 09:00 \(America\/Mexico_City\)\.\n$/)
    // Las secciones que lee el gancho agenda-context.py.
    for (const s of ['## Hitos\n', '## Hoy\n', '## Esta semana\n']) expect(t).toContain(s)
  })

  it('Madrid: el mismo instante es otro día y otras horas', () => {
    const raiz = cerebro(CAL('Europe/Madrid'))
    // 29 oct 2026 23:30 UTC = 30 oct 00:30 en Madrid (ya en horario de invierno, UTC+1).
    const t = generarNow(raiz, new Date('2026-10-29T23:30:00Z'), 'Europe/Madrid')
    expect(t).toContain('> **Viernes 30 de octubre 2026** (Europe/Madrid)')
    expect(t).toContain('- `07:00` Gimnasio')
    expect(t).toContain('- [ ] Mandar propuesta _(venció el jue 29)_')
    expect(t).toContain('    - [ ] Algo de mañana')
    expect(t).toContain('- **Lun 2:** `07:00` Gimnasio')
    expect(t).toMatch(/Generado por Arbrain el 30 oct 2026, 00:30 \(Europe\/Madrid\)/)
  })

  it('sin plan ni meta: dice que no hay, no inventa', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'now-vacio-'))
    mkdirSync(join(raiz, '.claude'), { recursive: true })
    const t = generarNow(raiz, new Date('2026-10-29T15:00:00Z'), 'America/Mexico_City')
    expect(t).not.toContain('Meta a 90 días')
    expect(t).toContain('_(sin objetivo del mes')
    expect(t).toContain('## Hoy\n_Nada agendado._')
    expect(t).toContain('## Esta semana\n_Nada agendado._')
  })

  it('la meta pendiente del expediente no cuenta; el fechado más reciente sí', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'now-meta-'))
    mkdirSync(join(raiz, '.claude/memory/project'), { recursive: true })
    writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias.md'), '<!-- arbrain:expediente pendiente -->\n- **Meta a 90 días:** de ejemplo\n')
    expect(metaDe(raiz)).toBeNull()
    writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias-2026-10-20.md'), '- **Meta a 90 días:** 700 USD al mes.\n')
    expect(metaDe(raiz)).toBe('700 USD al mes.')
  })

  it('objetivos del registro de la app ganan al texto', () => {
    const reg = `<!-- arbrain-objectives-v1\n${JSON.stringify({ version: 1, goals: [
      { id: '1', scope: 'month', start: '2026-10-01', end: '2026-11-01', title: 'Mes del registro', status: 'agreed' },
      { id: '2', scope: 'day', start: '2026-10-29', end: '2026-10-30', title: 'Día del registro', status: 'completed' },
    ] })}\n-->`
    const h = hitosDe(`${OBJETIVOS}\n${reg}`, '2026-10-29')
    expect(h.mes).toBe('Mes del registro')
    expect(h.dia[0]).toEqual({ texto: 'Día del registro', hecho: true })
  })

  it('un evento sin inicio no rompe nada y no aparece', () => {
    expect(eventosEntre({ eventos: [{ titulo: 'x' }, null, 'basura'] }, '2026-10-29', '2026-10-30', 'UTC')).toEqual([])
  })
})

describe('escribirNow', () => {
  it('escribe con marca, no reescribe si solo cambiaría la hora y respeta lo editado a mano', () => {
    const raiz = cerebro(CAL('America/Mexico_City'))
    const ruta = join(raiz, RUTA_NOW)
    expect(escribirNow(raiz, { ahora: new Date('2026-10-29T15:00:00Z'), tz: 'America/Mexico_City' })).toBe('escrito')
    const primero = readFileSync(ruta, 'utf8')
    expect(primero).toMatch(/^<!-- arbrain:now sha256=[0-9a-f]{64} -->\n# Ahora\n/)
    expect(esNuestro(primero)).toBe(true)
    // 20 minutos después, nada cambió más que la hora: no se toca (git y el espejo quedan limpios).
    expect(escribirNow(raiz, { ahora: new Date('2026-10-29T15:20:00Z'), tz: 'America/Mexico_City' })).toBe('igual')
    expect(readFileSync(ruta, 'utf8')).toBe(primero)
    // Cambia el calendario: se reescribe.
    writeFileSync(join(raiz, '.claude/plan/calendario.json'), JSON.stringify({ ...CAL('America/Mexico_City'), eventos: [{ titulo: 'Nuevo', inicio: '2026-10-29T18:00:00' }] }))
    expect(escribirNow(raiz, { ahora: new Date('2026-10-29T15:40:00Z'), tz: 'America/Mexico_City' })).toBe('escrito')
    expect(readFileSync(ruta, 'utf8')).toContain('`18:00` Nuevo')
    // El dueño lo edita a mano: ya no es nuestro.
    writeFileSync(ruta, readFileSync(ruta, 'utf8').replace('Nuevo', 'Lo cambié yo'))
    expect(escribirNow(raiz, { ahora: new Date('2026-10-29T16:00:00Z'), tz: 'America/Mexico_City' })).toBe('editado_a_mano')
    expect(readFileSync(ruta, 'utf8')).toContain('Lo cambié yo')
  })

  it('<!-- manual --> lo congela aunque la huella cuadre', () => {
    const raiz = cerebro(CAL('UTC'))
    const ruta = join(raiz, RUTA_NOW)
    writeFileSync(ruta, '<!-- manual -->\n# Ahora\nmi versión\n')
    expect(escribirNow(raiz, { tz: 'UTC' })).toBe('editado_a_mano')
    expect(readFileSync(ruta, 'utf8')).toBe('<!-- manual -->\n# Ahora\nmi versión\n')
  })

  it('reemplaza la semilla pendiente y la semilla vieja sin marca', () => {
    const viejo = '# Ahora\n\n> _Todavía sin datos. Este archivo lo genera `now-snapshot.py`._\n\n---\n> _Auto-generado por `now-snapshot.py`._\n'
    for (const semilla of ['<!-- arbrain:now pendiente -->\n# Ahora\n', viejo]) {
      const raiz = cerebro(CAL('UTC'))
      writeFileSync(join(raiz, RUTA_NOW), semilla)
      expect(escribirNow(raiz, { tz: 'UTC' })).toBe('escrito')
      expect(readFileSync(join(raiz, RUTA_NOW), 'utf8')).toContain('Generado por Arbrain')
    }
    // Un now.md sin marca que no es la semilla (lo escribió alguien): no se toca.
    const raiz = cerebro(CAL('UTC'))
    writeFileSync(join(raiz, RUTA_NOW), '# Ahora\nescrito por una rutina mía\n')
    expect(escribirNow(raiz, { tz: 'UTC' })).toBe('editado_a_mano')
  })

  it('no corre en la instalación del autor ni sin cerebro', () => {
    const raiz = cerebro(CAL('UTC'))
    process.env.ARBRAIN_EDICION = 'daniel'
    expect(escribirNow(raiz)).toBe('no_cliente')
    expect(iniciarNowAlumno(raiz)).toBeNull()
    expect(existsSync(join(raiz, RUTA_NOW))).toBe(false)
    process.env.ARBRAIN_EDICION = 'cliente'
    expect(escribirNow(join(tmpdir(), 'no-existe-este-cerebro-xyz'))).toBe('sin_cerebro')
  })

  it('iniciarNowAlumno escribe al arrancar y se detiene limpio', () => {
    const raiz = cerebro(CAL('UTC'))
    const vistos: string[] = []
    const r = iniciarNowAlumno(raiz, { registrar: (res, motivo) => vistos.push(`${motivo}:${res}`) })
    expect(r).not.toBeNull()
    expect(vistos).toEqual(['arranque:escrito'])
    expect(statSync(join(raiz, RUTA_NOW)).size).toBeGreaterThan(100)
    expect(r!.ahora()).toBe('igual')
    r!.detener()
  })
})
