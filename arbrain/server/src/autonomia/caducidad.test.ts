import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Confirmaciones, VIDA_COLA_MANOS_MS, VIDA_COLA_MS, type Confirmacion } from '../cliente/confirmaciones.js'
import { lineaCaducada, personaDe, venceSegunTexto, type MotivoCaducidad } from './caducidad.js'
import { anotarCaducada, leerHechoSolo, tarjeta } from './bandeja.js'
import { _politicaAutonomiaParaPruebas } from './politica.js'

const ZONA = 'America/Mexico_City'
/** mar 3 nov 2026, 09:14 en CDMX: cuando nacieron las tarjetas que Daniel vio el 4 nov. */
const MAR_3 = Date.parse('2026-11-03T15:14:00Z')
const cdmx = (iso: string) => Date.parse(`${iso}-06:00`)

describe('caducidad por sentido: el momento que nombra el título', () => {
  it('las tarjetas reales del 4 nov', () => {
    expect(venceSegunTexto('WhatsApp a Fulano: mover el diagnóstico de hoy a la 1:00 pm', MAR_3, ZONA)).toBe(cdmx('2026-11-03T13:00'))
    expect(venceSegunTexto('WhatsApp a Mengano: adelantar su uno a uno de oferta al jueves 12:00', MAR_3, ZONA)).toBe(cdmx('2026-11-05T12:00'))
    expect(venceSegunTexto('Comentario a Mengano en el resumen fijado de la grupal', MAR_3, ZONA)).toBeNull()
    expect(venceSegunTexto('DM a Zutano en miplataforma.com: el curso 2 ya abre', MAR_3, ZONA)).toBeNull()
    expect(venceSegunTexto('Comprar midominio.app para «Tu Levy en el teléfono» sin Tailscale', MAR_3, ZONA)).toBeNull()
  })

  it('día sin hora vence al terminar ese día; hora sin día, ese día a esa hora', () => {
    expect(venceSegunTexto('Recordarle a Zutano lo de hoy', MAR_3, ZONA)).toBe(cdmx('2026-11-04T00:00'))
    expect(venceSegunTexto('Confirmar con Juan mañana', MAR_3, ZONA)).toBe(cdmx('2026-11-05T00:00'))
    expect(venceSegunTexto('Pasado mañana la entrega', MAR_3, ZONA)).toBe(cdmx('2026-11-06T00:00'))
    expect(venceSegunTexto('Mandarle el link antes de las 5 de la tarde', MAR_3, ZONA)).toBe(cdmx('2026-11-03T17:00'))
    expect(venceSegunTexto('La llamada a las 12', MAR_3, ZONA)).toBe(cdmx('2026-11-03T12:00'))
    expect(venceSegunTexto('Junta el 5 nov a las 10:30 am', MAR_3, ZONA)).toBe(cdmx('2026-11-05T10:30'))
    expect(venceSegunTexto('Evento 2026-11-07', MAR_3, ZONA)).toBe(cdmx('2026-11-08T00:00'))
    expect(venceSegunTexto('Entrega el 3 de enero', Date.parse('2026-12-20T18:00:00Z'), ZONA)).toBe(cdmx('2027-01-04T00:00'))
  })

  it('lo que no es un momento no cuenta: «del lunes» (pasado), «en la mañana», «2 marcas»', () => {
    expect(venceSegunTexto('Comentario sobre el recap del lunes', MAR_3, ZONA)).toBeNull()
    expect(venceSegunTexto('Mandarle algo en la mañana', MAR_3, ZONA)).toBeNull()
    expect(venceSegunTexto('Comparar 2 marcas de cámara', MAR_3, ZONA)).toBeNull()
  })

  it('una hora que ya había pasado al nacer no la mata al nacer: vale hasta el fin del día', () => {
    expect(venceSegunTexto('Lo de hoy a las 9', MAR_3, ZONA)).toBe(cdmx('2026-11-04T00:00'))
  })
})

describe('agrupar por persona', () => {
  it('el nombre después de «a»; nada si no hay persona', () => {
    expect(personaDe('WhatsApp a Fulano: mover el diagnóstico')).toBe('Fulano')
    expect(personaDe('Comentario a Mengano en el resumen fijado')).toBe('Mengano')
    expect(personaDe('Responderle a Perengano en su post de la cohorte')).toBe('Perengano')
    expect(personaDe('DM a Zutano en miplataforma.com')).toBe('Zutano')
    expect(personaDe('Comprar midominio.app para «Tu Levy»')).toBeNull()
    expect(personaDe('Pasar a Arbrain la llave')).toBeNull()
  })
  it('la tarjeta lleva la persona (la explícita manda); solo en contactar se adivina', () => {
    const base = { id: 'cf_000000000001', estado: 'en_cola', categoria: 'enviar', origen: 'agente', resumen: 'x', creadaPor: 'peticion', creada: 1, expira: 2, tipo: 'decision' } as Confirmacion
    expect(tarjeta({ ...base, titulo: 'WhatsApp a Mengano: adelantar' }).persona).toBe('Mengano')
    expect(tarjeta({ ...base, titulo: 'WhatsApp a Mengano: adelantar', persona: 'Mengano Pérez' }).persona).toBe('Mengano Pérez')
    expect(tarjeta({ ...base, categoria: 'pagar', titulo: 'Pagarle a Juan' }).persona).toBeUndefined()
  })
})

