import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  accionDe, candidatoMedio, claveFuente, claveMedio, evaluarLaunchd, formatear, leerLaunchctl, leerNervio, necesidades,
  rotuloDe, type EstadoVivo, type LecturaLaunchd, type MedioResuelto, type VivoNervio,
} from '../../src/features/canvas/model/nervio'
import { pastillasDe } from '../../src/features/canvas/model/enlace'
import type { CanvasElement } from '../../src/features/canvas/model/element'
import { ErrorMedio, resolverArchivo, resolverMedio, responderArchivo } from '../../src/lib/canvas/nervio-medios'

// ── El contrato declarativo ──

test('nervio: el contrato se sanea por partes; lo inválido se cae sin tumbar el resto', () => {
  const n = leerNervio({
    medio: { src: ['env:HT_VSL2_URL', 'medio:vsl2/*/vsl2.mp4', 'medio:../etc/passwd', '/Users/x/a.mp4', 'env:OPENAI_API_KEY'], titulo: 'VSL2' },
    previa: true, rotulo: 'VSL2',
    estado: { tipo: 'launchd', label: 'com.arbrain.ht-pipeline' },
  })
  assert.deepEqual(n?.medio?.src, ['env:HT_VSL2_URL', 'medio:vsl2/*/vsl2.mp4'])
  assert.equal(n?.estado?.tipo, 'launchd')
  assert.equal(leerNervio({ estado: { tipo: 'launchd', label: 'com.apple.algo' } }), null, 'solo tareas com.arbrain.*')
  assert.equal(leerNervio({ estado: { tipo: 'json', url: 'http://ejemplo.mx/x', valor: 'a' } }), null, 'json solo https')
  assert.equal(leerNervio(null), null)
  assert.equal(leerNervio('cualquier cosa'), null)
})

test('nervio: un candidato de medio no sube, no es absoluto y solo admite * entero', () => {
  assert.equal(candidatoMedio('medio:vsl2/2026-10-17/vsl2.mp4'), 'medio:vsl2/2026-10-17/vsl2.mp4')
  assert.equal(candidatoMedio('medio:vsl2/../x.mp4'), null)
  assert.equal(candidatoMedio('medio:vsl2//x.mp4'), null)
  assert.equal(candidatoMedio('medio:vsl2/a*/x.mp4'), null)
  assert.equal(candidatoMedio('medio:VSL2/x.mp4'), null)
  assert.equal(candidatoMedio('file:///etc/passwd'), null)
  assert.equal(candidatoMedio('env:PATH'), null, 'una variable que no es *_URL no sale')
  assert.equal(candidatoMedio('https://videos.ejemplo.mx/v/abc/'), 'https://videos.ejemplo.mx/v/abc/')
})

test('nervio: qué hace el clic (medio > vista previa > ir > estado)', () => {
  assert.equal(accionDe({ medio: { src: ['medio:a/b.mp4'] } }, 'doc:x.md'), 'medio')
  assert.equal(accionDe({ previa: true }, 'https://ejemplo.mx/aplicar'), 'previa')
  assert.equal(accionDe({ previa: true }, 'doc:x.md'), 'enlace', 'la vista previa es solo para https')
  assert.equal(accionDe({ estado: { tipo: 'launchd', label: 'com.arbrain.x' } }, undefined), 'estado')
  assert.equal(accionDe(null, 'doc:x.md'), 'enlace')
  assert.equal(accionDe(null, undefined), null)
})

test('nervio: la misma fuente en dos nodos se pide una vez', () => {
  const f = { tipo: 'json', url: 'https://ejemplo.mx/api/ht/huecos', valor: 'quedan', total: 'tope' }
  const els = [{ nervio: { estado: f } }, { nervio: { estado: { ...f } } }, { nervio: { medio: { src: 'medio:a/b.mp4' } } }, {}]
  const n = necesidades(els)
  assert.equal(n.fuentes.length, 1)
  assert.equal(n.medios.length, 1)
  assert.deepEqual(n.medios[0].src, ['medio:a/b.mp4'], 'un src suelto se vuelve lista')
})

