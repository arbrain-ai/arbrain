import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { armarBandeja, tarjetaDeAviso, type AvisoFila, type EstadoDecision, type TarjetaPendiente } from '../../src/features/avisos/bandeja'

// 13 nov 2026, 07:38: Levy subió a la bandeja de decisiones cf_f293bf9d2c33 (publicar el video de @levyarbrain). El daemon dejó en
// `avisos` la fila «Levy espera tu toque: publicar» y la campana la pintaba en «Para saber», plegada: a las 08:09 Daniel no la
// veía en «Te toca decidir». Filas con la forma real de ese día (Supabase `avisos`, source bandeja:decisiones).
const AHORA = new Date('2026-11-13T13:45:00Z')
const fila = (cf: string, hora: string, categoria = 'publicar', p: Partial<AvisoFila> = {}): AvisoFila => ({
  id: `aviso-${cf}`, created_at: hora, kind: 'agente', source: 'bandeja:decisiones', title: `Levy espera tu toque: ${categoria}`,
  body: 'Publicar en @levyarbrain: «Dejé a Fable 5.2 trabajando solo una noche: este fue el resultado» (video largo). Levy recomienda Sí: Es noticia y caduca. Sin tu toque no sale.',
  url: `/telefono/decisiones?id=${cf}`, read_at: null, clave: `decision-${cf}`, ...p,
})
const video: TarjetaPendiente = {
  id: 'cf_f293bf9d2c33', estado: 'en_cola', tipo: 'decision', categoria: 'publicar', creada: Date.parse('2026-11-13T13:38:18Z'),
  titulo: 'Publicar en @levyarbrain: «Dejé a Fable 5.2 trabajando solo una noche: este fue el resultado» (video largo)',
  recomienda: 'si', recomendacion: 'Es noticia y caduca.',
}
const sinEstado = new Map<string, EstadoDecision>()

test('la fila que avisa de una tarjeta sabe cuál es (por su clave o por su enlace)', () => {
  assert.equal(tarjetaDeAviso(fila('cf_f293bf9d2c33', '2026-11-13T13:38:18Z')), 'cf_f293bf9d2c33')
  assert.equal(tarjetaDeAviso(fila('cf_d27fd111caed', '2026-11-13T03:22:49Z', 'contactar a alguien', { clave: null })), 'cf_d27fd111caed')
  assert.equal(tarjetaDeAviso({ source: 'ht-grupales', url: '/telefono/decisiones?id=cf_f293bf9d2c33', clave: null }), null)
})

test('«Te toca decidir» muestra TODAS las pendientes de /decisiones, de cualquier categoría, con Sí · No · Ver detalle', () => {
  const tarjetas: TarjetaPendiente[] = [video,
    { id: 'cf_aaaaaaaaaaaa', tipo: 'decision', categoria: 'enviar', creada: Date.parse('2026-11-13T12:00:00Z'), titulo: 'WhatsApp a Mengano: mover su uno a uno', recomienda: 'no', recomendacion: 'Todavía no confirma.' },
    { id: 'cf_bbbbbbbbbbbb', tipo: 'decision', categoria: 'pagar', creada: Date.parse('2026-11-13T11:00:00Z'), titulo: 'Comprar midominio.app' },
    { id: 'cf_cccccccccccc', tipo: 'decision', categoria: 'borrar', creada: Date.parse('2026-11-13T10:00:00Z'), titulo: 'Borrar la rama vieja de pruebas' },
    { id: 'cf_dddddddddddd', tipo: 'decision', categoria: 'otra', creada: Date.parse('2026-11-13T09:00:00Z'), titulo: 'Mover la grupal al viernes' },
    { id: 'cf_eeeeeeeeeeee', tipo: 'manos', categoria: 'enviar', creada: Date.parse('2026-11-13T08:00:00Z'), titulo: 'Correr el envío desde tu terminal' },
  ]
  const b = armarBandeja([fila('cf_f293bf9d2c33', '2026-11-13T13:38:18Z')], sinEstado, AHORA, 20, new Set(), tarjetas)
  assert.deepEqual(b.decidir.map(v => v.tarjeta), tarjetas.map(t => t.id), 'todas, la más nueva arriba')
  assert.equal(b.pendientes, tarjetas.length)
  assert.equal(b.saber.length, 0, 'nada de la bandeja cae en «Para saber»')
  assert.deepEqual(b.cerrar, [], 'la fila de una tarjeta que sigue esperando no se cierra: solo no se repite')
  const v = b.decidir[0]
  assert.equal(v.titulo, video.titulo)
  assert.equal(v.frase, 'Levy recomienda que sí: Es noticia y caduca.')
  assert.deepEqual(v.acciones.map(a => a.etiqueta), ['Sí', 'No', 'Ver detalle'])
  assert.deepEqual(v.acciones[2], { tipo: 'abrir', etiqueta: 'Ver detalle', url: '/telefono/decisiones?id=cf_f293bf9d2c33' })
  // La recomendada va primero (la tecla encendida); «Córrelo tú» no se aprueba desde aquí.
  assert.deepEqual(b.decidir[1].acciones.map(a => a.tipo), ['no', 'si', 'abrir'])
  assert.deepEqual(b.decidir[5].acciones.map(a => a.tipo), ['abrir'])
})

test('la fila de una tarjeta que ya se decidió se cierra sola; sin poder leer la bandeja, la fila sigue en «Te toca decidir»', () => {
  const decidida = armarBandeja([fila('cf_f293bf9d2c33', '2026-11-13T13:38:18Z')], sinEstado, AHORA, 20, new Set(), [])
  assert.deepEqual(decidida.cerrar, [{ id: 'aviso-cf_f293bf9d2c33', por: 'decidido' }])
  assert.equal(decidida.pendientes, 0)
  // Daemon sin responder (null): falta de dato no es «decidida». Antes caía en «Para saber»; ahora pide su toque y abre su página.
  const ciega = armarBandeja([fila('cf_f293bf9d2c33', '2026-11-13T13:38:18Z')], sinEstado, AHORA, 20, new Set(), null)
  assert.equal(ciega.saber.length, 0)
  assert.equal(ciega.decidir.length, 1)
  assert.match(ciega.decidir[0].titulo, /^Publicar en @levyarbrain/)
  assert.equal(ciega.decidir[0].frase, 'Espera tu toque: publicar')
  assert.deepEqual(ciega.decidir[0].acciones, [{ tipo: 'abrir', etiqueta: 'Decidir', url: '/telefono/decisiones?id=cf_f293bf9d2c33' }])
})

test('/api/avisos lee la bandeja en vivo y no manda las tarjetas como filas de `avisos` (la Cabina marca leídas solo filas)', () => {
  const ruta = readFileSync(new URL('../../src/app/api/avisos/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /pendientesDeLaBandeja\(request\)/)
  assert.match(ruta, /armarBandeja\(filas, estados, new Date\(\), 20, publicados, tarjetas\)/)
  assert.match(ruta, /\.filter\(v => !v\.tarjeta\)/)
  // Sí · No de la campana es el mismo toque que la bandeja: POST /api/decisiones { accion: 'resolver' }.
  const campana = readFileSync(new URL('../../src/features/notifications/components/NotificationBell.tsx', import.meta.url), 'utf8')
  assert.match(campana, /fetch\('\/api\/decisiones', \{ method: 'POST'[^\n]*accion: 'resolver', id: a\.tarjeta, respuesta/)
})
