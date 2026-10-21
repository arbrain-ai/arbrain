/**
 * Cerebro de las manos: resuelve un pedido de Daniel de punta a punta con las herramientas `manos`.
 *
 * Escalera (nodo C, noche del 2 oct; números en docs/builds/manos-noche-2026-10-02/C-velocidad.md):
 *   0. Receta sin modelo: si una receta guardada cubre el pedido (coincidencia local, parámetros entre «»),
 *      corre sola en milisegundos. Solo si falla entra un modelo.
 *   1. Jev (OpenRouter) solo para opciones cerradas: desempatar recetas, reparar un paso, ordenar caminos de
 *      la insistencia. Nunca recibe la pantalla ni datos personales.
 *   2. Sonnet 5.5 por defecto (`MANOS_CEREBRO_MODELO`).
 *   3. Opus 5.5 (`MANOS_CEREBRO_ESCALA`) cuando Sonnet falla 2 veces, cuando Sonnet llama `escalar` (nuevo y
 *      ambiguo) o desde el inicio si hay dinero o personas de por medio (estándar firmado por Daniel, 2 oct 17:23).
 *
 * Velocidad: mientras arranca el modelo se precalienta lo obvio (la app o la URL directa del pedido) y su primer
 * turno llega con el árbol ya leído; la web va por la extensión Arbrain (web_*), con acciones en lote.
 * Regla de insistencia (decisores/insistencia.ts) en el sistema del modelo.
 *
 * Cada pedido deja una línea en la bitácora con los modelos, el escalado y cada paso.
 * Uso: `npx tsx src/manos/cerebro.ts "abre YouTube, busca Prankedy…"`.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { query, createSdkMcpServer, tool, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Adaptador, Decisor, Observacion } from './contrato.js'
import { ejecutarManos, Frescura, type SinkBitacora } from './herramientas.js'
import { AlmacenRecetas, Grabadora, leerComando, type Verificador } from './recetas.js'
import { aprender } from './decisores/aprender.js'
import { ejecutarLienzo } from './lienzo/herramientas-lienzo.js'
import { AdaptadorCasa, ClienteCasa } from './adaptadores/casa.js'
import { cargarEntornoManos, componerManos, crearDecisor } from './registro.js'
import { Registro, type Origen, type PasoBitacora } from './bitacora.js'
import { Freno } from './freno.js'
import { capa } from './herramientas.js'
import { REGLA_INSISTENCIA } from './decisores/insistencia.js'
import { elegirReceta, objetivoDelPedido } from './decisores/atajos.js'
import { SesionWeb, ejecutarWeb, perfilDelPedido } from './web/herramientas-web.js'
import { dirWeb } from './web/puente.js'

export const MODELO_SONNET = () => process.env.MANOS_CEREBRO_MODELO || 'claude-sonnet-5-5'
export const MODELO_OPUS = () => process.env.MANOS_CEREBRO_ESCALA || 'claude-opus-5-5'

/** Dinero o personas: el pedido mueve plata o habla con alguien. «Escribe en el buscador» no es una persona; «escríbele» sí. */
const DINERO_PERSONAS = /\b(pag[aoe]|pagar|compr[ao]|comprar|transfier|transferir|tarjeta|cobr|factur|suscrib|env[ií]a(le|r)?|m[aá]nda(le|r)?|escr[ií]bele|resp[oó]nde(le)?|contesta(le)?|mensaje|whatsapp|correo|e-?mail|dm|publica|postea|tuitea)\b/i

export type EstadoIntento = 'hecho' | 'fallo' | 'escala' | 'requiere_confirmacion' | 'aclaracion'
export interface Intento { modelo: string; estado: EstadoIntento; detalle: string; evidencia?: string; ms: number; costo_usd?: number; espera?: { rol?: string; etiqueta_contiene?: string; valor_contiene?: string }[] }

export function modeloInicial(pedido: string): { modelo: string; motivo?: string } {
  if (DINERO_PERSONAS.test(pedido)) return { modelo: MODELO_OPUS(), motivo: 'dinero o personas de por medio' }
  return { modelo: MODELO_SONNET() }
}

/** Qué sigue tras un intento. null = se termina (hecho, pide confirmación o ya no hay a quién escalar). */
export function siguiente(intentos: Intento[]): { modelo: string; motivo: string } | null {
  const ult = intentos[intentos.length - 1]
  if (!ult || ult.estado === 'hecho' || ult.estado === 'requiere_confirmacion' || ult.estado === 'aclaracion') return null
  const opus = MODELO_OPUS()
  if (ult.modelo === opus) return null
  if (ult.estado === 'escala') return { modelo: opus, motivo: `Sonnet pidió escalar: ${ult.detalle}` }
  const fallosSonnet = intentos.filter(i => i.modelo !== opus && i.estado === 'fallo').length
  if (fallosSonnet >= 2) return { modelo: opus, motivo: 'Sonnet falló 2 veces' }
  return { modelo: ult.modelo, motivo: 'reintento tras una falla' }
}

