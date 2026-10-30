import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Adaptador, Decisor, Elemento, Observacion, PedidoActuar } from './contrato.js'
import { AlmacenRecetas, Grabadora, correrReceta, emparejar, grabarReceta, rutas } from './recetas.js'
import { ejecutarManos } from './herramientas.js'

/** App falsa: barra lateral con «Dock» que abre un panel con un interruptor. `idioma` cambia las etiquetas. */
class AppFalsa implements Adaptador {
  readonly nombre = 'falsa'
  idioma: 'es' | 'en' = 'es'
  panel = 'general'
  interruptor = 0
  enviado = false
  /** Si está activo, ⌘W en la ventana 11 abre una hoja «Guardar» en vez de cerrar. */
  hoja = false
  conHoja = false
  /** El panel del Dock tarda esto en aparecer tras el clic (ms), y observar se bloquea mientras carga si `bloquea`. */
  cargaPanel = 0
  bloquea = false
  private listoEn = 0
  ventanasAbiertas = [10]
  acciones: PedidoActuar[] = []
  private et(es: string, en: string) { return this.idioma === 'es' ? es : en }
  private arbol(ventana: number): Elemento[] {
    const els: Elemento[] = [
      { ref: 'e1', rol: 'AXWindow', etiqueta: this.panel, profundidad: 0 },
      { ref: 'e2', rol: 'AXOutline', etiqueta: 'Barra lateral', profundidad: 1 },
      { ref: 'e3', rol: 'AXButton', etiqueta: this.et('General', 'General'), profundidad: 2 },
      { ref: 'e4', rol: 'AXButton', etiqueta: this.et('Escritorio y Dock', 'Desktop & Dock'), profundidad: 2 },
      { ref: 'e5', rol: 'AXGroup', profundidad: 1 },
      { ref: 'e6', rol: 'AXButton', etiqueta: 'Enviar', profundidad: 2 },
      { ref: 'e10', rol: 'AXTextField', etiqueta: 'Buscar', profundidad: 1 },
    ]
    if (this.panel === 'dock' && Date.now() >= this.listoEn) els.push({ ref: 'e7', rol: 'AXCheckBox', etiqueta: this.et('Ocultar el Dock', 'Hide the Dock'), valor: String(this.interruptor), profundidad: 2 })
    if (ventana === 11) els.push({ ref: 'e9', rol: 'AXTextArea', profundidad: 1 })
    if (ventana === 11 && this.conHoja) els.push({ ref: 'e20', rol: 'AXSheet', profundidad: 1 }, { ref: 'e21', rol: 'AXButton', etiqueta: this.et('Eliminar', 'Delete'), profundidad: 2 }, { ref: 'e22', rol: 'AXButton', etiqueta: 'Cancelar', profundidad: 2 })
    return els
  }
  async observar(p: { pid?: number; ventana?: number }): Promise<Observacion> {
    if (this.bloquea && Date.now() < this.listoEn) await new Promise(r => setTimeout(r, this.listoEn - Date.now()))
    const ventana = p.ventana ?? this.ventanasAbiertas[this.ventanasAbiertas.length - 1]
    const elementos = this.arbol(ventana)
    return { app: 'Falsa', pid: 7, ventana, elementos, texto: elementos.map(e => `[${e.ref}] ${e.rol} «${e.etiqueta ?? ''}»`).join('\n'), total_elementos: elementos.length }
  }
  async actuar(p: PedidoActuar) {
    this.acciones.push(p)
    if (p.accion === 'tecla' && p.tecla === 'n') { this.ventanasAbiertas.push(11); return { ok: true, efecto: 'sin_verificar' as const } }
    if (p.accion === 'tecla' && p.tecla === 'w') { if (this.hoja) this.conHoja = true; else this.ventanasAbiertas = this.ventanasAbiertas.filter(v => v !== 11); return { ok: true, efecto: 'sin_verificar' as const } }
    if (p.ref === 'e21') { this.conHoja = false; this.ventanasAbiertas = this.ventanasAbiertas.filter(v => v !== 11); return { ok: true, efecto: 'sin_verificar' as const } }
    if (p.ref === 'e4') { this.panel = 'dock'; this.listoEn = Date.now() + this.cargaPanel }
    else if (p.ref === 'e10') { /* buscar: no cambia nada */ }
    else if (p.ref === 'e3') this.panel = 'general'
    else if (p.ref === 'e7') this.interruptor = 1 - this.interruptor
    else if (p.ref === 'e6') this.enviado = true
    else if (p.ref !== 'e9') return { ok: false, efecto: 'fallo' as const, detalle: 'ref desconocido' }
    return { ok: true, efecto: 'sin_verificar' as const }
  }
  async apps() { return [{ nombre: 'Falsa', bundle: 'com.falsa', pid: 7, activa: false }] }
  async abrir() { return { pid: 7, ventanas: [] } }
  async ventanas() { return this.ventanasAbiertas.map(id => ({ id, pid: 7, app: 'Falsa', marco: { x: 0, y: 0, w: 500, h: 400 }, en_pantalla: true })) }
  async verificar() { return { cumple: true, detalle: '' } }
  async cursor() { return { x: 0, y: 0 } }
  async salud() { return { ok: true, detalle: '' } }
  async cerrar() {}
}

