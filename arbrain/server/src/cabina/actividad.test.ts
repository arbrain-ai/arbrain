import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cola, describir, fundir, leerActividad, pasosDeLinea, sinEnvoltura, type Paso } from './actividad.js'

const muestra = (n: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'harness', 'muestras', `${n}.jsonl`), 'utf8')
const pasos = (h: string, texto: string) => { const n = { turno: 0 }; return fundir(texto.split('\n').filter(Boolean).flatMap(l => pasosDeLinea(h, l, n))) }
const tipos = (p: Paso[]) => p.map(x => x.k)

describe('actividad viva de un subagente sin pantalla', () => {
  it('claude: herramienta con su comando y su resultado enlazado por id', () => {
    const p = pasos('claude', muestra('claude-herramienta'))
    const her = p.find(x => x.k === 'herramienta')
    const res = p.find(x => x.k === 'resultado')
    expect(her && res && her.k === 'herramienta' && res.k === 'resultado' && her.id === res.id).toBe(true)
    expect(tipos(p)).toContain('texto')
  })
  it('codex exec: el comando sin la envoltura de zsh, su salida y su código', () => {
    const p = pasos('codex', muestra('codex-herramienta'))
    const her = p.find(x => x.k === 'herramienta')
    expect(her?.k === 'herramienta' && her.detalle).toBe("printf 'hola' > nota2.txt")
    expect(p.find(x => x.k === 'resultado')).toMatchObject({ ok: true, codigo: 0 })
    expect(p.at(-1)).toMatchObject({ k: 'texto', texto: 'listo' })
  })
  it('codex app-server: marcas de Arbrain, mensaje en vivo y fin', () => {
    const p = pasos('codex', muestra('codex-appserver-vivo'))
    expect(p[0]).toMatchObject({ k: 'encargo', n: 1 })
    expect(tipos(p)).toEqual(expect.arrayContaining(['entrada', 'herramienta', 'resultado', 'texto', 'fin']))
  })
  it('opencode: la herramienta llega completa con su archivo', () => {
    const p = pasos('opencode', muestra('opencode-herramienta'))
    expect(p.find(x => x.k === 'herramienta')).toMatchObject({ nombre: 'Write', detalle: '/private/tmp/dsp-muestras/nota3.txt', cambio: { quita: 0, pone: 1 } })
  })
  it('qwen habla el dialecto de claude', () => {
    expect(tipos(pasos('qwen', muestra('qwen-herramienta')))).toEqual(expect.arrayContaining(['herramienta', 'resultado', 'texto']))
  })
  it('gemini cae al adaptador común sin romperse', () => {
    expect(tipos(pasos('gemini', muestra('gemini-reanudar')))).toContain('texto')
  })
  it('pensar en ráfaga se funde en un solo paso con la cuenta mayor', () => {
    const l = [10, 50, 380].map(t => JSON.stringify({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: t })).join('\n')
    expect(pasos('claude', l)).toEqual([{ k: 'pensando', tokens: 380 }])
  })
  it('Read no vuelca el archivo: solo cuenta sus líneas', () => {
    const use = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/a/b.ts' } }] } })
    const res = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'uno\ndos\ntres' }] } })
    expect(pasos('claude', `${use}\n${res}`)[1]).toMatchObject({ k: 'resultado', salida: '', lineas: 3 })
  })
  it('describe herramientas en palabras y con el cambio de líneas', () => {
    expect(describir('Edit', { file_path: 'x.ts', old_string: 'a\nb', new_string: 'c' })).toEqual({ que: 'Edita', detalle: 'x.ts', cambio: { quita: 2, pone: 1 } })
    expect(describir('Bash', { command: 'ls', description: 'Lista archivos' })).toEqual({ que: 'Lista archivos', detalle: 'ls' })
    expect(describir('mcp__cabina__mostrar', { vista: 'trabajos' }).que).toBe('mostrar')
  })
  it('la cola de una salida: últimas líneas, sin colores ANSI', () => {
    const s = Array.from({ length: 40 }, (_, i) => `\x1b[32mlinea ${i}\x1b[0m`).join('\n')
    const c = cola(s)
    expect(c.split('\n')).toHaveLength(14)
    expect(c.endsWith('linea 39')).toBe(true)
  })
  it('sinEnvoltura respeta comillas escapadas', () => {
    expect(sinEnvoltura(`/bin/zsh -lc "echo \\"hola\\""`)).toBe('echo "hola"')
    expect(sinEnvoltura(`/bin/zsh -lc 'echo '\\''x'\\'''`)).toBe(`echo 'x'`)
  })
  it('lectura incremental: solo líneas completas y desde el offset', async () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'act-')), '900001.jsonl')
    writeFileSync(ruta, '{"arbrain":"inicio","en":1,"texto":"encargo"}\n{"type":"assistant","message":{"content":[{"type":"text","text":"hola"}]}}\n{"type":"assis')
    const a = await leerActividad(ruta, 'claude', null, s => s)
    expect(tipos(a.pasos)).toEqual(['encargo', 'texto'])
    appendFileSync(ruta, 'tant","message":{"content":[{"type":"text","text":"sigo"}]}}\n{"arbrain":"salida","codigo":0,"en":2}\n')
    const b = await leerActividad(ruta, 'claude', a.offset, s => s, a.turnoBase)
    expect(b.pasos).toEqual([{ k: 'texto', texto: 'sigo' }, { k: 'fin', codigo: 0 }])
    const c = await leerActividad(ruta, 'claude', b.offset, s => s, b.turnoBase)
    expect(c.pasos).toEqual([])
  })
  it('tacha secretos y acorta la casa', async () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'act-')), '900002.jsonl')
    writeFileSync(ruta, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'clave sk-SECRETO' }] } })}\n`)
    const a = await leerActividad(ruta, 'claude', null, s => s.replace(/sk-\w+/g, '[oculto]'))
    expect(a.pasos[0]).toEqual({ k: 'texto', texto: 'clave [oculto]' })
  })
})
