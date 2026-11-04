import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { armarPolitica, anotarHechoSolo, conPiso, fijarPolitica, modoDe, politicaVigente, _politicaAutonomiaParaPruebas, CLASES, INFO_CLASE } from './politica.js'
import { claseDeEnvio } from './clase.js'
import { frenarWeb, type InfoElemento } from '../manos/web/freno-web.js'
import { frenar } from '../manos/freno.js'

let dir = ''
const antes = { ...process.env }
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autonomia-'))
  process.env.ARBRAIN_POLITICA_AUTONOMIA = join(dir, 'politica.json')
  process.env.ARBRAIN_HECHO_SOLO_DIR = join(dir, 'hecho-solo')
  _politicaAutonomiaParaPruebas()
})
afterEach(() => { process.env = { ...antes }; _politicaAutonomiaParaPruebas() })

// El caso real (bitácora 20261103140340-b1ac): el cuadro «Create API key» de abliteration.ai, con el nombre ya escrito.
const crearLlave: InfoElemento = {
  tag: 'button', tipo: 'submit', boton_tipo: 'submit', nombre: 'Create key', editable: false, en_formulario: true,
  formulario: { busqueda: false, etiqueta: 'Create API key', texto: 'Create API key Key name Project Default project Cancel Create key' },
  dialogo: { texto: 'Create API key' }, ancestros: ['dialog «Create API key»'], url: 'https://abliteration.ai/console/api-keys',
}

describe('política de autonomía: presets y piso', () => {
  it('sin archivo rige Piloto automático en la instalación original', () => {
    const p = politicaVigente()
    expect(p.preset).toBe('piloto')
    expect(p.vigente.configurar).toBe('hacer')
    expect(p.vigente.contactar).toBe('tocar')
    expect(p.vigente.pagar).toBe('tocar')
    expect(p.vigente.borrar).toBe('tocar')
  })

  it('lo irreversible nunca baja de «tocar», aunque el archivo diga «hacer»', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(process.env.ARBRAIN_POLITICA_AUTONOMIA!, JSON.stringify({ preset: 'piloto', ajustes: { contactar: 'hacer', pagar: 'hacer', borrar: 'hacer', publicar: 'hacer', legal: 'hacer' } }))
    for (const c of CLASES.filter(c => INFO_CLASE[c].irreversible)) expect(modoDe(c), c).toBe('tocar')
  })

  it('presets: Cauteloso toca todo, Equilibrado configura y mueve agenda solo', () => {
    expect(Object.values(armarPolitica('cauteloso', {}, false).vigente).every(m => m === 'tocar')).toBe(true)
    const e = armarPolitica('equilibrado', {}, false).vigente
    expect([e.configurar, e.agenda, e.cohorte, e.borrar_prueba]).toEqual(['hacer', 'hacer', 'tocar', 'tocar'])
  })

  it('edición cliente: pagar es «nunca»; sin política del daemon rige Cauteloso', () => {
    expect(conPiso('pagar', 'tocar', true)).toBe('nunca')
    process.env.ARBRAIN_EDICION = 'cliente'
    expect(politicaVigente().preset).toBe('cauteloso')
    _politicaAutonomiaParaPruebas({ remota: { preset: 'piloto' } })
    expect(politicaVigente().vigente.configurar).toBe('hacer')
    expect(politicaVigente().vigente.pagar).toBe('nunca')
  })

  it('fijarPolitica deja un archivo legible (lo lee Levy) y se relee igual', () => {
    fijarPolitica('equilibrado', { cohorte: 'hacer' }, 'prueba')
    const j = JSON.parse(readFileSync(process.env.ARBRAIN_POLITICA_AUTONOMIA!, 'utf8'))
    expect(j.preset).toBe('equilibrado')
    expect(j.ajustes).toEqual({ cohorte: 'hacer' })
    expect(j.clases.configurar).toMatch(/llaves API/)
    expect(j.siempre_tuyo).toContain('precios')
    expect(politicaVigente().vigente.cohorte).toBe('hacer')
  })

  it('«Lo que hice solo»: una línea por acción en el archivo del día', () => {
    anotarHechoSolo({ clase: 'configurar', que: '«Create key» en abliteration.ai', donde: 'abliteration.ai', origen: 'web', deshacer: 'borrar la llave en la consola' })
    const archivos = readdirSync(process.env.ARBRAIN_HECHO_SOLO_DIR!)
    expect(archivos).toHaveLength(1)
    const fila = JSON.parse(readFileSync(join(process.env.ARBRAIN_HECHO_SOLO_DIR!, archivos[0]), 'utf8').trim())
    expect(fila).toMatchObject({ clase: 'configurar', donde: 'abliteration.ai', deshacer: 'borrar la llave en la consola' })
  })
})

