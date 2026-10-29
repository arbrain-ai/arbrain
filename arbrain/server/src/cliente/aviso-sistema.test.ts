/**
 * A6 (0.2.15): aviso del sistema cuando Levy espera un clic. Puro: el comando por plataforma, el escape de comillas, una
 * vez por confirmación y con silencio entre avisos. Nada se lanza de verdad (`correr` falso).
 */
import { describe, expect, it } from 'vitest'
import { _avisoSistemaParaPruebas, avisarSistema, comandoAviso } from './aviso-sistema.js'

describe('aviso del sistema', () => {
  it('macOS por osascript, Windows por un toast de PowerShell, Linux por notify-send; lo demás, nada', () => {
    const mac = comandoAviso('Levy espera tu clic', 'Enviar "hola" a Juan\\n', 'darwin')!
    expect(mac.cmd).toBe('osascript')
    expect(mac.args[1]).toBe('display notification "Enviar \\"hola\\" a Juan\\\\n" with title "Levy espera tu clic" sound name "Glass"')
    const win = comandoAviso('Levy', "it's", 'win32')!
    expect(win.cmd).toBe('powershell')
    expect(win.args.at(-1)).toMatch(/CreateTextNode\('it''s'\)/)
    expect(win.args.at(-1)).toMatch(/CreateToastNotifier\('Arbrain'\)/)
    expect(comandoAviso('a', 'b', 'linux')).toEqual({ cmd: 'notify-send', args: ['-a', 'Arbrain', 'a', 'b'] })
    expect(comandoAviso('a', 'b', 'freebsd')).toBeNull()
    // Controles fuera y recorte: una tarjeta larga no rompe el comando.
    expect(comandoAviso('t\u0007', 'x'.repeat(500), 'linux')!.args[3].length).toBe(200)
  })
  it('una vez por confirmación, con silencio de 3 s entre avisos; solo en la edición cliente', () => {
    _avisoSistemaParaPruebas()
    const lanzados: string[] = []
    const correr = (c: { cmd: string; args: string[] }) => { lanzados.push(c.cmd) }
    expect(avisarSistema('cf_1', 't', 'c', { plataforma: 'darwin', correr, ahora: 10_000, cliente: true })).toBe('enviado')
    expect(avisarSistema('cf_1', 't', 'c', { plataforma: 'darwin', correr, ahora: 20_000, cliente: true })).toBe('repetido')
    expect(avisarSistema('cf_2', 't', 'c', { plataforma: 'darwin', correr, ahora: 11_000, cliente: true })).toBe('silencio')
    expect(avisarSistema('cf_2', 't', 'c', { plataforma: 'darwin', correr, ahora: 14_000, cliente: true })).toBe('enviado')
    expect(avisarSistema('cf_3', 't', 'c', { plataforma: 'freebsd', correr, ahora: 30_000, cliente: true })).toBe('sin_como')
    expect(avisarSistema('cf_4', 't', 'c', { plataforma: 'darwin', correr, ahora: 40_000, cliente: false })).toBe('no_cliente')
    expect(lanzados).toEqual(['osascript', 'osascript'])
  })
})
