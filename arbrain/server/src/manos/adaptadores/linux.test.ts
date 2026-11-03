import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AdaptadorLinux, pantallaVirtualInstalada, RUTA_AYUDANTE } from './linux.js'
import { juzgar, frenar, Freno } from '../freno.js'
import { componerManos, crearAdaptador } from '../registro.js'
import { navegar } from '../navegador.js'
import { computerUseDisponible } from '../politica.js'
import { juzgarAbrir, juzgarCliente } from '../freno-cliente.js'
import { atenderPantalla, type DepsVista } from '../pantalla-vista.js'
import type { ContextoAccion } from '../contrato.js'
import { rutaSoloApp } from '../../cliente/cofre.js'

/**
 * Pantalla virtual del modo servidor (1 nov 2026). Aquí, sin Linux: el protocolo con un ayudante falso, el freno con el
 * contexto que arma el ayudante real para el formulario de httpbin, la disponibilidad por marcador y la vista privada.
 * La prueba con la pantalla de verdad (Xvfb + Chrome + AT-SPI) es `linux-e2e.ts`, que corre en el servidor.
 */
const dir = mkdtempSync(join(tmpdir(), 'manos-linux-'))
const bitacora = join(dir, 'pedidos.jsonl')
const falso = join(dir, 'manos-linux-falso.mjs')
// Respuestas con la forma exacta del ayudante real (manos_linux.py) en el formulario https://httpbin.org/forms/post.
writeFileSync(falso, `#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
const rl = createInterface({ input: process.stdin })
const W = { id: 6291458, pid: 52204, app: 'Google Chrome', titulo: 'httpbin.org/forms/post - Google Chrome', marco: { x: 0, y: 0, w: 1439, h: 899 }, en_pantalla: true, z: 0 }
rl.on('line', l => {
  const p = JSON.parse(l)
  appendFileSync(${JSON.stringify(bitacora)}, l + '\\n')
  const r = (() => {
    switch (p.op) {
      case 'apps': return [{ nombre: 'Google Chrome', bundle: 'chrome', pid: 52204, activa: true }]
      case 'ventanas': return [W]
      case 'abrir_url': return { pid: 52204, ventanas: [W] }
      case 'pagina': return { ventana: W.id, titulo_pagina: 'httpbin.org/forms/post', url: 'https://httpbin.org/forms/post' }
      case 'observar': return { app: 'Google Chrome', bundle: 'chrome', pid: 52204, ventana: W.id, titulo: W.titulo, url: 'https://httpbin.org/forms/post', total_elementos: 2, cambios: '',
        texto: '[e27] AXTextField «Customer name:»\\n[e73] AXButton «Submit order»',
        elementos: [{ ref: 'e27', rol: 'AXTextField', etiqueta: 'Customer name:', profundidad: 0 }, { ref: 'e73', rol: 'AXButton', etiqueta: 'Submit order', acciones: ['click'], profundidad: 0 }] }
      case 'contexto': return p.ref === 'e73'
        ? { bundle: 'chrome', app: 'Google Chrome', plataforma: 'linux', ventana: { titulo: W.titulo }, elemento: { rol: 'AXButton', titulo: 'Submit order', acciones: ['click'] }, ancestros: ['AXStaticText', 'AXGroup «formulario»', 'AXWebArea'], dentro_de: ['web'], url: 'https://httpbin.org/forms/post' }
        : { bundle: 'chrome', app: 'Google Chrome', plataforma: 'linux', ventana: { titulo: W.titulo }, elemento: { rol: 'AXTextField', titulo: p.ref === 'e35' ? 'E-mail address:' : 'Customer name:' }, ancestros: ['AXStaticText', 'AXGroup «formulario»', 'AXWebArea'], dentro_de: ['web'], url: 'https://httpbin.org/forms/post' }
      case 'actuar': return p.ref === 'e404' ? null : { ok: true, efecto: 'confirmado', detalle: 'teclas por X con el campo enfocado' }
      case 'salud': return { ok: true, version: '0.1.0', pantalla: ':99', geometria: '1440x900x24', encendida: false, navegador: '/usr/bin/google-chrome-stable', atspi: 'AT-SPI 2', marcador: '/etc/arbrain/pantalla-virtual.json', faltan: [] }
      case 'cursor': return { x: 720, y: 450 }
      default: return {}
    }
  })()
  process.stdout.write(JSON.stringify(r === null ? { id: p.id, ok: false, error: 'Ref e404 desconocido o vencido para esa ventana: vuelve a observar.' } : { id: p.id, ok: true, r, ms: 1 }) + '\\n')
})
`)
chmodSync(falso, 0o755)
const pedidos = () => readFileSync(bitacora, 'utf8').trim().split('\n').map(l => JSON.parse(l))

