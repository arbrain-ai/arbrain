/**
 * Scroll medido por accesibilidad (apps Catalyst y listas sin barra AX). Ver scroll-medido.ts.
 */
import { describe, expect, it } from 'vitest'
import { medir, posiciones, ruedaMedida, scrollEnActuar, zonaEn, type Lectura, type Llamador } from './scroll-medido.js'

const WIN = { x: 486, y: 165, w: 1200, h: 800 }
const HILO = { x: 1092, y: 165, w: 594, h: 800 }
const mensajes = (desde: number, ys: number[]) => ys.map((y, i) => ({ ref: `e${100 + desde + i}`, rol: 'AXStaticText', etiqueta: `mensaje ${desde + i}`, marco: { x: 1108, y, w: 300, h: 33 } }))
const lectura = (ys: number[], desde = 0, extra: Lectura['elementos'] = []): Lectura => ({
  pid: 1, ventana: 4242, win: WIN,
  elementos: [
    { ref: 'e1', rol: 'AXWindow', etiqueta: 'Chat', marco: WIN },
    { ref: 'e29', rol: 'AXGroup', etiqueta: 'Lista de conversaciones', marco: { x: 486, y: 165, w: 605, h: 800 } },
    { ref: 'e55', rol: 'AXGroup', etiqueta: 'Mensajes', marco: HILO },
    ...mensajes(desde, ys), ...extra,
  ],
})

/**
 * App Catalyst de mentira: la rueda por proceso no hace nada; la de la ventana mueve 2 pt por px (como WhatsApp para
 * Mac) y recicla las celdas (6 refs para 30 mensajes).
 */
function appCatalyst(op: { nativoMueve?: boolean; tope?: number; alReves?: boolean; pierde?: number } = {}) {
  let desplazado = 0, perdidas = 0
  const llamadas: string[] = []
  const c: Llamador = {
    async llamar(nombre, a: any = {}) {
      llamadas.push(nombre)
      if (nombre === 'observar') {
        // 30 mensajes cada 60 pt; se ven los que caen en la ventana.
        const ys = Array.from({ length: 30 }, (_, i) => 200 + i * 60 - 1200 + desplazado)
        const r = lectura([])
        r.elementos.push(...ys.map((y, i) => ({ ref: `m${i % 6}`, rol: 'AXStaticText', etiqueta: `msg ${i}`, marco: { x: 1108, y, w: 300, h: 33 } })).filter(e => e.marco.y > 165 && e.marco.y < 965))
        return r
      }
      if (nombre === 'actuar') { if (op.nativoMueve) desplazado += 90; return { ok: true, efecto: 'sin_verificar', detalle: 'rueda por proceso' } }
      if (nombre === 'rueda') {
        if (perdidas < (op.pierde ?? 0)) { perdidas++; return { via: 'fondo', cursor_movido_por: 'nadie' } }
        desplazado += (op.alReves ? -2 : 2) * a.dy
        if (op.tope != null) desplazado = Math.min(op.tope, desplazado)
        return { via: 'fondo', cursor_movido_por: 'nadie', cursor_real_movido: false }
      }
      throw new Error(`op inesperada ${nombre}`)
    },
  }
  return { c, llamadas, desplazado: () => desplazado }
}
const nativo = (c: Llamador) => () => c.llamar('actuar', {})

describe('medir el desplazamiento por accesibilidad', () => {
  it('la mediana de lo que se movió (lo fijo no cuenta)', () => {
    expect(medir(new Map([['a', 100], ['b', 200], ['c', 300], ['fijo', 50]]), new Map([['a', 340], ['b', 440], ['c', 540], ['fijo', 50]]))).toBe(240)
  })
  it('nada se movió → null', () => {
    expect(medir(new Map([['a', 100], ['b', 200]]), new Map([['a', 100], ['b', 200]]))).toBeNull()
  })
  it('lo visible se reemplazó entero → NaN (salto largo)', () => {
    expect(medir(new Map([['a', 100], ['b', 200]]), new Map([['x', 100], ['y', 200], ['z', 300]]))).toBeNaN()
  })
  it('las posiciones van por texto: una celda reciclada (mismo ref, otro contenido) no engaña', () => {
    // Mismos refs y mismas y, pero otros mensajes: por ref parecería quieto; por texto, se reemplazó lo visible.
    const l0 = lectura([300, 400, 500], 0), l1 = lectura([300, 400, 500], 7)
    l1.elementos.forEach((e, i) => { if (e.etiqueta?.startsWith('mensaje')) e.ref = l0.elementos[i].ref })
    expect(medir(posiciones(l0, HILO), posiciones(l1, HILO))).toBeNaN()
  })
  it('textos repetidos en la zona no cuentan', () => {
    const l = lectura([300, 400], 0, [{ ref: 'r1', rol: 'AXStaticText', etiqueta: 'Hoy', marco: { x: 1300, y: 500, w: 40, h: 20 } }, { ref: 'r2', rol: 'AXStaticText', etiqueta: 'Hoy', marco: { x: 1300, y: 600, w: 40, h: 20 } }])
    expect([...posiciones(l, HILO).keys()].some(k => k.includes('Hoy'))).toBe(false)
  })
  it('la zona es el contenedor más chico bajo el punto, no la lista de al lado ni la ventana', () => {
    expect(zonaEn(lectura([300]), { x: 1389, y: 565 })?.ref).toBe('e55')
    expect(zonaEn(lectura([300]), { x: 700, y: 565 })?.ref).toBe('e29')
  })
})

