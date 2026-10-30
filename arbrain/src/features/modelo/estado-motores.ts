/**
 * Estado de los motores para Configuración → Modelo y motores (2 oct 2026). Lógica pura (sin React ni red) para
 * probarla con `tsx --test`. Decisión del autor (2 oct): sin GPT. Motores: Claude (Claude Code SDK)
 * y Codex SOLO como arnés de DeepSeek por OpenRouter. GPT no se ofrece.
 *
 * El registro del daemon (`GET /modelos/registro`) dice por qué una ruta no está disponible; aquí se traduce a
 * pasos verificables en español, sin depender del texto de `motivo`, que es para logs.
 */

export interface RutaPublica { id: string; nombre: string; modelId: string; cuenta: string; proveedorId: string; disponible: boolean; motivo: string | null; estado: string }
export interface ProveedorPublico { id: string; nombre: string; auth: { kind: string; variable?: string; presente?: boolean; cuentas?: string[] } }
export interface Registro { motorApi: boolean; rutas: RutaPublica[]; proveedores: ProveedorPublico[] }

/** `viejo`: el servidor del chat no publica el registro (404), corre una versión anterior. */
export type EstadoRegistro = 'cargando' | 'ok' | 'viejo' | 'error'

/** Espacios del chat de la suscripción de OpenAI: ya no se ofrecen. */
export const CUENTAS_GPT = ['codex', 'yt'] as const
export const esCuentaGpt = (motor: string | null | undefined): boolean => !!motor && (CUENTAS_GPT as readonly string[]).includes(motor)

export interface Paso { ok: boolean | null; texto: string }
export interface EstadoMotor {
  id: string
  titulo: string
  detalle: string
  /** Se puede elegir para las conversaciones nuevas. */
  disponible: boolean
  /** Una línea: «Activo», «Bloqueado», «Comprobando…». */
  etiqueta: string
  /** Qué se comprobó, en orden. Vacío cuando no hay nada que explicar. */
  pasos: Paso[]
  /** Qué falta hacer y quién, cuando está bloqueado. */
  queFalta: string | null
}

export const MOTOR_CLAUDE: EstadoMotor = {
  id: 'default',
  titulo: 'Claude',
  detalle: 'Tu suscripción Max · Claude Code SDK',
  disponible: true,
  etiqueta: 'Activo',
  pasos: [],
  queFalta: null,
}

const REINICIO = 'Lo hace Levy, junto con el reinicio del servidor del chat (com.claudeclaw.app).'

/** Cada ruta por API del registro (hoy, DeepSeek por OpenRouter con Codex como arnés). */
export function motoresPorApi(registro: Registro | null, estado: EstadoRegistro): EstadoMotor[] {
  if (estado === 'cargando') {
    return [{ id: 'deepseek', titulo: 'DeepSeek', detalle: 'OpenRouter · Codex como arnés', disponible: false, etiqueta: 'Comprobando…', pasos: [], queFalta: null }]
  }
  if (estado !== 'ok' || !registro) {
    const viejo = estado === 'viejo'
    return [{
      id: 'deepseek',
      titulo: 'DeepSeek',
      detalle: 'OpenRouter · Codex como arnés',
      disponible: false,
      etiqueta: 'Bloqueado',
      pasos: [{ ok: false, texto: viejo ? 'El servidor del chat corre una versión anterior: todavía no publica el registro de motores.' : 'No hubo respuesta del servidor del chat al pedir el registro de motores.' }],
      queFalta: viejo ? `Falta que el servidor del chat tome la versión nueva. ${REINICIO}` : 'Revisar que el servidor del chat esté en línea.',
    }]
  }
  return registro.rutas.map((r) => {
    const p = registro.proveedores.find((x) => x.id === r.proveedorId)
    const variable = p?.auth.variable ?? 'la llave'
    const llave = p?.auth.kind !== 'api-key' ? true : p.auth.presente === true
    const activa = r.estado !== 'desactivada'
    const pasos: Paso[] = [
      { ok: true, texto: 'El servidor del chat publica el registro de motores.' },
      { ok: llave, texto: llave ? `La llave ${variable} está en arbrain/server/.env.` : `Falta la llave ${variable} en arbrain/server/.env del Studio.` },
      { ok: registro.motorApi, texto: registro.motorApi ? 'El motor por API está encendido (ARBRAIN_MOTOR_API=1).' : 'El motor por API está apagado: falta ARBRAIN_MOTOR_API=1 en arbrain/server/.env.' },
      { ok: activa, texto: activa ? `La ruta está activa (${r.estado === 'experimental' ? 'experimental' : r.estado}).` : 'La ruta está desactivada en el registro.' },
    ]
    const disponible = r.disponible && llave && registro.motorApi && activa
    const queFalta = disponible ? null
      : !llave ? `Falta poner ${variable} en arbrain/server/.env del Studio. ${REINICIO}`
      : !registro.motorApi ? `Falta encender el interruptor ARBRAIN_MOTOR_API=1 en arbrain/server/.env del Studio. ${REINICIO}`
      : !activa ? 'La ruta está desactivada en el registro de modelos del daemon.'
      : r.motivo ?? 'El servidor la marca como no disponible.'
    return {
      id: r.cuenta,
      titulo: r.nombre,
      detalle: `${p?.nombre ?? r.proveedorId} · Codex como arnés · se paga por uso`,
      disponible,
      etiqueta: disponible ? (r.estado === 'experimental' ? 'Activo · experimental' : 'Activo') : 'Bloqueado',
      pasos,
      queFalta,
    }
  })
}

/** Opciones para «Conversaciones nuevas»: Como está, Claude, las rutas por API y, SOLO si la preferencia guardada
 *  todavía apunta a GPT, esa fila marcada como sin suscripción para poder salir de ella. */
export function opcionesNuevas(motores: EstadoMotor[], guardado: string | null): Array<{ id: string | null; titulo: string; detalle: string; disponible: boolean; aviso: string | null }> {
  const filas: Array<{ id: string | null; titulo: string; detalle: string; disponible: boolean; aviso: string | null }> = [
    { id: null, titulo: 'Como está', detalle: 'Sin preferencia: la conversación nueva nace en el espacio activo, con su modelo y esfuerzo de siempre.', disponible: true, aviso: null },
    ...motores.map((m) => ({ id: m.id, titulo: m.titulo, detalle: m.detalle, disponible: m.disponible, aviso: m.disponible ? null : m.etiqueta === 'Comprobando…' ? null : 'Bloqueado: el motor de arriba dice qué falta.' })),
  ]
  if (esCuentaGpt(guardado)) {
    filas.push({ id: guardado, titulo: 'GPT (guardado antes)', detalle: 'OpenAI ya no tiene suscripción: elige Claude o DeepSeek y guarda.', disponible: false, aviso: 'Sin suscripción de OpenAI.' })
  }
  return filas
}
