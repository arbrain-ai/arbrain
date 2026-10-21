/**
 * Herramientas de LIENZO de manos (2 oct 2026): lo que una app dibujada a mano pide y el árbol de
 * accesibilidad no da. Viven en ArbrainManos.app (Pluma.swift, Cielo.swift, Portapapeles.swift,
 * Grabadora.swift); aquí está el contrato que leen Claude y Codex, el freno y la bitácora.
 *
 *   trazar        arrastre continuo con trayectoria natural: lápiz, mover un elemento, seleccionar por recuadro
 *   clic_xy       clic izquierdo/derecho/medio, doble o triple, en coordenadas de la ventana (menús contextuales)
 *   pasar_encima  hover: el puntero viaja y se queda (tooltips, menús de hover)
 *   rueda         scroll fino en píxeles (con cmd/option: zoom en lienzos)
 *   ojos          captura de la ventana o una zona + OCR local con cajas; la imagen vuelve al cerebro para juicio visual
 *   seleccion     lo seleccionado y el menú contextual abierto, por AX (verificar sin portapapeles)
 *   portapapeles  leer, escribir (texto, imagen, archivos) y restaurar
 *   pegar         copia + ⌘V en una app + devuelve el portapapeles de Daniel (archivos de Finder incluidos)
 *   grabar        video MP4 de una ventana (b-roll), con o sin el cursor fantasma
 *
 * Todas van por SkyLight en segundo plano (sin mover el cursor real ni subir la ventana) salvo `via`.
 * Coordenadas SIEMPRE en puntos relativos a la ventana: px de `ojos` ÷ `escala` (Retina 2×, monitores mixtos).
 */
import { DUENO, DUENO_M, PERSONA_DUENO } from '../../dueno.js'
import { confirmacionHumana, categoriaDe } from '../confirmacion-humana.js'
import { execFile } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ClienteCasa } from '../adaptadores/casa.js'
import { frenar } from '../freno.js'
import type { ContextoAccion, PedidoActuar } from '../contrato.js'
import type { SinkBitacora } from '../herramientas.js'
import { etiquetaSegura } from '../bitacora.js'
import { modoVer, permisoHid, FRENO_CURSOR } from '../modo-ver.js'
import { esEdicionCliente } from '../../edicion.js'
import { juzgarLienzo, pasaLienzo } from './freno-lienzo.js'

const ejecutar = promisify(execFile)

const OBJETIVO = {
  // Carril U: en cliente el ejemplo no nombra una app de la instalación original.
  app: { type: 'string', description: `Bundle id (preferido, p. ej. ${esEdicionCliente() ? 'com.apple.Preview' : 'com.saasfactory.sfmap'}) o nombre visible.` },
  pid: { type: 'integer' },
  ventana: { type: 'integer', description: 'Id de ventana (de `ventanas`). Sin él, la de más arriba de esa app.' },
} as const
const PEDIDO = { type: 'string', description: `Las palabras de ${DUENO} que originan el encargo (primera llamada): van a la bitácora.` } as const
const VIA = { type: 'string', enum: ['fondo', 'frente', 'hid'], description: `fondo (por defecto): SkyLight, ni la ventana sube ni el cursor real se mueve. frente: la app pasa al frente durante el gesto y se ve el Halo; el ratón de ${DUENO} NO se mueve (los eventos van por SkyLight, no por HID). hid: el ratón REAL de ${DUENO}, ÚLTIMO RECURSO (arrastre fino que exige el ratón físico): solo con ${DUENO} inactivo un rato o con \`confirmacion\` = su cita que lo pida explícitamente («usa mi ratón»); se detiene si él lo mueve. «Quiero verte» NO es hid: usa frente y se ve el Halo.` } as const
const PUNTOS = { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: '[[x,y],…] en puntos relativos a la ventana.' } as const
const MODS = { type: 'array', items: { type: 'string', enum: ['cmd', 'shift', 'option', 'ctrl'] } } as const
const CONFIRMACION = { type: 'string', description: `Solo si el freno lo pide: cita textual del pedido de ${DUENO}.` } as const
const FOCO = { type: 'boolean', description: 'false: la app conserva el foco al terminar (cadenas de gestos sobre un panel que se cierra al perder el foco). Cierra la cadena con un gesto sin este campo.' } as const

