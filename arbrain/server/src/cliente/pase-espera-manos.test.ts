/**
 * Espera de confirmación de las manos (1 nov 2026, firmado por Daniel). El red team 4 (M4-2) cerró al pase de agente
 * `GET /confirmaciones/cf_<id>` y `POST /confirmaciones/encolar`, pero el MCP de manos los usa para esperar el clic de
 * la persona en una acción irreversible (`manos/confirmacion-humana.ts`): con 403, el agente veía «venció» al primer
 * sondeo. Se abren SOLO esas dos, con la misma autenticación (daemon local + pase), y la lectura solo devuelve
 * `{ id, estado }` de confirmaciones de origen `manos`.
 *
 * GUARDIA: esta prueba falla si cualquier otra ruta se abre al pase. Para abrir una, hay que cambiar aquí la lista
 * esperada a propósito (y explicar por qué en el reporte del cambio).
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { rutaSoloApp, rutasDelPase } from './cofre.js'
import { Confirmaciones, huellaManos, vistaParaPase } from './confirmaciones.js'

describe('guardia: el pase abre exactamente esto', () => {
  it('la lista completa de lo que abre el pase no cambia sin cambiar esta prueba', () => {
    expect(rutasDelPase()).toEqual({
      exactas: [
        'GET /health', 'GET /manos/estado', 'GET /manos/interruptor', 'GET /schedule',
        'POST /confirmaciones/consumir', 'POST /confirmaciones/encolar', 'POST /confirmaciones/pedir',
        'POST /manos/apps/pedir', 'POST /manos/turno', 'POST /schedule',
      ],
      patrones: ['GET ^\\/confirmaciones\\/cf_[0-9a-f]{12}$', 'GET ^\\/manos\\/apps\\/pa_[0-9a-f]{12}$'],
    })
  })

  it('las dos rutas de la espera de las manos: abiertas, y solo con su método y su forma exacta', () => {
    expect(rutaSoloApp('GET', '/confirmaciones/cf_0123456789ab')).toBe(false)
    expect(rutaSoloApp('POST', '/confirmaciones/encolar')).toBe(false)
    for (const [m, r] of [
      ['POST', '/confirmaciones/cf_0123456789ab'], ['DELETE', '/confirmaciones/cf_0123456789ab'], ['GET', '/confirmaciones/encolar'],
      ['GET', '/confirmaciones/cf_0123'], ['GET', '/confirmaciones/cf_0123456789abc'], ['GET', '/confirmaciones/cf_0123456789AB'],
      ['GET', '/confirmaciones/cf_0123456789ab/x'], ['GET', '/confirmaciones/xx_0123456789ab'],
    ] as const) expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(true)
  })

  it('todo lo demás que cerró el red team (M-1/M-2 y M4-2) sigue cerrado', () => {
    const cerradas: Array<[string, string]> = [
      // M4-2: lecturas de la persona
      ['GET', '/sessions'], ['GET', '/chat/backstage'], ['GET', '/chat/sessions'], ['POST', '/chat/sdk-sessions'],
      ['GET', '/ops/recent'], ['GET', '/ops/stream'], ['GET', '/usage'], ['GET', '/confirmaciones'],
      ['GET', '/fs/read'], ['GET', '/fs/list'], ['GET', '/fs/index'], ['POST', '/cabina'], ['GET', '/cohorte'],
      ['GET', '/commands'], ['GET', '/limits'], ['GET', '/models'], ['POST', '/efforts'], ['POST', '/preferencias/motor'],
      ['POST', '/modelos/catalogo'], ['POST', '/tts'], ['POST', '/live/workspace'], ['POST', '/live/transcribe'],
      ['POST', '/chat/despertadores'], ['POST', '/schedule/x/run'],
      // M-1/M-2: escrituras en nombre de la persona
      ...(['/apagar', '/llaves/probar', '/manos/interruptor', '/confirmaciones/resolver', '/cohorte/consentimiento', '/chat', '/chat/stream',
        '/chat/fork', '/newchat', '/cohorte/venta', '/synthesize', '/schedule/abc/run', '/schedule/abc/pause', '/schedule/abc/resume'] as const).map(r => ['POST', r] as [string, string]),
      // Permiso por app: ver, resolver y quitar son de la app
      ['GET', '/manos/apps'], ['POST', '/manos/apps/resolver'], ['POST', '/manos/apps/quitar'],
    ]
    for (const [m, r] of cerradas) expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(true)
  })
})

describe('lo que ve el pase de una confirmación', () => {
  const store = new Confirmaciones(new Database(':memory:'))
  const manos = store.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'Levy usando tu computadora: manos:actuar', literal: 'manos:actuar ["WhatsApp","hola Juan"]', herramienta: 'manos:actuar', huella: huellaManos('manos:actuar', ['WhatsApp']), creadaPor: 'peticion' })
  const agente = store.pedir({ origen: 'agente', categoria: 'borrar', resumen: 'Borrar archivos', literal: 'rm -rf ~/Documentos', herramienta: 'Bash', huella: 'agente:x' })
  const rutina = store.pedir({ origen: 'cron', categoria: 'enviar', resumen: 'Mandar el reporte', literal: 'gog gmail send', herramienta: 'Bash', huella: 'cron:x' })

  it('de manos: solo id y estado (sin literal, resumen, conversación ni nada más)', () => {
    expect(vistaParaPase(store.get(manos.id))).toEqual({ id: manos.id, estado: 'pendiente' })
    store.resolver(manos.id, 'permitir')
    expect(vistaParaPase(store.get(manos.id))).toEqual({ id: manos.id, estado: 'permitida' })
  })

  it('las del agente y las de rutinas no existen para el pase', () => {
    expect(vistaParaPase(store.get(agente.id))).toBeNull()
    expect(vistaParaPase(store.get(rutina.id))).toBeNull()
    expect(vistaParaPase(null)).toBeNull()
  })

  it('una de origen manos que no pidió el MCP (creada por la guardia) tampoco', () => {
    const c = store.pedir({ origen: 'manos', categoria: 'otra', resumen: 'x', literal: 'y', huella: 'manos:otra', creadaPor: 'guardia' })
    expect(vistaParaPase(store.get(c.id))).toBeNull()
  })
})
