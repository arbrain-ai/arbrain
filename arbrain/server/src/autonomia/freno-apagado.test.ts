/**
 * Freno apagado hasta una hora (5 nov 2026, 18:56, Daniel: «asumo el riesgo… ya puedes usar todo»).
 * Vigente: todo pasa y queda anotado; vencido: vuelve a frenar; sin el campo: igual que siempre.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apagarFreno, encenderFreno, fijarPolitica, frenoApagado, instanteApagado, modoDe, politicaVigente } from './politica.js'
import { Freno, frenar } from '../manos/freno.js'
import { frenarWeb, type InfoElemento } from '../manos/web/freno-web.js'
import { frenarNavegacion } from '../manos/juicio-url.js'
import type { Adaptador, ContextoAccion, PedidoActuar } from '../manos/contrato.js'

const pid = 1
const compositorWA: ContextoAccion = { bundle: 'net.whatsapp.WhatsApp', app: 'WhatsApp', elemento: { rol: 'AXTextArea', placeholder: 'Escribe un mensaje', valor_largo: 4 } }
const pestanaAjena: ContextoAccion = { bundle: 'com.google.Chrome', dentro_de: ['web'], elemento: { rol: 'AXLink', titulo: 'Prankedy' } }
const botonPagar: ContextoAccion = { elemento: { rol: 'AXButton', titulo: 'Realizar pedido' } }
const enviarWeb: InfoElemento = { tag: 'button', tipo: '', editable: false, boton_tipo: 'submit', nombre: 'Enviar', en_formulario: true, formulario: { busqueda: false, accion: '/contacto' }, ancestros: [], url: 'https://ejemplo.com/contacto' }

let dir = ''
const prev = { politica: process.env.ARBRAIN_POLITICA_AUTONOMIA, hecho: process.env.ARBRAIN_HECHO_SOLO_DIR }
const escribirPolitica = (extra: Record<string, unknown>) => writeFileSync(process.env.ARBRAIN_POLITICA_AUTONOMIA!, JSON.stringify({ version: 1, preset: 'piloto', ajustes: {}, ...extra }))
const hechoSolo = () => readdirSync(process.env.ARBRAIN_HECHO_SOLO_DIR!).flatMap(f => readFileSync(join(process.env.ARBRAIN_HECHO_SOLO_DIR!, f), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
const HORA = 3600_000
const conZona = (ms: number) => new Date(ms).toISOString()

function falso(ctx: ContextoAccion) {
  const hechas: PedidoActuar[] = []
  const a = {
    nombre: 'falso', hechas,
    observar: async () => ({ app: 'X', pid, ventana: 3, elementos: [], texto: '', total_elementos: 0 }),
    actuar: async (p: PedidoActuar) => { hechas.push(p); return { ok: true, efecto: 'sin_verificar' as const } },
    apps: async () => [], abrir: async () => ({ pid, ventanas: [] }), ventanas: async () => [],
    verificar: async () => ({ cumple: true, detalle: '' }), cursor: async () => ({ x: 0, y: 0 }), salud: async () => ({ ok: true, detalle: '' }), cerrar: async () => {},
    contexto: async () => ctx,
  }
  return a as Adaptador & { hechas: PedidoActuar[] }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'freno-apagado-'))
  process.env.ARBRAIN_POLITICA_AUTONOMIA = join(dir, 'politica.json')
  process.env.ARBRAIN_HECHO_SOLO_DIR = join(dir, 'hecho-solo')
})
afterEach(() => {
  process.env.ARBRAIN_POLITICA_AUTONOMIA = prev.politica
  process.env.ARBRAIN_HECHO_SOLO_DIR = prev.hecho
  rmSync(dir, { recursive: true, force: true })
})

describe('freno apagado vigente: todo pasa y queda anotado', () => {
  beforeEach(() => escribirPolitica({ freno_apagado_hasta: conZona(Date.now() + HORA), freno_apagado_por: 'te doy si y desactiva ese freno!!' }))

  it('el juicio puro deja pasar enviar, pagar y la pestaña de Daniel sin cita, marcados como apagado', () => {
    expect(frenar({ pid, accion: 'tecla', tecla: 'return', ref: 'e5' }, compositorWA)).toMatchObject({ pasa: true, freno: { categoria: 'enviar', paso: true, apagado: true } })
    expect(frenar({ pid, accion: 'click', ref: 'e1' }, botonPagar)).toMatchObject({ pasa: true, freno: { categoria: 'pagar', apagado: true } })
    expect(frenar({ pid, ventana: 252, accion: 'click', ref: 'e1' }, pestanaAjena)).toMatchObject({ pasa: true, freno: { categoria: 'pestana_de_daniel', apagado: true } })
    // Lo reversible sigue como siempre (sin freno que anotar).
    expect(frenar({ pid, accion: 'click', ref: 'e1' }, { elemento: { rol: 'AXLink', titulo: 'Prankedy' } }).freno).toBeUndefined()
  })
  it('las manos lo ejecutan, lo devuelven con freno.apagado y lo anotan en «Lo que hice solo» con su categoría', async () => {
    const a = falso(compositorWA)
    const r = await new Freno(a).actuar({ pid, accion: 'tecla', tecla: 'return', ref: 'e5' })
    expect(r).toMatchObject({ ok: true, freno: { categoria: 'enviar', paso: true, apagado: true } })
    expect(a.hechas).toHaveLength(1)
    expect(hechoSolo()).toEqual([expect.objectContaining({ clase: 'contactar', categoria: 'enviar', origen: 'manos' })])
  })
  it('el ratón real (via=hid) también pasa y se anota', async () => {
    const a = falso({ elemento: { rol: 'AXLink', titulo: 'Prankedy' } })
    expect((await new Freno(a).actuar({ pid, accion: 'click', ref: 'e1', via: 'hid' })).ok).toBe(true)
    expect(hechoSolo()).toEqual([expect.objectContaining({ categoria: expect.stringMatching(/^cursor_de_/) })])
  })
  it('la política rige «hacer» en todo, el piso de lo irreversible incluido', () => {
    expect(modoDe('contactar')).toBe('hacer')
    expect(modoDe('pagar')).toBe('hacer')
    expect(modoDe('publicar')).toBe('hacer')
  })
  it('el freno web y la navegación con efecto también pasan', async () => {
    expect(frenarWeb({ accion: 'click' }, enviarWeb)).toMatchObject({ pasa: true, freno: { categoria: 'enviar', apagado: true } })
    expect(await frenarNavegacion('https://ejemplo.com/logout', 'navegar', undefined)).toEqual({ ok: true })
    expect(hechoSolo()).toEqual([expect.objectContaining({ categoria: 'url_con_efecto' })])
  })
})

describe('freno apagado vencido o ausente: igual que siempre', () => {
  for (const [nombre, extra] of [['vencido', { freno_apagado_hasta: conZona(Date.now() - 60_000), freno_apagado_por: 'te doy si' }], ['sin el campo', {}], ['hora ilegible', { freno_apagado_hasta: 'mañana temprano' }]] as const) {
    it(`${nombre}: enviar, pagar y la pestaña de Daniel vuelven a frenar; la política, con su piso`, async () => {
      escribirPolitica(extra)
      expect(frenoApagado()).toBeNull()
      expect(frenar({ pid, accion: 'tecla', tecla: 'return', ref: 'e5' }, compositorWA)).toMatchObject({ pasa: false, freno: { categoria: 'enviar' } })
      expect(frenar({ pid, accion: 'click', ref: 'e1' }, botonPagar)).toMatchObject({ pasa: false, freno: { categoria: 'pagar' } })
      expect(frenar({ pid, ventana: 252, accion: 'click', ref: 'e1' }, pestanaAjena)).toMatchObject({ pasa: false, freno: { categoria: 'pestana_de_daniel' } })
      expect(frenarWeb({ accion: 'click' }, enviarWeb).pasa).toBe(false)
      expect(modoDe('contactar')).toBe('tocar')
      const a = falso(compositorWA)
      expect((await new Freno(a).actuar({ pid, accion: 'tecla', tecla: 'return', ref: 'e5' })).efecto).toBe('bloqueado')
      expect(a.hechas).toHaveLength(0)
    })
  }
})

describe('freno apagado: el interruptor', () => {
  it('la hora sin zona es la hora local del dueño; con zona, ese instante', () => {
    expect(instanteApagado('2026-11-06T06:00-06:00')).toBe(Date.parse('2026-11-06T12:00:00Z'))
    expect(Number.isFinite(instanteApagado('2026-11-06T06:00'))).toBe(true)
    expect(Number.isNaN(instanteApagado('mañana'))).toBe(true)
  })
  it('apagar exige cita y hora futura; encender lo quita; cambiar el preset desde la app no lo borra', () => {
    expect(() => apagarFreno(conZona(Date.now() + HORA), '')).toThrow(/cita/)
    expect(() => apagarFreno(conZona(Date.now() - HORA), 'te doy si')).toThrow(/pasó/)
    apagarFreno(conZona(Date.now() + HORA), 'te doy si y desactiva ese freno!!')
    expect(frenoApagado()?.por).toBe('te doy si y desactiva ese freno!!')
    fijarPolitica('equilibrado', {}, 'app')
    expect(frenoApagado()).not.toBeNull()
    expect(politicaVigente().preset).toBe('equilibrado')
    encenderFreno()
    expect(frenoApagado()).toBeNull()
    expect(modoDe('contactar')).toBe('tocar')
  })
})
