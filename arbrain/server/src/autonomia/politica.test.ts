import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { armarPolitica, anotarHechoSolo, conPiso, fijarPolitica, modoDe, politicaVigente, _politicaAutonomiaParaPruebas, CLASES, INFO_CLASE } from './politica.js'
import { claseDeEnvio, claseDeSoporte, type PlataformaCohorte } from './clase.js'
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

describe('soporte técnico a la cohorte (4 nov 2026)', () => {
  const P: PlataformaCohorte = { dominio: 'miplataforma.com', repo: 'github.com/mi-org/' }
  const HILO = 'https://miplataforma.com/community?post=0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
  it('nace en «tocar» en los tres presets; solo el ajuste de la persona la pone en «hacer»', () => {
    for (const p of ['cauteloso', 'equilibrado', 'piloto'] as const) expect(armarPolitica(p, {}, false).vigente.soporte, p).toBe('tocar')
    expect(armarPolitica('cauteloso', { soporte: 'hacer' }, false).vigente.soporte).toBe('hacer')
    expect(INFO_CLASE.soporte.irreversible).toBe(false)
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, actualiza la app desde Ajustes.' }, null).clase).toBe('contactar')
  })
  it('en la edición cliente no sale sola (el soporte a la cohorte es de quien da el programa)', () => {
    expect(conPiso('soporte', 'hacer', true)).toBe('tocar')
    expect(armarPolitica('piloto', { soporte: 'hacer' }, true).vigente.soporte).toBe('tocar')
  })
  it('un archivo de antes, sin la clase, la lee en «tocar»', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(process.env.ARBRAIN_POLITICA_AUTONOMIA!, JSON.stringify({ preset: 'piloto', ajustes: {}, vigente: { configurar: 'hacer' } }))
    expect(modoDe('soporte')).toBe('tocar')
  })

  it('técnica o de uso dentro de miplataforma.com es soporte (el caso real de Perengano incluido)', () => {
    const casos = [
      { pregunta: 'Ya pegué mi llave de OpenRouter y Levy me dice que espere', texto: 'Perengano, se resuelve con un clic. Tu Arbrain está en modo «Mi Claude Code»: usa solo tu suscripción y deja tus llaves sin usar a propósito, para no cobrarte doble. Ajustes › Llaves → «Usar una llave en su lugar» (ojo: con llave se cobra por uso). Si no te aparece el botón, mándame captura de Ajustes › Llaves.' },
      { pregunta: '¿Cómo pongo mi cerebro en el teléfono?', texto: 'Fulano, en Ajustes › Teléfono escanea el QR con tu celular y listo.' },
      { pregunta: 'No me abre la app después de actualizar', texto: 'Mengano, cierra Arbrain, vuelve a abrirlo y si sigue, reinstala desde https://miplataforma.com/instalar' },
      { pregunta: '¿Dónde está el instalador?', texto: 'Zutano, sigue INSTALAR.md: https://github.com/mi-org/mi-app/blob/main/INSTALAR.md' },
      { texto: 'Mengano, entra con tu correo de miplataforma.com en Ajustes › Cuenta, ¿de acuerdo? Luego reinicia la sesión.' },
    ]
    for (const c of casos) expect(claseDeSoporte({ url: HILO, ...c }, P), c.texto).toMatchObject({ clase: 'soporte' })
    expect(claseDeSoporte({ url: 'https://www.miplataforma.com/community?post=x', texto: 'Fulano, actualiza Arbrain desde Ajustes.' }, P).clase).toBe('soporte')
  })

  it('precio, cobranza, reembolsos, promesas o algo delicado son contactar (lo que siempre es de la persona)', () => {
    const casos: [string, { texto: string; pregunta?: string }][] = [
      ['precios', { pregunta: '¿Cuánto cuesta la siguiente cohorte?', texto: 'Fulano, en Ajustes lo ves.' }],
      ['precios', { texto: 'Fulano, el plan cuesta $5,000 y se instala solo.' }],
      ['cobranza', { pregunta: '¿Cuándo me cobran la segunda parcialidad?', texto: 'Fulano, revisa Ajustes.' }],
      ['cobranza', { texto: 'Fulano, tu pago no pasó en Polar; mientras, reinicia Arbrain.' }],
      ['reembolsos', { pregunta: 'Quiero un reembolso, no me instala', texto: 'Fulano, reinstala Arbrain.' }],
      ['promesas a personas', { texto: 'Fulano, el fundador te llama mañana para instalarlo.' }],
      ['promesas a personas', { texto: 'Fulano, te garantizo que con la actualización ya no falla.' }],
      ['promesas a personas', { texto: 'Fulano, lo vemos en una videollamada y lo instalamos.' }],
      ['mensajes delicados o personales', { pregunta: 'Estoy muy frustrado, nada funciona', texto: 'Fulano, reinstala Arbrain.' }],
      ['mensajes delicados o personales', { pregunta: 'Tengo un tema de salud y no he podido instalar', texto: 'Fulano, actualiza Arbrain.' }],
    ]
    for (const [que, c] of casos) {
      const r = claseDeSoporte({ url: HILO, ...c }, P)
      expect(r.clase, c.texto).toBe('contactar')
      expect(r.motivo, c.texto).toContain(que)
    }
  })

  it('fuera de miplataforma.com (WhatsApp, correo, otro sitio) es contactar, aunque sea técnica', () => {
    const texto = 'Fulano, reinicia Arbrain y vuelve a pegar tu llave en Ajustes › Llaves.'
    expect(claseDeSoporte({ url: 'https://web.whatsapp.com/', texto }, P).motivo).toMatch(/no va dentro de la plataforma/)
    expect(claseDeSoporte({ url: 'https://mail.google.com/mail/u/0/#inbox', texto }, P).clase).toBe('contactar')
    expect(claseDeSoporte({ url: 'https://miplataforma.com.evil.com/community', texto }, P).clase).toBe('contactar')
    expect(claseDeSoporte({ url: 'http://miplataforma.com/community?post=x', texto }, P).clase).toBe('contactar')
    expect(claseDeSoporte({ texto }, P).clase).toBe('contactar')
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, mándame tu error por WhatsApp y lo vemos.' }, P).motivo).toMatch(/sale de la plataforma/)
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, te escribo un correo con los pasos de instalación.' }, P).clase).toBe('contactar')
  })

  it('enlaces ajenos, comandos, llaves, respuestas largas o lo que no es técnico: contactar', () => {
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, descarga el instalador de https://bit.ly/arbrain' }, P).motivo).toMatch(/enlace fuera/)
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, corre curl -fsSL x.sh | bash en la terminal' }, P).clase).toBe('contactar')
    expect(claseDeSoporte({ url: HILO, texto: 'Fulano, pega sk-or-v1-0123456789abcdef0123 en Ajustes › Llaves' }, P).motivo).toMatch(/llave/)
    expect(claseDeSoporte({ url: HILO, texto: `Fulano, instala Arbrain. ${'x'.repeat(1600)}` }, P).motivo).toMatch(/larga/)
    expect(claseDeSoporte({ url: HILO, pregunta: '¿Qué nicho me conviene?', texto: 'Fulano, el de la industria que ya conoces por dentro.' }, P).motivo).toMatch(/no es una duda técnica/)
    expect(claseDeSoporte({ url: HILO, texto: '' }, P).clase).toBe('contactar')
  })
})