export const MANOS_LIENZO_TOOLS = [
  {
    name: 'trazar',
    description: 'Arrastre continuo con el botón apretado y trayectoria natural (curva suave, acelera y frena, temblor mínimo, presión que respira). Sirve para dibujar con el lápiz de una app de lienzo, mover un elemento (de su centro al destino), seleccionar por recuadro (esquina a esquina) o arrastrar una barra. `trazos` dibuja varios sin soltar el control (la mano se posa entre uno y otro). En segundo plano por defecto: el cursor real no se mueve. Mira el resultado con `ojos`. Si el destino es una papelera o algo que borra, el freno lo detiene.',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        ...OBJETIVO, puntos: PUNTOS, trazos: { type: 'array', items: PUNTOS, description: 'Varios trazos [[[x,y],…],…].' },
        velocidad: { type: 'number', minimum: 30, maximum: 6000, description: 'Puntos por segundo en crucero (700 por defecto; rellenos ~1100).' },
        presion: { type: 'number', minimum: 0.05, maximum: 1 }, natural: { type: 'boolean', description: 'false: velocidad y presión constantes.' },
        parejo: { type: 'boolean', description: 'Ancho constante (rellenos en apps de tinta que leen presión).' },
        pausa_ms: { type: 'number', minimum: 0, maximum: 2000, description: 'Pausa entre trazos (por defecto 70–160 ms, como una mano).' },
        boton: { type: 'string', enum: ['izquierdo', 'derecho', 'medio'] }, modificadores: MODS, via: VIA, devolver_foco: FOCO,
        confirmacion: CONFIRMACION, pedido: PEDIDO,
      },
    },
  },
  {
    name: 'clic_xy',
    description: 'Clic por coordenadas cuando la app no expone el control por accesibilidad (vistas dibujadas, lienzos, paneles propios). `boton: derecho` abre el menú contextual (luego `observar` lo lee como menú). `veces: 2` = doble clic (renombrar, entrar), 3 = triple. `solo_mirar: true` dice qué hay debajo sin tocar. Antes de actuar mira qué elemento hay en ese punto y pasa el freno (borrar, enviar, pagar…).',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['x', 'y'],
      properties: {
        ...OBJETIVO, x: { type: 'number' }, y: { type: 'number' },
        boton: { type: 'string', enum: ['izquierdo', 'derecho', 'medio'] }, veces: { type: 'integer', minimum: 1, maximum: 3 },
        modificadores: MODS, via: VIA, devolver_foco: FOCO, solo_mirar: { type: 'boolean' }, confirmacion: CONFIRMACION, pedido: PEDIDO,
      },
    },
  },
  {
    name: 'pasar_encima',
    description: 'Hover: el puntero (fantasma; el real no se mueve) viaja a x,y o recorre `puntos` y se queda `quedarse_ms` para que aparezcan tooltips, previsualizaciones o menús que solo existen al pasar por encima.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...OBJETIVO, x: { type: 'number' }, y: { type: 'number' }, puntos: PUNTOS, quedarse_ms: { type: 'number', minimum: 0, maximum: 10000 }, via: VIA, confirmacion: CONFIRMACION, pedido: PEDIDO } },
  },
  {
    name: 'rueda',
    description: 'Scroll en una ventana que SÍ desplaza y lo comprueba: `dy`/`dx` en PÍXELES (positivo = bajar el contenido), repartidos en `pasos`. Sin x,y apunta al centro del contenido (en navegadores, la página). Si la rueda no mueve nada (listas virtuales de X o YouTube) prueba solo Av Pág/Re Pág y luego desplazarse al siguiente elemento, comparando la imagen antes y después; responde `desplazado` y la vía que funcionó, o `fallo`. En lienzos con cmd u option hace zoom (sin verificación). `lineas: true` para listas clásicas.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...OBJETIVO, x: { type: 'number' }, y: { type: 'number' }, dx: { type: 'number' }, dy: { type: 'number' }, pasos: { type: 'integer', minimum: 1, maximum: 60 }, lineas: { type: 'boolean' }, verificar: { type: 'boolean', description: 'false: no comprobar el desplazamiento (más rápido).' }, modificadores: MODS, via: VIA, confirmacion: CONFIRMACION, pedido: PEDIDO } },
  },
  {
    name: 'ojos',
    description: 'Ver como un humano cuando la accesibilidad no alcanza: captura la ventana (o una `zona` {x,y,w,h} en puntos), la manda a TU vista para juicio visual («¿se parece?», «¿dónde está X?») y agrega el texto que lee el OCR local (Vision) con su caja y centro en puntos de la ventana, listos para `clic_xy`. Funciona aunque la ventana esté tapada. Coordenadas correctas en Retina y con varios monitores (devuelve `escala`). Nada sale de la Mac salvo la imagen hacia el cerebro.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        ...OBJETIVO, zona: { type: 'object', additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
        ocr: { type: 'boolean', description: 'false: sin OCR (más rápido).' }, buscar: { type: 'string', description: 'Solo los textos que contengan esto.' },
        ver: { type: 'boolean', description: 'false: no devuelve la imagen (solo OCR y ruta).' }, max_px: { type: 'integer', minimum: 256, maximum: 2400, description: 'Lado mayor de la imagen que vuelve (1400 por defecto).' },
        pedido: PEDIDO,
      },
    },
  },
  {
    name: 'seleccion',
    description: 'Lee por accesibilidad lo que la app tiene seleccionado (texto) y las opciones de un menú contextual abierto, sin tocar el portapapeles. Úsalo para verificar un doble clic, una selección por arrastre o un clic derecho.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...OBJETIVO, pedido: PEDIDO } },
  },
  {
    name: 'portapapeles',
    description: `El portapapeles de la Mac. \`leer\` (tipos, texto recortado, si hay imagen o archivos), \`escribir\` texto / imagen (ruta) / archivos (rutas, como copiarlos en Finder) guardando antes lo que ${DUENO} tenía, y \`restaurar\` para devolvérselo. Para pegar en una app usa \`pegar\`, que restaura solo.`,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: { accion: { type: 'string', enum: ['leer', 'escribir', 'restaurar'] }, texto: { type: 'string' }, imagen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } }, confirmacion: CONFIRMACION, pedido: PEDIDO } },
  },
  {
    name: 'pegar',
    description: `Pega texto, una imagen (ruta) o archivos (rutas: lo mismo que arrastrarlos desde Finder a una app que los acepte) en una app: copia, opcionalmente hace clic en x,y para poner el foco, ⌘V por el menú de la app y devuelve el portapapeles de ${DUENO} como estaba. Pegar no envía: si la app es un chat, el mensaje queda escrito sin mandar.`,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...OBJETIVO, texto: { type: 'string' }, imagen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } }, x: { type: 'number' }, y: { type: 'number' }, ref: { type: 'string' }, restaurar: { type: 'boolean' }, confirmacion: CONFIRMACION, pedido: PEDIDO } },
  },
  {
    name: 'grabar',
    description: 'Graba una ventana a video MP4 (b-roll): `iniciar` (app, ventana?, ruta?, fps 30, fantasma true = se ve el cursor de las manos) devuelve un id; `parar` cierra el archivo y dice ruta, segundos y tamaño. Para una pestaña de Chrome, graba su ventana. No graba audio.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, required: ['accion'], properties: { accion: { type: 'string', enum: ['iniciar', 'parar', 'estado'] }, ...OBJETIVO, grabacion: { type: 'string', description: 'Nombre de la grabación (devuelto por iniciar).' }, ruta: { type: 'string' }, fps: { type: 'integer', minimum: 1, maximum: 60 }, fantasma: { type: 'boolean' }, confirmacion: CONFIRMACION, pedido: PEDIDO } },
  },
] as const

