import { describe, it, expect } from 'vitest'
import { modeloInicial, siguiente, MODELO_OPUS, MODELO_SONNET, type Intento } from './cerebro.js'
import { sinPantalla } from './registro.js'

const it_ = (modelo: string, estado: Intento['estado'], detalle = ''): Intento => ({ modelo, estado, detalle, ms: 1 })

describe('cerebro: estándar de modelos', () => {
  it('Sonnet 5.5 por defecto', () => {
    expect(modeloInicial('abre YouTube, busca Prankedy y ponme el tercer video').modelo).toBe('claude-sonnet-5-5')
  })
  it('dinero o personas empiezan en Opus 5.5', () => {
    for (const p of ['mándale un WhatsApp a Tomás', 'paga la factura de luz', 'responde el correo de Leila'])
      expect(modeloInicial(p)).toMatchObject({ modelo: 'claude-opus-5-5', motivo: 'dinero o personas de por medio' })
  })
  it('escribir en un campo no es hablar con alguien (nodo C, 2 oct): Sonnet', () => {
    expect(modeloInicial('En sfmap escribe «Plan» en el buscador de la barra lateral.').modelo).toBe('claude-sonnet-5-5')
    expect(modeloInicial('escríbele a Lucía que llego tarde').modelo).toBe('claude-opus-5-5')
  })
  it('Sonnet que pide escalar pasa a Opus', () => {
    expect(siguiente([it_(MODELO_SONNET(), 'escala', 'ambiguo')])).toMatchObject({ modelo: MODELO_OPUS() })
  })
  it('Sonnet reintenta una vez y a la segunda falla escala', () => {
    expect(siguiente([it_(MODELO_SONNET(), 'fallo')])).toMatchObject({ modelo: MODELO_SONNET() })
    expect(siguiente([it_(MODELO_SONNET(), 'fallo'), it_(MODELO_SONNET(), 'fallo')])).toMatchObject({ modelo: MODELO_OPUS(), motivo: 'Sonnet falló 2 veces' })
  })
  it('hecho, confirmación pendiente u Opus agotado terminan', () => {
    expect(siguiente([it_(MODELO_SONNET(), 'hecho')])).toBeNull()
    expect(siguiente([it_(MODELO_SONNET(), 'requiere_confirmacion')])).toBeNull()
    expect(siguiente([it_(MODELO_OPUS(), 'fallo')])).toBeNull()
  })
})

describe('privacidad: la pantalla se queda con Anthropic', () => {
  it('a Jev (OpenRouter) no le llega el árbol ni capturas, solo la pregunta y las opciones', () => {
    const p = sinPantalla({ pregunta: '¿cuál?', opciones: { e1: 'botón «Enviar»' }, estado: { ventana: 'WhatsApp', arbol: '[e1] chat con Ana: «hola»', captura: '/tmp/x.png', meta: 'abrir panel' } })
    expect(p.estado).toEqual({ meta: 'abrir panel' })
    expect(JSON.stringify(p)).not.toMatch(/hola|x\.png/)
  })
})