test('nervio: el formato de un contador y la lectura de launchctl', () => {
  const f = { tipo: 'json' as const, url: 'https://ejemplo.mx/api/ht/huecos', valor: 'quedan', total: 'tope', formato: '{valor} de {total} libres' }
  assert.equal(formatear(f, 30, 40), '30 de 40 libres')
  assert.equal(formatear({ ...f, formato: undefined }, 30, 40), '30 de 40')
  assert.equal(formatear(f, undefined, 40), null, 'sin valor no hay número: falta de medición no es cero')
  assert.deepEqual(leerLaunchctl('{\n\t"LastExitStatus" = 256;\n\t"PID" = 812;\n}'), { codigo: 256, pid: 812 })
  assert.deepEqual(leerLaunchctl('{\n\t"LastExitStatus" = 0;\n}'), { codigo: 0, pid: null })
})

test('nervio: el semáforo de un cron es honesto', () => {
  const ahora = Date.parse('2026-10-14T12:00:00Z')
  const base: LecturaLaunchd = { cargado: true, codigo: 0, corriendo: false, atrasoS: 600, ultima: ahora - 60_000, error: null, bytesError: 0, linea: '[APLICAR] pipeline HT' }
  assert.deepEqual(evaluarLaunchd(base, ahora), { semaforo: 'verde', texto: 'hace 1 min', detalle: '[APLICAR] pipeline HT' })
  assert.equal(evaluarLaunchd({ ...base, cargado: false }, ahora).semaforo, 'rojo')
  assert.equal(evaluarLaunchd({ ...base, codigo: 1 }, ahora).texto, 'falló (código 1)')
  assert.equal(evaluarLaunchd({ ...base, ultima: ahora - 3600_000 }, ahora).semaforo, 'ambar', 'escribe cada corrida y calla 1 h')
  assert.deepEqual(evaluarLaunchd({ ...base, atrasoS: null, ultima: ahora - 2 * 86400_000 }, ahora).semaforo, 'verde', 'sin atraso declarado no se juzga el silencio')
  assert.equal(evaluarLaunchd({ ...base, error: ahora - 30_000, bytesError: 80 }, ahora).semaforo, 'ambar', 'errores después de la última salida')
  assert.equal(evaluarLaunchd({ ...base, ultima: null }, ahora).semaforo, 'gris')
  const diaria = { ...base, atrasoS: 26 * 3600, ultima: ahora - 6 * 3600_000 }
  assert.equal(evaluarLaunchd(diaria, ahora).semaforo, 'verde', 'la diaria de las 06:10 va bien a las 12')
  assert.equal(evaluarLaunchd({ ...diaria, ultima: ahora - 30 * 3600_000 }, ahora).semaforo, 'ambar')
})

// ── La pastilla viva ──

const caja = (id: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'shape', x, y, width, height, zIndex: 2, rotation: 0, opacity: 1, locked: false, ...extra }) as unknown as CanvasElement

