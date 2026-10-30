/**
 * E2E de las manos completas contra apps reales, por la capa MCP (`ejecutarLienzo`), cada prueba con su
 * verificación independiente (AX, portapapeles, píxeles o archivo):
 *
 *   TextEdit (documento propio en un .rtf temporal): doble clic, selección por arrastre, clic derecho → menú,
 *     rueda fina, pegar texto / imagen / archivos con portapapeles restaurado, grabar ventana a MP4,
 *     y el doble clic otra vez con la ventana en el monitor secundario (coordenadas con otra escala).
 *   sfmap (página propia): hover → globo del rail, trazo de lápiz, mover un elemento, seleccionar por recuadro, ojos+OCR.
 *   Freno: arrastre con via=hid sin la cita de Daniel → bloqueado.
 *
 *   cd arbrain/server && MANOS_CASA_SOCKET=… npx tsx src/manos/lienzo/e2e-lienzo.ts [--salida archivo.json] [--sin-monitor]
 *
 * Deja todo como estaba: el documento se cierra (autoguardado en el temporal), el portapapeles de Daniel vuelve,
 * la página de sfmap es la de pruebas.
 */
import { DUENO, DUENO_M } from '../../dueno.js'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ClienteCasa } from '../adaptadores/casa.js'
import { ejecutarLienzo } from './herramientas-lienzo.js'

const sh = promisify(execFile)
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const TE = 'com.apple.TextEdit', SF = 'com.saasfactory.sfmap'

interface Prueba { nombre: string; ok: boolean; detalle: string; ms: number }

