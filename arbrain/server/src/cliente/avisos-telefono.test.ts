/**
 * Avisos de Levy en el teléfono del alumno (v0.2.18): textos en español de alumno, una vez por evento y sin spam.
 * La entrega es un fetch falso: ninguna notificación real sale de aquí.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  _reiniciarParaPruebas, avisarFinRutina, avisoCola, avisoRutina, CADA_FALLO_MS, CADA_RUTINA_MS, linea, mandarAviso,
  nombreRutina, registrarDestinoAvisos, URL_RUTINAS, urlConversacion,
} from './avisos-telefono.js'

function fetchFalso() {
  const cuerpos: Record<string, unknown>[] = []
  const urls: string[] = []
  const auth: string[] = []
  const f = (async (url: string, init: RequestInit) => {
    urls.push(url); auth.push(String((init.headers as Record<string, string>).Authorization))
    cuerpos.push(JSON.parse(String(init.body)))
    return { ok: true, body: null }
  }) as unknown as typeof fetch
  return { f, cuerpos, urls, auth }
}

afterEach(() => _reiniciarParaPruebas())

describe('textos', () => {
  it('cola: «Levy espera tu decisión», qué es en humano y abre esa conversación', () => {
    const a = avisoCola({ id: 'cf_1', frase: 'Mandar la cotización a tu cliente por correo', resumen: 'r', conversacion: 'conv-9' })
    expect(a).toEqual({
      title: 'Levy espera tu decisión',
      body: 'Mandar la cotización a tu cliente por correo. Siguió con lo demás; cuando decidas, lo retoma.',
      url: '/chat?session=conv-9', tag: 'cola-cf_1', kind: 'cola',
    })
    expect(avisoCola({ id: 'cf_2', resumen: 'Abrir https://banco.example/pago', conversacion: '../x' }).body)
      .toBe('Abrir https[:]//banco.example/pago. Siguió con lo demás; cuando decidas, lo retoma.')
    expect(avisoCola({ id: 'cf_2', resumen: 'x', conversacion: '../x' }).url).toBe('/chat')
  })

  it('rutina: terminó con el principio de lo que dejó; si falló, por qué y dónde verla', () => {
    const ok = avisoRutina({ id: 'rutina-resumen-1', prompt: 'Resúmeme mi día\ncon detalle', ok: true, texto: 'Hoy tienes 3 juntas.\n\nLa primera a las 10.', corrida: 5 })
    expect(ok).toEqual({ title: 'Tu rutina terminó: Resúmeme mi día', body: 'Hoy tienes 3 juntas. La primera a las 10.', url: URL_RUTINAS, tag: 'rutina-rutina-resumen-1-5', kind: 'rutina' })
    const mal = avisoRutina({ id: 'r', prompt: 'Revisa mi correo', ok: false, error: 'Error: Falta tu llave de Claude.', corrida: 1 })
    expect(mal.title).toBe('Tu rutina no terminó: Revisa mi correo')
    expect(mal.body).toBe('Falta tu llave de Claude. Ábrela en Taller › Rutinas para ver qué pasó.')
    expect(avisoRutina({ id: 'r', prompt: 'x', ok: true, texto: '' }).body).toBe('Terminó sin dejar texto. Ábrela en Taller › Rutinas.')
    expect(URL_RUTINAS).toBe('/chat?panel=taller&taller=rutinas')
  })

  it('una línea para la pantalla bloqueada: sin saltos, recortada, sin enlaces vivos', () => {
    expect(linea('a\n\n b', 10)).toBe('a b')
    expect(linea('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
    expect(linea('ve a www.ejemplo.com', 40)).toBe('ve a www[.]ejemplo.com')
    expect(nombreRutina('🤖 [rutina-x]\n\nResume')).toBe('Resume')
    expect(nombreRutina('')).toBe('Tu rutina')
    expect(urlConversacion('sdk:abc-1')).toBe('/chat?session=sdk%3Aabc-1')
    expect(urlConversacion(null)).toBe('/chat')
  })
})

describe('entrega', () => {
  it('va a la web local con el token del daemon, una vez por tag; sin destino no rompe', async () => {
    const { f, urls, auth, cuerpos } = fetchFalso()
    const a = avisoCola({ id: 'cf_1', resumen: 'x' })
    expect(await mandarAviso(a, { url: 'http://127.0.0.1:4310/', token: 't0k', fetch: f })).toBe('enviado')
    expect(await mandarAviso(a, { url: 'http://127.0.0.1:4310/', token: 't0k', fetch: f })).toBe('repetido')
    expect(urls).toEqual(['http://127.0.0.1:4310/api/notifications/send'])
    expect(auth).toEqual(['Bearer t0k'])
    expect(Object.keys(cuerpos[0]).sort()).toEqual(['body', 'kind', 'tag', 'title', 'url'])
    expect(await mandarAviso(avisoCola({ id: 'cf_2', resumen: 'x' }), {})).toBe('sin_configurar')
  })

  it('rutinas: no avisa sin destino, en corridas manuales ni con «Pausar todo»', async () => {
    const { f, cuerpos } = fetchFalso()
    expect(await avisarFinRutina({ id: 'r1', prompt: 'p', ok: true })).toBe('omitido')
    let pausa = false
    registrarDestinoAvisos({ url: 'http://127.0.0.1:1', token: 't', fetch: f }, { pausado: () => pausa })
    expect(await avisarFinRutina({ id: 'r1', prompt: 'p', ok: true, manual: true })).toBe('omitido')
    pausa = true
    expect(await avisarFinRutina({ id: 'r1', prompt: 'p', ok: true })).toBe('omitido')
    pausa = false
    expect(await avisarFinRutina({ id: 'r1', prompt: 'p', ok: true }, 1_000)).toBe('enviado')
    expect(cuerpos).toHaveLength(1)
  })

  it('sin spam: una misma rutina a lo más una vez por hora; un mismo fallo, una vez cada 12 h', async () => {
    const { f, cuerpos } = fetchFalso()
    registrarDestinoAvisos({ url: 'http://127.0.0.1:1', token: 't', fetch: f })
    const t0 = 1_800_000_000_000
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: true }, t0)).toBe('enviado')
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: true }, t0 + 15 * 60_000)).toBe('omitido')
    expect(await avisarFinRutina({ id: 'otra', prompt: 'p', ok: true }, t0 + 15 * 60_000)).toBe('enviado')
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: true }, t0 + CADA_RUTINA_MS)).toBe('enviado')
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: false, error: 'Falta tu llave' }, t0 + CADA_RUTINA_MS + 1)).toBe('enviado')
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: false, error: 'Falta tu llave' }, t0 + 2 * CADA_RUTINA_MS)).toBe('omitido')
    expect(await avisarFinRutina({ id: 'cada15', prompt: 'p', ok: false, error: 'Falta tu llave' }, t0 + CADA_RUTINA_MS + 1 + CADA_FALLO_MS)).toBe('enviado')
    expect(cuerpos.map(c => c.tag)).toEqual([`rutina-cada15-${t0}`, `rutina-otra-${t0 + 15 * 60_000}`, `rutina-cada15-${t0 + CADA_RUTINA_MS}`,
      `rutina-cada15-${t0 + CADA_RUTINA_MS + 1}`, `rutina-cada15-${t0 + CADA_RUTINA_MS + 1 + CADA_FALLO_MS}`])
  })

  it('cableado: el scheduler avisa al terminar (bien o mal) solo en la edición cliente; server.ts fija el destino con su token', () => {
    const sch = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    expect(sch.match(/esEdicionCliente\(\) && !task\.id\.endsWith\('-migrated'\)\) void avisarFinRutina/g)).toHaveLength(2)
    const srv = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
    expect(srv).toMatch(/registrarDestinoAvisos\(\{ token: MC_TOKEN, url: ALLOWED_ORIGIN \}, \{ pausado \}\)/)
  })
})
