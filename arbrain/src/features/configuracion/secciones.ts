/**
 * Mapa de Ajustes (6 oct 2026): las secciones, sus grupos en la navegación (como la app de Claude) y el índice del
 * buscador. Módulo puro, sin React, para probarlo con node:test. Cada sección lista sus ajustes concretos: el buscador
 * de la nav filtra secciones Y ajustes, y un ajuste encontrado lleva a su sección.
 */
import { esEdicionCliente } from '@/lib/edicion'
import { capital, NOMBRE_DUENO, NOMBRE_SEGUNDA } from '@/config'

const CLIENTE = esEdicionCliente()

export type IdSeccion = 'norte' | 'equipo' | 'clientes' | 'oferta' | 'embudo' | 'modelo' | 'apariencia' | 'cuenta' | 'avisos' | 'mac' | 'atajos' | 'panel' | 'llaves' | 'voz' | 'sinfiltro' | 'privacidad' | 'seguridad' | 'telefono' | 'maquinas' | 'autonomia' | 'directo'

export interface DefSeccion { id: IdSeccion; nombre: string; detalle: string; ajustes: string[] }
export interface DefGrupo { id: string; titulo: string; secciones: IdSeccion[] }

const TODAS: ReadonlyArray<DefSeccion> = [
  { id: 'norte', nombre: 'Norte', detalle: 'Hacia dónde va el negocio: visión, misión y principios', ajustes: ['Visión', 'Misión', 'Misión para los clientes', `Misión de ${NOMBRE_DUENO()}`, 'Misión del equipo', 'Principios', 'Borrador sin firmar'] },
  { id: 'equipo', nombre: 'Equipo', detalle: 'El organigrama: quién lleva qué', ajustes: ['Organigrama', 'Quién lleva qué', capital(NOMBRE_SEGUNDA()), 'Levy', 'Trinity', 'Sensei', 'Próxima contratación'] },
  { id: 'clientes', nombre: 'Clientes', detalle: 'A quién le hablamos: el avatar', ajustes: ['Avatar', 'Cliente ideal', 'ICP', 'Emprendedor que aplica IA'] },
  { id: 'oferta', nombre: 'Oferta', detalle: 'Lo que vendemos: low ticket y high ticket', ajustes: ['Low ticket', 'High ticket', 'LT', 'HT', 'Promesa', 'Precio'] },
  { id: 'embudo', nombre: 'Embudo', detalle: 'Cómo una persona pasa de vernos a comprar', ajustes: ['Embudo', 'Definición del embudo', 'Funnel', 'Distribución por canal'] },
  { id: 'cuenta', nombre: 'Cuenta', detalle: 'Tu nombre y tu foto', ajustes: ['Nombre', 'Foto de perfil', 'Correo'] },
  // Modo directo (7 nov 2026): antes de grabar o transmitir. Tapa nombres, dinero y secretos; niega Finanzas, Cohorte, Casa y Perro.
  { id: 'directo', nombre: 'Modo directo', detalle: 'Antes de grabar o transmitir: tapa clientes, dinero y secretos', ajustes: ['Modo directo', 'En directo', 'Transmitir', 'Grabar pantalla', 'Stream', 'Live', 'Directo', 'Ocultar datos', 'Ocultar clientes', 'Ocultar dinero', 'Ocultar secretos', '⌘⇧D'] },
  { id: 'apariencia', nombre: 'Apariencia', detalle: 'Tema claro u oscuro', ajustes: ['Tema', 'Modo oscuro', 'Modo claro', 'Tema del sistema'] },
  { id: 'avisos', nombre: 'Notificaciones', detalle: CLIENTE ? 'Los avisos de Levy en tu teléfono: activar, probar y apagar' : 'Reportes y avisos en tu teléfono: activar, probar y apagar', ajustes: ['Activar notificaciones', 'Notificaciones push', 'Avisos en el teléfono', 'Avisos de Levy', 'Enviarme una prueba', 'Desactivar notificaciones', ...(CLIENTE ? ['Rutinas', 'Decisiones pendientes'] : ['Reportes']), 'iPhone', 'Pantalla de inicio'] },
  { id: 'modelo', nombre: 'Modelos', detalle: 'Qué modelos salen en el chat y en qué motor nacen', ajustes: ['Motores', 'Conversaciones nuevas', 'Modelo por defecto', 'Claude', 'DeepSeek', 'OpenRouter'] },
  // Autonomía v2 (4 nov 2026): el preset y cada clase (lo hace solo · te pregunta · nunca). Aquí se enciende el soporte a la cohorte.
  { id: 'autonomia', nombre: 'Autonomía', detalle: 'Qué hace Levy solo y qué espera tu toque', ajustes: ['Autonomía', 'Política de autonomía', 'Cauteloso', 'Equilibrado', 'Piloto automático', 'Lo hace solo', 'Te pregunta', 'Soporte técnico a la cohorte', 'Dudas de los alumnos', 'Configurar servicios', 'Tu agenda', 'Classroom de la cohorte', 'Lo que hice solo'] },
  { id: 'panel', nombre: 'Panel', detalle: 'Qué secciones salen en el «+» del panel', ajustes: ['Secciones del «+»', 'Ocultar secciones', 'Orden de las secciones', 'Tareas'] },
  { id: 'atajos', nombre: 'Atajos', detalle: 'Teclado de la app y del Canvas', ajustes: ['Atajos de teclado', 'Abrir Ajustes ⌘,', 'Atajos del Canvas', 'Atajos del Calendario'] },
  { id: 'mac', nombre: CLIENTE ? 'Esta computadora' : 'Mac y sistema', detalle: CLIENTE ? 'Computer use y permisos del sistema' : 'Permisos de macOS y Ops', ajustes: ['Permisos de macOS', 'Micrófono', 'Cámara', 'Grabación de pantalla', 'Accesibilidad', 'Computer use', 'Ops', ...(CLIENTE ? [] : ['Sincronización', 'Cola de sincronización', 'Conflictos', 'Paquete offline', 'Espejo local'])] },
  // Edición cliente (11 oct 2026): las llaves del alumno (BYOK) y su privacidad.
  { id: 'llaves', nombre: 'Llaves', detalle: 'Tu conexión con Claude y OpenRouter', ajustes: ['API key de Anthropic', 'Cuenta de Claude', 'Token', 'OpenRouter', 'Probar conexión', 'Llavero'] },
  // Voz del alumno (21 oct 2026): su llave de Groq (gratis) para dictar; «Escuchar» usa la voz del dispositivo.
  { id: 'voz', nombre: 'Voz', detalle: 'Dictar con tu llave de Groq (gratis)', ajustes: ['Llave de Groq', 'Groq', 'Dictar', 'Micrófono', 'Nota de voz', 'Transcribir', 'Escuchar'] },
  // Sin filtro del alumno (v0.2.23, 4 nov 2026): SU llave de abliteration.ai para DeepSeek V4.1 Flash abliterated.
  { id: 'sinfiltro', nombre: 'Sin filtro', detalle: 'DeepSeek abliterated con tu llave de abliteration.ai', ajustes: ['Sin filtro', 'Modelo sin filtro', 'DeepSeek abliterated', 'Abliterated', 'abliteration.ai', 'Llave de abliteration.ai', 'No es Claude'] },
  // Seguridad del alumno (12 oct 2026): freno general, bitácora, carpetas abiertas y tope de gasto.
  // Grupal 23 oct 2026: el modo de permisos y las carpetas van primero («demasiadas confirmaciones»).
  { id: 'seguridad', nombre: 'Permisos y seguridad', detalle: 'Cuánto te pregunta Levy, a qué carpetas entra, pausar todo y tope de gasto', ajustes: ['Permisos', 'Modo de permisos', 'Preguntar siempre', 'Automático en mi carpeta', 'Sin preguntar', 'Confirmaciones', 'Carpetas a las que tu cerebro puede entrar', 'Carpetas abiertas', 'Abrir carpeta', 'Pausar todo', 'Reanudar', 'Lo que hizo Levy', 'Bitácora', 'Tope de gasto', 'Límite de crédito', 'Gasto'] },
  // Tu cerebro en el teléfono (23 oct 2026): tu Arbrain en el celular por tu Tailscale (scripts/servidor/telefono.mjs).
  // Sin Tailscale (3 nov 2026): QR, «Listo desde…» y la dirección privada por el relay de Arbrain (scripts/servidor/conectar.mjs).
  { id: 'telefono', nombre: 'Teléfono', detalle: 'Tu Levy en tu celular: escanea el QR, sin instalar nada', ajustes: ['Teléfono', 'Tu cerebro en el teléfono', 'Tu Levy en el teléfono', 'Celular', 'iPhone', 'Android', 'Código QR', 'Escanear con tu teléfono', 'Dirección privada', 'Cerrar sesión en todos los teléfonos', 'Código para entrar', 'Pantalla de inicio', 'App en el teléfono', 'Tailscale'] },
  { id: 'maquinas', nombre: 'Máquinas', detalle: 'Dónde corre tu Levy: esta computadora y tu servidor', ajustes: ['Máquinas', 'Esta computadora', 'Mi servidor', 'Otra computadora', 'Agregar otra máquina', 'Unir a mi cuenta', 'Abrir otra máquina'] },
  { id: 'privacidad', nombre: 'Privacidad', detalle: 'Monitoreo del programa y documentos legales', ajustes: ['Monitoreo de cohorte', 'Compartir mi avance', 'Qué se envía', 'Aviso de privacidad', 'Términos de uso', 'Licencia'] },
]