/** El freno de la cadena completa, donde esté (main metió CapaApps entre la grabadora y el freno, 1 nov). */
const frenoDe = (a: unknown): Freno => {
  let x: any = a
  for (let i = 0; x && i < 8; i++, x = x.interno) if (x instanceof Freno) return x
  throw new Error('la cadena de manos no trae freno')
}

describe('adaptador linux (protocolo, con un ayudante falso)', () => {
  const lx = new AdaptadorLinux({ comando: [process.execPath, falso] })
  afterAll(() => lx.cerrar())

  it('traduce observar al contrato con la URL de la página', async () => {
    const o = await lx.observar({ app: 'chrome', consulta: 'Customer' })
    expect(o.elementos[0]).toMatchObject({ ref: 'e27', rol: 'AXTextField', etiqueta: 'Customer name:' })
    expect(o).toMatchObject({ ventana: 6291458, url: 'https://httpbin.org/forms/post' })
    expect(pedidos().at(-1)).toMatchObject({ op: 'observar', app: 'chrome', consulta: 'Customer' })
  })

  it('actuar nunca lanza; ni la cita del freno ni los permisos del cursor viajan al ayudante', async () => {
    expect(await lx.actuar({ ventana: 6291458, accion: 'escribir', ref: 'e27', texto: 'Fulano', confirmacion: 'llena mi nombre', via: 'hid', permiso_hid: 'inactivo' })).toMatchObject({ ok: true, efecto: 'confirmado' })
    const ultimo = pedidos().at(-1)
    expect(ultimo.confirmacion).toBeUndefined(); expect(ultimo.via).toBeUndefined(); expect(ultimo.permiso_hid).toBeUndefined()
    const mal = await lx.actuar({ ventana: 6291458, accion: 'click', ref: 'e404' })
    expect(mal).toMatchObject({ ok: false, efecto: 'fallo' })
    expect(mal.detalle).toMatch(/vuelve a observar/)
  })

  it('salud dice qué hay debajo (pantalla, AT-SPI y navegador)', async () => {
    const s = await lx.salud()
    expect(s.ok).toBe(true)
    expect(s.detalle).toMatch(/AT-SPI 2 · pantalla :99 1440x900x24 apagada/)
  })

  it('navegar usa la ventana nueva que abre el ayudante, la adopta y espera la página', async () => {
    const manos = componerManos(lx)
    const freno = frenoDe(manos)
    const r = await navegar(freno, { url: 'httpbin.org/forms/post' })
    expect(r).toMatchObject({ ok: true, pid: 52204, ventana: 6291458, url: 'https://httpbin.org/forms/post' })
    expect(freno.propias.has(6291458)).toBe(true)
    expect(pedidos().some(p => p.op === 'abrir_url' && p.url === 'https://httpbin.org/forms/post')).toBe(true)
  })

  it('el freno en la cadena completa: «Submit order» sin cita queda bloqueado sin llegar al ayudante', async () => {
    const manos = componerManos(lx)
    const freno = frenoDe(manos)
    freno.adoptar(6291458)
    const antes = pedidos().filter(p => p.op === 'actuar').length
    const r = await manos.actuar({ ventana: 6291458, pid: 52204, accion: 'click', ref: 'e73' })
    expect(r).toMatchObject({ ok: false, efecto: 'bloqueado', freno: { categoria: 'enviar', paso: false } })
    expect(pedidos().filter(p => p.op === 'actuar').length).toBe(antes)
  })
})

