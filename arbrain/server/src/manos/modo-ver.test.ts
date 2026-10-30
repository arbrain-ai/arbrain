import { describe, it, expect, beforeEach } from 'vitest'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { INTENCION_VER, ModoVer, modoVer, permisoHid, pideCursorReal } from './modo-ver.js'
import { ejecutarManos } from './herramientas.js'
import { ejecutarLienzo } from './lienzo/herramientas-lienzo.js'
import { Freno } from './freno.js'
import type { Adaptador, PedidoActuar } from './contrato.js'
import type { ClienteCasa } from './adaptadores/casa.js'

function adaptador(inactivo: number | undefined = 0, apps = [{ nombre: 'WhatsApp', bundle: 'net.whatsapp.WhatsApp', pid: 7, activa: false }, { nombre: 'Google Chrome', bundle: 'com.google.Chrome', pid: 9, activa: true }]) {
  const actos: PedidoActuar[] = []
  const mostrados: any[] = []
  const a: Adaptador = {
    nombre: 'falso',
    observar: async () => ({ app: 'X', pid: 7, ventana: 3, elementos: [], texto: '', total_elementos: 0 }),
    actuar: async p => { actos.push({ ...p }); return { ok: true, efecto: 'confirmado' } },
    apps: async () => apps,
    abrir: async () => ({ pid: 7, ventanas: [] }),
    ventanas: async () => [{ id: 31, pid: 9, app: 'Google Chrome', marco: { x: 0, y: 0, w: 1, h: 1 }, en_pantalla: true, z: 1 }, { id: 40, pid: 7, app: 'WhatsApp', marco: { x: 0, y: 0, w: 1, h: 1 }, en_pantalla: true, z: 2 }],
    verificar: async () => ({ cumple: true, detalle: '' }),
    cursor: async () => ({ x: 0, y: 0 }),
    salud: async () => ({ ok: true, detalle: '' }),
    cerrar: async () => {},
    mostrar: async p => { mostrados.push(p) },
    inactividad: async () => inactivo,
  }
  return { a, actos, mostrados }
}
const decisor = () => ({ nombre: 'x', decidir: async () => ({ eleccion: 'a', confianza: 1, decisor: 'x', ms: 0, costo_usd: 0 }) })

beforeEach(() => modoVer.apagar())

