/**
 * Adaptador `cua`: Cua Driver (trycua/cua, MIT) por su MCP de stdio.
 *
 * Toda la traducción Cua ↔ contrato vive aquí y en ningún otro lado:
 *   - refs cortos `e<N>` ↔ `element_token` del último snapshot de esa ventana;
 *   - `delivery_mode` background por defecto (no roba cursor ni foco);
 *   - `effect` de Cua → `confirmado` / `sin_verificar` / `fallo`.
 *
 * Requisitos: CuaDriver.app firmada con Accesibilidad y Grabación de pantalla
 * (macOS asigna el permiso a la app, no a la terminal) y la telemetría apagada.
 * Versión fijada y binario en docs/builds/computer-use-2026-10-02/RESULTADOS.md.
 */
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClienteMcpStdio, type RespuestaHerramienta } from '../mcp-cliente.js'
import type { Adaptador, App, Elemento, Expectativa, Objetivo, Observacion, PedidoActuar, PedidoObservar, ResultadoAccion, ResultadoVerificar, Ventana } from '../contrato.js'

const DIRECCION = { arriba: 'up', abajo: 'down', izquierda: 'left', derecha: 'right' } as const

export class AdaptadorCua implements Adaptador {
  readonly nombre = 'cua'
  private readonly mcp: ClienteMcpStdio
  /** (pid:ventana) → ref → element_token del último snapshot. */
  private readonly refs = new Map<string, Map<string, string>>()
  private readonly sesion: string

  constructor(opts: { binario?: string; sesion?: string } = {}) {
    const binario = opts.binario || process.env.MANOS_CUA_BIN || 'cua-driver'
    // Cua no reabre una etiqueta de sesión ya terminada: una por instancia del adaptador.
    this.sesion = `${opts.sesion || process.env.MANOS_CUA_SESION || 'arbrain-manos'}-${process.pid}-${Date.now().toString(36)}`
    // La telemetría se apaga también aquí: no depende de que el config persistido siga igual.
    this.mcp = new ClienteMcpStdio(binario, ['mcp'], { CUA_DRIVER_RS_TELEMETRY_ENABLED: 'false', CUA_TELEMETRY_ENABLED: 'false' })
  }

  private cursorListo: Promise<void> | null = null

  /**
   * El cursor virtual de Cua anima cada clic (~2.5 s medidos en el Studio). Para manos en segundo
   * plano se apaga por sesión; `MANOS_CUA_CURSOR_VISIBLE=1` lo enciende para demos.
   */
  private prepararSesion(): Promise<void> {
    return (this.cursorListo ??= (async () => {
      await this.mcp.llamar('start_session', { session: this.sesion })
      await this.mcp.llamar('set_agent_cursor_enabled', { session: this.sesion, enabled: process.env.MANOS_CUA_CURSOR_VISIBLE === '1' })
    })())
  }

  private async llamar(herramienta: string, args: Record<string, unknown> = {}): Promise<RespuestaHerramienta> {
    await this.prepararSesion()
    const r = await this.mcp.llamar(herramienta, args)
    if (r.error) throw new Error(`${herramienta}: ${r.texto.slice(0, 400) || 'error sin detalle'}`)
    return r
  }

  async apps(): Promise<App[]> {
    const r = await this.llamar('list_apps', { session: this.sesion })
    const lista: any[] = r.estructurado?.apps ?? r.estructurado?.items ?? []
    return lista.filter(a => a.running).map(a => ({ nombre: a.name, bundle: a.bundle_id ?? undefined, pid: a.pid, activa: !!a.active }))
  }