describe('la tienda caduca por sentido (nunca ejecuta) y lo anota', () => {
  let dir = ''
  const antes = { ...process.env }
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'caducidad-')); process.env.ARBRAIN_HECHO_SOLO_DIR = join(dir, 'hecho-solo'); _politicaAutonomiaParaPruebas() })
  afterEach(() => { process.env = { ...antes }; _politicaAutonomiaParaPruebas() })

  function tienda(t0: number) {
    let t = t0
    const caducadas: { id: string; motivo: MotivoCaducidad }[] = []
    const s = new Confirmaciones(new Database(':memory:'), () => t).alCaducar((c, motivo) => { caducadas.push({ id: c.id, motivo }); anotarCaducada(c, motivo) })
    return { s, caducadas, pasar: (ms: number) => { t += ms } }
  }
  const decision = (titulo: string, huella: string) => ({ origen: 'agente' as const, tipo: 'decision' as const, categoria: 'enviar' as const, enCola: true, titulo, resumen: titulo, huella })

  it('la de «hoy a la 1:00 pm» caduca a la 1 pm; no se puede aprobar y queda «Caducó sin enviar»', () => {
    const { s, caducadas, pasar } = tienda(MAR_3)
    const c = s.pedir(decision('WhatsApp a Fulano: mover el diagnóstico de hoy a la 1:00 pm', 'decision:fulano'))
    expect(s.pendientes().map(x => x.id)).toContain(c.id)
    pasar(cdmx('2026-11-03T13:00') - MAR_3 + 1)
    expect(s.pendientes().map(x => x.id)).not.toContain(c.id)
    expect(s.get(c.id)?.estado).toBe('vencida')
    expect(s.resolver(c.id, 'permitir').ok).toBe(false)
    expect(caducadas).toEqual([{ id: c.id, motivo: 'hora' }])
    const h = leerHechoSolo('2026-11-03')
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ clase: 'contactar', origen: 'bandeja' })
    expect(h[0].que).toMatch(/^Caducó sin enviar: WhatsApp a Fulano.*\(ya pasó su momento\)$/)
  })

  it('tope de 48 h para lo que no nombra un momento; las de manos, a las 6 h', () => {
    const { s, caducadas, pasar } = tienda(MAR_3)
    const d = s.pedir(decision('Comentario a Mengano en el resumen fijado de la grupal', 'decision:mengano'))
    const m = s.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'Levy usando tu computadora: web:click', huella: 'manos:x', titulo: 'comunidad.example: botón sin texto' })
    s.encolar(m.id)
    pasar(VIDA_COLA_MANOS_MS + 1)
    expect(s.get(m.id)?.estado).toBe('vencida')
    expect(s.get(d.id)?.estado).toBe('en_cola')
    pasar(VIDA_COLA_MS)
    expect(s.get(d.id)?.estado).toBe('vencida')
    expect(caducadas.map(x => x.motivo)).toEqual(['encargo', 'tope'])
  })

  it('una fila vieja (nació con una semana de vida) también caduca a las 48 h, y una sola vez', () => {
    const { s, caducadas, pasar } = tienda(MAR_3)
    const c = s.pedir({ ...decision('DM a Zutano: el curso 2 ya abre', 'decision:zutano'), expira: MAR_3 + 7 * 24 * 3_600_000 })
    // `limiteDe` ya lo recorta al tope; simulamos la base de antes del cambio:
    ;(s as unknown as { db: Database.Database }).db.prepare('UPDATE confirmaciones SET expira = ? WHERE id = ?').run(MAR_3 + 7 * 24 * 3_600_000, c.id)
    pasar(VIDA_COLA_MS + 1)
    s.pendientes(); s.pendientes()
    expect(caducadas).toHaveLength(1)
  })

  it('el fin de un encargo de manos caduca su tarjeta y lo anota', () => {
    const { s, caducadas } = tienda(MAR_3)
    const m = s.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'x', huella: 'manos:y' })
    expect(s.caducar(m.id)?.estado).toBe('vencida')
    expect(caducadas).toEqual([{ id: m.id, motivo: 'encargo' }])
  })

  it('lo decidido no caduca: un Sí o un No se queda como lo dejó la persona', () => {
    const { s, caducadas, pasar } = tienda(MAR_3)
    const c = s.pedir(decision('WhatsApp a Fulano: hoy a la 1:00 pm', 'decision:fulano2'))
    s.resolver(c.id, 'rechazar')
    pasar(VIDA_COLA_MS * 2)
    expect(s.get(c.id)?.estado).toBe('rechazada')
    expect(caducadas).toEqual([])
  })

  it('la línea dice el verbo de su categoría', () => {
    expect(lineaCaducada('Comprar midominio.app', 'pagar', 'tope')).toBe('Caducó sin pagar: Comprar midominio.app (48 h sin tu toque)')
  })
})