describe('modo «quiero verte»', () => {
  it('reconoce cómo lo pide Daniel y no se enciende con pedidos normales', () => {
    for (const p of ['quiero ver el cursor moviéndose y quiero que seas tú quien esté controlando', 'hazlo en vivo', 'déjame verte', 'muéstrame cómo lo haces']) expect(INTENCION_VER.test(p), p).toBe(true)
    for (const p of ['mándale mensaje a Lucía', 'abre el sexto guardado de X', 'revisa el calendario']) expect(INTENCION_VER.test(p), p).toBe(false)
  })

  it('dura el encargo: un pedido nuevo sin «ver» lo apaga y caduca solo', () => {
    const m = new ModoVer(1000)
    m.observar('quiero verte trabajar', 0)
    expect(m.activo(500)).toBe(true)
    expect(m.activo(1500)).toBe(false)
    m.observar('en vivo', 2000); m.observar('ahora otra cosa', 2100)
    expect(m.activo(2200)).toBe(false)
  })

  it('«quiero verte» NO produce hid: la app pasa al frente una vez y el paso va por dentro con el Halo', async () => {
    const { a, actos, mostrados } = adaptador(999)
    const pedido = 'quiero ver el cursor moviéndose y quiero que seas tú quien esté controlando'
    const r = await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', pedido }, a, decisor)
    await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'escribir', ref: 'e2', texto: 'hola', pedido }, a, decisor)
    expect(r.error).toBeFalsy()
    expect(actos.map(x => x.via)).toEqual([undefined, undefined])
    expect(mostrados).toEqual([{ pid: 7 }])
  })

  it('«quiero verte» como confirmación tampoco autoriza hid si Daniel está activo', async () => {
    const { a, actos } = adaptador(2)
    const r = await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', via: 'hid', confirmacion: 'quiero verte trabajar en vivo', pedido: 'quiero verte trabajar en vivo' }, a, decisor)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/cursor_de_daniel/)
    expect(actos).toHaveLength(0)
  })

  it('hid sin inactividad ni pedido explícito queda bloqueado (y sin medida tampoco pasa)', async () => {
    for (const inactivo of [0, 30, undefined]) {
      const { a, actos } = adaptador(inactivo)
      const r = await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', via: 'hid', pedido: 'mándale mensaje a Lucía' }, a, decisor)
      expect(r.error, String(inactivo)).toBe(true)
      expect(r.text).toMatch(/cursor_de_daniel/)
      expect(actos).toHaveLength(0)
    }
    const { a, actos } = adaptador()
    await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1' }, a, decisor)
    expect(actos[0].via).toBeUndefined()
  })

  it('hid pasa como último recurso: con Daniel inactivo ≥ umbral o con su pedido explícito para esa acción', async () => {
    const quieto = adaptador(600)
    await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', via: 'hid' }, quieto.a, decisor)
    expect(quieto.actos[0]).toMatchObject({ via: 'hid', permiso_hid: 'inactivo', hid_inactivo_s: 60 })
    const activo = adaptador(1)
    await ejecutarManos('actuar', { app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', via: 'hid', confirmacion: 'usa mi ratón para arrastrar eso' }, activo.a, decisor)
    expect(activo.actos[0]).toMatchObject({ via: 'hid', permiso_hid: 'explicito' })
  })

  it('el pedido explícito es SU ratón; «el cursor moviéndose» o una negación no lo son', () => {
    for (const c of ['usa mi ratón', 'toma mi mouse y arrastra la capa', 'hazlo con mi cursor', 'con el ratón real']) expect(pideCursorReal(c), c).toBe(true)
    for (const c of ['quiero ver el cursor moviéndose', 'quiero verte', 'no uses mi ratón', 'no toques mi cursor real', 'mueve el cursor']) expect(pideCursorReal(c), c).toBe(false)
    expect(permisoHid(undefined, 59, 60).ok).toBe(false)
    expect(permisoHid(undefined, 60, 60)).toMatchObject({ ok: true, permiso: 'inactivo' })
  })

  it('el freno no deja pasar hid sin el permiso que pone la capa de herramientas', async () => {
    const { a, actos } = adaptador(999)
    const r = await new Freno(a).actuar({ app: 'net.whatsapp.WhatsApp', accion: 'click', ref: 'e1', via: 'hid' })
    expect(r.efecto).toBe('bloqueado')
    expect(r.freno?.categoria).toBe('cursor_de_daniel')
    expect(actos).toHaveLength(0)
  })

  it('lienzo: «quiero verte» va al frente con el Halo, nunca hid; hid sin permiso se frena', async () => {
    const llamadas: any[] = []
    const c = { async llamar(op: string, args: any) { llamadas.push({ op, args }); if (op === 'inactividad') return { segundos: 3 }; if (op === 'clic_xy' && args.solo_mirar) return { debajo: {} }; if (op === 'rueda') return { efecto: 'confirmado', desplazado: true, via_scroll: 'rueda', intentos: ['rueda ✓'], via: args.via }; return {} } }
    await ejecutarLienzo('rueda', { app: 'com.google.Chrome', dy: 600, pedido: 'quiero verte bajar en X' }, () => c as unknown as ClienteCasa)
    expect(llamadas.find(l => l.op === 'rueda').args).toMatchObject({ via: 'frente', devolver_foco: false })
    llamadas.length = 0
    const r = await ejecutarLienzo('clic_xy', { app: 'com.figma.Desktop', x: 10, y: 10, via: 'hid', pedido: 'arrastra la capa' }, () => c as unknown as ClienteCasa)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/cursor_de_daniel/)
    expect(llamadas.some(l => l.op === 'clic_xy' && !l.args.solo_mirar)).toBe(false)
  })

  it('lienzo: rueda que no movió nada es un error con lo que se intentó', async () => {
    const c = { async llamar() { return { efecto: 'fallo', desplazado: false, intentos: ['rueda fondo ✗', 'teclas AvPág×1 ✗'] } } }
    const r = await ejecutarLienzo('rueda', { app: 'com.google.Chrome', dy: 600 }, () => c as unknown as ClienteCasa)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/NO se movió.*AvPág/)
  })
})