describe('actuar scroll en una app que ignora la rueda por proceso (Catalyst)', () => {
  it('sube con la rueda a la ventana y lo confirma', async () => {
    const w = appCatalyst()
    const r = await scrollEnActuar(w.c, { app: 'com.ejemplo.catalyst' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba', cantidad: 3 } as any, nativo(w.c))
    expect(r).toMatchObject({ ok: true, efecto: 'confirmado' })
    expect(r!.detalle).toMatch(/240 pt hacia arriba/)
    expect(w.desplazado()).toBe(240)
    expect(w.llamadas.filter(l => l === 'actuar')).toHaveLength(1) // primero el camino de siempre, una vez
  })
  it('baja con signo contrario', async () => {
    const w = appCatalyst()
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'abajo', cantidad: 3 } as any, nativo(w.c))
    expect(r?.efecto).toBe('confirmado')
    expect(r!.detalle).toMatch(/hacia abajo/)
    expect(w.desplazado()).toBe(-240)
  })
  it('un viaje largo va por tramos medidos (nunca un salto mayor que media ventana)', async () => {
    const w = appCatalyst()
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba', cantidad: 20 } as any, nativo(w.c))
    expect(r?.efecto).toBe('confirmado')
    expect(w.desplazado()).toBe(1600)
    expect(w.llamadas.filter(l => l === 'rueda').length).toBeGreaterThan(3)
  })
  it('si el primer tramo se pierde (pasó dos veces seguidas en vivo), se reenvía y sube', async () => {
    const w = appCatalyst({ pierde: 2 })
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba', cantidad: 3 } as any, nativo(w.c))
    expect(r?.efecto).toBe('confirmado')
    expect(w.desplazado()).toBe(240)
  })
  it('si el camino de siempre ya movió, no se agrega rueda', async () => {
    const w = appCatalyst({ nativoMueve: true })
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba' } as any, nativo(w.c))
    expect(r?.efecto).toBe('confirmado')
    expect(w.llamadas).not.toContain('rueda')
  })
  it('si la barra AX ya lo confirmó, no se mide ni se agrega nada', async () => {
    const w = appCatalyst()
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba' } as any, async () => ({ ok: true, efecto: 'confirmado', detalle: 'barra 0.50 → 0.26' }))
    expect(r).toEqual({ ok: true, efecto: 'confirmado', detalle: 'barra 0.50 → 0.26' })
    expect(w.llamadas).not.toContain('rueda')
  })
  it('al principio de la lista dice fallo con el motivo (no «sin_verificar»)', async () => {
    const w = appCatalyst({ tope: 0 })
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba' } as any, nativo(w.c))
    expect(r).toMatchObject({ ok: false, efecto: 'fallo' })
    expect(r!.detalle).toMatch(/al principio/)
  })
  it('al revés de lo pedido: fallo', async () => {
    const w = appCatalyst({ alReves: true })
    const r = await scrollEnActuar(w.c, { app: 'x' }, { accion: 'scroll', ref: 'e55', direccion: 'arriba' } as any, nativo(w.c))
    expect(r).toMatchObject({ ok: false, efecto: 'fallo' })
  })
  it('no aplica (null, el camino de siempre): hid, horizontal, otra acción, navegador o nada medible', async () => {
    const w = appCatalyst()
    expect(await scrollEnActuar(w.c, {}, { accion: 'scroll', direccion: 'arriba', via: 'hid' } as any, nativo(w.c))).toBeNull()
    expect(await scrollEnActuar(w.c, {}, { accion: 'scroll', direccion: 'izquierda' } as any, nativo(w.c))).toBeNull()
    expect(await scrollEnActuar(w.c, {}, { accion: 'click', ref: 'e1' } as any, nativo(w.c))).toBeNull()
    const nav: Llamador = { llamar: async () => ({ ...lectura([300, 400]), url: 'https://ejemplo.com' }) }
    expect(await scrollEnActuar(nav, {}, { accion: 'scroll', direccion: 'arriba' } as any, nativo(nav))).toBeNull()
    const vacio: Llamador = { llamar: async () => lectura([]) }
    expect(await scrollEnActuar(vacio, {}, { accion: 'scroll', direccion: 'arriba' } as any, nativo(vacio))).toBeNull()
    expect(w.llamadas).not.toContain('rueda')
    expect(w.llamadas).not.toContain('actuar')
  })
})

describe('herramienta rueda fuera de navegadores', () => {
  it('confirma con la medida por accesibilidad y conserva el estado del cursor', async () => {
    const w = appCatalyst()
    const r = await ruedaMedida(w.c, { app: 'x', x: 903, y: 400, dy: 300 })
    expect(r).toMatchObject({ desplazado: true, efecto: 'confirmado', cursor_movido_por: 'nadie', cursor_real_movido: false })
    expect(w.desplazado()).toBe(600)
  })
  it('zoom, sin verificar, en líneas, hid o sin mover: null (la cascada de siempre)', async () => {
    const w = appCatalyst({ tope: 0 })
    expect(await ruedaMedida(w.c, { app: 'x', dy: 300, modificadores: ['cmd'] })).toBeNull()
    expect(await ruedaMedida(w.c, { app: 'x', dy: 300, verificar: false })).toBeNull()
    expect(await ruedaMedida(w.c, { app: 'x', dy: 300, lineas: true })).toBeNull()
    expect(await ruedaMedida(w.c, { app: 'x', dy: 300, via: 'hid' })).toBeNull()
    expect(await ruedaMedida(w.c, { app: 'x', dy: 300 })).toBeNull()
  })
})