export const NOMBRES_LIENZO = new Set<string>(MANOS_LIENZO_TOOLS.map(t => t.name))

export interface ResultadoLienzo { text: string; error?: boolean; imagen?: { data: string; mimeType: string } }

/** Lo que hay debajo de un punto (AX), convertido al contexto que entiende el freno. */
async function contextoEn(c: ClienteCasa, a: any, x: number, y: number): Promise<{ ctx: ContextoAccion; debajo: any }> {
  const r = await c.llamar('clic_xy', { ...objetivo(a), x, y, solo_mirar: true }, 10_000)
  const d = r?.debajo ?? {}
  const ctx: ContextoAccion = { app: a.app, bundle: typeof a.app === 'string' && a.app.includes('.') ? a.app : undefined }
  if (d.rol) ctx.elemento = { rol: d.rol, titulo: d.titulo, descripcion: d.descripcion, ayuda: d.ayuda }
  return { ctx, debajo: d }
}

function objetivo(a: any): Record<string, unknown> {
  return { ...(a.app ? { app: a.app } : {}), ...(a.pid ? { pid: a.pid } : {}), ...(a.ventana ? { ventana: a.ventana } : {}) }
}

/**
 * Quién movió el cursor real durante el gesto (ArbrainManos: `cursor_movido_por`). Falla del 3 oct, 10:38/10:46:
 * «cursor real MOVIDO» solo comparaba la posición antes y después, y Daniel mueve SU ratón mientras trabajamos.
 */