const GRUPOS_ORIGINAL: ReadonlyArray<DefGrupo> = [
  { id: 'negocio', titulo: 'El negocio', secciones: ['norte', 'equipo', 'clientes', 'oferta', 'embudo'] },
  { id: 'tu', titulo: 'Tú', secciones: ['cuenta', 'apariencia', 'avisos', 'directo'] },
  { id: 'arbrain', titulo: 'Arbrain', secciones: ['modelo', 'autonomia', 'panel', 'atajos'] },
  { id: 'computadora', titulo: 'Esta computadora', secciones: ['mac'] },
]

/**
 * Edición cliente: sin «El negocio» (es el de Daniel) ni Cuenta (perfil y foto viven en su Supabase). Llaves y
 * Privacidad son suyas: se pueden cambiar después del primer arranque. Notificaciones (v0.2.18): los avisos de SU Levy
 * en su teléfono, junto a «Tu cerebro en el teléfono».
 */
const GRUPOS_CLIENTE: ReadonlyArray<DefGrupo> = [
  { id: 'tu', titulo: 'Tú', secciones: ['llaves', 'voz', 'sinfiltro', 'telefono', 'maquinas', 'avisos', 'seguridad', 'privacidad', 'apariencia'] },
  { id: 'arbrain', titulo: 'Arbrain', secciones: ['modelo', 'panel', 'atajos'] },
  { id: 'computadora', titulo: 'Esta computadora', secciones: ['mac'] },
]