export const SISTEMA_CEREBRO = `Eres las manos de Arbrain en la Mac de ${DUENO}. Resuelves UN pedido suyo operando apps con las herramientas manos y terminas SIEMPRE con la herramienta terminar.
Reglas:
- Si existe un comando o una API, va antes que la pantalla: para ajustes del sistema usa leer_ajuste (defaults read) antes de abrir Configuración. Nunca toques pestañas o ventanas de ${DUENO}.
- Si una app tiene varias instancias o ventanas, trabaja con la que está en pantalla (en_pantalla true); la que está en otro escritorio no responde.
- Web: si tienes web_abrir, úsalo (extensión Arbrain: pestaña propia en segundo plano, árbol por índices). Ve por URL directa siempre que exista: canal https://www.youtube.com/@canal/videos, búsqueda https://www.youtube.com/results?search_query=…, guardados de X https://x.com/i/bookmarks, y para abrir un elemento de una lista navega a su enlace (permalink) con web_navegar. Encadena varias acciones en un solo web_actuar con pasos. Sin web_abrir, usa navegar (ventana propia) y observar.
- Si un sitio no carga (error de red o SSL, página bloqueada), NO lo rodees con espejos, otros dominios u otros navegadores: puede ser un bloqueador de ${DUENO} o su red. Termina con aclaracion diciendo qué error leíste.
- Si el mensaje trae «YA ABIERTO», ese árbol es fresco: actúa con sus refs o índices sin volver a observar.
- Observa → actúa por ref → vuelve a observar (solo_cambios) antes del siguiente ref. En páginas grandes usa consulta para filtrar. Si son varios controles estables de la misma lectura (botones de una calculadora, campos de un formulario), usa actuar_lote: una llamada en vez de una por paso.
- Todo en segundo plano, con el Halo como tu cursor: el ratón y el teclado de ${DUENO} nunca se tocan. Si ${DUENO} dijo «quiero verte» o «muéstrame cómo», la ventana de trabajo pasa al frente sola al actuar y él ve moverse al Halo. Si dijo «ponme» o «muéstrame», al final usa mostrar (o web_mostrar) con la ventana o pestaña tuya.
- Si un enlace lleva a un video, las manos lo silencian y pausan solas: confírmalo en el resultado (medios) y repórtalo.
- El freno detiene lo irreversible (enviar, borrar, pagar, publicar, salir, descartar, datos sensibles). Solo puedes pasar confirmacion si es una cita LITERAL del pedido de ${DUENO} que lo pide explícitamente; si no, terminar con estado requiere_confirmacion y explica qué falta.
- Si el pedido es ambiguo (no está claro qué, cuál o dónde) y no hay receta que lo cubra, llama escalar ANTES de actuar.
- ${REGLA_INSISTENCIA}
- Verifica el resultado con una lectura (URL, valor, estado) y pon esa evidencia en terminar. No inventes: si no lo comprobaste, es fallo.
- Nunca cierres, escondas ni muevas ventanas de ${DUENO}; deja todo como estaba.`

export interface OpcionesPedir {
  manos?: Adaptador
  decisor?: () => Decisor
  origen?: Origen
  /** Fuerza el modelo inicial (pruebas). */
  modelo?: string
  maxIntentos?: number
  maxTurnos?: number
  /** Silencia el progreso en consola. */
  silencio?: boolean
  /** Sesión web (extensión Arbrain). Por defecto se abre una si la extensión responde. `null` = sin web_*. */
  web?: (() => SesionWeb) | null
  /** Perfil de Chrome (subcadena del correo, p. ej. «saasfactory»). Sin él se deduce del pedido; si nada, el del dueño. */
  perfil?: string
  /** Sin el atajo de recetas (medir el modelo solo). */
  sinRecetas?: boolean
  /** Sin precalentar la app o la URL del pedido. */
  sinPrecalentar?: boolean
  /** Sin aprender recetas de lo que resuelva el modelo. */
  sinAprender?: boolean
  /**
   * Cita textual de Daniel (sus palabras exactas). Es la ÚNICA autoridad para el freno (`confirmacion`), el modo
   * «quiero verte» y «ponme/muéstrame». El `pedido` puede venir redactado por Levy; la cita no. Sin cita, el pedido
   * hace de cita (uso por consola).
   */
  cita?: string
  /** Avance en vivo (MCP `notifications/progress`, la UI de Arbrain). Nunca lleva texto de las apps. */
  progreso?: (p: Progreso) => void
  /** Al terminar, captura (PNG) de la última ventana nativa o pestaña propia trabajada. */
  captura?: boolean
  /** Tope de tiempo del pedido completo (ms). Al pasarlo se corta el intento en curso y no se abren más. */
  presupuestoMs?: number
  /** Daniel detuvo el encargo (MCP `notifications/cancelled`): se corta el intento en curso y no se abren más. */
  senal?: AbortSignal
}

/** Un evento de avance. `pasos` = pasos registrados hasta ahora; `ms` desde el inicio del pedido. */
export interface Progreso { fase: 'inicio' | 'receta' | 'modelo' | 'paso' | 'escala' | 'cierre' | 'fin'; mensaje: string; pasos: number; ms: number }

/** Una línea por paso, solo con lo que la bitácora ya considera seguro (rol, etiqueta de control, resultado). */
export function describirPaso(p: Omit<PasoBitacora, 't'>): string {
  return `${p.herramienta}${p.accion ? ` ${p.accion}` : ''}${p.app ? ` · ${p.app}` : ''}${p.etiqueta ? ` «${p.etiqueta}»` : ''} → ${p.resultado}${p.freno ? ` (freno: ${p.freno.categoria}${p.freno.paso ? ', pasó con la cita' : ''})` : ''}${p.decidio && p.decidio !== 'precalentar' ? ` [${p.decidio}]` : ''}`
}

/** Resumen corto de los pasos: sin duplicados seguidos, como mucho `max` líneas. */
export function resumirPasos(pasos: Omit<PasoBitacora, 't'>[], max = 14): string[] {
  const lineas: string[] = []
  let previa = ''
  for (const p of pasos) {
    const l = describirPaso({ ...p, decidio: undefined })
    if (l === previa) continue
    previa = l
    lineas.push(l)
  }
  if (lineas.length <= max) return lineas
  return [...lineas.slice(0, max - 4), `… ${lineas.length - max + 1} pasos más …`, ...lineas.slice(-3)]
}

export interface ResultadoPedido {
  ok: boolean; estado: EstadoIntento; intentos: Intento[]; escalado?: { de: string; a: string; motivo: string }; evidencia?: string; id: string; ms: number; ruta?: 'receta' | 'modelo'; aprendida?: string
  /** Lo que dijo quien cerró el pedido (el modelo en terminar o la receta). */
  detalle?: string
  /** Pasos tal como quedaron en la bitácora (sin texto de las apps). */
  pasos?: PasoBitacora[]
  /** Última pestaña propia trabajada (web). */
  url_final?: string; titulo_final?: string
  /** PNG de la última ventana o pestaña trabajada (si se pidió captura). */
  captura?: string
}

