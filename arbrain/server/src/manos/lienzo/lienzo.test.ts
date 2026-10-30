import { describe, expect, it } from 'vitest'
import { MANOS_LIENZO_TOOLS, NOMBRES_LIENZO, ejecutarLienzo } from './herramientas-lienzo.js'
import type { ClienteCasa } from '../adaptadores/casa.js'

/** Cliente falso: anota lo que se le pidió y contesta lo que la app diría. */
function falso(debajo: Record<string, string> = {}) {
  const llamadas: { op: string; args: any }[] = []
  const c = {
    async llamar(op: string, args: any) {
      llamadas.push({ op, args })
      if (op === 'clic_xy' && args.solo_mirar) return { debajo }
      if (op === 'clic_xy') return { eventos_ax: 3, cursor_real_movido: false }
      if (op === 'trazo') return { trazos: 1, eventos: 40, ms: 500, via: 'fondo', via_activada: true, cursor_real_movido: false, efecto: 'sin_verificar' }
      if (op === 'pegar') return { pegado: { detalle: 'menú «Pegar» por AX' }, restaurado: { restaurado: true } }
      return {}
    },
  }
  return { cliente: () => c as unknown as ClienteCasa, llamadas, actos: () => llamadas.filter(l => !(l.op === 'clic_xy' && l.args.solo_mirar)) }
}

describe('herramientas de lienzo', () => {
  it('publica nueve herramientas con esquema', () => {
    expect([...NOMBRES_LIENZO].sort()).toEqual(['clic_xy', 'grabar', 'ojos', 'pasar_encima', 'pegar', 'portapapeles', 'rueda', 'seleccion', 'trazar'])
    for (const t of MANOS_LIENZO_TOOLS) expect(t.inputSchema.type).toBe('object')
  })

  it('clic_xy sobre «Eliminar» lo detiene el freno y no toca nada', async () => {
    const f = falso({ rol: 'AXButton', titulo: 'Eliminar' })
    const r = await ejecutarLienzo('clic_xy', { app: 'com.apple.finder', x: 10, y: 10 }, f.cliente)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/FRENO/)
    expect(f.actos()).toHaveLength(0)
  })

  it('con la cita de Daniel el mismo clic pasa', async () => {
    const f = falso({ rol: 'AXButton', titulo: 'Eliminar' })
    const r = await ejecutarLienzo('clic_xy', { app: 'com.apple.finder', x: 10, y: 10, confirmacion: 'borra la página de pruebas' }, f.cliente)
    expect(r.error).toBeFalsy()
    expect(f.actos()).toHaveLength(1)
    expect(f.actos()[0].args.confirmacion).toBeUndefined()   // la cita no viaja a la app
  })

  it('un clic en una vista sin accesibilidad (lienzo) pasa sin freno', async () => {
    const f = falso({})
    const r = await ejecutarLienzo('clic_xy', { app: 'com.saasfactory.sfmap', x: 800, y: 400, veces: 2 }, f.cliente)
    expect(r.error).toBeFalsy()
    expect(r.text).toMatch(/×2/)
  })

  it('arrastrar a la papelera es borrar: freno', async () => {
    const f = falso({ rol: 'AXDockItem', titulo: 'Papelera' })
    const r = await ejecutarLienzo('trazar', { app: 'com.apple.finder', puntos: [[100, 100], [900, 900]] }, f.cliente)
    expect(r.error).toBe(true)
    expect(f.actos()).toHaveLength(0)
  })

  it('un trazo de lápiz con muchos puntos no consulta destino y dibuja', async () => {
    const f = falso({})
    const puntos = Array.from({ length: 30 }, (_, i) => [100 + i * 5, 200 + (i % 3)])
    const r = await ejecutarLienzo('trazar', { app: 'com.saasfactory.sfmap', puntos }, f.cliente)
    expect(r.error).toBeFalsy()
    expect(f.llamadas.map(l => l.op)).toEqual(['trazo'])
    expect(r.text).toMatch(/cursor real quieto/)
  })

  it('via=hid (mueve el cursor de Daniel) exige su cita explícita o su inactividad', async () => {
    const f = falso({})
    const r = await ejecutarLienzo('trazar', { app: 'com.apple.finder', via: 'hid', puntos: [[1, 1], [2, 2]] }, f.cliente)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/cursor_de_daniel/)
    // Solo se preguntó la inactividad: ningún gesto llegó a ArbrainManos.
    expect(f.llamadas.map(l => l.op)).toEqual(['inactividad'])
  })

  it('pegar avisa si el portapapeles de Daniel volvió', async () => {
    const f = falso({})
    const r = await ejecutarLienzo('pegar', { app: 'com.apple.TextEdit', texto: 'hola' }, f.cliente)
    expect(r.text).toMatch(/restaurado/)
  })
})
