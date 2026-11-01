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
import { leerFuentes, leerTokenTodoist, rutaFuentes, SIN_FUENTES, sincronizarFuentes, type Dependencias, type Respuesta, type Salida } from './now-fuentes.js'

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

// ── Google Calendar y Todoist (1 nov 2026): simulados, sin red ni `gog` real ────────────────────────────────────────

const TOKEN = 'tok-de-prueba-0123456789abcdef'
const CUENTAS = { accounts: [
  { email: 'ana@ejemplo.com', client: 'default', services: ['calendar', 'gmail'] },
  { email: 'ana.trabajo@ejemplo.com', client: 'default', services: ['calendar'] },
  { email: 'solo-correo@ejemplo.com', client: 'default', services: ['gmail'] },
] }
const JUNTA = { summary: 'Junta de equipo', start: { dateTime: '2026-11-02T10:00:00-06:00' }, end: { dateTime: '2026-11-02T11:00:00-06:00' }, status: 'confirmed', eventType: 'default' }
const EVENTOS: Record<string, unknown> = {
  'ana@ejemplo.com': { events: [
    { summary: 'Dentista', start: { dateTime: '2026-11-01T11:00:00-06:00' }, end: { dateTime: '2026-11-01T12:00:00-06:00' }, status: 'confirmed', eventType: 'default', description: 'clave de la puerta 4321' },
    { summary: 'Cumpleaños de Leo', start: { date: '2026-11-03' }, end: { date: '2026-11-04' }, eventType: 'birthday' },
    { summary: 'Cancelado', start: { dateTime: '2026-11-01T13:00:00-06:00' }, end: { dateTime: '2026-11-01T14:00:00-06:00' }, status: 'cancelled' },
    { summary: 'Oficina', start: { date: '2026-11-02' }, end: { date: '2026-11-03' }, eventType: 'working-location' },
    { summary: 'Rechazada', start: { dateTime: '2026-11-01T16:00:00-06:00' }, end: { dateTime: '2026-11-01T17:00:00-06:00' }, attendees: [{ email: 'ana@ejemplo.com', self: true, responseStatus: 'declined' }] },
    JUNTA,
  ], nextPageTokens: [] },
  // La misma junta llega por la cuenta del trabajo: sale una vez.
  'ana.trabajo@ejemplo.com': { events: [JUNTA, { summary: 'Demo con cliente', start: { dateTime: '2026-11-04T17:00:00Z' }, end: { dateTime: '2026-11-04T18:00:00Z' } }] },
}
const TODOIST: Record<string, unknown> = {
  '': { results: [
    { content: 'Pagar luz', due: { date: '2026-10-30' } },
    { content: 'Llamar a mamá', due: { date: '2026-11-01T18:30:00' } },
    { content: 'Revisar contrato', due: { date: '2026-11-02T16:00:00.000000Z' } },
    { content: 'Sin fecha', due: null },
  ], next_cursor: 'pag2' },
  pag2: { results: [{ content: 'Enviar factura', due: { date: '2026-11-05' } }], next_cursor: null },
}

/** Google y Todoist de mentira. `fallas` cambia lo que responde cada cosa; `llamadas` guarda todo lo que se pidió. */
function simulados(fallas: { cuentas?: Salida; cuenta?: Record<string, Salida>; todoist?: number | 'red' } = {}) {
  const llamadas = { gog: [] as string[][], todoist: [] as { url: string; cabeceras: Record<string, string> }[] }
  const deps: Dependencias = {
    binarioGog: () => '/simulado/gog',
    tokenTodoist: async () => TOKEN,
    ejecutar: async (bin, args) => {
      expect(bin).toBe('/simulado/gog')
      llamadas.gog.push(args)
      if (args.includes('auth')) return fallas.cuentas ?? { codigo: 0, salida: JSON.stringify(CUENTAS), agotado: false }
      const cuenta = args[args.indexOf('--account') + 1]
      return fallas.cuenta?.[cuenta] ?? { codigo: 0, salida: JSON.stringify(EVENTOS[cuenta] ?? { events: [] }), agotado: false }
    },
    pedir: async (url, cabeceras): Promise<Respuesta> => {
      llamadas.todoist.push({ url, cabeceras })
      if (fallas.todoist === 'red') throw new Error('sin red')
      if (fallas.todoist) return { estado: fallas.todoist, cuerpo: null }
      return { estado: 200, cuerpo: TODOIST[new URL(url).searchParams.get('cursor') ?? ''] }
    },
  }
  return { deps, llamadas }
}