export function cursorReal(r: any): string {
  switch (r?.cursor_movido_por) {
    case 'nadie': return `cursor de ${DUENO} intacto`
    // ArbrainManos reporta «persona» (las versiones anteriores, el nombre de la instalación original).
    case 'persona': case PERSONA_DUENO: return `cursor de ${DUENO} intacto (él movió su ratón durante el gesto; las manos no publicaron eventos HID)`
    case 'manos_hid': return 'cursor real MOVIDO por la mano (via hid autorizado)'
    case 'sin_evento': return `⚠️ el cursor de ${DUENO} se movió SIN eventos de las manos ni de él (la app o el sistema): no repitas este gesto por fondo en esta app y avísale`
    default: return `cursor real ${r?.cursor_real_movido ? 'MOVIDO' : 'quieto'}`
  }
}
/** El gesto movió el cursor de Daniel por culpa de las manos (HID o un movimiento sin evento): se reporta como error. */
const culpaCursor = (r: any) => r?.cursor_movido_por === 'sin_evento' || (r?.cursor_movido_por == null && r?.cursor_real_movido === true && r?.via !== 'hid')

/** Arrastrar a una papelera, «Eliminar», «Trash»…: el destino decide si el arrastre borra. */
const DESTINO_QUE_BORRA = /papelera|trash|bin\b|eliminar|borrar|delete|remove|quitar/i

