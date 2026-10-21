/**
 * Regresiones desde la realidad: cada falla real de las manos queda aquí (o en un test unitario) como prueba
 * permanente. Mapa completo y cómo se agrega una nueva: docs/builds/manos-v1-estable-2026-10-02/REGRESION.md.
 *
 *   prankedy   (falla real del 2 oct, 17:15): Chrome sin árbol web + Enter que no navega. Guion sin modelo
 *              por la vía de respaldo (AXManualAccessibility): búsqueda → canal → Videos → 3.er video,
 *              silenciado y pausado en el mismo paso. Cierra su ventana al final.
 *
 * Las otras fallas reales viven como tests:
 *   - «Enter que envía» (WhatsApp, 2 oct): freno.test.ts › «las fallas reales del 2 oct».
 *   - «refs que caducan si otro agente observa»: concurrencia.ts › caso 2.
 *
 * `npx tsx src/manos/regresiones.ts [prankedy]`
 */
import type { Adaptador, Observacion } from './contrato.js'
import { cargarEntornoManos, componerManos } from './registro.js'
import { capa, ejecutarManos, Frescura } from './herramientas.js'
import { Freno } from './freno.js'
import { AlmacenRecetas } from './recetas.js'
import { Registro } from './bitacora.js'

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

async function buscarHasta(m: Adaptador, pid: number, ventana: number, f: (o: Observacion) => string | undefined, consulta?: string, ms = 10_000): Promise<{ ref: string; o: Observacion } | null> {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const o = await m.observar({ pid, ventana, max_elementos: 6000, ...(consulta ? { consulta } : {}) })
    const ref = f(o)
    if (ref) return { ref, o }
    await dormir(300)
  }
  return null
}

export async function regresionPrankedy(m: Adaptador = componerManos()): Promise<{ ok: boolean; detalle: string; url?: string; ms: number }> {
  const t0 = performance.now()
  const reg = new Registro('prueba', 'regresión: abre YouTube, busca Prankedy, métete a su canal y ponme el tercer video (guion)')
  const sink = { paso: (p: any) => reg.paso({ ...p, decidio: 'guion' }) }
  const x = (n: string, a: any) => ejecutarManos(n, a, m, () => { throw new Error('sin decisor') }, new AlmacenRecetas(), { bitacora: sink, frescura: new Frescura() })
  const nav = JSON.parse((await x('navegar', { url: 'https://www.youtube.com/results?search_query=Prankedy' })).text)
  if (!nav.ok) return { ok: false, detalle: `navegar: ${nav.detalle}`, ms: 0 }
  const { pid, ventana } = nav
  let detalle = '', url: string | undefined, ok = false
  try {
    const canal = await buscarHasta(m, pid, ventana, o => o.elementos.find(e => e.rol === 'AXLink' && /^Prankedy\b.*@Prankedy/i.test(e.etiqueta ?? ''))?.ref, 'Prankedy')
    if (!canal) throw new Error('no apareció el canal en los resultados')
    await m.actuar({ pid, ventana, accion: 'click', ref: canal.ref })
    const tab = await buscarHasta(m, pid, ventana, o => (/@Prankedy/i.test(o.url ?? '') ? o.elementos.find(e => /AXRadioButton|AXTab|AXLink/.test(e.rol) && /^Videos$/i.test(e.etiqueta ?? ''))?.ref : undefined), 'Videos')
    if (!tab) throw new Error('no entró al canal o no vio la pestaña Videos')
    await m.actuar({ pid, ventana, accion: 'click', ref: tab.ref })
    // El 3.er video: tercer encabezado de video de la cuadrícula (cada uno trae un enlace con la duración).
    // La SPA cambia la URL antes que el contenido: se exige la misma cuadrícula en dos lecturas seguidas.
    let previa = ''
    const tercero = await buscarHasta(m, pid, ventana, o => {
      if (!/\/videos/.test(o.url ?? '')) return undefined
      const vids = o.elementos.filter(e => e.rol === 'AXLink' && / \d+ (minutos?|segundos?)/.test(e.etiqueta ?? ''))
      const huella = vids.slice(0, 6).map(v => v.etiqueta).join('|')
      const estable = vids.length >= 3 && huella === previa
      previa = huella
      return estable ? vids[2].ref : undefined
    }, undefined, 15_000)
    if (!tercero) throw new Error('no vio 3 videos en la pestaña Videos')
    const titulo = tercero.o.elementos.find(e => e.ref === tercero.ref)?.etiqueta?.replace(/ \d+ minutos?.*$/, '')
    const r = await m.actuar({ pid, ventana, accion: 'click', ref: tercero.ref })
    const pag = await m.pagina!({ pid, ventana })
    url = pag.url
    ok = !!r.medios?.silenciado && !!r.medios?.pausado && /youtube\.com\/watch/.test(url ?? '')
    detalle = `3.er video «${titulo}» · ${url} · silenciado ${r.medios?.silenciado} · pausado ${r.medios?.pausado} (${Math.round(r.medios?.ms ?? 0)} ms)`
  } catch (e) {
    detalle = (e as Error).message
  } finally {
    await m.actuar({ pid, ventana, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] }).catch(() => null)
    await capa(m, Freno)?.soltar?.()
  }
  reg.verificacion = { ok, como: detalle }
  reg.cerrar(ok, { falla: ok ? undefined : `regresión prankedy: ${detalle}` })
  return { ok, detalle, url, ms: Math.round(performance.now() - t0) }
}

if (process.argv[1] && /regresiones\.(ts|js)$/.test(process.argv[1])) {
  cargarEntornoManos()
  process.env.MANOS_QUIEN ??= 'regresiones'
  const m = componerManos()
  regresionPrankedy(m).then(async r => {
    console.log(`${r.ok ? 'OK ' : 'MAL'} prankedy ${r.ms} ms · ${r.detalle}`)
    console.log(r.ok ? 'REGRESIONES_OK' : 'REGRESIONES_FALLO')
    await m.cerrar()
    process.exit(r.ok ? 0 : 1)
  })
}