describe('clase de un envío', () => {
  it('crear, guardar o generar en una consola es configurar', () => {
    expect(claseDeEnvio({ etiqueta: 'Create key', formulario: 'Create API key Key name', url: 'https://abliteration.ai/console/api-keys' })).toBe('configurar')
    expect(claseDeEnvio({ etiqueta: 'Guardar cambios', formulario: 'Webhook URL', url: 'https://dashboard.ejemplo.com/settings/webhooks' })).toBe('configurar')
    expect(claseDeEnvio({ etiqueta: 'Create account', formulario: 'Email Password', url: 'https://ejemplo.com/signup' })).toBe('configurar')
  })
  it('ante cualquier señal de personas es contactar', () => {
    expect(claseDeEnvio({ etiqueta: 'Siguiente', url: 'https://ejemplo.com/contacto' })).toBe('contactar')
    expect(claseDeEnvio({ etiqueta: 'Enviar', url: 'https://ejemplo.com/' })).toBe('contactar')
    expect(claseDeEnvio({ etiqueta: 'Add member', formulario: 'Invite by email', url: 'https://app.ejemplo.com/team' })).toBe('contactar')
    expect(claseDeEnvio({ etiqueta: 'Create', formulario: 'Start a post', url: 'https://www.linkedin.com/feed/' })).toBe('contactar')
    expect(claseDeEnvio({ etiqueta: 'Guardar', formulario: 'Name Email Message', url: 'https://ejemplo.com/form' })).toBe('contactar')
    expect(claseDeEnvio({ etiqueta: 'Create key', accion: '/contact', url: 'https://ejemplo.com/x' })).toBe('contactar')
  })
  it('dinero no es configurar, aunque el botón diga guardar o crear', () => {
    expect(claseDeEnvio({ etiqueta: 'Save card', url: 'https://abliteration.ai/console/settings' })).toBe('pagar')
    expect(claseDeEnvio({ etiqueta: 'Create key', url: 'https://abliteration.ai/console/billing' })).toBe('pagar')
    expect(claseDeEnvio({ etiqueta: 'Add', formulario: 'Add credits Amount', url: 'https://ejemplo.com/console' })).toBe('pagar')
  })
  it('aceptar términos es legal', () => {
    expect(claseDeEnvio({ etiqueta: 'Acepto los términos', url: 'https://ejemplo.com/' })).toBe('legal')
  })
})

describe('freno de manos con la política (lo que pidió Daniel el 3 nov)', () => {
  it('crear la llave API pasa sin cita y queda marcado para «Lo que hice solo»', () => {
    const v = frenarWeb({ accion: 'click' }, crearLlave)
    expect(v.pasa).toBe(true)
    expect(v.autonomia?.clase).toBe('configurar')
    expect(v.freno?.paso).toBeUndefined()   // no consume confirmación ni pide la tarjeta I8
  })

  it('en Cauteloso la misma llave vuelve a pedir el permiso', () => {
    fijarPolitica('cauteloso')
    const v = frenarWeb({ accion: 'click' }, crearLlave)
    expect(v.pasa).toBe(false)
    expect(v.freno?.categoria).toBe('enviar')
  })

  it('mandar un WhatsApp pide toque (web y app nativa)', () => {
    const compositor: InfoElemento = { tag: 'div', editable: true, rol: 'textbox', nombre: 'Escribe un mensaje', url: 'https://web.whatsapp.com/', ancestros: ['footer'] }
    const enter = frenarWeb({ accion: 'tecla', tecla: 'return' }, compositor)
    expect(enter.pasa).toBe(false)
    expect(enter.freno?.categoria).toBe('enviar')
    const boton: InfoElemento = { tag: 'button', rol: 'button', nombre: 'Enviar', url: 'https://web.whatsapp.com/', ancestros: ['footer'] }
    expect(frenarWeb({ accion: 'click' }, boton).pasa).toBe(false)
    const nativo = frenar({ accion: 'tecla', tecla: 'return' }, { bundle: 'net.whatsapp.WhatsApp', app: 'WhatsApp', elemento: { rol: 'AXTextArea', descripcion: 'Escribe un mensaje' } }, { modo: 'original' })
    expect(nativo.pasa).toBe(false)
    expect(nativo.freno?.categoria).toBe('enviar')
  })

  it('pagar pide toque (botón de pago y «crear» en una página de cobro)', () => {
    const pagar: InfoElemento = { tag: 'button', boton_tipo: 'submit', nombre: 'Pay now', en_formulario: true, formulario: { busqueda: false }, url: 'https://abliteration.ai/console/billing' }
    const v = frenarWeb({ accion: 'click' }, pagar)
    expect(v.pasa).toBe(false)
    expect(v.freno?.categoria).toBe('pagar')
    const crearEnCobro: InfoElemento = { ...crearLlave, url: 'https://abliteration.ai/console/billing' }
    expect(frenarWeb({ accion: 'click' }, crearEnCobro).pasa).toBe(false)
  })

  it('borrar pide toque (borrar la llave no es configurar)', () => {
    const borrar: InfoElemento = { ...crearLlave, nombre: 'Delete key', formulario: { busqueda: false, etiqueta: 'Delete API key' }, dialogo: { texto: 'Delete API key? This cannot be undone.' } }
    const v = frenarWeb({ accion: 'click' }, borrar)
    expect(v.pasa).toBe(false)
    expect(v.freno?.categoria).toBe('borrar')
  })

  it('invitar a alguien desde una consola sigue siendo contactar', () => {
    const invitar: InfoElemento = { ...crearLlave, nombre: 'Create invite', formulario: { busqueda: false, etiqueta: 'Invite member', texto: 'Email Role' } }
    expect(frenarWeb({ accion: 'click' }, invitar).pasa).toBe(false)
  })
})

