// El motivo del freno en la tarjeta de la persona, en su idioma (13 nov 2026). El juicio no cambia: solo lo que lee ella.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fijarIdiomaPrueba } from '../i18n/tr.js'
import { motivoParaPersona, resumenTarjetaManos } from './motivo-persona.js'

// El catálogo real más los fragmentos que aún no se fusionan (trabajo en curso de «Arbrain en inglés»).
vi.mock('../i18n/en.json', async (original) => {
  const real = (await original() as { default: Record<string, string> }).default
  const dir = join(import.meta.dirname, '../../../src/shared/i18n/fragmentos')
  const extra = existsSync(dir) ? Object.assign({}, ...readdirSync(dir).filter(n => n.endsWith('.json')).map(n => JSON.parse(readFileSync(join(dir, n), 'utf8')) as Record<string, string>)) : {}
  return { default: { ...extra, ...real } }
})

afterEach(() => fijarIdiomaPrueba(null))

describe('motivo de la tarjeta de manos', () => {
  it('en español sale idéntico (la tarjeta de siempre)', () => {
    fijarIdiomaPrueba('es')
    const m = 'escribir correo electrónico en un formulario web en un formulario lo transmite'
    expect(motivoParaPersona(m)).toBe(m)
    expect(resumenTarjetaManos('Enter sobre «Enviar»', { regla: 'R5', grupo: 'grupo', app: 'WhatsApp' })).toBe('envío a un grupo o lista (grupo): Enter sobre «Enviar» en WhatsApp')
    expect(resumenTarjetaManos('Enter sobre «Enviar»', { regla: 'pedido' })).toBe('no lo pediste en el chat: Enter sobre «Enviar»')
  })

  it('en inglés traduce los fijos y los que llevan datos, y deja igual lo que no reconoce', () => {
    fijarIdiomaPrueba('en')
    expect(motivoParaPersona('⌘Q sale de la app (y puede perder lo no guardado)')).toBe('⌘Q quits the app (and may lose unsaved work)')
    expect(motivoParaPersona('escribir contraseña (campo seguro) en un formulario lo transmite')).toBe('typing into a form sends it: password (secure field)')
    expect(motivoParaPersona('Enter presiona el botón por defecto «Enviar»')).toBe('Enter presses the default button “Enviar”')
    expect(motivoParaPersona('button «Send»')).toBe('button “Send”')
    expect(motivoParaPersona('abrir example.com, un sitio que no aprobaste en esta sesión')).toBe('opening example.com, a site you haven\'t approved in this session')
    expect(motivoParaPersona('la URL lleva datos que parecen codificados (hex) hacia example.com')).toBe('the URL carries data that looks encoded (hex), to example.com')
    expect(motivoParaPersona('algo que no conoce «x» y sigue')).toBe('algo que no conoce «x» y sigue')
    expect(resumenTarjetaManos('Enter en un campo de una página envía el formulario', { regla: 'R6', app: 'Safari' })).toBe('a destination that didn\'t come from your message, after reading the screen: Enter in a field on a web page submits the form in Safari')
  })
})