test('pastilla con nervio: estado y medio en la pastilla; mínima cuando no cabe; sin dato es gris', () => {
  const medio = { src: ['medio:arbrain-medios/vsl2/vsl2.mp4'] }
  const fuente = { tipo: 'json' as const, url: 'https://ejemplo.mx/api/ht/huecos', valor: 'quedan', total: 'tope', formato: '{valor} de {total} libres' }
  const els = [
    caja('vsl2', 0, 0, 320, 200, { nervio: { medio, rotulo: 'VSL2' } }),
    caja('agenda', 0, 400, 320, 200, { link: 'https://ejemplo.mx/aplicar', nervio: { previa: true, estado: fuente, rotulo: '/aplicar' } }),
  ]
  const vivo: VivoNervio = {
    medios: new Map<string, MedioResuelto>([[claveMedio(medio), { ok: true, tipo: 'archivo', url: '/x', duracion: 717.1 }]]),
    estados: new Map<string, EstadoVivo>([[claveFuente(fuente), { semaforo: 'verde', texto: '30 de 40 libres', medidoEn: '' }]]),
  }
  const p = pastillasDe(els, 1, undefined, vivo)
  assert.deepEqual(p.map(q => [q.id, q.accion, q.glifo, q.semaforo, q.etiqueta]), [
    ['vsl2', 'medio', 'play', null, 'VSL2 · 11:57'],
    ['agenda', 'previa', 'previa', 'verde', '30 de 40 libres · /aplicar'],
  ])
  // Sin estado medido todavía: gris, nunca verde.
  const sin = pastillasDe(els, 1)
  assert.equal(sin[1].semaforo, 'gris')
  assert.equal(sin[1].etiqueta, 'midiendo… · /aplicar')
  // A zoom chico la etiqueta larga no cabe: queda el rótulo corto; más chico, solo punto y glifo.
  const chico = pastillasDe(els, 0.4, undefined, vivo)
  assert.deepEqual(chico.map(q => q.etiqueta), ['VSL2', '/aplicar'])
  const minimo = pastillasDe(els, 0.22, undefined, vivo)
  assert.deepEqual(minimo.map(q => [q.etiqueta, q.glifo]), [['', 'play'], ['', 'previa']])
  // Un enlace sin nervio sigue igual que siempre.
  const [solo] = pastillasDe([caja('d', 0, 0, 600, 200, { link: 'doc:docs/x.md' })], 1)
  assert.equal(solo.accion, undefined)
  assert.equal(solo.etiqueta, 'Abrir documento ↗')
})

test('pastilla con nervio: no se mete bajo un chip que va a caballo del borde', () => {
  const els = [
    caja('c', 0, 0, 320, 200, { nervio: { medio: { src: ['medio:a/b.mp4'] }, rotulo: 'VSL2' } }),
    caja('c:chip', 220, -20, 86, 38, { zIndex: 4 }),          // «HOY», centro fuera de la tarjeta
  ]
  const [p] = pastillasDe(els, 1)
  assert.ok(p.y > 100, `bajó a la esquina libre (y=${p.y})`)
})

test('rótulo: el medio sin archivo lo dice en la pastilla', () => {
  const n = leerNervio({ medio: { src: 'medio:a/b.mp4' }, rotulo: 'VSL2' })!
  const vivo: VivoNervio = { estados: new Map(), medios: new Map([[claveMedio(n.medio!), { ok: false, error: 'no existe' }]]) }
  assert.equal(rotuloDe(n, 'medio', vivo, null).completo, 'VSL2 · sin archivo')
})

// ── El servidor de medios: lista cerrada, Range ──

function carpetaDeMedios() {
  const raiz = mkdtempSync(path.join(tmpdir(), 'nervio-'))
  const medios = path.join(raiz, 'medios'), vsl2 = path.join(raiz, 'vsl2'), fuera = path.join(raiz, 'fuera')
  for (const d of [medios, path.join(vsl2, '2026-10-13-1742'), path.join(vsl2, '2026-10-17-1900'), fuera, path.join(medios, '.oculto')]) mkdirSync(d, { recursive: true })
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))
  writeFileSync(path.join(medios, 'corte.mp4'), bytes)
  writeFileSync(path.join(medios, '.oculto', 'x.mp4'), bytes)
  writeFileSync(path.join(medios, 'notas.txt'), 'hola')
  writeFileSync(path.join(fuera, 'secreto.mp4'), bytes)
  symlinkSync(path.join(fuera, 'secreto.mp4'), path.join(medios, 'atajo.mp4'))
  writeFileSync(path.join(vsl2, '2026-10-13-1742', 'vsl2.mp4'), bytes.subarray(0, 10))
  writeFileSync(path.join(vsl2, '2026-10-17-1900', 'vsl2.mp4'), bytes.subarray(0, 20))
  utimesSync(path.join(vsl2, '2026-10-13-1742', 'vsl2.mp4'), new Date('2026-10-13'), new Date('2026-10-13'))
  utimesSync(path.join(vsl2, '2026-10-17-1900', 'vsl2.mp4'), new Date('2026-10-17'), new Date('2026-10-17'))
  return { raices: { 'arbrain-medios': medios, vsl2 }, fuera }
}