describe('freno nativo con la política (punto 4: configurar una app que pidió)', () => {
  const AJUSTES: import('../manos/contrato.js').ContextoAccion = { bundle: 'com.ejemplo.editor', app: 'Editor', elemento: { rol: 'AXTextField', descripcion: 'API key' }, ancestros: ['AXGroup «Ajustes › Proveedores»'] }
  const LLAVE = 'sk-abl-0123456789abcdefghijklmnopqrstuv'
  it('escribir la llave en el campo «API key» de los ajustes de una app pasa sin cita', () => {
    const r = frenar({ accion: 'escribir', texto: LLAVE }, AJUSTES, { modo: 'original' })
    expect(r.pasa).toBe(true)
    expect(r.autonomia?.clase).toBe('configurar')
  })
  it('la misma llave en un chat, en una página o en un campo de contraseña sigue frenada', () => {
    expect(frenar({ accion: 'escribir', texto: LLAVE }, { bundle: 'net.whatsapp.WhatsApp', app: 'WhatsApp', elemento: { rol: 'AXTextArea', descripcion: 'Escribe un mensaje' } }, { modo: 'original' }).pasa).toBe(false)
    expect(frenar({ accion: 'escribir', texto: LLAVE }, { ...AJUSTES, dentro_de: ['web'] }, { modo: 'original' }).pasa).toBe(false)
    expect(frenar({ accion: 'escribir', texto: 'mi-clave-123' }, { ...AJUSTES, elemento: { rol: 'AXTextField', subrol: 'AXSecureTextField', descripcion: 'Contraseña' } }, { modo: 'original' }).pasa).toBe(false)
  })
  it('contactar, pagar y borrar en apps nativas siguen pidiendo permiso', () => {
    const boton = (titulo: string) => ({ bundle: 'com.ejemplo.editor', app: 'Editor', elemento: { rol: 'AXButton', titulo } })
    expect(frenar({ accion: 'click', ref: 'e1' }, boton('Crear y enviar invitación'), { modo: 'original' }).pasa).toBe(false)
    expect(frenar({ accion: 'click', ref: 'e1' }, boton('Pagar ahora'), { modo: 'original' }).pasa).toBe(false)
    expect(frenar({ accion: 'click', ref: 'e1' }, boton('Eliminar proyecto'), { modo: 'original' }).pasa).toBe(false)
    expect(frenar({ accion: 'click', ref: 'e1' }, boton('Reenviar'), { modo: 'original' }).pasa).toBe(false)
  })
  it('en Cauteloso la llave en ajustes vuelve a pedir permiso', () => {
    fijarPolitica('cauteloso')
    expect(frenar({ accion: 'escribir', texto: LLAVE }, AJUSTES, { modo: 'original' }).pasa).toBe(false)
  })
})