/** Decisor que elige la opción cuya descripción contiene el texto pedido (o, por meta, el que toque); cuenta sus llamadas. */
function decisorQueElige(texto: RegExp | ((pregunta: string) => RegExp)): Decisor & { llamadas: number } {
  const d = {
    nombre: 'falso', llamadas: 0,
    async decidir(p: { pregunta: string; opciones: Record<string, string> }) {
      d.llamadas++
      const re = typeof texto === 'function' ? texto(p.pregunta) : texto
      const id = Object.entries(p.opciones).find(([, v]) => re.test(v))?.[0]
      if (!id) throw new Error('sin opción')
      return { eleccion: id, confianza: 0.9, decisor: 'falso', ms: 1, costo_usd: 0 }
    },
  }
  return d
}

let app: AppFalsa, g: Grabadora, almacen: AlmacenRecetas
beforeEach(() => { app = new AppFalsa(); g = new Grabadora(app); almacen = new AlmacenRecetas(mkdtempSync(join(tmpdir(), 'recetas-'))) })

/** Hace la tarea «a mano» (como el cerebro): observar, Dock, observar, interruptor. */
async function hacerTarea(): Promise<void> {
  let o = await g.observar({ pid: 7 })
  await g.actuar({ pid: 7, ventana: o.ventana, accion: 'click', ref: o.elementos.find(e => /Dock/.test(e.etiqueta ?? ''))!.ref })
  o = await g.observar({ pid: 7 })
  await g.actuar({ pid: 7, ventana: o.ventana, accion: 'click', ref: o.elementos.find(e => e.rol === 'AXCheckBox')!.ref })
}
const VERIF_INTERRUPTOR = [{ tipo: 'pantalla' as const, espera: [{ rol: 'AXCheckBox', valor: '{{meta}}' }] }]