const codigo = async (p: Promise<unknown>) => { try { await p; return 200 } catch (e) { return e instanceof ErrorMedio ? e.status : 500 } }

test('medios: solo la lista cerrada; nada de subir, ocultos, symlinks hacia fuera ni otros tipos', async () => {
  const { raices, fuera } = carpetaDeMedios()
  const a = await resolverArchivo('medio:arbrain-medios/corte.mp4', raices)
  assert.equal(a.ruta, 'medio:arbrain-medios/corte.mp4')
  assert.equal(a.bytes, 1000)
  assert.equal(await codigo(resolverArchivo('medio:arbrain-medios/../fuera/secreto.mp4', raices)), 403)
  assert.equal(await codigo(resolverArchivo(`medio:otra/${fuera}/secreto.mp4`, raices)), 403)
  assert.equal(await codigo(resolverArchivo(`${fuera}/secreto.mp4`, raices)), 403, 'una ruta absoluta no es un medio')
  assert.equal(await codigo(resolverArchivo('medio:arbrain-medios/.oculto/x.mp4', raices)), 403)
  assert.equal(await codigo(resolverArchivo('medio:arbrain-medios/atajo.mp4', raices)), 404, 'el symlink apunta fuera: no existe para el lienzo')
  assert.equal(await codigo(resolverArchivo('medio:arbrain-medios/notas.txt', raices)), 404, 'solo audio y video')
  assert.equal(await codigo(resolverArchivo('medio:arbrain-medios/no-existe.mp4', raices)), 404)
})

test('medios: * elige el corte más reciente del pipeline', async () => {
  const { raices } = carpetaDeMedios()
  const a = await resolverArchivo('medio:vsl2/*/vsl2.mp4', raices)
  assert.equal(a.ruta, 'medio:vsl2/2026-10-17-1900/vsl2.mp4')
})

test('medios: la URL estable manda; una variable sin definir pasa al siguiente candidato', async () => {
  const { raices } = carpetaDeMedios()
  const src = ['env:HT_VSL2_URL', 'medio:vsl2/*/vsl2.mp4']
  const local = await resolverMedio(src, { raices, env: {} })
  assert.equal(local.tipo, 'archivo')
  assert.match(local.url!, /^\/api\/canvas\/nervio\/medio\/flujo\?m=medio%3Avsl2%2F2026-10-17-1900%2Fvsl2.mp4&v=/)
  const sfcast = await resolverMedio(src, { raices, env: { HT_VSL2_URL: 'https://videos.ejemplo.mx/v/abc/' } })
  assert.deepEqual([sfcast.tipo, sfcast.url, sfcast.origen], ['embed', 'https://videos.ejemplo.mx/v/abc/', 'env:HT_VSL2_URL'])
  const directo = await resolverMedio(src, { raices, env: { HT_VSL2_URL: 'https://cdn.ejemplo.com/vsl2.mp4' } })
  assert.equal(directo.tipo, 'url')
  const malo = await resolverMedio(['env:HT_VSL2_URL'], { raices, env: { HT_VSL2_URL: 'sk-no-es-url' } })
  assert.equal(malo.ok, false, 'un valor que no es https no sale al navegador')
  assert.equal(malo.url, undefined)
})

test('medios: Range devuelve 206 con los bytes exactos, 416 fuera del archivo y 200 entero', async () => {
  const { raices } = carpetaDeMedios()
  const a = await resolverArchivo('medio:arbrain-medios/corte.mp4', raices)
  const r = responderArchivo(a, 'bytes=10-19')
  assert.equal(r.status, 206)
  assert.equal(r.headers.get('content-range'), 'bytes 10-19/1000')
  assert.equal(r.headers.get('accept-ranges'), 'bytes')
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  const cola = responderArchivo(a, 'bytes=-5')
  assert.equal(cola.headers.get('content-range'), 'bytes 995-999/1000')
  assert.equal(responderArchivo(a, 'bytes=2000-').status, 416)
  const todo = responderArchivo(a, null)
  assert.equal(todo.status, 200)
  assert.equal((await todo.arrayBuffer()).byteLength, 1000)
})