const normalizar = (s: string) => s.normalize('NFC').toLowerCase().replace(/[«»"'“”]/g, '').replace(/\s+/g, ' ').trim()
/** ¿La confirmación es una cita literal (y no vacía) de las palabras de Daniel? */
export function citaLiteral(autoridad: string, confirmacion: unknown): boolean {
  const c = normalizar(String(confirmacion ?? ''))
  return c.length >= 4 && normalizar(autoridad).includes(c)
}

/** Envoltorio que recuerda la última observación de cada ventana (no cambia ninguna respuesta). */
function recordar(m: Adaptador, ultimas: Map<number, Observacion>): Adaptador {
  return new Proxy(m, {
    get(t, k, r) {
      if (k === 'observar') return async (p: any) => { const o = await t.observar(p); ultimas.delete(o.ventana); ultimas.set(o.ventana, o); return o }
      if (k === 'interno') return t
      const v = Reflect.get(t, k, r)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}

/** ¿La extensión contesta? (tope corto: si no, el cerebro trabaja sin web_*). */
async function webViva(s: SesionWeb, ms = 800): Promise<boolean> {
  try { await Promise.race([s.canal.llamar('pestanas'), new Promise((_, mal) => setTimeout(() => mal(new Error('tope')), ms))]); return true } catch { return false }
}

/**
 * Precalentar: abre la app (en segundo plano) o la URL directa que el pedido nombra y devuelve su árbol para el
 * primer turno del modelo. Corre en paralelo al arranque del proceso del modelo. Tope ~5 s; si falla, nada.
 */
async function precalentar(pedido: string, manos: Adaptador, web: SesionWeb | null, frescura: Frescura, sink: SinkBitacora, autoridad = pedido): Promise<string> {
  const obj = objetivoDelPedido(pedido)
  if (!obj) return ''
  const tope = new Promise<string>(ok => setTimeout(() => ok(''), 5000))
  const trabajo = (async () => {
    if (obj.tipo === 'web') {
      if (!web) return ''
      const r = await ejecutarWeb('web_abrir', { url: obj.url, max: 300, pedido: autoridad }, web, sink, 'precalentar')
      return r.error ? '' : `YA ABIERTO (precalentado por URL directa ${obj.url}; pestaña propia):\n${r.text.slice(0, 30_000)}`
    }
    // Si hay varias instancias (la de Daniel en otro escritorio y una a la vista), se toma la que está en pantalla.
    let pid: number | undefined, w: Awaited<ReturnType<Adaptador['ventanas']>>[number] | undefined
    for (const a of (await manos.apps()).filter(a => a.bundle === obj.app)) {
      const v = (await manos.ventanas({ pid: a.pid })).find(v => v.en_pantalla && v.marco.h > 150)
      if (v) { pid = a.pid; w = v; break }
    }
    if (!w) { pid = (await manos.abrir(obj.app)).pid; w = (await manos.ventanas({ pid })).find(v => v.en_pantalla && v.marco.h > 150) }
    if (!w || !pid) return ''
    const o = await manos.observar({ pid, ventana: w.id, max_elementos: 250, tiempo_max_ms: 2000 })
    frescura.observo(o.pid)
    return `YA ABIERTO (precalentado: ${o.app} · pid ${o.pid} · ventana ${o.ventana}${o.titulo ? ` · «${o.titulo}»` : ''} · ${o.elementos.length}/${o.total_elementos} elementos):\n${o.texto.slice(0, 30_000)}`
  })().catch(() => '')
  return Promise.race([trabajo, tope])
}

export async function pedir(pedido: string, op: OpcionesPedir = {}): Promise<ResultadoPedido> {
  const manos = op.manos ?? componerManos()
  const decisor = op.decisor ?? (() => (dec ??= crearDecisor()))
  let dec: Decisor | undefined
  const almacen = new AlmacenRecetas()
  const frescura = new Frescura()
  const registro = new Registro(op.origen ?? 'cerebro', pedido)
  const log = (s: string) => { if (!op.silencio) console.log(s) }
  // La autoridad para el freno y para «ponme / quiero verte» es SOLO la cita textual de Daniel.
  const autoridad = (op.cita ?? '').trim() || pedido
  const avisar = (fase: Progreso['fase'], mensaje: string) => { try { op.progreso?.({ fase, mensaje, pasos: registro.pasos.length, ms: registro.ms }) } catch { /* el avance nunca tumba el pedido */ } }
  if (op.progreso) {
    const anotarPaso = registro.paso.bind(registro)
    registro.paso = p => { anotarPaso(p); avisar('paso', describirPaso(p)) }
  }
  const presupuesto = op.presupuestoMs ?? Infinity
  // Ventanas propias que ya existían (p. ej. abiertas por herramientas finas del mismo servidor): no son de este pedido.
  const propiasAntes = new Set(capa(manos, Freno)?.propias ?? [])
  avisar('inicio', `encargo recibido: «${pedido.slice(0, 120)}»`)
  const intentos: Intento[] = []
  const mostradas = new Set<number>()
  const sinkReceta: SinkBitacora = { paso: p => registro.paso({ ...p, decidio: p.decidio ?? 'receta' }) }

  // 0. Receta sin modelo.
  if (!op.sinRecetas) {
    const cand = await elegirReceta(pedido, almacen.listar(), decisor).catch(() => null)
    if (cand) {
      const t = performance.now()
      avisar('receta', `receta «${cand.receta.nombre}» (coincidencia ${cand.puntos.toFixed(2)})`)
      const r = await ejecutarManos('correr_receta', { nombre: cand.receta.nombre, parametros: cand.parametros }, manos, decisor, almacen, { bitacora: sinkReceta, frescura, quien: 'receta', intencion: autoridad })
      const res = (() => { try { return JSON.parse(r.text) } catch { return { estado: 'fallo', detalle: r.text } } })()
      log(`▶ receta «${cand.receta.nombre}» (${cand.puntos.toFixed(2)}) → ${res.estado} en ${Math.round(performance.now() - t)} ms`)
      const it: Intento = { modelo: 'receta', estado: res.estado === 'hecho' ? 'hecho' : res.estado === 'requiere_confirmacion' ? 'requiere_confirmacion' : 'fallo', detalle: res.detalle ?? (res.estado === "hecho" ? `hecho con la receta ${cand.receta.nombre}, sin modelo; ${res.verificador ?? "verificada"}` : `receta ${cand.receta.nombre}`), evidencia: res.verificador, ms: Math.round(performance.now() - t) }
      intentos.push(it)
      if (it.estado !== 'fallo') {
        registro.cerebro = { modelos: ['receta'], intentos: 1, costo_usd: 0 }
        // A la bitácora va CÓMO se verificó, no lo leído (en un chat, el valor leído es el texto del mensaje).
        registro.verificacion = { ok: it.estado === 'hecho', como: it.estado === 'hecho' ? `verificador de la receta ${cand.receta.nombre} cumple` : String(res.detalle ?? '').slice(0, 300) }
        // Captura del resultado: la última ventana en la que trabajó la receta (sin traerla al frente).
        let captura: string | undefined
        const vReceta = (res.pasos ?? []).map((p: { ventana?: number }) => p.ventana).filter((v: unknown) => v != null).pop()
        if (op.captura && it.estado === 'hecho') captura = await capturarNativa(manos, vReceta).catch(() => undefined)
        const e = registro.cerrar(it.estado === 'hecho', { falla: it.estado === 'hecho' ? undefined : it.detalle, intentos: 1 })
        if (!op.manos) { await capa(manos, Freno)?.soltar?.(); await manos.cerrar() }
        await dec?.cerrar?.()
        avisar('fin', `${it.estado} por receta en ${e.ms} ms`)
        return { ok: it.estado === 'hecho', estado: it.estado, intentos, evidencia: it.evidencia, id: e.id, ms: e.ms, ruta: 'receta', detalle: it.detalle, pasos: e.pasos, ...(captura ? { captura } : {}) }
      }
    }
  }

  // Web por la extensión, si contesta.
  let web: SesionWeb | null = null
  if (op.web !== null) {
    const s = op.web ? op.web() : new SesionWeb()
    const perfil = (op.perfil ?? '').trim().toLowerCase() || perfilDelPedido(`${pedido} ${op.cita ?? ''}`)
    if (perfil) s.perfil = perfil
    if (await webViva(s)) web = s
    else if (!op.web) await s.canal.cerrar().catch(() => null)
  }
  const pestanasMostradas = new Set<number>()
  // Última observación por ventana: la usa el respaldo por coordenadas de un clic que no entra.
  const ultimas = new Map<number, Observacion>()
  const memoria = recordar(manos, ultimas)

  // Recetas aprendidas tras el 2.º uso: lo que el modelo haga desde aquí puede volverse receta.
  const grabadora = capa(manos, Grabadora)
  const desde = grabadora?.historial.length ?? 0
  const inicial = op.modelo ? { modelo: op.modelo } : modeloInicial(`${pedido} ${op.cita ?? ''}`)
  let modelo = inicial.modelo
  let escalado: ResultadoPedido['escalado'] = inicial.motivo ? { de: MODELO_SONNET(), a: modelo, motivo: inicial.motivo } : undefined
  const sinkPre: SinkBitacora = { paso: p => registro.paso({ ...p, decidio: 'precalentar' }) }
  // El precalentado arranca ya; el primer intento lo espera dentro de su prompt (en paralelo al arranque del modelo).
  const pre = op.sinPrecalentar ? Promise.resolve('') : precalentar(pedido, memoria, web, frescura, sinkPre, autoridad)
  let notaPrevia = intentos.length ? `Se intentó primero la receta y falló: ${intentos[0].detalle}. Resuélvelo tú.` : ''
  const max = op.maxIntentos ?? 4
  log(`▶ pedido: «${pedido}» · cerebro ${modelo}${inicial.motivo ? ` (${inicial.motivo})` : ''}${web ? ' · web por extensión' : ''}`)

  for (let n = 0; n < max; n++) {
    const queda = presupuesto - registro.ms
    if (queda < 3000) { log('  presupuesto agotado: no se abre otro intento'); break }
    if (op.senal?.aborted) { log(`  detenido por ${DUENO}: no se abre otro intento`); break }
    avisar('modelo', `intento ${n + 1} con ${modelo}${n === 0 && inicial.motivo ? ` (${inicial.motivo})` : ''}`)
    const it = await intento(pedido, modelo, notaPrevia, n === 0 ? pre : Promise.resolve(''), { memoria, ultimas, mostradas, pestanasMostradas, manos, decisor, almacen, frescura, registro, web, maxTurnos: op.maxTurnos ?? 40, log, autoridad, citaAparte: !!op.cita?.trim() && op.cita.trim() !== pedido.trim(), topeMs: queda, senal: op.senal })
    intentos.push(it)
    if (op.senal?.aborted) break
    log(`  intento ${n + 1} · ${modelo} → ${it.estado}: ${it.detalle.slice(0, 160)}`)
    const sig = siguiente(intentos.filter(i => i.modelo !== 'receta'))
    if (!sig) break
    if (sig.modelo !== modelo) { escalado = { de: modelo, a: sig.modelo, motivo: sig.motivo }; log(`  ⇧ escala ${modelo} → ${sig.modelo}: ${sig.motivo}`); avisar('escala', `escala a ${sig.modelo}: ${sig.motivo}`) }
    notaPrevia = `Intento anterior (${modelo}) terminó en «${it.estado}»: ${it.detalle}. Las ventanas y pestañas que abriste siguen abiertas; retoma desde donde quedó.`
    modelo = sig.modelo
  }
  const ult = intentos[intentos.length - 1]
  const ok = ult?.estado === 'hecho'
  let aprendida: string | undefined
  if (ok && grabadora && !op.sinAprender) {
    const espera = ult.espera?.length ? [{ tipo: 'pantalla' as const, espera: ult.espera }] : undefined
    const a = await aprender(grabadora, almacen, pedido, desde, espera).catch(e => ({ estado: 'nada' as const, motivo: (e as Error).message }))
    log(`  aprender: ${a.estado}${'motivo' in a ? ` (${a.motivo})` : 'nombre' in a ? ` ${a.nombre}` : ''}`)
    registro.paso({ herramienta: 'aprender', resultado: a.estado === 'receta' ? 'ok' : 'lectura', ms: 0, detalle: a.estado === 'receta' ? `receta ${a.nombre}` : a.estado === 'huella' ? `huella ${a.veces}` : `no: ${a.motivo}`.slice(0, 120) })
    if (a.estado === 'receta') aprendida = a.nombre
  }
  // Lo que se ve al final (URL de la pestaña propia o captura de la última ventana), antes de cerrar nada.
  avisar('cierre', 'leyendo el estado final y cerrando lo propio')
  const final: { url_final?: string; titulo_final?: string; captura?: string } = {}
  if (web && web.ultimaPestana != null) {
    const e = await conTope(web.canal.llamar<{ url: string; titulo: string }>('evaluar_estado', { pestana: web.ultimaPestana }), 3000).catch(() => null)
    if (e) { final.url_final = e.url; final.titulo_final = e.titulo }
    if (op.captura) final.captura = await capturarWeb(web, web.ultimaPestana).catch(() => undefined)
  }
  if (op.captura && !final.captura && !final.url_final && ultimas.size) {
    const o = [...ultimas.values()].pop()!
    final.captura = await capturarNativa(manos, o.ventana, o.pid).catch(() => undefined)
  }
  // Todo queda como estaba (regla de Daniel): se cierran las ventanas y pestañas propias, salvo la que se le mostró.
  const freno = capa(manos, Freno)
  for (const w of [...(freno?.propias ?? [])].filter(w => !mostradas.has(w) && !propiasAntes.has(w))) {
    const v = (await manos.ventanas().catch(() => [])).find(x => x.id === w)
    if (!v) continue
    // El ⌘W de la casa usa el botón de cierre de la VENTANA (no la pestaña activa): cierra la ventana propia entera.
    const r = await manos.actuar({ pid: v.pid, ventana: w, accion: 'tecla', tecla: 'w', modificadores: ['cmd'] }).catch(e => ({ ok: false, efecto: 'fallo' as const, detalle: (e as Error).message }))
    registro.paso({ herramienta: 'limpieza', accion: 'cerrar ventana propia', app: v.app, resultado: r.ok ? 'ok' : 'fallo', ms: 0, ...(r.ok ? {} : { detalle: r.detalle?.slice(0, 120) }) })
  }
  if (web && !op.web) {
    const propias = await web.canal.llamar<{ pestana: number }[]>('pestanas').catch(() => [])
    for (const p of propias.filter(p => !pestanasMostradas.has(p.pestana))) await ejecutarWeb('web_pestanas', { cerrar: p.pestana }, web).catch(() => null)
    await web.canal.cerrar().catch(() => null)
  }
  const modelos = intentos.map(i => i.modelo)
  registro.cerebro = { modelos, ...(escalado ? { escalado } : {}), intentos: intentos.length, costo_usd: Number(intentos.reduce((s, i) => s + (i.costo_usd ?? 0), 0).toFixed(4)) }
  registro.verificacion = { ok, como: (ult?.evidencia ?? ult?.detalle ?? '').slice(0, 300) }
  const e = registro.cerrar(ok, { falla: ok ? undefined : `${ult?.estado}: ${ult?.detalle}`, intentos: intentos.length, escaloPorFalla: intentos.some(i => i.estado === 'fallo') })
  if (!op.manos) { await capa(manos, Freno)?.soltar?.(); await manos.cerrar() }
  await dec?.cerrar?.()
  avisar('fin', `${ult?.estado ?? 'fallo'} en ${(e.ms / 1000).toFixed(1)} s`)
  return { ok, estado: ult?.estado ?? 'fallo', intentos, ...(escalado ? { escalado } : {}), evidencia: ult?.evidencia, id: e.id, ms: e.ms, ruta: 'modelo', ...(aprendida ? { aprendida } : {}), detalle: ult?.detalle, pasos: e.pasos, ...final }
}

const conTope = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, mal) => { setTimeout(() => mal(new Error('tope')), ms).unref?.() })])

/** PNG de una ventana nativa sin traerla al frente (ScreenCaptureKit en el adaptador casa). */
async function capturarNativa(manos: Adaptador, ventana?: number, pid?: number): Promise<string | undefined> {
  if (ventana == null) return undefined
  const p = pid ?? (await manos.ventanas().catch(() => [])).find(v => v.id === Number(ventana))?.pid
  if (!p) return undefined
  const o = await conTope(manos.observar({ pid: p, ventana: Number(ventana), captura: true, max_elementos: 1, tiempo_max_ms: 1000 }), 6000)
  return o.captura
}

/** PNG de una pestaña propia por el depurador de la extensión (no la trae al frente). */
async function capturarWeb(web: SesionWeb, pestana: number): Promise<string | undefined> {
  const { png } = await conTope(web.canal.llamar<{ png: string }>('captura', { pestana }), 4000)
  if (!png) return undefined
  const dir = join(dirWeb(), 'capturas'); mkdirSync(dir, { recursive: true, mode: 0o700 })
  const ruta = join(dir, `${Date.now()}-${pestana}.png`)
  writeFileSync(ruta, Buffer.from(png, 'base64'), { mode: 0o600 })
  return ruta
}

interface Ctx { memoria: Adaptador; ultimas: Map<number, Observacion>; lienzo?: ClienteCasa; mostradas: Set<number>; pestanasMostradas: Set<number>; manos: Adaptador; decisor: () => Decisor; almacen: AlmacenRecetas; frescura: Frescura; registro: Registro; web: SesionWeb | null; maxTurnos: number; log: (s: string) => void
  /** Cita textual de Daniel: lo único que vale como confirmación del freno y como «ponme / quiero verte». */
  autoridad: string
  /** La cita viene aparte del pedido (encargar): se le muestra al modelo como tal. */
  citaAparte?: boolean
  /** Tope de este intento (ms). */
  topeMs?: number
  senal?: AbortSignal }

async function intento(pedido: string, modelo: string, nota: string, pre: Promise<string>, c: Ctx): Promise<Intento> {
  const t0 = performance.now()
  let fin = null as { estado: EstadoIntento; detalle: string; evidencia?: string; espera?: Intento['espera'] } | null
  const sink: SinkBitacora = { paso: p => c.registro.paso({ ...p, decidio: p.decidio === 'jev' || p.decidio === 'receta' ? p.decidio : modelo }) }
  const recortar = (text: string) => (text.length > 60_000 ? text.slice(0, 60_000) + '\n…(recortado: usa consulta)' : text)
  const correr = async (nombre: string, args: any) => {
    // Confirmaciones del cerebro: solo valen si son una cita literal del pedido de Daniel.
    if (args?.confirmacion && !citaLiteral(c.autoridad, args.confirmacion)) delete args.confirmacion
    let r = await ejecutarManos(nombre, args, c.memoria, c.decisor, c.almacen, { bitacora: sink, frescura: c.frescura, quien: modelo, intencion: c.autoridad })
    // Una acción que falló sin tocar nada (el elemento no admite clic, el texto no entró) no invalida los refs:
    // el modelo no tiene que gastar un turno en volver a observar.
    if (nombre === 'actuar' && args?.ref && /"ok":false/.test(r.text) && /"efecto":"fallo"/.test(r.text)) {
      const o = [...c.ultimas.values()].reverse().find(x => (args.pid ? x.pid === args.pid : true) && x.elementos.some(e => e.ref === args.ref))
      if (o) c.frescura.observo(o.pid)
    }
    // Insistencia en código: un clic por accesibilidad que la app no acepta (filas SwiftUI, vistas dibujadas)
    // se repite por coordenadas en el centro del mismo elemento, con su freno. El modelo no gasta un turno en eso.
    if (nombre === 'actuar' && args?.accion === 'click' && args?.ref && /"efecto":"fallo"/.test(r.text)) {
      const o = [...c.ultimas.values()].reverse().find(x => (args.pid ? x.pid === args.pid : true) && x.elementos.some(e => e.ref === args.ref))
      const e = o?.elementos.find(x => x.ref === args.ref)
      const w = o && (await c.manos.ventanas({ pid: o.pid }).catch(() => [])).find(v => v.id === o.ventana)
      if (o && e?.marco && w) {
        const x = await ejecutarLienzo('clic_xy', { pid: o.pid, ventana: o.ventana, x: e.marco.x - w.marco.x + e.marco.w / 2, y: e.marco.y - w.marco.y + e.marco.h / 2 }, () => capa(c.manos, AdaptadorCasa)?.cliente ?? (c.lienzo ??= new ClienteCasa()), sink, modelo)
        r = { text: x.error ? `${r.text}\n(también probé clic por coordenadas: ${x.text.slice(0, 160)})` : `{"ok":true,"efecto":"sin_verificar","detalle":"el clic por accesibilidad no entró; lo repetí por coordenadas en el centro del elemento: ${x.text.replace(/"/g, "'").slice(0, 160)}"}`, error: x.error }
        c.frescura.actuo(o.pid)
      }
    }
    // Insistencia en un campo: si el texto no entró por teclas ni pegando (valor leído sin cambios), se pone el
    // valor por accesibilidad sobre el mismo elemento (nada cambió: el ref sigue valiendo) y se lee de vuelta.
    if (nombre === 'actuar' && args?.accion === 'escribir' && args?.ref && args?.texto && /"efecto":"fallo"/.test(r.text) && /no entr/i.test(r.text)) {
      const o = [...c.ultimas.values()].reverse().find(x => (args.pid ? x.pid === args.pid : true) && x.elementos.some(e => e.ref === args.ref))
      const e = o?.elementos.find(x => x.ref === args.ref)
      if (o && e) {
        c.frescura.observo(o.pid)
        const v = await ejecutarManos('actuar', { pid: o.pid, ventana: o.ventana, accion: 'valor', ref: args.ref, valor: `${e.valor ?? ''}${args.texto}` }, c.memoria, c.decisor, c.almacen, { bitacora: sink, frescura: c.frescura, quien: modelo, intencion: c.autoridad })
        r = /"ok":true/.test(v.text) ? { text: `{"ok":true,"efecto":"confirmado","detalle":"las teclas no entraron; puse el valor por accesibilidad y lo leí de vuelta"}` } : { text: `${r.text}\n(también probé poner el valor: ${v.text.slice(0, 160)})`, error: true }
      }
    }
    if (nombre === 'mostrar' && !r.error && args?.ventana) c.mostradas.add(Number(args.ventana))
    c.log(`    · ${nombre} ${JSON.stringify(args).slice(0, 110)} → ${r.text.replace(/\s+/g, ' ').slice(0, 140)}`)
    return { content: [{ type: 'text' as const, text: recortar(r.text) }], isError: !!r.error }
  }
  const correrWeb = async (nombre: string, args: any) => {
    if (!c.web) return { content: [{ type: 'text' as const, text: 'La extensión web no está conectada: usa navegar.' }], isError: true }
    if (args?.confirmacion && !citaLiteral(c.autoridad, args.confirmacion)) delete args.confirmacion
    const r = await ejecutarWeb(nombre, { ...args, pedido: c.autoridad }, c.web, sink, modelo)
    if (nombre === 'web_mostrar' && !r.error) { const p = args?.pestana ?? c.web.ultimaPestana; if (p != null) c.pestanasMostradas.add(Number(p)) }
    c.log(`    · ${nombre} ${JSON.stringify(args).slice(0, 110)} → ${r.text.replace(/\s+/g, ' ').slice(0, 140)}`)
    return { content: [{ type: 'text' as const, text: recortar(r.text) }], isError: !!r.error }
  }
  const obj = { app: z.string().optional(), pid: z.number().int().optional(), ventana: z.number().int().optional() }
  const paso = z.object({ accion: z.enum(['click', 'escribir', 'tecla', 'scroll', 'valor']), indice: z.number().int().optional(), texto: z.string().optional(), tecla: z.string().optional(), modificadores: z.array(z.string()).optional(), direccion: z.enum(['arriba', 'abajo', 'izquierda', 'derecha']).optional(), cantidad: z.number().int().optional(), valor: z.string().optional() })
  const herramientasWeb = c.web ? [
    tool('web_abrir', `Abre una URL en una pestaña PROPIA del Chrome de ${DUENO} (grupo Arbrain, segundo plano, video pausado y silenciado) y devuelve el árbol por índices. Usa URL directa siempre que exista.`, { url: z.string(), consulta: z.string().optional(), max: z.number().int().optional() }, a => correrWeb('web_abrir', a)),
    tool('web_navegar', 'Lleva tu pestaña propia a otra URL (p. ej. el permalink de un elemento de una lista).', { pestana: z.number().int().optional(), url: z.string(), consulta: z.string().optional(), max: z.number().int().optional() }, a => correrWeb('web_navegar', a)),
    tool('web_observar', 'Lee la página por índices; por defecto solo lo que cambió. completo: true da todo.', { pestana: z.number().int().optional(), completo: z.boolean().optional(), consulta: z.string().optional(), max: z.number().int().optional() }, a => correrWeb('web_observar', a)),
    tool('web_actuar', 'Actúa por índice: click, escribir, tecla, scroll o valor. Hasta 8 pasos en una llamada (pasos) con una sola lectura al final (devuelve lo que cambió). El freno detiene enviar/publicar/pagar/borrar.', { pestana: z.number().int().optional(), pasos: z.array(paso).optional(), accion: z.enum(['click', 'escribir', 'tecla', 'scroll', 'valor']).optional(), indice: z.number().int().optional(), texto: z.string().optional(), tecla: z.string().optional(), direccion: z.enum(['arriba', 'abajo', 'izquierda', 'derecha']).optional(), cantidad: z.number().int().optional(), valor: z.string().optional(), confirmacion: z.string().optional(), max: z.number().int().optional() }, a => correrWeb('web_actuar', a)),
    tool('web_verificar', 'Comprueba sin pantalla: URL o título que contienen un texto, texto visible, o estado del video.', { pestana: z.number().int().optional(), url_contiene: z.string().optional(), titulo_contiene: z.string().optional(), texto_contiene: z.string().optional(), video: z.enum(['pausado', 'reproduciendo', 'silenciado']).optional() }, a => correrWeb('web_verificar', a)),
    tool('web_mostrar', `Trae al frente tu pestaña propia. Solo si ${DUENO} dijo «ponme» o «muéstrame».`, { pestana: z.number().int().optional(), reproducir: z.boolean().optional() }, a => correrWeb('web_mostrar', a)),
  ] : []
  const servidor = createSdkMcpServer({
    name: 'manos', version: '1.0.0',
    tools: [
      tool('observar', 'Lee una ventana como árbol de accesibilidad (refs, rol, etiqueta, valor). consulta filtra; solo_cambios devuelve el diff desde tu última lectura; ocr agrega texto de OCR local.',
        { ...obj, consulta: z.string().optional(), solo_cambios: z.boolean().optional(), ocr: z.boolean().optional(), max_elementos: z.number().int().optional(), tiempo_max_ms: z.number().int().optional() }, a => correr('observar', a)),
      tool('actuar', 'Actúa por ref sin mover el cursor: click, escribir, tecla, scroll o valor. El freno puede devolver «bloqueado».',
        { ...obj, accion: z.enum(['click', 'escribir', 'tecla', 'scroll', 'valor']), ref: z.string().optional(), texto: z.string().optional(), tecla: z.string().optional(), modificadores: z.array(z.string()).optional(), direccion: z.enum(['arriba', 'abajo', 'izquierda', 'derecha']).optional(), cantidad: z.number().int().optional(), valor: z.string().optional(), confirmacion: z.string().optional() }, a => correr('actuar', a)),
      tool('actuar_lote', 'Varias acciones por ref en una sola llamada (hasta 12), todas con refs de TU ÚLTIMA observación de esa ventana, y una sola lectura de cambios al final. Solo para controles que no cambian entre pasos (teclados, botoneras, formularios). Se detiene en la primera que falle o que el freno bloquee.',
        { ...obj, pasos: z.array(z.object({ accion: z.enum(['click', 'escribir', 'tecla', 'valor']), ref: z.string().optional(), texto: z.string().optional(), tecla: z.string().optional(), modificadores: z.array(z.string()).optional(), valor: z.string().optional() })).max(12) },
        async a => {
          const res: string[] = []
          let pid: number | undefined
          for (const [k, p] of a.pasos.entries()) {
            const o = [...c.ultimas.values()].reverse().find(x => (a.pid ? x.pid === a.pid : true) && (!p.ref || x.elementos.some(e => e.ref === p.ref)))
            pid = o?.pid ?? pid
            // Lote: los refs de la última lectura siguen valiendo entre pasos (controles estables).
            if (pid) c.frescura.observo(pid)
            const r = await correr('actuar', { ...(a.app ? { app: a.app } : {}), ...(o ? { pid: o.pid, ventana: o.ventana } : { pid: a.pid, ventana: a.ventana }), ...p })
            const t = r.content[0].text
            res.push(`${k + 1}. ${p.accion}${p.ref ? ` ${p.ref}` : ''}: ${t.slice(0, 120)}`)
            if (r.isError || /"ok":false/.test(t)) { res.push(`(se detuvo en el paso ${k + 1})`); break }
          }
          const fin = pid ? await correr('observar', { pid, solo_cambios: true }) : null
          return { content: [{ type: 'text' as const, text: `${res.join('\n')}${fin ? `\n${fin.content[0].text}` : ''}` }] }
        }),
      // navegar abre una ventana en el Chrome de Daniel (y Chrome puede pasar al frente): con la extensión viva no se
      // ofrece. En la demo del nodo E (3 oct) Sonnet lo usó como «otro camino» y salió en el Chrome de Daniel.
      ...(c.web ? [] : [tool('navegar', 'Abre una URL en una ventana NUEVA y propia del navegador, en segundo plano (respaldo si no tienes web_abrir). Devuelve pid y ventana.', { url: z.string(), navegador: z.enum(['chrome', 'brave', 'edge']).optional(), confirmacion: z.string().optional() }, a => correr('navegar', a))]),
      tool('mostrar', `Trae al frente una ventana propia. Solo si ${DUENO} dijo «ponme», «muéstrame» o «quiero verte».`, { ...obj, ventana: z.number().int() }, a => correr('mostrar', { ...a, pedido: c.autoridad })),
      tool('ventanas', 'Lista ventanas (id, app, título, en pantalla).', { app: z.string().optional(), pid: z.number().int().optional() }, a => correr('ventanas', a)),
      tool('apps', 'Lista apps abiertas; con abrir abre una en segundo plano.', { abrir: z.string().optional() }, a => correr('apps', a)),
      tool('verificar', 'Comprueba expectativas sobre una ventana.', { ...obj, espera: z.array(z.object({ etiqueta_contiene: z.string().optional(), rol: z.string().optional(), valor: z.string().optional(), seleccionado: z.boolean().optional(), habilitado: z.boolean().optional() })) }, a => correr('verificar', a)),
      tool('listar_recetas', 'Recetas guardadas (tareas que ya corren sin modelo).', {}, a => correr('listar_recetas', a)),
      tool('correr_receta', 'Corre una receta guardada.', { nombre: z.string(), parametros_json: z.string().optional().describe('JSON {"nombre": "valor"} con los parámetros de la receta') },
        // z.record tumba la lista de herramientas del SDK (probado el 2 oct): los parámetros viajan como JSON.
        a => correr('correr_receta', { nombre: a.nombre, ...(a.parametros_json ? { parametros: JSON.parse(a.parametros_json) } : {}) })),
      tool('leer_ajuste', 'Regla de oro: lee el estado real por comando de solo lectura, sin pantalla. argv permitido: ["defaults","read",dominio,clave] o ["pgrep",…]; en Windows ["reg","query",llave,"/v",valor] o ["tasklist",…]. Ej.: ["defaults","read","com.apple.dock","autohide"].', { argv: z.array(z.string()) }, async a => {
        const t = performance.now()
        try {
          const out = await leerComando(a.argv)
          c.registro.paso({ herramienta: 'leer_ajuste', accion: a.argv.slice(0, 2).join(' '), resultado: 'lectura', ms: Math.round(performance.now() - t), decidio: modelo })
          return { content: [{ type: 'text' as const, text: `${a.argv.join(' ')} → «${out}»` }] }
        } catch (e) { return { content: [{ type: 'text' as const, text: (e as Error).message }], isError: true } }
      }),
      ...herramientasWeb,
      tool('escalar', 'Pide que un modelo más capaz (Opus) tome el pedido: úsalo si el pedido es ambiguo y no hay receta, ANTES de actuar.', { motivo: z.string() }, async a => {
        fin = { estado: 'escala', detalle: a.motivo }
        return { content: [{ type: 'text' as const, text: 'Escalado. Termina tu turno ya.' }] }
      }),
      tool('terminar', `Cierra el pedido. estado hecho solo con evidencia leída (URL, valor). requiere_confirmacion si el freno pide permiso de ${DUENO}. En apps nativas, espera = lo que se ve en pantalla cuando la tarea quedó hecha (sirve para aprenderla como receta).`, { estado: z.enum(['hecho', 'fallo', 'requiere_confirmacion', 'aclaracion']), resumen: z.string(), evidencia: z.string().optional(), espera: z.array(z.object({ rol: z.string().optional(), etiqueta_contiene: z.string().optional(), valor_contiene: z.string().optional() })).optional() }, async a => {
        // Escalar es definitivo en este intento: un terminar posterior no lo pisa.
        if (fin?.estado !== 'escala') fin = { estado: a.estado, detalle: a.resumen, evidencia: a.evidencia, ...(a.espera?.length ? { espera: a.espera } : {}) }
        return { content: [{ type: 'text' as const, text: 'Registrado. Termina tu turno ya.' }] }
      }),
    ],
  })
  const nombres = ['observar', 'actuar', 'actuar_lote', ...(c.web ? [] : ['navegar']), 'mostrar', 'ventanas', 'apps', 'verificar', 'listar_recetas', 'correr_receta', 'leer_ajuste', ...(c.web ? ['web_abrir', 'web_navegar', 'web_observar', 'web_actuar', 'web_verificar', 'web_mostrar'] : []), 'escalar', 'terminar'].map(n => `mcp__manos__${n}`)
  let costo = 0
  // Prompt en streaming: el proceso del modelo arranca YA y el texto llega cuando el precalentado termina.
  const base = `PEDIDO DE ${DUENO.toLocaleUpperCase('es')}: «${pedido}»${c.citaAparte ? `\nSUS PALABRAS TEXTUALES (lo único que vale como confirmacion del freno): «${c.autoridad}»` : ''}${nota ? `\n\n${nota}` : ''}${modelo === MODELO_OPUS() ? `\n\nEres el modelo escalado (no hay a quién más escalar). Si el pedido sigue sin poder resolverse sin adivinar, investiga lo que puedas en modo lectura y termina con estado aclaracion y la pregunta concreta para ${DUENO}.` : ''}`
  async function* entrada(): AsyncGenerator<SDKUserMessage> {
    const extra = await pre
    yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: extra ? `${base}\n\n${extra}` : base } } as SDKUserMessage
  }
  const q = query({
    prompt: entrada(),
    options: {
      model: modelo, cwd: mkdtempSync(join(tmpdir(), 'manos-cerebro-')), systemPrompt: SISTEMA_CEREBRO,
      // Solo las herramientas manos: sin herramientas integradas, sin settings ni hooks del repo.
      tools: [], mcpServers: { manos: servidor }, allowedTools: nombres, strictMcpConfig: true, settingSources: [],
      persistSession: false, maxTurns: c.maxTurnos,
      // SDK 0.3.286: sin modo explícito, Claude Code decide (puede ser auto mode). Lo fijamos.
      permissionMode: 'default',
    } as any,
  })
  // Tope del intento: se corta el proceso del modelo y cuenta como fallo (no se insiste más allá del presupuesto).
  const reloj = c.topeMs && Number.isFinite(c.topeMs) ? setTimeout(() => { if (!fin) fin = { estado: 'fallo', detalle: `se agotó el tiempo del encargo (${Math.round(c.topeMs! / 1000)} s)` }; try { (q as any).close?.() } catch { /* ya cerrado */ } }, c.topeMs) : null
  const detener = () => { if (!fin) fin = { estado: 'fallo', detalle: `${DUENO_M} detuvo el encargo` }; try { (q as any).close?.() } catch { /* ya cerrado */ } }
  if (c.senal?.aborted) detener(); else c.senal?.addEventListener('abort', detener, { once: true })
  try {
    for await (const m of q as AsyncIterable<any>) {
      if (process.env.MANOS_CEREBRO_DEBUG) c.log(`      [${m.type}${m.subtype ? ':' + m.subtype : ''}] ${JSON.stringify(m.message?.content ?? m.result ?? m.tools ?? m.error ?? '').slice(0, 300)}`)
      if (m.type === 'result') { costo = Number(m.total_cost_usd ?? 0); if (!fin && m.subtype !== 'success') fin = { estado: 'fallo', detalle: `el cerebro terminó sin cerrar: ${m.subtype}` }; break }
    }
  } catch (e) {
    if (!fin) fin = { estado: 'fallo', detalle: `error del cerebro: ${(e as Error).message.slice(0, 200)}` }
  } finally {
    if (reloj) clearTimeout(reloj)
    c.senal?.removeEventListener('abort', detener)
    try { (q as any).close?.() } catch { /* ya cerrado */ }
  }
  const f = fin ?? { estado: 'fallo' as const, detalle: 'el cerebro no llamó a terminar' }
  return { modelo, estado: f.estado, detalle: f.detalle, evidencia: f.evidencia, ms: Math.round(performance.now() - t0), costo_usd: costo, ...((f as any).espera ? { espera: (f as any).espera } : {}) }
}

if (process.argv[1] && /cerebro\.(ts|js)$/.test(process.argv[1])) {
  cargarEntornoManos()
  const args = process.argv.slice(2)
  const modelo = args.find(a => a.startsWith('--modelo='))?.slice(9)
  const texto = args.filter(a => !a.startsWith('--')).join(' ')
  if (!texto) { console.error('uso: cerebro.ts "pedido" [--modelo=claude-opus-5-5]'); process.exit(64) }
  pedir(texto, { modelo }).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1) })
}