describe('reconocer elementos sin ref ni coordenadas', () => {
  it('la ruta son los ancestros, con la ventana sin título', async () => {
    const o = await app.observar({})
    expect(rutas(o).get('e4')).toEqual(['AXWindow', 'AXOutline «Barra lateral»'])
  })
  it('empareja por rol y etiqueta, desempata por ruta y no adivina empates', async () => {
    const o = await app.observar({})
    expect(emparejar(o, { rol: 'AXButton', etiqueta: 'escritorio y dock', ruta: [] })).toMatchObject({ tipo: 'uno', elemento: { ref: 'e4' } })
    expect(emparejar(o, { rol: 'AXButton', etiqueta: 'Nada', ruta: [] }).tipo).toBe('ninguno')
    const gemelo = { ref: 'e8', rol: 'AXButton', etiqueta: 'General', profundidad: 2 }
    // Gemelo bajo la misma barra lateral: empate, no se adivina.
    const doble = { ...o, elementos: [...o.elementos.slice(0, 3), gemelo, ...o.elementos.slice(3)] }
    expect(emparejar(doble, { rol: 'AXButton', etiqueta: 'General', ruta: ['AXWindow', 'AXOutline «Barra lateral»'] }).tipo).toBe('ambiguo')
    // Gemelo bajo otro contenedor (AXGroup): la ruta desempata.
    const otraRuta = { ...o, elementos: [...o.elementos, gemelo] }
    expect(emparejar(otraRuta, { rol: 'AXButton', etiqueta: 'General', ruta: ['AXWindow', 'AXOutline «Barra lateral»'] })).toMatchObject({ tipo: 'uno', elemento: { ref: 'e3' } })
  })
})

describe('grabar', () => {
  it('convierte las acciones en pasos por rol, etiqueta y ruta, con parámetros y verificador', async () => {
    await hacerTarea()
    const { receta, ruta } = await grabarReceta(g, almacen, { nombre: 'dock', metas: ['abrir Dock', 'interruptor'], parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    expect(receta.app).toBe('com.falsa')
    expect(receta.pasos.map(p => [p.ventana, p.elemento?.etiqueta])).toEqual([['frente', 'Escritorio y Dock'], ['misma', 'Ocultar el Dock']])
    expect(JSON.stringify(receta.pasos)).not.toMatch(/"ref"|marco/)
    expect(receta.verificador[0]).toMatchObject({ espera: [{ valor: '{{meta}}' }] })
    expect(JSON.parse(readFileSync(ruta, 'utf8')).nombre).toBe('dock')
  })
  it('sin verificador final no hay receta, y el verificador debe cumplirse al grabar', async () => {
    await hacerTarea()
    await expect(grabarReceta(g, almacen, { nombre: 'x', verificador: [] })).rejects.toThrow(/verificador final/)
    await expect(grabarReceta(g, almacen, { nombre: 'x', verificador: [{ tipo: 'pantalla', espera: [{ rol: 'AXCheckBox', valor: '0' }] }] })).rejects.toThrow(/no se cumple/)
  })
  it('los verificadores por comando solo pueden leer', async () => {
    await hacerTarea()
    await expect(grabarReceta(g, almacen, { nombre: 'x', verificador: [{ tipo: 'comando', argv: ['defaults', 'write', 'a', 'b', '1'] }] })).rejects.toThrow(/no permitido/)
  })
  it('detecta la ventana nueva y marca como sensible lo que envía', async () => {
    let o = await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: 10, accion: 'tecla', tecla: 'n', modificadores: ['cmd'] })
    await g.ventanas({ pid: 7 })
    o = await g.observar({ pid: 7, ventana: 11 })
    await g.actuar({ pid: 7, ventana: 11, accion: 'escribir', ref: 'e9', texto: 'hola 42' })
    await g.actuar({ pid: 7, ventana: 11, accion: 'click', ref: 'e6' })
    const { receta } = await grabarReceta(g, almacen, { nombre: 'doc', parametros: { frase: 'hola 42' }, verificador: [{ tipo: 'pantalla', espera: [{ rol: 'AXTextArea' }] }] })
    expect(receta.pasos.map(p => p.ventana)).toEqual(['frente', 'nueva', 'misma'])
    expect(receta.pasos[1].texto).toBe('{{frase}}')
    expect(receta.pasos[2].sensible).toBe(true)
    expect(o.ventana).toBe(11)
  })
})

