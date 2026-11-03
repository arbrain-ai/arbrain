import { describe, expect, it } from 'vitest'
import { categoriaDe } from './confirmacion-humana.js'

// Categoría de la tarjeta I8 que ve la persona («Levy quiere enviar / pagar / borrar / publicar…»).
describe('categoriaDe: lo que la tarjeta le dice a la persona', () => {
  it('escribir su correo o su teléfono en un campo no es «enviar» (QA del modo servidor, 1 nov 2026)', () => {
    expect(categoriaDe('transmitir_datos', 'escribir correo electrónico en un formulario web en un formulario lo transmite')).toBe('otra')
    expect(categoriaDe('transmitir_datos', 'escribir teléfono en un formulario web en un formulario lo transmite')).toBe('otra')
  })
  it('un dato de pago sigue siendo pagar; enviar, borrar y publicar siguen igual', () => {
    expect(categoriaDe('transmitir_datos', 'escribir número de tarjeta en un formulario web')).toBe('pagar')
    expect(categoriaDe('enviar', 'button «Submit order»')).toBe('enviar')
    expect(categoriaDe('enviar_chat', 'Enter en el chat de WhatsApp manda el mensaje')).toBe('enviar')
    expect(categoriaDe('borrar', 'mover a la papelera')).toBe('borrar')
    expect(categoriaDe('publicar', 'publicar el post')).toBe('publicar')
  })
})