describe('freno con el contexto de la pantalla virtual (plataforma linux)', () => {
  const L = (x: ContextoAccion): ContextoAccion => ({ plataforma: 'linux', bundle: 'chrome', app: 'Google Chrome', ...x })
  const web = { dentro_de: ['web'], url: 'https://httpbin.org/forms/post' }
  const p = { pid: 1, ventana: 7 }
  const propias = new Set([7])
  it('«Submit order» de un formulario web es enviar; con la cita de la persona pasa', () => {
    const c = L({ ...web, elemento: { rol: 'AXButton', titulo: 'Submit order' } })
    expect(frenar({ ...p, accion: 'click', ref: 'e73' }, c, { propias, modo: 'original' })).toMatchObject({ pasa: false, freno: { categoria: 'enviar' } })
    expect(frenar({ ...p, accion: 'click', ref: 'e73', confirmacion: 'envía el pedido de la pizza' }, c, { propias, modo: 'original' })).toMatchObject({ pasa: true })
  })
  it('correo y teléfono escritos en un formulario web son datos que se transmiten', () => {
    const c = L({ ...web, elemento: { rol: 'AXTextField', titulo: 'E-mail address:' } })
    expect(juzgar({ ...p, accion: 'escribir', ref: 'e35', texto: 'prueba@ejemplo.com' }, c, propias).categoria).toBe('transmitir_datos')
    expect(juzgar({ ...p, accion: 'escribir', ref: 'e31', texto: '443 123 4567' }, c, propias).categoria).toBe('transmitir_datos')
    expect(juzgar({ ...p, accion: 'escribir', ref: 'e27', texto: 'Fulano Prueba' }, L({ ...web, elemento: { rol: 'AXTextField', titulo: 'Customer name:' } }), propias).irreversible).toBe(false)
  })
  it('Ctrl es la tecla de comando: Ctrl+W en una ventana que no abrieron las manos frena; Ctrl+Q sale; Alt+F4 cierra', () => {
    expect(juzgar({ pid: 1, ventana: 9, accion: 'tecla', tecla: 'w', modificadores: ['ctrl'] }, L({}), propias).categoria).toBe('pestana_de_daniel')
    expect(juzgar({ ...p, accion: 'tecla', tecla: 'w', modificadores: ['ctrl'] }, L({}), propias).irreversible).toBe(false)
    expect(juzgar({ ...p, accion: 'tecla', tecla: 'q', modificadores: ['ctrl'] }, L({}), propias).categoria).toBe('salir')
    expect(juzgar({ ...p, accion: 'tecla', tecla: 'h', modificadores: ['ctrl'] }, L({}), propias).irreversible).toBe(false)
  })
  it('edición cliente: el correo en «E-mail address:» (contexto real del ayudante) no es la barra de direcciones', () => {
    // QA en la demo (1 nov 2026): «fulano@example.com» se bloqueaba dos veces como barra_de_direcciones y el correo
    // quedaba vacío. Con el contexto que arma manos_linux.py (dentro de AXWebArea) es un dato que se transmite.
    const c = L({ ...web, elemento: { rol: 'AXTextField', titulo: 'E-mail address:' }, ancestros: ['AXStaticText', 'AXGroup «formulario»', 'AXWebArea'] })
    const correo = { ...p, accion: 'escribir' as const, ref: 'e21', texto: 'fulano@example.com' }
    expect(juzgarCliente(correo, c, true)?.categoria).not.toBe('barra_de_direcciones')
    expect(frenar(correo, c, { propias, cliente: juzgarCliente(correo, c, true), modo: 'autonomo' })).not.toMatchObject({ freno: { categoria: 'barra_de_direcciones' } })
    expect(juzgarCliente({ ...p, accion: 'escribir', ref: 'e1', texto: 'evil.test' }, L({ elemento: { rol: 'AXTextField', titulo: 'Address and search bar' }, dentro_de: [] }), true)).toMatchObject({ duro: true, categoria: 'barra_de_direcciones' })
  })
  it('Enter en un campo de la página envía el formulario', () => {
    expect(juzgar({ ...p, accion: 'tecla', tecla: 'return', ref: 'e27' }, L({ ...web, elemento: { rol: 'AXTextField', titulo: 'Customer name:' } }), propias).categoria).toBe('enviar')
  })
  it('edición cliente: en la pantalla virtual solo se abre Chrome; terminales nunca', () => {
    expect(juzgarAbrir('google chrome', 'linux', true)).toEqual({ ok: true })
    expect(juzgarAbrir('chrome', 'linux', true)).toEqual({ ok: true })
    expect(juzgarAbrir('xterm', 'linux', true)).toMatchObject({ ok: false })
    expect(juzgarAbrir('gnome-terminal', 'linux', true)).toMatchObject({ ok: false })
    expect(juzgarAbrir('nautilus', 'linux', true)).toMatchObject({ ok: false })
  })
})