export async function ejecutarLienzo(nombre: string, args: any, cliente: () => ClienteCasa, bitacora?: SinkBitacora, quien?: string): Promise<ResultadoLienzo> {
  const a = args ?? {}
  const c = cliente()
  const t0 = performance.now()
  const anotar = (p: Record<string, unknown>) =>
    bitacora?.paso({ herramienta: nombre, decidio: quien, app: a.app, ms: Math.round(performance.now() - t0), ...(p as any) }, typeof a.pedido === 'string' ? a.pedido : undefined)
  const bloquear = (categoria: string, detalle: string): ResultadoLienzo => {
    anotar({ resultado: 'bloqueado', freno: { categoria, paso: false } })
    return { text: `FRENO (${categoria}): ${detalle} No se ejecutó nada. Pregúntale a ${DUENO} y repite con confirmacion = la cita textual de su pedido.`, error: true }
  }
  // Freno de lienzo: devuelve el bloqueo o null si pasa. Fuera de la edición cliente solo deja la «sombra» en la bitácora.
  const frenoLienzo = async (n: string, args: any, destino: ContextoAccion, op: { hayElemento?: boolean } = {}): Promise<ResultadoLienzo | null> => {
    const j = juzgarLienzo(n, args, destino, op)
    if (!j.irreversible) return null
    if (pasaLienzo(j, args.confirmacion)) {
      // I8 (edición cliente): con la cita real, además el clic de la persona en la app. Daniel: no pregunta.
      const humana = await confirmacionHumana({ categoria: categoriaDe(j.categoria, j.motivo), resumen: `${n}: ${j.motivo}`.slice(0, 280), herramienta: `lienzo:${n}`, partes: [n, destino.app ?? null, args.texto ?? null, args.x ?? null, args.y ?? null, args.ruta ?? null] })
      if (humana.ok) return null
      anotar({ resultado: 'bloqueado', freno: { categoria: j.categoria ?? 'freno', paso: false } })
      return { text: humana.detalle, error: true }
    }
    if (!esEdicionCliente()) { anotar({ resultado: 'lectura', freno: { categoria: j.categoria ?? 'freno', paso: true }, detalle: `sombra del freno de lienzo: ${j.motivo}` }); return null }
    return bloquear(j.categoria ?? 'freno', `${j.motivo}.`)
  }
  /** I8 para lo que `frenar` dejó pasar con la cita: el clic de la persona (edición cliente; Daniel: ok sin preguntar). */
  const humanaLienzo = async (n: string, freno: { categoria: string; motivo: string } | undefined, partes: unknown[]): Promise<ResultadoLienzo | null> => {
    if (!freno) return null
    const humana = await confirmacionHumana({ categoria: categoriaDe(freno.categoria, freno.motivo), resumen: `${n}: ${freno.motivo}`.slice(0, 280), herramienta: `lienzo:${n}`, partes: [n, ...partes] })
    if (humana.ok) return null
    anotar({ resultado: 'bloqueado', freno: { categoria: freno.categoria, paso: false } })
    return { text: humana.detalle, error: true }
  }
  try {
    modoVer.observar(typeof a.pedido === 'string' ? a.pedido : undefined)
    // Cada quien su cursor (3 oct): hid nunca es automático, ni con «quiero verte».
    delete a.permiso_hid; delete a.hid_inactivo_s
    if (a.via === 'hid') {
      const ina = await c.llamar('inactividad', {}, 3_000).then((r: any) => typeof r?.segundos === 'number' ? r.segundos : undefined, () => undefined)
      const p = permisoHid(a.confirmacion, ina)
      if (!p.ok) {
        anotar({ resultado: 'bloqueado', freno: { categoria: 'cursor_de_daniel', paso: false } })
        return { text: `${FRENO_CURSOR(p.motivo)} No se ejecutó nada.`, error: true }
      }
      a.permiso_hid = p.permiso; a.hid_inactivo_s = p.umbral_s
    }
    // «Quiero verte»: el gesto va al frente (via frente) y lo que Daniel ve moverse es el Halo; su cursor no se toca.
    if (a.via == null && modoVer.activo() && ['trazar', 'clic_xy', 'pasar_encima', 'rueda'].includes(nombre) && !a.solo_mirar) { a.via = 'frente'; a.devolver_foco ??= false }
    // Freno de lienzo (10 oct 2026, AUDITORIA riesgo 5): pegar, portapapeles, grabar, rueda y pasar_encima ya no lo
    // saltan. Edición cliente: lo irreversible se detiene sin la cita real. Instalación de Daniel: solo se anota.
    if (['pegar', 'portapapeles', 'grabar', 'rueda', 'pasar_encima'].includes(nombre)) {
      const destino: ContextoAccion = nombre === 'pegar' && typeof a.x === 'number' && typeof a.y === 'number'
        ? await contextoEn(c, a, a.x, a.y).then(r => r.ctx, () => ({ app: a.app }))
        : { app: a.app, bundle: typeof a.app === 'string' && a.app.includes('.') ? a.app : undefined }
      const veto = await frenoLienzo(nombre, a, destino)
      if (veto) return veto
    }
    switch (nombre) {
      case 'trazar': {
        const lista: number[][][] = Array.isArray(a.trazos) && a.trazos.length ? a.trazos : Array.isArray(a.puntos) ? [a.puntos] : []
        if (!lista.length) return { text: 'trazar necesita `puntos` o `trazos`.', error: true }
        const ultimo = lista[lista.length - 1][lista[lista.length - 1].length - 1]
        // Un arrastre que termina en algo que borra es un borrado: mismo freno que un clic ahí.
        // Edición cliente (red team 2 A-1): se revisa dónde suelta CADA trazo, no solo un arrastre corto. Daniel: como siempre.
        const destinos = esEdicionCliente() ? lista.map(t => t[t.length - 1]).filter(Boolean) : lista.length === 1 && lista[0].length <= 12 ? [ultimo] : []
        for (const punto of destinos) {
          const { ctx, debajo } = await contextoEn(c, a, punto[0], punto[1])
          const etiqueta = [debajo.titulo, debajo.descripcion, debajo.ayuda].filter(Boolean).join(' ')
          if (DESTINO_QUE_BORRA.test(etiqueta)) {
            const f = frenar({ accion: 'click', ventana: a.ventana, confirmacion: a.confirmacion } as PedidoActuar, { ...ctx, elemento: { rol: debajo.rol ?? 'AXButton', titulo: 'Eliminar', descripcion: etiqueta } })
            if (!f.pasa) return bloquear(f.freno?.categoria ?? 'borrar', `soltar sobre «${etiqueta}» borraría lo arrastrado.`)
            // Red team 2 A-1 (I8): la cita no basta; en cliente, además el clic de la persona en la app. Daniel: no pregunta.
            const veto = await humanaLienzo('trazar', f.freno, [a.app ?? null, a.ventana ?? null, punto, etiqueta])
            if (veto) return veto
          }
        }
        const { pedido: _p, confirmacion: _c, ...resto } = a
        const r = await c.llamar('trazo', resto, 10 * 60_000)
        anotar({ accion: 'trazo', resultado: 'ok', efecto: r.efecto })
        return { text: `Trazo: ${r.trazos} trazo(s), ${r.eventos} eventos en ${Math.round(r.ms)} ms por ${r.via}${r.via_activada ? '' : ' (sin activación de fondo)'}; ${cursorReal(r)}. Efecto sin verificar: mira con \`ojos\`.`, ...(culpaCursor(r) ? { error: true } : {}) }
      }
      case 'clic_xy': {
        const { ctx, debajo } = await contextoEn(c, a, a.x, a.y)
        if (a.solo_mirar) { anotar({ resultado: 'lectura' }); return { text: `Debajo de (${a.x},${a.y}): ${JSON.stringify(debajo)}` } }
        if (ctx.elemento) {
          const f = frenar({ accion: 'click', ventana: a.ventana, confirmacion: a.confirmacion } as PedidoActuar, ctx)
          if (!f.pasa) return bloquear(f.freno?.categoria ?? 'freno', f.detalle ?? f.juicio.motivo)
          // Red team 2 A-1 (I8): igual que Freno.actuar, lo irreversible que pasó con la cita espera el clic humano.
          const veto = await humanaLienzo('clic_xy', f.freno, [a.app ?? null, a.ventana ?? null, a.x ?? null, a.y ?? null, a.boton ?? 'izquierdo', a.veces ?? 1, debajo.rol ?? null, debajo.titulo ?? debajo.descripcion ?? null])
          if (veto) return veto
        } else {
          // Sin elemento de accesibilidad debajo no se sabe qué hace el clic (AUDITORIA A5).
          const veto = await frenoLienzo('clic_xy', a, ctx, { hayElemento: false })
          if (veto) return veto
        }
        const { pedido: _p, confirmacion: _c, ...resto } = a
        const r = await c.llamar('clic_xy', resto, 30_000)
        anotar({ accion: `clic ${a.boton ?? 'izquierdo'} ×${a.veces ?? 1}`, rol: debajo.rol, etiqueta: etiquetaSegura(debajo.rol, debajo.titulo ?? debajo.descripcion, a.app), resultado: 'ok', efecto: r.eventos_ax ? 'la app reaccionó' : 'sin_verificar' })
        const texto = `Clic ${a.boton ?? 'izquierdo'} ×${a.veces ?? 1} en (${a.x},${a.y}) sobre ${debajo.rol ?? 'una vista sin accesibilidad'}${debajo.titulo ? ` «${debajo.titulo}»` : ''}: ${r.eventos_ax} eventos AX, ${cursorReal(r)}.`
        // Si el fondo no alcanzó: fallo con la sugerencia; nunca se escala solo a la mano real.
        if (r.efecto === 'fallo') return { text: `${texto} FALLO: ${r.detalle}`, error: true }
        return { text: texto, ...(culpaCursor(r) ? { error: true } : {}) }
      }
      case 'pasar_encima': {
        const { pedido: _p, confirmacion: _cf, ...resto } = a
        const r = await c.llamar('hover', resto, 30_000)
        anotar({ accion: 'hover', resultado: 'ok' })
        return { text: `Puntero sobre ${a.x != null ? `(${a.x},${a.y})` : `${a.puntos?.length ?? 0} puntos`} (${r.eventos} movimientos, ${cursorReal(r)}). Mira con \`ojos\` u \`observar\` lo que apareció.`, ...(culpaCursor(r) ? { error: true } : {}) }
      }
      case 'rueda': {
        const { pedido: _p, confirmacion: _cf, ...resto } = a
        const { confirmacion: _c2, ...resto2 } = resto
        const r = await c.llamar('rueda', resto2, 30_000)
        const fallo = r.efecto === 'fallo'
        anotar({ accion: `rueda ${a.dx ?? 0},${a.dy ?? 0}`, resultado: fallo ? 'fallo' : 'ok', efecto: r.efecto, ...(r.via_scroll ? { detalle: `vía ${r.via_scroll}` } : {}) })
        const donde = r.punto ? `(${Math.round(r.punto.x)},${Math.round(r.punto.y)})` : `(${a.x},${a.y})`
        const pasos = (r.intentos ?? []).join(' → ')
        if (fallo) return { text: `Rueda en ${donde}: el contenido NO se movió tras ${pasos}. Prueba el buscador del sitio, una URL directa o la extensión web (web_actuar scroll).`, error: true }
        return { text: `Rueda en ${donde}: dx ${a.dx ?? 0}, dy ${a.dy ?? 0} por ${r.via ?? 'fondo'}. ${r.desplazado === true ? `Desplazado (vía ${r.via_scroll}${pasos ? `: ${pasos}` : ''}; cambio visual ${r.cambio_visual}).` : 'Sin verificar.'} ${cursorReal(r)}.`, ...(culpaCursor(r) ? { error: true } : {}) }
      }
      case 'ojos': {
        const dir = mkdtempSync(join(tmpdir(), 'manos-ojos-'))
        const ruta = join(dir, 'ventana.png')
        const r = await c.llamar('ojos', { ...objetivo(a), ruta, ocr: a.ocr !== false, ...(a.buscar ? { buscar: a.buscar } : {}) }, 30_000)
        let textos: any[] = r.textos ?? []
        let ver = ruta
        if (a.zona) {
          const { x = 0, y = 0, w = r.marco.w, h = r.marco.h } = a.zona
          const k = r.escala
          ver = join(dir, 'zona.png')
          await ejecutar('sips', ['-c', String(Math.round(h * k)), String(Math.round(w * k)), '--cropOffset', String(Math.round(y * k)), String(Math.round(x * k)), ruta, '--out', ver])
          textos = textos.filter(t => t.centro[0] >= x && t.centro[0] <= x + w && t.centro[1] >= y && t.centro[1] <= y + h)
        }
        let imagen: ResultadoLienzo['imagen']
        if (a.ver !== false) {
          const chica = join(dir, 'ver.png')
          await ejecutar('sips', ['-Z', String(a.max_px ?? 1400), ver, '--out', chica])
          imagen = { data: readFileSync(chica).toString('base64'), mimeType: 'image/png' }
        }
        anotar({ resultado: 'lectura' })
        const lineas = textos.slice(0, 80).map(t => `«${t.texto}» centro (${t.centro[0]},${t.centro[1]})`)
        const factor = a.ver !== false ? ` La imagen que ves mide hasta ${a.max_px ?? 1400} px de lado: para pasar de sus píxeles a puntos de ventana multiplica por (ancho ventana ${r.marco.w} ÷ ancho imagen)${a.zona ? ` y suma el origen de la zona (${a.zona.x ?? 0},${a.zona.y ?? 0})` : ''}.` : ''
        return { text: `Ventana ${r.ventana} · ${r.marco.w}×${r.marco.h} pt en (${r.marco.x},${r.marco.y}) · escala ${r.escala} px/pt · captura ${ruta}.${factor}\nOCR (${textos.length}):\n${lineas.join('\n') || '(nada)'}`, imagen }
      }
      case 'seleccion': {
        const r = await c.llamar('seleccion', objetivo(a), 10_000)
        anotar({ resultado: 'lectura' })
        return { text: JSON.stringify(r) }
      }
      case 'portapapeles': {
        const { pedido: _p, confirmacion: _cf, ...resto } = a
        const r = await c.llamar('portapapeles', resto, 15_000)
        anotar({ accion: `portapapeles ${a.accion}`, resultado: a.accion === 'leer' ? 'lectura' : 'ok', escrito: typeof a.texto === 'string' ? a.texto.length : undefined })
        return { text: JSON.stringify(r) }
      }
      case 'pegar': {
        const { pedido: _p, confirmacion: _cf, ...resto } = a
        const r = await c.llamar('pegar', resto, 30_000)
        anotar({ accion: 'pegar', resultado: 'ok', escrito: typeof a.texto === 'string' ? a.texto.length : undefined })
        return { text: `Pegado (${a.texto != null ? 'texto' : a.imagen ? 'imagen' : 'archivos'}) por ${r.pegado?.detalle ?? '⌘V'}; portapapeles de ${DUENO} ${r.restaurado?.restaurado ? 'restaurado' : `NO restaurado: ${r.restaurado?.detalle ?? 'restaurar:false'}`}. Verifica en la app.` }
      }
      case 'grabar': {
        const { pedido: _p, confirmacion: _cf, ...resto } = a
        const r = await c.llamar('grabar', resto, 30_000)
        anotar({ accion: `grabar ${a.accion}`, resultado: 'ok' })
        return { text: JSON.stringify(r) }
      }
    }
    return { text: `Herramienta desconocida: ${nombre}`, error: true }
  } catch (e) {
    anotar({ resultado: 'fallo', efecto: (e as Error).message.slice(0, 120) })
    return { text: `Error en ${nombre}: ${(e as Error).message}`, error: true }
  }
}