export const GRUPOS: ReadonlyArray<DefGrupo> = CLIENTE ? GRUPOS_CLIENTE : GRUPOS_ORIGINAL

/** Las secciones de esta edición: exactamente las que agrupa su navegación. */
export const SECCIONES: ReadonlyArray<DefSeccion> = TODAS.filter((d) => GRUPOS.some((g) => g.secciones.includes(d.id)))

export const SECCION_INICIAL: IdSeccion = CLIENTE ? 'llaves' : 'cuenta'

/** Enlaces viejos que siguen vivos: `permisos` → Mac y sistema (en la edición cliente, Permisos y seguridad), `modelos` → Modelos, `notificaciones` → Notificaciones (id `avisos`). `labels` se fue al Board. */
const ALIAS: Record<string, IdSeccion> = { notificaciones: 'avisos', permisos: CLIENTE ? 'seguridad' : 'mac', modelos: 'modelo', general: 'apariencia', teclado: 'atajos', 'en-directo': 'directo', stream: 'directo' }

export const defDe = (id: IdSeccion): DefSeccion => TODAS.find((s) => s.id === id)!

/** `?seccion=` (nuevo) o `?section=` (viejo); un valor desconocido abre la sección inicial. */
export function seccionDeUrl(valor: string | null | undefined): IdSeccion {
  if (!valor) return SECCION_INICIAL
  if (SECCIONES.some((s) => s.id === valor) && GRUPOS.some((g) => g.secciones.includes(valor as IdSeccion))) return valor as IdSeccion
  const alias = ALIAS[valor]
  return alias && SECCIONES.some((s) => s.id === alias) ? alias : SECCION_INICIAL
}

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface ResultadoGrupo { grupo: DefGrupo; secciones: Array<{ seccion: DefSeccion; coincidencias: string[] }> }

/**
 * Filtra la nav. Una sección entra si su nombre o detalle coinciden (muestra entera) o si algún ajuste suyo coincide
 * (la lista de ajustes encontrados va debajo). Sin consulta: todo. Un grupo sin secciones desaparece.
 */
export function buscarAjustes(consulta: string): ResultadoGrupo[] {
  const q = normalizar(consulta.trim())
  return GRUPOS.map((grupo) => ({
    grupo,
    secciones: grupo.secciones.flatMap((id) => {
      const seccion = defDe(id)
      if (!q) return [{ seccion, coincidencias: [] as string[] }]
      const propia = normalizar(`${seccion.nombre} ${seccion.detalle} ${grupo.titulo}`).includes(q)
      const coincidencias = seccion.ajustes.filter((a) => normalizar(a).includes(q))
      return propia || coincidencias.length ? [{ seccion, coincidencias: propia ? [] : coincidencias }] : []
    }),
  })).filter((g) => g.secciones.length > 0)
}