describe('disponibilidad: Linux solo con la pantalla virtual instalada (marcador de root)', () => {
  const previo = { e: process.env.ARBRAIN_EDICION, m: process.env.ARBRAIN_PANTALLA_MARCADOR, p: process.env.ARBRAIN_PLATAFORMA_PRUEBA, a: process.env.MANOS_ADAPTADOR }
  afterEach(() => {
    for (const [k, v] of [['ARBRAIN_EDICION', previo.e], ['ARBRAIN_PANTALLA_MARCADOR', previo.m], ['ARBRAIN_PLATAFORMA_PRUEBA', previo.p], ['MANOS_ADAPTADOR', previo.a]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  })
  it('cliente en Linux: sin marcador no; con marcador sí; en macOS y Windows como siempre', () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const m = join(dir, 'pantalla-virtual.json')
    process.env.ARBRAIN_PANTALLA_MARCADOR = join(dir, 'no-existe.json')
    expect(pantallaVirtualInstalada('linux')).toBe(false)
    expect(computerUseDisponible('linux')).toBe(false)
    writeFileSync(m, '{"pantalla_virtual":1}\n')
    process.env.ARBRAIN_PANTALLA_MARCADOR = m
    expect(pantallaVirtualInstalada('linux')).toBe(true)
    expect(computerUseDisponible('linux')).toBe(true)
    expect(pantallaVirtualInstalada('darwin')).toBe(false)
    expect(computerUseDisponible('darwin')).toBe(true)
    expect(computerUseDisponible('freebsd')).toBe(false)
  })
  it('MANOS_ADAPTADOR=linux crea el adaptador de la pantalla virtual con su ayudante en manos-linux/', () => {
    expect(crearAdaptador('linux').nombre).toBe('linux')
    expect(RUTA_AYUDANTE()).toMatch(/manos-linux\/manos_linux\.py$/)
  })
})

describe('vista privada de la pantalla (daemon): solo mirar', () => {
  const deps = (o: Partial<DepsVista> & { respuesta?: any } = {}): DepsVista & { ops: string[] } => {
    const ops: string[] = []
    return { ops, instalada: o.instalada ?? (() => true), llamar: o.llamar ?? (async (op: string) => { ops.push(op); return o.respuesta ?? {} }) }
  }
  it('solo la app: el pase de los agentes no abre /pantalla/* (no puede mirar la pantalla por esta vía)', () => {
    expect(rutaSoloApp('GET', '/pantalla/captura')).toBe(true)
    expect(rutaSoloApp('GET', '/pantalla/estado')).toBe(true)
  })
  it('sin pantalla virtual: 404 y no le pregunta nada al ayudante', async () => {
    const d = deps({ instalada: () => false })
    expect(await atenderPantalla('GET', '/pantalla/captura', d)).toMatchObject({ status: 404 })
    expect(d.ops).toEqual([])
  })
  it('solo GET: mandar algo a la pantalla no existe', async () => {
    expect(await atenderPantalla('POST', '/pantalla/captura', deps())).toMatchObject({ status: 405 })
    expect(await atenderPantalla('GET', '/pantalla/clic', deps())).toBeNull()
  })
  it('apagada: 204, sin encenderla', async () => {
    const d = deps({ respuesta: { apagada: true } })
    expect(await atenderPantalla('GET', '/pantalla/captura', d)).toEqual({ status: 204 })
    expect(d.ops).toEqual(['captura_jpeg'])
  })
  it('encendida: JPEG; calidad y ancho acotados', async () => {
    const vistos: any[] = []
    const d = deps({ llamar: async (op, args) => { vistos.push({ op, ...args }); return { apagada: false, jpeg: Buffer.from('jpeg').toString('base64'), ancho: 1080, alto: 675 } } })
    const r = await atenderPantalla('GET', '/pantalla/captura?calidad=999&ancho=10', d) as any
    expect(r.status).toBe(200)
    expect(r.jpeg.toString()).toBe('jpeg')
    expect(vistos[0]).toMatchObject({ op: 'captura_jpeg', calidad: 85, ancho_max: 320 })
  })
})

describe('ayudante real (manos_linux.py): el bus de accesibilidad, sin activar otro por D-Bus', () => {
  // QA en la demo (1 nov 2026): la espera de «listo» (GetAddress a org.a11y.Bus) activaba un segundo at-spi-bus-launcher
  // por D-Bus; el nuestro perdía el nombre y moría, el pidfile quedaba en un muerto y cada ayudante nuevo lanzaba otro.
  const py = (caso: string) => {
    const estado = mkdtempSync(join(tmpdir(), 'manos-linux-estado-'))
    const codigo = `
import sys, json
sys.path.insert(0, ${JSON.stringify(join(__dirname, '..', '..', '..', 'manos-linux'))})
import manos_linux as m
lanzados, esperas, duenos = [], [], ${caso === 'adopta' ? '[1561]' : caso === 'lanza' ? '[0, 0, 777, 777]' : '[]'}
m.vivo = lambda n, p: ${caso === 'vivo' ? '4242' : '0'}
m.dueno_a11y = lambda env: duenos.pop(0) if duenos else 777
def lanzar(n, argv, env):
    lanzados.append(argv[0]); m.anotar(n, 555, argv[0]); return 555
m.lanzar = lanzar
def esperar(que, listo, tope=10.0):
    esperas.append(que)
    while not listo(): pass
m.esperar = esperar
m.subprocess.run = lambda *a, **k: None
nuevo = m.asegurar_atspi({})
try: pid = open(m.pidfile('atspi')).read().split()[0]
except OSError: pid = None
print(json.dumps({'nuevo': nuevo, 'lanzados': lanzados, 'esperas': esperas, 'pidfile': pid}))
`
    const r = spawnSync('python3', ['-c', codigo], { encoding: 'utf8', env: { ...process.env, MANOS_LINUX_ESTADO: estado, PYTHONDONTWRITEBYTECODE: '1' } })
    expect(r.stderr).toBe('')
    return JSON.parse(r.stdout)
  }
  it('si ya hay un bus de accesibilidad (lo arrancó D-Bus u otro ayudante), lo adopta: no lanza otro y el pidfile lo nombra', () => {
    expect(py('adopta')).toEqual({ nuevo: false, lanzados: [], esperas: [], pidfile: '1561' })
  })
  it('si no hay, lanza uno, espera a que tenga dueño y el pidfile nombra al dueño real del bus (no el pid que lanzó)', () => {
    expect(py('lanza')).toEqual({ nuevo: true, lanzados: ['/usr/libexec/at-spi-bus-launcher'], esperas: ['El bus de accesibilidad (AT-SPI)'], pidfile: '777' })
  })
  it('si el del pidfile vive, no toca nada', () => {
    expect(py('vivo')).toEqual({ nuevo: false, lanzados: [], esperas: [], pidfile: null })
  })
  it('la espera ya no llama a org.a11y.Bus (eso lo activa): pregunta por su dueño a org.freedesktop.DBus', () => {
    const fuente = readFileSync(join(__dirname, '..', '..', '..', 'manos-linux', 'manos_linux.py'), 'utf8')
    const funcion = fuente.slice(fuente.indexOf('def dueno_a11y('), fuente.indexOf('def anotar('))
    expect(funcion).toMatch(/GetConnectionUnixProcessID', 'string:org\.a11y\.Bus'/)
    expect(funcion).not.toMatch(/--dest=org\.a11y\.Bus/)
    expect(fuente).not.toMatch(/a11y_lista/)
  })
})
