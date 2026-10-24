/**
 * Voz de la edición cliente (21 oct 2026, carril VOZ): la llave de Groq del alumno llega por stdin al cofre, nunca al
 * entorno ni a los hijos, no cuenta como llave del chat y es lo único con que el daemon cliente transcribe.
 * Nada lee secretos reales: llaves de prueba y transportes falsos.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { entornoClaude, guardarSecretos, llaveVoz, NUNCA_EN_ENTORNO, parsearSecretos, rutaSoloApp, vaciarCofreParaPruebas, vistaConLlaves } from './cofre.js'
import { estadoLlaves } from './llaves.js'
import { hablarLemonfox, proveedoresVoz, probarLlaveVoz, VOZ_LEMONFOX } from './voz.js'
import { transcribe } from '../live/transcribe.js'

const GROQ = 'gsk_' + 'p'.repeat(40)

let edicionPrevia: string | undefined
beforeEach(() => { vaciarCofreParaPruebas(); edicionPrevia = process.env.ARBRAIN_EDICION; process.env.ARBRAIN_EDICION = 'cliente' })
afterEach(() => { vaciarCofreParaPruebas(); if (edicionPrevia === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = edicionPrevia })

describe('cofre: llave de Groq', () => {
  it('stdin la acepta; nunca queda en el entorno del daemon ni en el del CLI de Claude', () => {
    // v0.2.10: la de LemonFox (leer en voz alta) también entra; cualquier otra llave se ignora.
    expect(parsearSecretos(JSON.stringify({ GROQ_API_KEY: ` ${GROQ} `, LEMONFOX_API_KEY: 'lf_x', ELEVENLABS_API_KEY: 'x' }))).toEqual({ GROQ_API_KEY: GROQ, LEMONFOX_API_KEY: 'lf_x' })
    const env = { ARBRAIN_EDICION: 'cliente', GROQ_API_KEY: 'heredada' } as NodeJS.ProcessEnv
    guardarSecretos(env, { GROQ_API_KEY: GROQ })
    expect(llaveVoz()).toBe(GROQ)
    expect(env.GROQ_API_KEY).toBeUndefined()
    expect((NUNCA_EN_ENTORNO as readonly string[]).includes('GROQ_API_KEY')).toBe(true)
    expect(Object.values(entornoClaude({ ...env, GROQ_API_KEY: GROQ }, true)).join('\n')).not.toContain(GROQ)
  })
  it('por entorno (contrato v1) también se captura y se borra', () => {
    const env = { ARBRAIN_EDICION: 'cliente', GROQ_API_KEY: GROQ } as NodeJS.ProcessEnv
    guardarSecretos(env, null)
    expect(llaveVoz()).toBe(GROQ)
    expect(env.GROQ_API_KEY).toBeUndefined()
  })
  it('sola no cuenta como llave del chat ni entra a la vista de proveedor', () => {
    guardarSecretos({ ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv, { GROQ_API_KEY: GROQ })
    expect(vistaConLlaves({}).GROQ_API_KEY).toBeUndefined()
    expect(estadoLlaves().chat).toBe(false)
  })
  it('vacía o ausente = sin llave', () => {
    guardarSecretos({ ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv, { GROQ_API_KEY: '   ' })
    expect(llaveVoz()).toBeUndefined()
  })
  it('el pase de agente no abre la prueba de voz ni la transcripción', () => {
    expect(rutaSoloApp('POST', '/voz/probar')).toBe(true)
    expect(rutaSoloApp('POST', '/live/transcribe')).toBe(true)
  })
})

describe('proveedores de voz', () => {
  it('cliente: solo la llave del cofre, nunca el .env del cerebro', () => {
    const envArchivo = () => ({ GROQ_API_KEY: 'del-env', LEMONFOX_API_KEY: 'lf' })
    expect(proveedoresVoz(true, envArchivo, undefined)).toEqual([])
    const p = proveedoresVoz(true, envArchivo, GROQ)
    expect(p.map(x => [x.name, x.key])).toEqual([['groq', GROQ]])
  })
  it('instalación de Daniel: lo de siempre (Groq y LemonFox desde su .env)', () => {
    const p = proveedoresVoz(false, () => ({ GROQ_API_KEY: 'g', LEMONFOX_API_KEY: 'lf' }), GROQ)
    expect(p.map(x => x.name)).toEqual(['groq', 'lemonfox'])
  })
  it('sin llave en cliente, transcribir responde stt_not_configured (la pantalla lleva a Ajustes › Voz)', async () => {
    const audio = new Blob([new Uint8Array(2000)], { type: 'audio/webm' })
    await expect(transcribe(audio, proveedoresVoz(true, () => ({}), undefined), new AbortController().signal)).rejects.toMatchObject({ code: 'stt_not_configured', status: 503 })
  })
  it('con llave, transcribe con Groq usando esa llave', async () => {
    let auth = ''
    const transport = (async (_u: string, init: RequestInit) => { auth = String((init.headers as Record<string, string>).Authorization); return new Response(JSON.stringify({ text: ' hola ' }), { status: 200 }) }) as unknown as typeof fetch
    const audio = new Blob([new Uint8Array(2000)], { type: 'audio/webm' })
    const r = await transcribe(audio, proveedoresVoz(true, () => ({}), GROQ), new AbortController().signal, transport)
    expect(r).toEqual({ text: 'hola', provider: 'groq' })
    expect(auth).toBe(`Bearer ${GROQ}`)
  })
})

describe('probar la llave de Groq', () => {
  const con = (status: number) => (async () => new Response('{"secreto":"no sale"}', { status })) as unknown as typeof fetch
  it('ok, inválida, saturado y sin red; nunca devuelve la llave ni el cuerpo del proveedor', async () => {
    expect((await probarLlaveVoz(GROQ, con(200))).ok).toBe(true)
    expect(await probarLlaveVoz(GROQ, con(401))).toMatchObject({ ok: false, code: 'llave_invalida' })
    expect(await probarLlaveVoz(GROQ, con(429))).toMatchObject({ ok: false, code: 'saturado' })
    expect(await probarLlaveVoz(GROQ, (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)).toMatchObject({ ok: false, code: 'sin_red' })
    const r = await probarLlaveVoz(GROQ, con(500))
    expect(JSON.stringify(r)).not.toContain(GROQ)
    expect(JSON.stringify(r)).not.toContain('no sale')
  })
  it('sin llave no llama a nadie', async () => {
    let llamado = false
    expect(await probarLlaveVoz(undefined, (async () => { llamado = true; return new Response('') }) as unknown as typeof fetch)).toMatchObject({ ok: false, code: 'falta_llave' })
    expect(llamado).toBe(false)
  })
})

describe('leer en voz alta con LemonFox (v0.2.10)', () => {
  const LF = 'lf_prueba_0123456789abcdef'
  it('manda la velocidad del lector como speed, en español, y devuelve el MP3 con el tempo aplicado', async () => {
    let cuerpo: Record<string, unknown> = {}
    let auth = ''
    const t = (async (_u: string, init: RequestInit) => { cuerpo = JSON.parse(String(init.body)); auth = String((init.headers as Record<string, string>).Authorization); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }) }) as unknown as typeof fetch
    const r = await hablarLemonfox('Hola', 2, LF, t)
    expect(r).toMatchObject({ ok: true, tempo: 2 })
    expect(r && r.ok && r.audio.length).toBe(3)
    expect(cuerpo).toMatchObject({ input: 'Hola', voice: VOZ_LEMONFOX, language: 'es', speed: 2, response_format: 'mp3' })
    expect(auth).toBe(`Bearer ${LF}`)
    expect(await hablarLemonfox('Hola', 9, LF, t)).toMatchObject({ ok: true, tempo: 3 })
  })
  it('sin llave no llama a nadie (la web usa la voz del sistema); errores sin la llave ni el cuerpo del proveedor', async () => {
    let llamado = false
    expect(await hablarLemonfox('Hola', 1, undefined, (async () => { llamado = true; return new Response('') }) as unknown as typeof fetch)).toBeNull()
    expect(llamado).toBe(false)
    const r = await hablarLemonfox('Hola', 1, LF, (async () => new Response('{"secreto":"no sale"}', { status: 401 })) as unknown as typeof fetch)
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(JSON.stringify(r)).not.toContain(LF)
    expect(JSON.stringify(r)).not.toContain('no sale')
  })
})