  async abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }> {
    const args = app.includes('.') && !app.includes(' ') ? { bundle_id: app } : { name: app }
    const r = await this.llamar('launch_app', { ...args, session: this.sesion })
    const s = r.estructurado ?? {}
    return { pid: s.pid, ventanas: (s.windows ?? []).map(aVentana) }
  }

  async ventanas(p: { app?: string; pid?: number } = {}): Promise<Ventana[]> {
    const pid = p.pid ?? (p.app ? await this.pidDe(p.app) : undefined)
    const r = await this.llamar('list_windows', { session: this.sesion, ...(pid ? { pid } : {}) })
    return (r.estructurado?.windows ?? []).map(aVentana)
  }

  private async pidDe(app: string): Promise<number> {
    const q = app.toLowerCase()
    const hit = (await this.apps()).find(a => a.bundle?.toLowerCase() === q || a.nombre.toLowerCase() === q)
    if (!hit) throw new Error(`La app «${app}» no está corriendo. Ábrela con apps({abrir}).`)
    return hit.pid
  }

  /** Resuelve pid y ventana: la ventana dada o la de mayor z de esa app. */
  private async resolver(o: Objetivo): Promise<{ pid: number; ventana: number }> {
    const pid = o.pid ?? (o.app ? await this.pidDe(o.app) : undefined)
    if (!pid) throw new Error('Falta app o pid.')
    if (o.ventana) return { pid, ventana: o.ventana }
    const vs = (await this.ventanas({ pid })).filter(v => v.titulo !== undefined || v.en_pantalla)
    if (!vs.length) throw new Error(`La app (pid ${pid}) no tiene ventanas.`)
    vs.sort((a, b) => (b.z ?? -1) - (a.z ?? -1) || Number(b.en_pantalla) - Number(a.en_pantalla))
    return { pid, ventana: vs[0].id }
  }

  async observar(p: PedidoObservar): Promise<Observacion> {
    const { pid, ventana } = await this.resolver(p)
    const captura = p.captura ? join(tmpdir(), `manos-${pid}-${ventana}-${Date.now()}.png`) : undefined
    const r = await this.llamar('get_window_state', {
      pid, window_id: ventana, session: this.sesion,
      include_screenshot: false,
      timeout_ms: Math.min(120_000, Math.max(100, p.tiempo_max_ms ?? 5000)),
      ...(captura ? { screenshot_out_file: captura } : {}),
      ...(p.consulta ? { query: p.consulta } : {}),
      ...(p.max_elementos ? { max_elements: p.max_elementos } : {}),
    })
    const s = r.estructurado ?? {}
    const mapa = new Map<string, string>()
    const elementos: Elemento[] = (s.elements ?? []).map((e: any) => {
      const ref = `e${e.element_index}`
      if (e.element_token) mapa.set(ref, e.element_token)
      return {
        ref, rol: e.role, etiqueta: e.label || undefined, valor: e.value ?? undefined,
        acciones: e.actions?.length ? e.actions : undefined,
        marco: e.frame ? { x: e.frame.x, y: e.frame.y, w: e.frame.w, h: e.frame.h } : undefined,
        profundidad: e.depth,
      }
    })
    this.refs.set(`${pid}:${ventana}`, mapa)
    const texto = elementos.map(e => `${'  '.repeat(Math.max(0, e.profundidad ?? 0))}[${e.ref}] ${e.rol}${e.etiqueta ? ` «${e.etiqueta}»` : ''}${e.valor != null && e.valor !== '' ? ` = ${String(e.valor).slice(0, 80)}` : ''}`).join('\n')
    return {
      app: s.app_name ?? p.app ?? String(pid), pid, ventana, titulo: s.window_title ?? undefined,
      elementos, texto, captura, total_elementos: s.element_count ?? elementos.length,
      aviso: s.degraded_reason ?? (s.truncated ? `árbol truncado: ${s.truncation_reason}` : undefined),
    }
  }

  private token(pid: number, ventana: number, ref: string): string {
    const t = this.refs.get(`${pid}:${ventana}`)?.get(ref)
    if (!t) throw new Error(`Ref ${ref} desconocido o vencido para esa ventana: vuelve a observar.`)
    return t
  }

  async actuar(p: PedidoActuar): Promise<ResultadoAccion> {
    const { pid, ventana } = await this.resolver(p)
    const base: Record<string, unknown> = { pid, session: this.sesion, delivery_mode: p.primer_plano ? 'foreground' : 'background' }
    if (p.primer_plano) base.window_id = ventana
    const conRef = p.ref ? { element_token: this.token(pid, ventana, p.ref) } : {}
    let r: RespuestaHerramienta
    try {
      switch (p.accion) {
        case 'click':
          if (!p.ref) throw new Error('click necesita ref (el contrato no expone coordenadas).')
          r = await this.llamar('click', { ...base, ...conRef }); break
        case 'escribir':
          if (p.texto == null) throw new Error('escribir necesita texto.')
          r = await this.llamar('type_text', { ...base, ...conRef, text: p.texto }); break
        case 'tecla':
          if (!p.tecla) throw new Error('tecla necesita tecla.')
          r = await this.llamar('press_key', { ...base, ...conRef, key: p.tecla, ...(p.modificadores?.length ? { modifiers: p.modificadores } : {}) }); break
        case 'scroll':
          r = await this.llamar('scroll', { ...base, ...conRef, direction: DIRECCION[p.direccion ?? 'abajo'], amount: p.cantidad ?? 3 }); break
        case 'valor':
          if (!p.ref || p.valor == null) throw new Error('valor necesita ref y valor.')
          r = await this.llamar('set_value', { pid, session: this.sesion, ...conRef, value: p.valor }); break
        default:
          throw new Error(`Acción desconocida: ${String((p as PedidoActuar).accion)}`)
      }
    } catch (e) {
      return { ok: false, efecto: 'fallo', detalle: (e as Error).message }
    }
    const efecto = String(r.estructurado?.effect ?? r.estructurado?.result?.effect ?? '').toLowerCase()
    return { ok: true, efecto: efecto === 'confirmed' ? 'confirmado' : 'sin_verificar', detalle: r.texto.slice(0, 300) || undefined }
  }

  async verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar> {
    const { pid, ventana } = await this.resolver(p)
    const expect = p.espera.slice(0, 8).map(e => ({
      element: {
        selector: { ...(e.etiqueta_contiene ? { label_contains: e.etiqueta_contiene } : {}), ...(e.rol ? { role: e.rol } : {}) },
        exists: true,
        ...(e.valor !== undefined ? { value_equals: e.valor } : {}),
        ...(e.seleccionado !== undefined ? { selected: e.seleccionado } : {}),
        ...(e.habilitado !== undefined ? { enabled: e.habilitado } : {}),
      },
    }))
    const r = await this.mcp.llamar('verify_state', { pid, window_id: ventana, session: this.sesion, expect })
    if (r.error) return { cumple: 'desconocido', detalle: r.texto.slice(0, 400) }
    const s = r.estructurado ?? {}
    const global = String(s.result ?? s.status ?? s.outcome ?? '').toLowerCase()
    const cumple = global === 'satisfied' ? true : global === 'unsatisfied' ? false : 'desconocido'
    return { cumple, detalle: r.texto.slice(0, 400) }
  }

  async cursor(): Promise<{ x: number; y: number }> {
    const r = await this.llamar('get_cursor_position', { session: this.sesion })
    const s = r.estructurado ?? {}
    return { x: Number(s.x), y: Number(s.y) }
  }

  async salud(): Promise<{ ok: boolean; detalle: string }> {
    const r = await this.mcp.llamar('check_permissions', {})
    const s = r.estructurado ?? {}
    const ok = !r.error && s.accessibility !== false && s.screen_recording !== false && !/pending|denied|not granted/i.test(r.texto)
    return { ok, detalle: r.texto.slice(0, 400) }
  }

  cerrar(): Promise<void> { return this.mcp.cerrar() }
}

function aVentana(w: any): Ventana {
  const b = w.bounds ?? {}
  return { id: w.window_id, pid: w.pid, app: w.app_name, titulo: w.title || undefined, marco: { x: b.x, y: b.y, w: b.width, h: b.height }, en_pantalla: !!w.is_on_screen, z: w.z_index ?? null }
}
