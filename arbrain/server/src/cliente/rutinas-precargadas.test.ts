/**
 * Rutinas precargadas «De Arbrain» (1 nov 2026): el catálogo, la siembra idempotente sobre la base real (SQLite en una
 * carpeta temporal) y sus avisos al terminar. Ninguna notificación real sale de aquí: el aviso nativo es una función falsa.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const store = mkdtempSync(join(tmpdir(), 'arbrain-precargadas-'))
const previo = { store: process.env.CLAUDECLAW_STORE_DIR }
process.env.CLAUDECLAW_STORE_DIR = store

type P = typeof import('./rutinas-precargadas.js')
type R = typeof import('./rutinas.js')
type T = typeof import('./avisos-telefono.js')
type Db = typeof import('../db.js')
let p: P, r: R, tel: T, db: Db

beforeAll(async () => {
  db = await import('../db.js')
  p = await import('./rutinas-precargadas.js')
  r = await import('./rutinas.js')
  tel = await import('./avisos-telefono.js')
  db.initDatabase()
})
afterAll(() => {
  if (previo.store === undefined) delete process.env.CLAUDECLAW_STORE_DIR; else process.env.CLAUDECLAW_STORE_DIR = previo.store
  rmSync(store, { recursive: true, force: true })
})
beforeEach(() => {
  db.getDb().prepare('DELETE FROM scheduled_tasks').run()
  db.getDb().exec('DROP TABLE IF EXISTS rutinas_sembradas')
})
afterEach(() => tel._reiniciarParaPruebas())

const ids = () => db.listTasks().map(t => t.id).sort()

describe('catálogo', () => {
  it('trae diario (mañana y cierre), semanal (domingo) y mensual (día 1), más 3 a 5 de valor', () => {
    const porId = new Map(p.CATALOGO.map(x => [x.id, x]))
    expect(porId.get('arbrain-reporte-manana')?.schedule).toBe('0 7 * * 1-5')
    expect(porId.get('arbrain-cierre-dia')?.schedule).toBe('0 19 * * 1-5')
    expect(porId.get('arbrain-revision-semanal')?.schedule).toBe('0 18 * * 0')
    expect(porId.get('arbrain-reporte-mensual')?.schedule).toBe('0 8 1 * *')
    expect(p.CATALOGO.length - 4).toBeGreaterThanOrEqual(3)
    expect(p.CATALOGO.length - 4).toBeLessThanOrEqual(5)
  })

  it('cada una pasa las mismas reglas que una rutina creada a mano y su id es único y de Arbrain', () => {
    expect(new Set(p.CATALOGO.map(x => x.id)).size).toBe(p.CATALOGO.length)
    for (const x of p.CATALOGO) {
      expect(x.id.startsWith(p.PREFIJO_PRECARGADA), x.id).toBe(true)
      expect(r.validarPrompt(x.prompt).ok, `${x.id}: ${x.prompt.length} caracteres`).toBe(true)
      expect(r.validarHorario(x.schedule).ok, x.id).toBe(true)
      expect(x.desde).toBeLessThanOrEqual(p.VERSION_CATALOGO)
      // La primera línea es su nombre: es el título del aviso en el teléfono.
      expect(tel.nombreRutina(x.prompt)).toBe(x.nombre)
    }
  })

  it('cada texto es autosuficiente: lee su contexto, deja el reporte en .claude/reportes/ y nunca envía', () => {
    for (const x of p.CATALOGO) {
      expect(x.prompt, x.id).toMatch(/\.claude\/memory\/RETRATO\.md/)
      // El archivo NO va en el texto guardado: lo pone el daemon en cada corrida («Esta corrida»).
      expect(x.prompt, x.id).toMatch(/archivo exacto que te da «Esta corrida»/)
      expect(x.prompt, x.id).not.toMatch(/AAAA|\{dia\}|\{mes\}/)
      expect(x.archivo, x.id).toMatch(/^\.claude\/reportes\/[a-z]+\/\{(dia|mes)\}(-[a-z]+)?\.md$/)
      expect(x.prompt, x.id).toMatch(/No envíes mensajes/)
      expect(x.prompt, x.id).not.toMatch(/lo de arriba|como te dije|https?:\/\//i)
    }
    for (const id of ['arbrain-reporte-manana', 'arbrain-cierre-dia', 'arbrain-revision-semanal', 'arbrain-reporte-mensual']) {
      const t = p.precargada(id)!.prompt
      for (const f of ['.claude/now.md', '.claude/plan/objetivos.md', '.claude/memory/project/meta-90-dias.md']) expect(t, `${id} lee ${f}`).toContain(f)
    }
  })
})

describe('siembra', () => {
  it('al arrancar aparecen todas en pausa, con su próxima corrida, y ninguna queda vencida', () => {
    const s = p.sembrarPrecargadas()
    expect(s.sembradas.sort()).toEqual(p.CATALOGO.map(x => x.id).sort())
    for (const t of db.listTasks()) {
      expect(t.status).toBe('paused')
      expect(t.next_run).toBeGreaterThan(Date.now() / 1000)
      expect(t.prompt).toBe(p.precargada(t.id)!.prompt)
    }
    expect(db.getDueTasks()).toHaveLength(0)
  })

  it('es idempotente: arrancar otra vez no duplica ni cambia nada', () => {
    p.sembrarPrecargadas()
    const antes = db.listTasks()
    const s = p.sembrarPrecargadas()
    expect(s.sembradas).toEqual([])
    expect(s.yaSembradas.length).toBe(p.CATALOGO.length)
    expect(db.listTasks()).toEqual(antes)
  })

  it('una que el dueño borró nunca se recrea', () => {
    p.sembrarPrecargadas()
    r.atenderRutinas('DELETE', '/schedule/arbrain-ideas-contenido', {}, { conPase: false, aviso: () => null })
    p.sembrarPrecargadas()
    p.sembrarPrecargadas()
    expect(ids()).not.toContain('arbrain-ideas-contenido')
    expect(ids().length).toBe(p.CATALOGO.length - 1)
  })

  it('una que el dueño editó, activó o ya corrió no se pisa', () => {
    p.sembrarPrecargadas()
    const d = db.getDb()
    d.prepare('UPDATE scheduled_tasks SET prompt = ?, schedule = ? WHERE id = ?').run('Mi versión del reporte', '30 6 * * *', 'arbrain-reporte-manana')
    r.atenderRutinas('POST', '/schedule/arbrain-cierre-dia/resume', {}, { conPase: false, aviso: () => null })
    db.updateTaskAfterRun('arbrain-reporte-mensual', 'Mi reporte', 123)
    const antes = db.listTasks()
    p.sembrarPrecargadas()
    expect(db.listTasks()).toEqual(antes)
    expect(db.getTask('arbrain-reporte-manana')).toMatchObject({ prompt: 'Mi versión del reporte', schedule: '30 6 * * *' })
    expect(db.getTask('arbrain-cierre-dia')?.status).toBe('active')
  })

  it('una versión nueva del catálogo solo agrega: lo borrado sigue borrado y lo editado, editado', () => {
    p.sembrarPrecargadas()
    db.deleteTask('arbrain-ideas-contenido')
    db.getDb().prepare('UPDATE scheduled_tasks SET prompt = ? WHERE id = ?').run('Editada', 'arbrain-cierre-dia')
    const nueva = { id: 'arbrain-prueba-v2', desde: 2, nombre: 'Prueba v2', paraQue: 'p', archivo: '.claude/reportes/prueba/{dia}.md', schedule: '0 9 * * 3', prompt: 'Prueba v2\n\nTexto de prueba.' }
    // La v2 también «cambia» el texto de una vieja: no llega a quien ya la tiene.
    const v2 = [...p.CATALOGO.map(x => x.id === 'arbrain-reporte-manana' ? { ...x, prompt: 'Texto nuevo v2' } : x), nueva]
    const s = p.sembrarPrecargadas(v2)
    expect(s.sembradas).toEqual(['arbrain-prueba-v2'])
    expect(db.getTask('arbrain-prueba-v2')?.status).toBe('paused')
    expect(db.getTask('arbrain-ideas-contenido')).toBeUndefined()
    expect(db.getTask('arbrain-cierre-dia')?.prompt).toBe('Editada')
    expect(db.getTask('arbrain-reporte-manana')?.prompt).toBe(p.precargada('arbrain-reporte-manana')!.prompt)
    const v = db.getDb().prepare('SELECT version FROM rutinas_sembradas WHERE id = ?').get('arbrain-prueba-v2') as { version: number }
    expect(v.version).toBe(2)
  })

  it('si el dueño ya tenía una rutina con ese id, la respeta y solo la anota', () => {
    db.createTask({ id: 'arbrain-reporte-manana', chat_id: 'c', thread_id: null, prompt: 'Suya', schedule: '0 6 * * *', next_run: 1, status: 'active', created_at: 1 })
    const s = p.sembrarPrecargadas()
    expect(s.sembradas).not.toContain('arbrain-reporte-manana')
    expect(db.getTask('arbrain-reporte-manana')).toMatchObject({ prompt: 'Suya', status: 'active' })
  })
})

describe('Taller › Rutinas', () => {
  const app = { conPase: false, aviso: () => null, suscripcion: () => false }

  it('la lista trae el para qué de cada precargada presente, y si el motor es la suscripción', () => {
    p.sembrarPrecargadas()
    db.deleteTask('arbrain-ideas-contenido')
    const res = r.atenderRutinas('GET', '/schedule', {}, app)!
    const meta = res.cuerpo.precargadas as Record<string, { nombre: string; paraQue: string; carpeta: string }>
    expect(Object.keys(meta).sort()).toEqual(p.CATALOGO.map(x => x.id).filter(i => i !== 'arbrain-ideas-contenido').sort())
    expect(meta['arbrain-reporte-manana']).toEqual({ nombre: 'Reporte de la mañana', paraQue: p.precargada('arbrain-reporte-manana')!.paraQue, carpeta: '.claude/reportes/diario/', reporte: null })
    expect(res.cuerpo.suscripcion).toBe(false)
    expect(r.atenderRutinas('GET', '/schedule', {}, { ...app, suscripcion: () => true })!.cuerpo.suscripcion).toBe(true)
  })

  it('Activar es un clic (resume) y deja su próxima corrida', () => {
    p.sembrarPrecargadas()
    const res = r.atenderRutinas('POST', '/schedule/arbrain-reporte-mensual/resume', {}, app)!
    expect(res.status).toBe(200)
    expect(db.getTask('arbrain-reporte-mensual')?.status).toBe('active')
  })

  it('las precargadas no le quitan lugar al tope de rutinas del dueño', () => {
    p.sembrarPrecargadas()
    for (let i = 0; i < r.MAX_RUTINAS - 1; i++) db.createTask({ id: `rutina-t-${i}`, chat_id: 'c', thread_id: null, prompt: 'p', schedule: '0 7 * * *', next_run: 1, status: 'paused', created_at: 1 })
    expect(r.atenderRutinas('POST', '/schedule', { prompt: 'la que falta', schedule: '0 8 * * *' }, app)!.status).toBe(201)
    expect(r.atenderRutinas('POST', '/schedule', { prompt: 'una de más', schedule: '0 8 * * *' }, app)!.status).toBe(409)
  })
})

describe('avisos al terminar', () => {
  const fin = { id: 'arbrain-reporte-manana', prompt: p0(), ok: true, texto: 'Hoy: 2 reuniones y tu objetivo es cerrar la propuesta.\nLo vencido: 1.', corrida: 1_000 }
  function p0() { return 'Reporte de la mañana\n\nEl día del dueño en una página.' }
  const falso = () => { const llamadas: [string, string, string][] = []; return { llamadas, avisar: ((k: string, t: string, b: string) => { llamadas.push([k, t, b]); return 'enviado' }) as never } }

  it('una precargada que corrió sola avisa en la computadora con su nombre y lo primero del reporte', () => {
    const f = falso()
    expect(p.avisarFinPrecargada(fin, { avisar: f.avisar, pausado: () => false })).toBe('enviado')
    expect(f.llamadas).toEqual([['rutina-arbrain-reporte-manana-1000', 'Tu rutina terminó: Reporte de la mañana', 'Hoy: 2 reuniones y tu objetivo es cerrar la propuesta. Lo vencido: 1.']])
  })

  it('si falló, lo dice y lleva a Taller › Rutinas', () => {
    const f = falso()
    p.avisarFinPrecargada({ ...fin, ok: false, texto: undefined, error: 'Error: sin saldo en tu llave' }, { avisar: f.avisar, pausado: () => false })
    expect(f.llamadas[0][1]).toBe('Tu rutina no terminó: Reporte de la mañana')
    expect(f.llamadas[0][2]).toMatch(/sin saldo en tu llave\. Ábrela en Taller › Rutinas/)
  })

  it('no avisa al probarla, con «Pausar todo», si respondió «Sin novedad» ni para rutinas que no son de Arbrain', () => {
    const f = falso()
    const op = { avisar: f.avisar, pausado: () => false }
    expect(p.avisarFinPrecargada({ ...fin, manual: true }, op)).toBe('omitido')
    expect(p.avisarFinPrecargada(fin, { ...op, pausado: () => true })).toBe('omitido')
    expect(p.avisarFinPrecargada({ ...fin, texto: 'Sin novedad' }, op)).toBe('omitido')
    expect(p.avisarFinPrecargada({ ...fin, texto: ' sin novedad. ' }, op)).toBe('omitido')
    expect(p.avisarFinPrecargada({ ...fin, id: 'rutina-mia-1' }, op)).toBe('omitido')
    expect(f.llamadas).toHaveLength(0)
  })

  it('el teléfono recibe la misma rutina y tampoco suena con «Sin novedad»', async () => {
    const cuerpos: Record<string, unknown>[] = []
    const fetchFalso = (async (_u: string, init: RequestInit) => { cuerpos.push(JSON.parse(String(init.body))); return { ok: true, body: null } }) as unknown as typeof fetch
    tel.registrarDestinoAvisos({ url: 'http://127.0.0.1:1', token: 't'.repeat(40), fetch: fetchFalso })
    expect(await tel.avisarFinRutina({ ...fin, texto: 'Sin novedad' })).toBe('omitido')
    expect(await tel.avisarFinRutina(fin)).toBe('enviado')
    expect(cuerpos).toHaveLength(1)
    expect(cuerpos[0]).toMatchObject({ title: 'Tu rutina terminó: Reporte de la mañana', url: tel.URL_RUTINAS, kind: 'rutina' })
  })
})

describe('cableado', () => {
  it('el scheduler del alumno siembra al arrancar y avisa al terminar en los dos caminos (bien y con error)', async () => {
    const { readFileSync } = await import('node:fs')
    const s = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const cliente = s.slice(s.indexOf('export function initSchedulerCliente'), s.indexOf('let relojNow'))
    expect(cliente).toMatch(/sembrarPrecargadas\(\)/)
    expect(s.match(/avisarFinPrecargada\(/g)?.length).toBe(2)
    // La corrida lleva el bloque con fecha y archivo, y lo que vuelve sale sin rutas.
    expect(s).toMatch(/promptDeCorrida\(task\.id, task\.prompt\)/)
    expect(s).toMatch(/text = pulirResultado\(task\.id, text\)/)
  })
})

describe('respuesta final', () => {
  it('pide dos líneas sin Markdown ni rutas (Arbrain ya dice dónde quedó el reporte)', () => {
    for (const x of p.CATALOGO) expect(x.prompt, x.id).toMatch(/dos líneas, lo más importante primero, sin Markdown, sin rutas ni nombres de archivos/)
  })

  it('el reporte de la mañana es de hoy: si no hay nada, una línea y lo próximo con su fecha', () => {
    const t = p.precargada('arbrain-reporte-manana')!.prompt
    expect(t).toMatch(/Si hoy no hay nada, dilo en una línea/)
    expect(t).toMatch(/lo próximo con su día y hora/)
    expect(t).toMatch(/no la deduzcas de los archivos ni comentes si alguno trae otra/)
  })

  it('pulirResultado quita las frases con rutas (el caso de la captura) y deja lo demás', () => {
    const malo = 'Lo más importante hoy: a las 9:00 sal de la llamada con Ferretería López con fecha de diagnóstico, y manda ya la cotización a Clínica Santa Fe, que venció el viernes.\nHoy es domingo 1 de noviembre, pero tu agenda está fechada el lunes 2; tu reporte completo quedó en .claude/reportes/diario/2026-11-01-manana.md.'
    const bien = p.pulirResultado('arbrain-reporte-manana', malo)
    expect(bien).toBe('Lo más importante hoy: a las 9:00 sal de la llamada con Ferretería López con fecha de diagnóstico, y manda ya la cotización a Clínica Santa Fe, que venció el viernes.')
    for (const ruta of ['Lo dejé en reportes/diario/2026-11-01-manana.md.', 'Quedó en /Users/usuario/Arbrain/.claude/reportes/x.md.', 'Ver 2026-11-01-cierre.md.', 'Está en C:\\Users\\usuario\\x.md.', 'Tu carpeta .claude ya lo tiene.'])
      expect(p.pulirResultado('arbrain-cierre-dia', `Cerraste 2/3 tareas, y/o moviste una. ${ruta}`), ruta).toBe('Cerraste 2/3 tareas, y/o moviste una.')
    expect(p.pulirResultado('arbrain-cierre-dia', 'Tu reporte quedó en .claude/reportes/diario/x.md')).toBe('Tu reporte está listo.')
    expect(p.pulirResultado('arbrain-cierre-dia', 'Sin novedad')).toBe('Sin novedad')
    expect(p.pulirResultado('rutina-mia-1', 'quedó en .claude/x.md')).toBe('quedó en .claude/x.md')
  })
})

describe('ruta del reporte: la fija el código', () => {
  const tz = 'America/Mexico_City'
  // Domingo 1 nov 2026, 07:00 en México = 13:00 UTC.
  const domingo = Date.UTC(2026, 10, 1, 13, 0)

  it('carpeta correcta, fecha de la zona del dueño y nunca «.claude» pegado al nombre', async () => {
    // La misma regla que deja escribir a una rutina sin clic (politica-agentes.ts): el archivo cae dentro de ella.
    const { generadoPorRutina } = await import('./politica-agentes.js')
    const home = '/tmp/cerebro-de-prueba'
    const esperadas: Record<string, string> = {
      'arbrain-reporte-manana': '.claude/reportes/diario/2026-11-01-manana.md',
      'arbrain-cierre-dia': '.claude/reportes/diario/2026-11-01-cierre.md',
      'arbrain-revision-semanal': '.claude/reportes/semanal/2026-11-01.md',
      'arbrain-reporte-mensual': '.claude/reportes/mensual/2026-11.md',
      'arbrain-prepara-reuniones': '.claude/reportes/reuniones/2026-11-01.md',
      'arbrain-seguimiento-clientes': '.claude/reportes/seguimiento/2026-11-01.md',
      'arbrain-ideas-contenido': '.claude/reportes/contenido/2026-11-01.md',
    }
    for (const x of p.CATALOGO) {
      const r = p.rutaReporte(x, domingo, tz)
      expect(r, x.id).toBe(esperadas[x.id])
      expect(r, x.id).not.toMatch(/\.claude\d|\.claude[^/]/)
      expect(r.startsWith(p.carpetaDe(x)), x.id).toBe(true)
      expect(generadoPorRutina(`${home}/${r}`, home), x.id).toBe(true)
    }
    // 23:30 del domingo en México ya es lunes en UTC: manda la zona del dueño.
    expect(p.rutaReporte(p.precargada('arbrain-reporte-manana')!, Date.UTC(2026, 10, 2, 5, 30), tz)).toBe('.claude/reportes/diario/2026-11-01-manana.md')
  })

  it('el bloque «Esta corrida» dice el día de la semana y el archivo exacto', () => {
    const b = p.bloqueCorrida(p.precargada('arbrain-reporte-manana')!, domingo, tz)
    expect(b).toContain('Hoy es domingo 1 de noviembre de 2026, 07:00 (America/Mexico_City)')
    expect(b).toContain('Escribe el reporte en: .claude/reportes/diario/2026-11-01-manana.md')
  })

  it('promptDeCorrida agrega el bloque y anota el archivo; la pestaña lo muestra solo si existe', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    p.sembrarPrecargadas()
    const raiz = mkdtempSync(join(tmpdir(), 'arbrain-cerebro-'))
    const texto = p.promptDeCorrida('arbrain-reporte-manana', 'Reporte de la mañana\n\ntexto', domingo, tz)
    expect(texto.endsWith('Escribe el reporte en: .claude/reportes/diario/2026-11-01-manana.md')).toBe(true)
    expect(p.promptDeCorrida('rutina-mia-1', 'mi texto', domingo, tz)).toBe('mi texto')
    expect(p.metaPrecargadas(['arbrain-reporte-manana'], p.CATALOGO, raiz)['arbrain-reporte-manana'].reporte).toBeNull()
    mkdirSync(join(raiz, '.claude/reportes/diario'), { recursive: true })
    writeFileSync(join(raiz, '.claude/reportes/diario/2026-11-01-manana.md'), '# x')
    expect(p.metaPrecargadas(['arbrain-reporte-manana'], p.CATALOGO, raiz)['arbrain-reporte-manana'].reporte).toBe('.claude/reportes/diario/2026-11-01-manana.md')
    rmSync(raiz, { recursive: true, force: true })
  })
})