describe('correr', () => {
  it('repite sin decidir cuando la pantalla coincide', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    app.panel = 'general'; app.interruptor = 0; app.acciones = []
    const d = decisorQueElige(/./)
    const r = await correrReceta(app, () => d, almacen, 'dock', { parametros: { meta: '1' } })
    expect(r).toMatchObject({ ok: true, estado: 'hecho', reparada: false })
    expect(d.llamadas).toBe(0)
    // Asienta tras abrir el panel (el interruptor aún no se ve); el último paso no asienta: espera el verificador.
    expect(app.acciones.map(a => a.asentar)).toEqual([undefined, false])
    expect(almacen.leer('dock')!.corridas).toBe(1)
  })
  it('si la pantalla cambió, cede al decisor, repara y guarda la versión nueva solo si verifica', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', metas: ['abrir el panel del Dock', 'activar ocultar el Dock'], parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    app.panel = 'general'; app.interruptor = 0; app.idioma = 'en'
    const d = decisorQueElige(q => (/interruptor|activar/.test(q) ? /AXCheckBox/ : /Dock/))
    const r = await correrReceta(app, () => d, almacen, 'dock', { parametros: { meta: '1' }, espera_elemento_ms: 50 })
    expect(r).toMatchObject({ ok: true, reparada: true, version: 2 })
    expect(d.llamadas).toBe(2)
    const rep = almacen.leer('dock')!
    expect(rep.pasos[0].elemento!.etiqueta).toBe('Desktop & Dock')
    expect(rep.pasos[0].alternativas![0].etiqueta).toBe('Escritorio y Dock')
    // De vuelta en español corre por la alternativa, sin decidir.
    app.panel = 'general'; app.interruptor = 0; app.idioma = 'es'
    const d2 = decisorQueElige(/./)
    expect(await correrReceta(app, () => d2, almacen, 'dock', { parametros: { meta: '1' }, espera_elemento_ms: 50 })).toMatchObject({ ok: true, reparada: false })
    expect(d2.llamadas).toBe(0)
  })
  it('un panel que tarda en cargar no se confunde con una pantalla distinta', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    app.panel = 'general'; app.interruptor = 0; app.cargaPanel = 1500; app.bloquea = true
    const d = decisorQueElige(/./)
    const r = await correrReceta(app, () => d, almacen, 'dock', { parametros: { meta: '1' } })
    expect(r).toMatchObject({ ok: true, reparada: false })
    expect(d.llamadas).toBe(0)
  })
  it('si el decisor repara mal mientras carga, el paso final lo delata y la reparación se revierte', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    app.panel = 'general'; app.interruptor = 0; app.cargaPanel = 150
    // Mientras el panel no está, el decisor elige «Buscar»; al final, con el panel cargado, el interruptor.
    const d = decisorQueElige(q => (/aún no se cumple/.test(q) ? /AXCheckBox/ : /Buscar/))
    const r = await correrReceta(app, () => d, almacen, 'dock', { parametros: { meta: '1' }, quieto_ms: 50, espera_verificador_ms: 300 })
    expect(r).toMatchObject({ ok: true, reparada: false })
    expect(r.pasos.at(-1)!.detalle).toMatch(/revierte/)
    const guardada = almacen.leer('dock')!
    expect(guardada.version).toBe(1)
    expect(guardada.pasos.map(p => p.elemento!.rol)).toEqual(['AXButton', 'AXCheckBox'])
    expect(guardada.corridas).toBe(1)
  })
  it('una reparación que no pasa el verificador no se guarda y cuenta como falla', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    app.panel = 'general'; app.interruptor = 0; app.idioma = 'en'
    const r = await correrReceta(app, () => decisorQueElige(/General/), almacen, 'dock', { parametros: { meta: '1' }, espera_elemento_ms: 50, espera_verificador_ms: 50 })
    expect(r.ok).toBe(false)
    const guardada = almacen.leer('dock')!
    expect(guardada.version).toBe(1)
    expect(guardada.pasos[0].elemento!.etiqueta).toBe('Escritorio y Dock')
    expect(guardada.fallos).toBe(1)
  })
  it('omitir_si_valor deja el interruptor en un estado en vez de alternarlo', async () => {
    await hacerTarea()
    await grabarReceta(g, almacen, { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR })
    const rec = almacen.leer('dock')!; rec.pasos[1].omitir_si_valor = '{{meta}}'; almacen.guardar(rec)
    app.panel = 'general' // el interruptor ya está en 1
    const r = await correrReceta(app, () => decisorQueElige(/./), almacen, 'dock', { parametros: { meta: '1' } })
    expect(r.ok).toBe(true)
    expect(r.pasos[1].estado).toBe('omitido')
    expect(app.interruptor).toBe(1)
  })
  it('un paso que envía nunca corre solo: pide confirmación sin tocar nada', async () => {
    let o = await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: o.ventana, accion: 'click', ref: 'e6' })
    app.enviado = false
    // Verificador trivial que se cumple: la barra lateral existe.
    await grabarReceta(g, almacen, { nombre: 'enviar', verificador: [{ tipo: 'pantalla', espera: [{ etiqueta_contiene: 'Barra lateral' }] }] })
    app.acciones = []
    const r = await correrReceta(app, () => decisorQueElige(/./), almacen, 'enviar')
    expect(r).toMatchObject({ ok: false, estado: 'requiere_confirmacion', paso_sensible: { paso: 0 } })
    expect(app.acciones).toHaveLength(0)
    expect(app.enviado).toBe(false)
    expect(await correrReceta(app, () => decisorQueElige(/./), almacen, 'enviar', { confirmar: [0] })).toMatchObject({ ok: true })
    expect(app.enviado).toBe(true)
    o = await app.observar({})
  })
  it('la ventana nueva se espera y se usa, y el texto lleva el parámetro', async () => {
    await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: 10, accion: 'tecla', tecla: 'n', modificadores: ['cmd'] })
    await g.observar({ pid: 7, ventana: 11 })
    await g.actuar({ pid: 7, ventana: 11, accion: 'escribir', ref: 'e9', texto: 'frase A' })
    await grabarReceta(g, almacen, { nombre: 'doc', parametros: { frase: 'frase A' }, verificador: [{ tipo: 'pantalla', espera: [{ rol: 'AXTextArea' }] }] })
    app.ventanasAbiertas = [10]; app.acciones = []
    const r = await correrReceta(app, () => decisorQueElige(/./), almacen, 'doc', { parametros: { frase: 'frase B' } })
    expect(r.ok).toBe(true)
    expect(app.acciones[1]).toMatchObject({ ventana: 11, ref: 'e9', texto: 'frase B' })
  })
})