async function main() {
  const c = new ClienteCasa(undefined, undefined, undefined, 'e2e-lienzo')
  const tool = async (n: string, a: any) => {
    const r = await ejecutarLienzo(n, a, () => c, undefined, 'e2e')
    if (r.error) throw new Error(r.text)
    return r
  }
  const resultados: Prueba[] = []
  const prueba = async (nombre: string, f: () => Promise<[boolean, string]>) => {
    const t = Date.now()
    try { const [ok, detalle] = await f(); resultados.push({ nombre, ok, detalle, ms: Date.now() - t }) }
    catch (e) { resultados.push({ nombre, ok: false, detalle: `excepción: ${(e as Error).message.slice(0, 300)}`, ms: Date.now() - t }) }
    const u = resultados[resultados.length - 1]
    console.log(`${u.ok ? '✅' : '❌'} ${u.nombre} (${u.ms} ms): ${u.detalle}`)
  }
  const pbAntes = await c.llamar('portapapeles', { accion: 'leer' })

  // ---------- TextEdit: un documento propio ----------
  const dir = mkdtempSync(join(tmpdir(), 'manos-e2e-'))
  const doc = join(dir, 'e2e-manos.rtf')
  const lineas = ['zanahoria', 'lechuga tomate', ...Array.from({ length: 80 }, (_, i) => `renglón ${i + 3} para la rueda`)]
  writeFileSync(doc, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs36 ${lineas.join('\\par\n')}}`)
  const pidTE = (await c.llamar('abrir', { app: TE })).pid
  const antes = new Set((await c.llamar('ventanas', { pid: pidTE })).map((v: any) => v.id))
  await sh('open', ['-g', '-a', 'TextEdit', doc])
  let win: any
  for (let i = 0; i < 40 && !win; i++) { await esperar(150); win = (await c.llamar('ventanas', { pid: pidTE })).find((v: any) => !antes.has(v.id) && v.marco.h > 200) }
  if (!win) throw new Error('TextEdit no abrió el documento de prueba')
  const V = { app: TE, ventana: win.id }
  await c.llamar('colocar', { ...V, x: 80, y: 120 })
  await esperar(300)
  win = (await c.llamar('ventanas', { pid: pidTE })).find((v: any) => v.id === win.id)
  const texto = async () => String(((await c.llamar('observar', { ...V, max_elementos: 300 })).elementos ?? []).find((e: any) => e.rol === 'AXTextArea')?.valor ?? '')
  const ocr = async (buscar: string) => {
    const r = await c.llamar('ojos', { ...V, ruta: join(dir, 'o.png'), buscar })
    return (r.textos ?? []) as { texto: string; centro: [number, number]; x: number; y: number; w: number; h: number }[]
  }
  // Lo seleccionado se LEE por AX (op `seleccion`): verificar sin tocar el portapapeles de Daniel.
  const copiado = async () => { await esperar(150); return String((await c.llamar('seleccion', V)).seleccion ?? '') }

  const dobleClic = async (etiqueta: string): Promise<[boolean, string]> => {
    const z = (await ocr('zanahoria')).find(t => /zanahoria/i.test(t.texto))
    if (!z) return [false, 'el OCR no encontró «zanahoria»']
    await tool('clic_xy', { ...V, x: z.centro[0], y: z.centro[1], veces: 2 })
    const sel = await copiado()
    return [sel.trim() === 'zanahoria', `${etiqueta}: OCR ubicó la palabra en (${z.centro}), doble clic → copiado «${sel.trim()}»`]
  }
  await prueba('doble clic (TextEdit)', () => dobleClic('monitor principal'))

  await prueba('seleccionar arrastrando (TextEdit)', async () => {
    const l = (await ocr('lechuga')).find(t => /lechuga/i.test(t.texto))
    if (!l) return [false, 'sin OCR de «lechuga tomate»']
    await tool('trazar', { ...V, puntos: [[l.x - 2, l.centro[1]], [l.x + l.w + 3, l.centro[1]]], velocidad: 400 })
    const sel = await copiado()
    return [sel.trim() === 'lechuga tomate', `arrastre de (${Math.round(l.x)},${l.centro[1]}) a (${Math.round(l.x + l.w)},${l.centro[1]}) → «${sel.trim()}»`]
  })

  await prueba('clic derecho → menú contextual (TextEdit)', async () => {
    const z = (await ocr('zanahoria'))[0]
    await tool('clic_xy', { ...V, x: z.centro[0], y: z.centro[1], boton: 'derecho', devolver_foco: false })
    await esperar(400)
    const menus: string[][] = (await c.llamar('seleccion', { app: TE })).menus ?? []
    const items = menus.flat().filter(t => /^(Copiar|Copy|Pegar|Paste|Cortar|Cut)/.test(t))
    await c.llamar('actuar', { app: TE, accion: 'tecla', tecla: 'escape' })
    await tool('clic_xy', { ...V, x: 40, y: win.marco.h - 30 }) // cierra el menú si quedó abierto y pone el cursor de texto abajo
    return [items.length > 0, `menú contextual con ${menus.flat().length} opciones (${items.slice(0, 4).join(', ')})`]
  })

  await prueba('rueda fina (TextEdit)', async () => {
    const barra = async () => Number(((await c.llamar('observar', { ...V, max_elementos: 300 })).elementos ?? []).find((e: any) => e.rol === 'AXScrollBar' && e.marco.h > e.marco.w)?.valor ?? NaN)
    const a = await barra()
    await tool('rueda', { ...V, x: win.marco.w / 2, y: win.marco.h / 2, dy: -600, pasos: 12 })
    await esperar(300)
    const b = await barra()
    await tool('rueda', { ...V, x: win.marco.w / 2, y: win.marco.h / 2, dy: 600, pasos: 6 })
    return [b > a, `barra vertical ${a.toFixed(3)} → ${b.toFixed(3)}`]
  })

  await prueba('pegar texto con portapapeles restaurado (TextEdit)', async () => {
    const pb0 = await c.llamar('portapapeles', { accion: 'leer' })
    const marca = `pegado-por-manos-${Math.random().toString(36).slice(2, 7)}`
    await tool('pegar', { ...V, texto: marca, x: 60, y: win.marco.h - 30 })
    await esperar(200)
    const t = await texto()
    const pb1 = await c.llamar('portapapeles', { accion: 'leer' })
    const igual = (pb1.texto ?? null) === (pb0.texto ?? null)
    return [t.includes(marca) && igual, `texto en el documento ${t.includes(marca)} · portapapeles de ${DUENO} igual que antes ${igual}`]
  })

  await prueba('pegar imagen (TextEdit)', async () => {
    const png = join(dir, 'punto.png')
    await sh('sips', ['-s', 'format', 'png', '-z', '24', '24', '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/AlertNoteIcon.icns', '--out', png]).catch(() => {})
    if (!existsSync(png)) return [false, 'no pude preparar la imagen']
    const n0 = (await texto()).split('\uFFFC').length
    await tool('pegar', { ...V, imagen: png })
    await esperar(300)
    const n1 = (await texto()).split('\uFFFC').length
    return [n1 > n0, `adjuntos en el texto ${n0 - 1} → ${n1 - 1}`]
  })

  await prueba('pegar archivos como desde Finder (TextEdit)', async () => {
    const arch = join(dir, 'nota-manos.txt')
    writeFileSync(arch, 'archivo de prueba de las manos\n')
    const n0 = (await texto()).split('\uFFFC').length
    await tool('pegar', { ...V, archivos: [arch] })
    await esperar(300)
    const t = await texto()
    const n1 = t.split('\uFFFC').length
    // TextEdit pega un archivo como adjunto (RTFD) o como su ruta/nombre (RTF): cualquiera prueba que llegó.
    return [n1 > n0 || t.includes('nota-manos'), `adjuntos ${n0 - 1} → ${n1 - 1}, nombre en el texto ${t.includes('nota-manos')} (archivo ${arch})`]
  })

  await prueba('grabar ventana a MP4 (TextEdit)', async () => {
    const ruta = join(dir, 'grabacion.mp4')
    await tool('grabar', { accion: 'iniciar', ...V, ruta, grabacion: 'e2e' })
    await tool('rueda', { ...V, x: win.marco.w / 2, y: win.marco.h / 2, dy: -400, pasos: 20 })
    await esperar(2200)
    const r = JSON.parse((await tool('grabar', { accion: 'parar', grabacion: 'e2e' })).text)
    const { stdout } = await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', ruta]).catch(() => ({ stdout: '{}' }))
    const p = JSON.parse(stdout)
    const dur = Number(p.format?.duration ?? 0)
    return [statSync(ruta).size > 10_000 && dur > 1.5, `${ruta}: ${Math.round(statSync(ruta).size / 1024)} KB, ${dur.toFixed(1)} s, ${p.streams?.[0]?.width}×${p.streams?.[0]?.height}`]
  })

  if (!process.argv.includes('--sin-monitor')) {
    const pantallas = (await c.llamar('ventanas', {})).filter((v: any) => v.marco.x >= 1920 && v.marco.h <= 40)
    if (pantallas.length) {
      await prueba('doble clic en el monitor secundario (otra escala)', async () => {
        await c.llamar('colocar', { ...V, x: 2300, y: 200 })
        await esperar(400)
        win = (await c.llamar('ventanas', { pid: pidTE })).find((v: any) => v.id === win.id)
        const r = await dobleClic(`ventana en (${win.marco.x},${win.marco.y})`)
        const esc = (await c.llamar('ojos', { ...V, ruta: join(dir, 'o2.png'), ocr: false })).escala
        await c.llamar('colocar', { ...V, x: 80, y: 120 })
        return [r[0], `${r[1]} · escala ${esc}`]
      })
    }
  }

  // Cerrar el documento propio (autoguardado en el temporal: sin hoja).
  await c.llamar('actuar', { ...V, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] })

  // ---------- sfmap: página de pruebas ----------
  if (!process.argv.includes('--sin-sfmap')) {
  const pidSF = (await c.llamar('abrir', { app: SF })).pid
  const vsf = (await c.llamar('ventanas', { pid: pidSF })).filter((v: any) => v.en_pantalla && v.marco.h > 300).sort((a: any, b: any) => b.z - a.z)[0]
  const S = { app: SF, ventana: vsf.id }
  // Guarda: solo una página de pruebas. Nunca dibujar en un lienzo de Daniel.
  const titulo = String(((await c.llamar('observar', { ...S, max_elementos: 8 })).elementos ?? []).find((e: any) => e.rol === 'AXStaticText')?.etiqueta ?? '')
  if (!/Pruebas manos|Perrito de las manos/.test(titulo)) throw new Error(`sfmap tiene abierta «${titulo}», no una página de pruebas: no se toca`)
  const pixel = async (pts: number[][]) => ((await c.llamar('pixel', { ...S, puntos: pts })).colores as { hex: string }[]).map(x => x.hex)
  const oscuro = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) < 120 }

  await prueba('ojos + OCR ubican texto y el clic cae ahí (sfmap)', async () => {
    const r = await c.llamar('ojos', { ...S, ruta: join(dir, 's.png') })
    const t = (r.textos ?? []).find((x: any) => /ESPACIOS/i.test(x.texto))
    if (!t) return [false, 'sin «ESPACIOS» en el OCR']
    const d = await c.llamar('clic_xy', { ...S, x: t.centro[0], y: t.centro[1], solo_mirar: true })
    return [/ESPACIOS/i.test(d.debajo?.valor ?? d.debajo?.titulo ?? d.debajo?.descripcion ?? ''), `OCR «${t.texto}» en (${t.centro}) · escala ${r.escala} · AX debajo: ${JSON.stringify(d.debajo)}`]
  })

  await prueba('hover muestra el globo del rail (sfmap)', async () => {
    const o = await c.llamar('observar', { ...S, max_elementos: 200 })
    const botones = (o.elementos ?? []).filter((e: any) => e.rol === 'AXButton' && e.marco.w > 40 && e.marco.w < 70 && e.marco.x - vsf.marco.x < 500)
    const b = botones[botones.length - 1]
    if (!b) return [false, 'sin botones del rail']
    const x = b.marco.x - vsf.marco.x + b.marco.w / 2, y = b.marco.y - vsf.marco.y + b.marco.h / 2
    const antes = ((await c.llamar('ojos', { ...S, ruta: join(dir, 'h0.png') })).textos ?? []).map((t: any) => t.texto)
    await tool('pasar_encima', { ...S, x, y, quedarse_ms: 1500 })
    const despues = ((await c.llamar('ojos', { ...S, ruta: join(dir, 'h1.png') })).textos ?? []).map((t: any) => t.texto)
    const nuevos = despues.filter((t: string) => !antes.includes(t))
    return [nuevos.length > 0, `textos nuevos al pasar por encima: ${JSON.stringify(nuevos.slice(0, 4))}`]
  })

  // Un trazo propio para mover y seleccionar: esquina libre abajo a la derecha.
  const W = vsf.marco.w, H = vsf.marco.h
  const linea = [[W - 380, H - 300], [W - 260, H - 290], [W - 160, H - 300]]
  await prueba('trazo de lápiz queda pintado (sfmap)', async () => {
    await c.llamar('clic_xy', { ...S, x: W - 60, y: 140, devolver_foco: false })
    await c.llamar('actuar', { ...S, accion: 'tecla', tecla: 'p' })
    await tool('trazar', { ...S, puntos: linea, velocidad: 500 })
    await esperar(300)
    const h = await pixel([[W - 260, H - 290], [W - 320, H - 295], [W - 210, H - 295]])
    return [h.filter(oscuro).length >= 2, `píxeles sobre la línea: ${h.join(' ')}`]
  })

  await prueba('seleccionar por recuadro (sfmap)', async () => {
    await c.llamar('actuar', { ...S, accion: 'tecla', tecla: 'escape' })
    const pb0 = (await c.llamar('portapapeles', { accion: 'leer' })).cambios
    await tool('trazar', { ...S, puntos: [[W - 410, H - 340], [W - 130, H - 250]], velocidad: 600 })
    await c.llamar('actuar', { ...S, accion: 'tecla', tecla: 'c', modificadores: ['cmd'] })
    await esperar(200)
    const pb = await c.llamar('portapapeles', { accion: 'leer' })
    await c.llamar('portapapeles', { accion: 'restaurar' })
    return [pb.cambios !== pb0, `⌘C tras el recuadro cambió el portapapeles (${pb0} → ${pb.cambios}; tipos ${JSON.stringify(pb.tipos?.slice(0, 3))}): había selección`]
  })

  await prueba('mover un elemento arrastrándolo (sfmap)', async () => {
    await tool('trazar', { ...S, puntos: [[W - 260, H - 290], [W - 260, H - 160]], velocidad: 300 })
    await esperar(400)
    const [viejo] = await pixel([[W - 260, H - 290]])
    const [nuevo, n2] = await pixel([[W - 260, H - 160], [W - 320, H - 165]])
    await c.llamar('actuar', { ...S, accion: 'tecla', tecla: 'escape' })
    return [!oscuro(viejo) && (oscuro(nuevo) || oscuro(n2)), `donde estaba: ${viejo} · 130 pt abajo: ${nuevo} ${n2}`]
  })

  await prueba(`freno: via=hid sin la cita de ${DUENO}`, async () => {
    // Umbral inalcanzable: aunque Daniel lleve rato sin tocar el ratón, esta prueba nunca lo mueve.
    const umbral = process.env.MANOS_HID_INACTIVO_S
    process.env.MANOS_HID_INACTIVO_S = '1e9'
    const r = await ejecutarLienzo('trazar', { ...S, via: 'hid', puntos: [[W - 100, H - 100], [W - 90, H - 100]] }, () => c)
    if (umbral == null) delete process.env.MANOS_HID_INACTIVO_S; else process.env.MANOS_HID_INACTIVO_S = umbral
    return [!!r.error && /cursor_de_daniel/.test(r.text), r.text.slice(0, 120)]
  })
  await c.llamar('hover', { ...S, x: W - 40, y: 120, quedarse_ms: 30 }) // devuelve el foco

  }

  // Portapapeles de Daniel: igual que al empezar.
  // Daniel puede copiar mientras corre la prueba: lo que se exige es que NADA de lo nuestro quede en su portapapeles.
  const pbDespues = await c.llamar('portapapeles', { accion: 'leer' })
  const nuestro = /pegado-por-manos|zanahoria|renglón \d+ para la rueda|nota-manos/.test(String(pbDespues.texto ?? '')) || (pbDespues.archivos ?? []).some((a: string) => a.includes('manos-e2e-'))
  await prueba(`nada nuestro queda en el portapapeles de ${DUENO}`, async () => [!nuestro, `al empezar ${pbAntes.texto ? `${String(pbAntes.texto).length} car.` : '(sin texto)'} · al terminar ${pbDespues.texto ? `${String(pbDespues.texto).length} car.` : '(sin texto)'} · rastro nuestro ${nuestro}`])

  const ok = resultados.every(r => r.ok)
  const i = process.argv.indexOf('--salida')
  if (i >= 0) writeFileSync(process.argv[i + 1], JSON.stringify({ fecha: new Date().toISOString(), ok, resultados }, null, 2))
  console.log(`\n${resultados.filter(r => r.ok).length}/${resultados.length} en verde`)
  c.cerrar()
  process.exit(ok ? 0 : 1)
}

main().catch(e => { console.error('E2E_FALLO', e); process.exit(2) })
