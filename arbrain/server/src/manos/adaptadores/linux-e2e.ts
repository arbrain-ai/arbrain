/**
 * Prueba de punta a punta de la pantalla virtual (adaptador `linux`) en un servidor Linux real (1 nov 2026).
 *
 * Corre como el usuario de Arbrain (sin root) en un servidor donde root ya corrió `nube.sh pantalla`. Pasa por la MISMA
 * capa que ven Claude y Codex: `handle()` del servidor MCP de manos (`tools/list`, `tools/call`) con Grabadora → Freno →
 * Vigía → adaptador linux → ManosLinux (AT-SPI + X). Nada de coordenadas escritas a mano: todo por refs del árbol.
 *
 * El guion (https://httpbin.org/forms/post, un formulario de prueba público que no guarda nada):
 *   1. `navegar` abre el formulario en el Chrome de la pantalla virtual (la primera llamada enciende la pantalla);
 *   2. `observar` lee el título y los campos;
 *   3. `actuar` escribe el nombre; el teléfono y el correo primero SIN cita (el freno los frena: transmitir datos) y luego
 *      con la cita de la persona; elige «Medium»;
 *   4. `verificar` comprueba los valores por accesibilidad;
 *   5. «Submit order» sin cita: el freno lo detiene (enviar) y la página sigue en /forms/post. Lo mismo en la edición
 *      cliente (la del alumno), donde además nadie dictó nada en el chat;
 *   6. captura PNG de la pantalla y consumo (memoria) de la pantalla y del navegador.
 *
 * Salida: una línea `@@PASO@@{json}` por comprobación y `@@RESULTADO@@{json}` al final; sale con 1 si algo obligatorio
 * falla. Uso: npx tsx src/manos/adaptadores/linux-e2e.ts <carpeta-de-trabajo>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] || join(process.env.HOME || '/tmp', 'manos-linux-e2e')
mkdirSync(DIR, { recursive: true })
// Lo que leen el registro y la edición se fija ANTES de cargar los módulos de manos.
process.env.MANOS_ADAPTADOR = 'linux'
process.env.MANOS_BITACORA_DIR ??= join(DIR, 'bitacora')
process.env.MANOS_RECETAS_DIR ??= join(DIR, 'recetas')

const URL_FORM = 'https://httpbin.org/forms/post'
const CITA = 'llena el formulario de prueba con mi teléfono 4431234567 y mi correo prueba@ejemplo.com, pero no lo envíes'
const pasos: { paso: string; ok: boolean; obligatorio: boolean; ms: number; detalle: string }[] = []
let id = 1

async function main() {
  const { handle } = await import('../mcp-stdio.js')
  const { AdaptadorLinux } = await import('./linux.js')
  const { componerManos } = await import('../registro.js')
  const { Freno } = await import('../freno.js')
  const llamar = async (name: string, args: Record<string, unknown>) => {
    const r = await handle({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }) as any
    return { texto: String(r?.result?.content?.[0]?.text ?? r?.error?.message ?? ''), error: !!r?.result?.isError }
  }
  const paso = async (nombre: string, f: () => Promise<{ ok: boolean; detalle: string }>, obligatorio = true) => {
    const t0 = performance.now()
    let r: { ok: boolean; detalle: string }
    try { r = await f() } catch (e) { r = { ok: false, detalle: `excepción: ${(e as Error).message}` } }
    const p = { paso: nombre, ok: r.ok, obligatorio, ms: Math.round(performance.now() - t0), detalle: r.detalle.slice(0, 600) }
    pasos.push(p)
    console.log(`@@PASO@@${JSON.stringify(p)}`)
    return r.ok
  }
  const refDe = (texto: string, rol: string, etiqueta: string) => texto.match(new RegExp(`\\[(e\\d+)\\] ${rol} «${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))?.[1]

  // Diagnóstico propio (sin pasar por el MCP): estado de la pantalla antes, con su consumo.
  const diag = new AdaptadorLinux({ quien: 'e2e' })
  const consumo: Record<string, unknown> = {}

  await paso('salud del ayudante (pantalla, AT-SPI, navegador, marcador)', async () => {
    const s = await diag.salud()
    return { ok: s.ok, detalle: s.detalle }
  })
  await paso('tools/list: las herramientas de manos están (computer use disponible en Linux con pantalla)', async () => {
    const r = await handle({ jsonrpc: '2.0', id: id++, method: 'tools/list', params: {} }) as any
    const nombres = (r?.result?.tools ?? []).map((t: any) => t.name)
    return { ok: ['observar', 'actuar', 'navegar', 'verificar'].every(n => nombres.includes(n)), detalle: nombres.join(', ') }
  })

  let ventana = 0
  await paso('navegar: abre el formulario en el Chrome de la pantalla virtual', async () => {
    const r = await llamar('navegar', { url: URL_FORM, pedido: CITA })
    const j = JSON.parse(r.texto)
    ventana = j.ventana
    consumo.con_navegador = await diag.estadoPantalla()
    return { ok: !r.error && j.ok && /httpbin\.org\/forms\/post/.test(j.url ?? ''), detalle: r.texto }
  })

  let arbol = ''
  await paso('observar: lee el título y los campos del formulario', async () => {
    const r = await llamar('observar', { ventana })
    arbol = r.texto
    const campos = ['Customer name:', 'Telephone:', 'E-mail address:', 'Small', 'Medium', 'Large', 'Submit order'].filter(c => arbol.includes(`«${c}»`))
    return { ok: !r.error && campos.length === 7 && arbol.includes('httpbin.org/forms/post'), detalle: `${arbol.split('\n')[0]} · campos: ${campos.join(' | ')}` }
  })
  const ref = (rol: string, etiqueta: string) => refDe(arbol, rol, etiqueta)
  const releer = async () => { arbol = (await llamar('observar', { ventana, solo_cambios: false })).texto }

  await paso('actuar: escribe el nombre', async () => {
    const r = await llamar('actuar', { ventana, accion: 'escribir', ref: ref('AXTextField', 'Customer name:'), texto: 'Fulano Prueba' })
    return { ok: !r.error && /"efecto":"confirmado"/.test(r.texto), detalle: r.texto }
  })
  await releer()
  await paso('freno: el teléfono en un formulario web SIN cita se frena (transmitir datos)', async () => {
    const r = await llamar('actuar', { ventana, accion: 'escribir', ref: ref('AXTextField', 'Telephone:'), texto: '4431234567' })
    return { ok: r.error && /"efecto":"bloqueado"/.test(r.texto) && /transmitir_datos/.test(r.texto), detalle: r.texto }
  })
  await paso('actuar: el teléfono con la cita de la persona', async () => {
    const r = await llamar('actuar', { ventana, accion: 'escribir', ref: ref('AXTextField', 'Telephone:'), texto: '4431234567', confirmacion: CITA })
    return { ok: !r.error && /"efecto":"confirmado"/.test(r.texto), detalle: r.texto }
  })
  await releer()
  await paso('actuar: el correo con la cita de la persona', async () => {
    const r = await llamar('actuar', { ventana, accion: 'escribir', ref: ref('AXTextField', 'E-mail address:'), texto: 'prueba@ejemplo.com', confirmacion: CITA })
    return { ok: !r.error && /"efecto":"confirmado"/.test(r.texto), detalle: r.texto }
  })
  await releer()
  await paso('actuar: elige el tamaño «Medium»', async () => {
    const r = await llamar('actuar', { ventana, accion: 'click', ref: ref('AXRadioButton', 'Medium') })
    return { ok: !r.error && /"ok":true/.test(r.texto), detalle: r.texto }
  })
  await paso('verificar: los valores quedaron, leídos por accesibilidad', async () => {
    const r = await llamar('verificar', { ventana, espera: [
      { rol: 'AXTextField', etiqueta_contiene: 'Customer name', valor: 'Fulano Prueba' },
      { rol: 'AXTextField', etiqueta_contiene: 'Telephone', valor: '4431234567' },
      { rol: 'AXTextField', etiqueta_contiene: 'E-mail', valor: 'prueba@ejemplo.com' },
      { rol: 'AXRadioButton', etiqueta_contiene: 'Medium', seleccionado: true },
    ] })
    return { ok: /"cumple":true/.test(r.texto), detalle: r.texto }
  })
  await releer()
  await paso('freno: «Submit order» SIN cita queda bloqueado (enviar)', async () => {
    const r = await llamar('actuar', { ventana, accion: 'click', ref: ref('AXButton', 'Submit order') })
    return { ok: r.error && /"efecto":"bloqueado"/.test(r.texto) && /"categoria":"enviar"/.test(r.texto), detalle: r.texto }
  })
  await paso('la página sigue en el formulario: no se envió nada', async () => {
    await new Promise(res => setTimeout(res, 1500))
    const r = await llamar('observar', { ventana, consulta: 'Submit' })
    return { ok: /httpbin\.org\/forms\/post/.test(r.texto.split('\n')[0]) && r.texto.includes('Submit order'), detalle: r.texto.split('\n')[0] }
  })

  // Edición cliente (la del alumno): la misma acción, sin nada dictado en el chat, también se detiene.
  await paso('edición cliente: «Submit order» sin pedido de la persona también queda bloqueado', async () => {
    const antes = process.env.ARBRAIN_EDICION
    process.env.ARBRAIN_EDICION = 'cliente'
    const manos = componerManos(new AdaptadorLinux({ quien: 'e2e-cliente' }))
    try {
      const freno = (manos as any).interno as InstanceType<typeof Freno>
      freno.adoptar(ventana)
      const o = await manos.observar({ ventana, consulta: 'Submit' })
      const boton = o.elementos.find(e => e.rol === 'AXButton' && e.etiqueta === 'Submit order')
      const r = await manos.actuar({ ventana, pid: o.pid, accion: 'click', ref: boton?.ref })
      return { ok: r.efecto === 'bloqueado' && r.freno?.categoria === 'enviar', detalle: JSON.stringify(r) }
    } finally {
      await manos.cerrar()
      if (antes === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = antes
    }
  })

  await paso('captura PNG de la pantalla virtual', async () => {
    const ruta = await diag.captura({ ruta: join(DIR, 'pantalla-formulario.png') })
    return { ok: !!ruta, detalle: ruta }
  }, false)
  consumo.final = await diag.estadoPantalla().catch(e => ({ error: (e as Error).message }))
  await diag.cerrar()

  const fallas = pasos.filter(p => p.obligatorio && !p.ok)
  const resultado = { ok: fallas.length === 0, pasos: pasos.length, fallas: fallas.map(f => f.paso), consumo }
  writeFileSync(join(DIR, 'resultado.json'), JSON.stringify({ ...resultado, detalle: pasos }, null, 1))
  console.log(`@@RESULTADO@@${JSON.stringify(resultado)}`)
  process.exit(fallas.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