const TZ = 'America/Mexico_City'
const HOY = new Date('2026-11-01T06:00:00Z') // inicio del domingo 1 nov en Ciudad de México
const A_LAS = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00-06:00`)

describe('now.md con Google Calendar y Todoist', () => {
  const CONFIG = process.env.ARBRAIN_CONFIG_DIR
  beforeEach(() => { process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'now-config-')) })
  afterEach(() => { if (CONFIG === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = CONFIG })

  it('mezcla sus cuentas de Google y sus tareas de Todoist con lo local, sin repetir ni colar lo que no va', async () => {
    const raiz = cerebro(CAL(TZ))
    const { deps, llamadas } = simulados()
    const f = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('09:40'), deps })
    expect(Object.keys(f.google).sort()).toEqual(['ana.trabajo@ejemplo.com', 'ana@ejemplo.com'])
    const t = generarNow(raiz, A_LAS('09:40'), TZ, f)
    expect(t).toContain('> Al día con Google Calendar (2 cuentas) y Todoist.')
    // Hoy: lo local (Viaje) y lo de Google, en orden; las tareas de Todoist con su hora de pared.
    expect(t).toContain('## Hoy\n- `todo el día` Viaje\n- `11:00` Dentista (hasta 12:00)\n')
    expect(t).toContain('- [ ] `18:30` Llamar a mamá · Todoist')
    expect(t).toContain('- [ ] Pagar luz · Todoist _(venció el vie 30)_')
    expect(t).toContain('- [ ] Factura vieja _(venció el mar 27)_')
    // La semana.
    expect(t).toContain('- **Lun 2:** `07:00` Gimnasio (hasta 08:00) · `10:00` Junta de equipo (hasta 11:00) · tarea: Revisar contrato · Todoist')
    expect(t).toContain('- **Mar 3:** `todo el día` Cumpleaños de Leo')
    expect(t).toContain('- **Mié 4:** `07:00` Gimnasio (hasta 08:00) · `11:00` Demo con cliente (hasta 12:00)')
    expect(t).toContain('- **Jue 5:** tarea: Enviar factura · Todoist')
    expect(t.match(/Junta de equipo/g)).toHaveLength(1)
    for (const fuera of ['Cancelado', 'Oficina', 'Rechazada', 'Sin fecha', 'clave de la puerta', 'solo-correo']) expect(t).not.toContain(fuera)
    // Solo lectura: cada llamada a gog lleva --readonly y habilita solo la orden exacta; nada que cree o borre.
    expect(llamadas.gog).toHaveLength(3)
    for (const a of llamadas.gog) {
      expect(a).toContain('--readonly')
      expect(a.filter(x => x.startsWith('--enable-commands-exact='))).toEqual([a.includes('auth') ? '--enable-commands-exact=auth.list' : '--enable-commands-exact=calendar.events'])
      expect(a.join(' ')).not.toMatch(/\b(create|update|delete|send|move)\b/)
    }
    expect(llamadas.gog.some(a => a.includes('solo-correo@ejemplo.com'))).toBe(false)
    // Todoist: dos páginas de GET a la API v1 con su token en la cabecera, y nada más.
    expect(llamadas.todoist.map(l => l.url)).toEqual(['https://api.todoist.com/api/v1/tasks?limit=200', 'https://api.todoist.com/api/v1/tasks?limit=200&cursor=pag2'])
    expect(llamadas.todoist[0].cabeceras).toEqual({ Authorization: `Bearer ${TOKEN}` })
    // Lo último bueno queda fuera del repo, sin el token, sin descripciones y solo para el dueño.
    const cache = readFileSync(rutaFuentes(raiz), 'utf8')
    expect(rutaFuentes(raiz).startsWith(process.env.ARBRAIN_CONFIG_DIR!)).toBe(true)
    expect(cache).not.toContain(TOKEN)
    expect(cache).not.toContain('clave de la puerta')
    if (process.platform !== 'win32') expect(statSync(rutaFuentes(raiz)).mode & 0o077).toBe(0)
    // escribirNow sin fuentes usa lo guardado: el archivo del cerebro tampoco lleva el token.
    expect(escribirNow(raiz, { ahora: A_LAS('09:40'), tz: TZ })).toBe('escrito')
    const now = readFileSync(join(raiz, RUTA_NOW), 'utf8')
    expect(now).toContain('`11:00` Dentista')
    expect(now).not.toContain(TOKEN)
  })

  it('sin conexión: ni gog ni token, el archivo sale igual que antes y no se llama a nada', async () => {
    const raiz = cerebro(CAL(TZ))
    const antes = generarNow(raiz, A_LAS('09:40'), TZ, SIN_FUENTES)
    let llamadas = 0
    const deps: Dependencias = {
      binarioGog: () => null, tokenTodoist: async () => null,
      ejecutar: async () => { llamadas++; return { codigo: 0, salida: '', agotado: false } },
      pedir: async () => { llamadas++; return { estado: 200, cuerpo: {} } },
    }
    const f = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('09:40'), deps })
    expect(f).toEqual(SIN_FUENTES)
    expect(llamadas).toBe(0)
    expect(existsSync(rutaFuentes(raiz))).toBe(false)
    expect(generarNow(raiz, A_LAS('09:40'), TZ)).toBe(antes)
    for (const x of ['Google', 'Todoist', 'Al día']) expect(antes).not.toContain(x)
  })

  it('si desconecta (gog sin cuentas, token borrado), lo guardado se olvida', async () => {
    const raiz = cerebro(CAL(TZ))
    await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('09:40'), deps: simulados().deps })
    expect(Object.keys(leerFuentes(raiz).google)).toHaveLength(2)
    const { deps } = simulados({ cuentas: { codigo: 0, salida: JSON.stringify({ accounts: [] }), agotado: false } })
    await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('10:00'), deps: { ...deps, tokenTodoist: async () => null } })
    expect(existsSync(rutaFuentes(raiz))).toBe(false)
    expect(generarNow(raiz, A_LAS('10:00'), TZ)).not.toContain('Dentista')
  })

  it('si falla, usa lo último bueno y dice de cuándo es; durante la falla no reescribe cada 20 minutos', async () => {
    const raiz = cerebro(CAL(TZ))
    const ruta = join(raiz, RUTA_NOW)
    await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('09:40'), deps: simulados().deps })
    expect(escribirNow(raiz, { ahora: A_LAS('09:40'), tz: TZ })).toBe('escrito')
    // Al día y sin cambios 20 minutos después: no se toca.
    const f2 = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('10:00'), deps: simulados().deps })
    expect(escribirNow(raiz, { ahora: A_LAS('10:00'), tz: TZ, fuentes: f2 })).toBe('igual')

    const caido = simulados({ cuenta: { 'ana@ejemplo.com': { codigo: null, salida: '', agotado: true }, 'ana.trabajo@ejemplo.com': { codigo: 1, salida: '', agotado: false } }, todoist: 401 }).deps
    const f3 = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('10:20'), deps: caido })
    expect(escribirNow(raiz, { ahora: A_LAS('10:20'), tz: TZ, fuentes: f3 })).toBe('escrito')
    const t = readFileSync(ruta, 'utf8')
    expect(t).not.toContain('> Al día con')
    expect(t).toContain('> Google Calendar (ana@ejemplo.com): tiempo agotado; muestro lo último bueno, del dom 1 nov, 10:00.')
    expect(t).toContain('> Google Calendar (ana.trabajo@ejemplo.com): no respondió; muestro lo último bueno, del dom 1 nov, 10:00.')
    expect(t).toContain('> Todoist: llave rechazada; muestro lo último bueno, del dom 1 nov, 10:00.')
    expect(t).toContain('`11:00` Dentista')
    expect(t).toContain('Llamar a mamá · Todoist')
    // Sigue caído 20 minutos después: la fecha de lo último bueno no se mueve, así que el archivo tampoco.
    const f4 = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('10:40'), deps: caido })
    expect(escribirNow(raiz, { ahora: A_LAS('10:40'), tz: TZ, fuentes: f4 })).toBe('igual')
    // Si ni la lista de cuentas responde, las cuentas conocidas siguen con lo último bueno; Todoist sin red, igual.
    const f5 = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('11:00'), deps: simulados({ cuentas: { codigo: null, salida: '', agotado: true }, todoist: 'red' }).deps })
    expect(Object.values(f5.google).map(l => [l.fallo, l.leido, l.datos.length > 0])).toEqual([['tiempo agotado', A_LAS('10:00').toISOString(), true], ['tiempo agotado', A_LAS('10:00').toISOString(), true]])
    expect(f5.todoist?.fallo).toBe('no respondió')
    // Vuelve: al día otra vez y sin las líneas de falla.
    const f6 = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('11:20'), deps: simulados().deps })
    expect(escribirNow(raiz, { ahora: A_LAS('11:20'), tz: TZ, fuentes: f6 })).toBe('escrito')
    expect(readFileSync(ruta, 'utf8')).toContain('> Al día con Google Calendar (2 cuentas) y Todoist.\n\n## Hitos')
  })

  it('una cuenta conectada que nunca respondió lo dice, sin inventar eventos', async () => {
    const raiz = cerebro(CAL(TZ))
    const f = await sincronizarFuentes(raiz, HOY, { ahora: A_LAS('09:40'), deps: simulados({ cuenta: { 'ana.trabajo@ejemplo.com': { codigo: 1, salida: '', agotado: false } } }).deps })
    const t = generarNow(raiz, A_LAS('09:40'), TZ, f)
    expect(t).toContain('> Al día con Google Calendar (1 de 2 cuentas) y Todoist.')
    expect(t).toContain('> Google Calendar (ana.trabajo@ejemplo.com): no respondió; todavía sin una lectura buena.')
    expect(t).not.toContain('Demo con cliente')
  })

  it('el token de Todoist: variable, llavero de Mac, Secret Service de Linux o registro de Windows; nunca inventado', async () => {
    const pedidos: string[][] = []
    const responde = (salida: string, codigo = 0) => async (bin: string, args: string[]): Promise<Salida> => { pedidos.push([bin, ...args]); return { codigo, salida, agotado: false } }
    expect(await leerTokenTodoist(responde('no'), 'darwin', { TODOIST_API_TOKEN: ` ${TOKEN}\n` })).toBe(TOKEN)
    expect(pedidos).toHaveLength(0)
    expect(await leerTokenTodoist(responde(`${TOKEN}\n`), 'darwin', { USER: 'ana' })).toBe(TOKEN)
    expect(pedidos.pop()).toEqual(['/usr/bin/security', 'find-generic-password', '-a', 'ana', '-s', 'todoist-api-token', '-w'])
    expect(await leerTokenTodoist(responde('', 44), 'darwin', { USER: 'ana' })).toBeNull()
    expect(await leerTokenTodoist(responde(`${TOKEN}\n`), 'linux', {})).toBe(TOKEN)
    expect(pedidos.pop()).toEqual(['secret-tool', 'lookup', 'servicio', 'todoist'])
    expect(await leerTokenTodoist(responde('', 1), 'linux', {})).toBeNull()
    expect(await leerTokenTodoist(responde(`\r\nHKEY_CURRENT_USER\\Environment\r\n    TODOIST_API_TOKEN    REG_SZ    ${TOKEN}\r\n\r\n`), 'win32', {})).toBe(TOKEN)
    expect(pedidos.pop()).toEqual(['reg', 'query', 'HKCU\\Environment', '/v', 'TODOIST_API_TOKEN'])
    expect(await leerTokenTodoist(responde('ERROR: no se encontró', 1), 'win32', {})).toBeNull()
  })

  it('iniciarNowAlumno lee Google y Todoist en segundo plano y deja el archivo al día', async () => {
    const raiz = cerebro(CAL(TZ))
    const vistos: string[] = []
    const r = iniciarNowAlumno(raiz, { esperaFuentesMs: 60_000, deps: simulados().deps, registrar: (res, motivo) => vistos.push(`${motivo}:${res}`) })!
    expect(vistos).toEqual(['arranque:escrito'])
    expect(readFileSync(join(raiz, RUTA_NOW), 'utf8')).not.toContain('Todoist')
    const [a, b] = [r.refrescar(), r.refrescar()]
    expect(a).toBe(b)
    expect(await a).toBe('escrito')
    expect(readFileSync(join(raiz, RUTA_NOW), 'utf8')).toContain('Llamar a mamá · Todoist')
    expect(await r.refrescar()).toBe('igual')
    r.detener()
  })
})