describe('ramas que la app no siempre muestra', () => {
  /** Documento nuevo, escribir, ⌘W: la primera vez sin hoja. */
  async function grabarDoc(): Promise<void> {
    await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: 10, accion: 'tecla', tecla: 'n', modificadores: ['cmd'] })
    await g.observar({ pid: 7, ventana: 11 })
    await g.actuar({ pid: 7, ventana: 11, accion: 'escribir', ref: 'e9', texto: 'frase A' })
    await g.actuar({ pid: 7, ventana: 11, accion: 'tecla', tecla: 'w', modificadores: ['cmd'], ref: 'e9' })
    await grabarReceta(g, almacen, { nombre: 'doc', metas: ['nuevo', 'escribir', 'cerrar sin guardar'], parametros: { frase: 'frase A' }, verificador: [{ tipo: 'ventana_cerrada' }] })
  }
  const opciones = { parametros: { frase: 'B' }, espera_verificador_ms: 50, espera_elemento_ms: 100 }

  it('si sale un diálogo nuevo, el decisor propone el paso que falta; si borra, pide confirmación antes', async () => {
    await grabarDoc()
    app.ventanasAbiertas = [10]; app.hoja = true
    const d = decisorQueElige(/Eliminar/)
    const sin = await correrReceta(app, () => d, almacen, 'doc', opciones)
    expect(sin).toMatchObject({ ok: false, estado: 'requiere_confirmacion', paso_sensible: { paso: 3, etiqueta: 'Eliminar' } })
    expect(app.conHoja).toBe(true)
    // Daniel confirma: se cierra y la receta aprende el paso, opcional y sensible.
    app.conHoja = false; app.ventanasAbiertas = [10]
    const con = await correrReceta(app, () => d, almacen, 'doc', { ...opciones, confirmar: [3] })
    expect(con).toMatchObject({ ok: true, reparada: true, version: 2 })
    const r = almacen.leer('doc')!
    expect(r.pasos[3]).toMatchObject({ opcional: true, sensible: true, elemento: { rol: 'AXButton', etiqueta: 'Eliminar' } })
  })
  it('el paso opcional se salta si el diálogo no sale y corre por receta si sale', async () => {
    await grabarDoc()
    app.ventanasAbiertas = [10]; app.hoja = true
    await correrReceta(app, () => decisorQueElige(/Eliminar/), almacen, 'doc', { ...opciones, confirmar: [3] })
    const d = decisorQueElige(/./)
    app.ventanasAbiertas = [10]; app.hoja = false
    const sinHoja = await correrReceta(app, () => d, almacen, 'doc', { ...opciones, confirmar: [3] })
    expect(sinHoja.ok).toBe(true)
    expect(sinHoja.pasos[3]).toMatchObject({ estado: 'omitido', detalle: 'la tarea ya se cumplía' })
    app.ventanasAbiertas = [10]; app.hoja = true; app.conHoja = false
    const conHoja = await correrReceta(app, () => d, almacen, 'doc', { ...opciones, confirmar: [3] })
    expect(conHoja).toMatchObject({ ok: true, reparada: false })
    expect(conHoja.pasos[3].estado).toBe('receta')
    expect(d.llamadas).toBe(0)
    // En inglés el diálogo dice «Delete»: el paso opcional se repara (sensible, ya confirmado) en vez de saltarse.
    app.ventanasAbiertas = [10]; app.hoja = true; app.conHoja = false; app.idioma = 'en'
    const ingles = await correrReceta(app, () => decisorQueElige(/Delete/), almacen, 'doc', { ...opciones, confirmar: [3], quieto_ms: 50 })
    expect(ingles).toMatchObject({ ok: true, reparada: true })
    expect(almacen.leer('doc')!.pasos[3]).toMatchObject({ elemento: { etiqueta: 'Delete' }, alternativas: [{ etiqueta: 'Eliminar' }], opcional: true, sensible: true })
    app.idioma = 'es'
    // Sin la confirmación, no empieza.
    expect((await correrReceta(app, () => d, almacen, 'doc', opciones)).estado).toBe('requiere_confirmacion')
  })
})

describe('herramientas MCP de recetas', () => {
  it('grabar, listar y correr por el mismo contrato que usa la IA', async () => {
    await hacerTarea()
    const gr = await ejecutarManos('grabar_receta', { nombre: 'dock', parametros: { meta: '1' }, verificador: VERIF_INTERRUPTOR }, g, () => decisorQueElige(/./), almacen)
    expect(gr.error).toBeUndefined()
    const l = JSON.parse((await ejecutarManos('listar_recetas', {}, g, () => decisorQueElige(/./), almacen)).text)
    expect(l.recetas[0]).toMatchObject({ nombre: 'dock', pasos: 2, parametros: ['meta'] })
    app.panel = 'general'; app.interruptor = 0
    const c = JSON.parse((await ejecutarManos('correr_receta', { nombre: 'dock', parametros: { meta: '1' } }, g, () => decisorQueElige(/./), almacen)).text)
    expect(c).toMatchObject({ ok: true, estado: 'hecho' })
  })
  it('grabar sin Grabadora es un error de herramienta', async () => {
    const r = await ejecutarManos('grabar_receta', { nombre: 'x', verificador: VERIF_INTERRUPTOR }, app, () => decisorQueElige(/./), almacen)
    expect(r.error).toBe(true)
  })
})