describe('mostrar con pedido explícito', () => {
  it('trae al frente una app de la persona cuando lo pide (falla real: «la ventana 17131 no la abrieron las manos»)', async () => {
    const { a, mostrados } = adaptador()
    const r = await ejecutarManos('mostrar', { app: 'net.whatsapp.WhatsApp', pedido: 'métete a WhatsApp y quiero verte' }, new Freno(a), decisor)
    expect(r.error).toBeFalsy()
    expect(mostrados).toHaveLength(1)
  })
  it('sigue protegiendo las ventanas del navegador de Daniel', async () => {
    const { a, mostrados } = adaptador()
    const r = await ejecutarManos('mostrar', { ventana: 31, pedido: 'muéstrame Chrome' }, new Freno(a), decisor)
    expect(r.error).toBe(true)
    expect(mostrados).toHaveLength(0)
  })
  it('sin pedido de mostrar no trae nada', async () => {
    const { a, mostrados } = adaptador()
    const r = await ejecutarManos('mostrar', { app: 'net.whatsapp.WhatsApp', pedido: 'revisa los mensajes' }, new Freno(a), decisor)
    expect(r.error).toBe(true)
    expect(mostrados).toHaveLength(0)
  })
})

describe('regresión 3 oct 10:38/10:46: un gesto por defecto o «frente» nunca mueve el ratón de Daniel', () => {
  const casa = (resp: Record<string, any>) => {
    const llamadas: any[] = []
    return { llamadas, c: () => ({ async llamar(op: string, args: any) { llamadas.push({ op, args }); if (op === 'clic_xy' && args.solo_mirar) return { debajo: { rol: 'AXGroup' } }; return resp[op] ?? {} } }) as unknown as ClienteCasa }
  }
  it('clic_xy sin via nunca pide hid a ArbrainManos', async () => {
    const f = casa({ clic_xy: { eventos_ax: 4, efecto: 'sin_verificar', cursor_movido_por: 'nadie', via: 'fondo' } })
    const r = await ejecutarLienzo('clic_xy', { app: 'com.anthropic.claudefordesktop', ventana: 21169, x: 1500, y: 1303 }, f.c)
    expect(r.error).toBeFalsy()
    const clic = f.llamadas.find(l => l.op === 'clic_xy' && !l.args.solo_mirar)
    expect(clic.args.via).toBeUndefined()
    expect(clic.args.permiso_hid).toBeUndefined()
  })
  it('si Daniel movió SU ratón durante el gesto, no se reporta «MOVIDO»', async () => {
    const f = casa({ clic_xy: { eventos_ax: 4, efecto: 'sin_verificar', cursor_real_movido: false, cursor_movido_por: 'persona', via: 'fondo' } })
    const r = await ejecutarLienzo('clic_xy', { app: 'com.anthropic.claudefordesktop', x: 1500, y: 1303 }, f.c)
    expect(r.error).toBeFalsy()
    expect(r.text).not.toMatch(/MOVIDO/)
    expect(r.text).toMatch(/él movió su ratón/)
  })
  it('un movimiento sin eventos (la app o el sistema) es error y pide no repetir por fondo', async () => {
    const f = casa({ hover: { eventos: 3, cursor_real_movido: true, cursor_movido_por: 'sin_evento', via: 'frente' } })
    const r = await ejecutarLienzo('pasar_encima', { app: 'com.apple.systempreferences', x: 10, y: 10, via: 'frente' }, f.c)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/no repitas/)
  })
  it('«quiero verte» en lienzo va por frente (SkyLight), nunca hid', async () => {
    const f = casa({ hover: { eventos: 3, cursor_movido_por: 'nadie', via: 'frente' } })
    await ejecutarLienzo('pasar_encima', { app: 'com.apple.systempreferences', x: 10, y: 10, pedido: 'quiero verte' }, f.c)
    expect(f.llamadas.find(l => l.op === 'hover').args.via).toBe('frente')
  })
  it('si el fondo no alcanzó (control sin eventos AX) devuelve fallo con la sugerencia, sin escalar', async () => {
    const f = casa({ clic_xy: { eventos_ax: 0, efecto: 'fallo', detalle: 'el clic de fondo no llegó (AXButton sin eventos AX). Usa actuar por ref (AX), «quiero verte» (via frente, se ve el Halo) o, solo con la cita explícita de Daniel o su inactividad, via hid.', cursor_movido_por: 'nadie', via: 'fondo' } })
    const r = await ejecutarLienzo('clic_xy', { app: 'com.apple.calculator', x: 10, y: 10 }, f.c)
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/actuar por ref/)
    expect(f.llamadas.filter(l => l.op === 'clic_xy' && !l.args.solo_mirar)).toHaveLength(1)
  })
})
