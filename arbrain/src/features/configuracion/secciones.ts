/**
 * Mapa de Ajustes (6 oct 2026): las secciones, sus grupos en la navegación (como la app de Claude) y el índice del
 * buscador. Módulo puro, sin React, para probarlo con node:test. Cada sección lista sus ajustes concretos: el buscador
 * de la nav filtra secciones Y ajustes, y un ajuste encontrado lleva a su sección.
 */
import { esEdicionCliente } from '@/lib/edicion'
import { capital, NOMBRE_DUENO, NOMBRE_SEGUNDA } from '@/config'

const CLIENTE = esEdicionCliente()

export type IdSeccion = 'norte' | 'equipo' | 'clientes' | 'oferta' | 'embudo' | 'modelo' | 'apariencia' | 'cuenta' | 'avisos' | 'mac' | 'atajos' | 'panel' | 'llaves' | 'voz' | 'privacidad' | 'seguridad'

export interface DefSeccion { id: IdSeccion; nombre: string; detalle: string; ajustes: string[] }
export interface DefGrupo { id: string; titulo: string; secciones: IdSeccion[] }

const TODAS: ReadonlyArray<DefSeccion> = [
  { id: 'norte', nombre: 'Norte', detalle: 'Hacia dónde va el negocio: visión, misión y principios', ajustes: ['Visión', 'Misión', 'Misión para los clientes', `Misión de ${NOMBRE_DUENO()}`, 'Misión del equipo', 'Principios', 'Borrador sin firmar'] },
  { id: 'equipo', nombre: 'Equipo', detalle: 'El organigrama: quién lleva qué', ajustes: ['Organigrama', 'Quién lleva qué', capital(NOMBRE_SEGUNDA()), 'Levy', 'Trinity', 'Sensei', 'Próxima contratación'] },
  { id: 'clientes', nombre: 'Clientes', detalle: 'A quién le hablamos: el avatar', ajustes: ['Avatar', 'Cliente ideal', 'ICP', 'Emprendedor que aplica IA'] },
  { id: 'oferta', nombre: 'Oferta', detalle: 'Lo que vendemos: low ticket y high ticket', ajustes: ['Low ticket', 'High ticket', 'LT', 'HT', 'Promesa', 'Precio'] },
  { id: 'embudo', nombre: 'Embudo', detalle: 'Cómo una persona pasa de vernos a comprar', ajustes: ['Embudo', 'Definición del embudo', 'Funnel', 'Distribución por canal'] },
  { id: 'cuenta', nombre: 'Cuenta', detalle: 'Tu nombre y tu foto', ajustes: ['Nombre', 'Foto de perfil', 'Correo'] },
  { id: 'apariencia', nombre: 'Apariencia', detalle: 'Tema claro u oscuro', ajustes: ['Tema', 'Modo oscuro', 'Modo claro', 'Tema del sistema'] },
  { id: 'avisos', nombre: 'Notificaciones', detalle: 'Reportes y avisos en tu teléfono: activar, probar y apagar', ajustes: ['Activar notificaciones', 'Notificaciones push', 'Avisos en el teléfono', 'Enviarme una prueba', 'Desactivar notificaciones', 'Reportes', 'iPhone', 'Pantalla de inicio'] },
  { id: 'modelo', nombre: 'Modelos', detalle: 'Qué modelos salen en el chat y en qué motor nacen', ajustes: ['Motores', 'Conversaciones nuevas', 'Modelo por defecto', 'Claude', 'DeepSeek', 'OpenRouter'] },
  { id: 'panel', nombre: 'Panel', detalle: 'Qué secciones salen en el «+» del panel', ajustes: ['Secciones del «+»', 'Ocultar secciones', 'Orden de las secciones', 'Tareas'] },
  { id: 'atajos', nombre: 'Atajos', detalle: 'Teclado de la app y del Canvas', ajustes: ['Atajos de teclado', 'Abrir Ajustes ⌘,', 'Atajos del Canvas', 'Atajos del Calendario'] },
  { id: 'mac', nombre: CLIENTE ? 'Esta computadora' : 'Mac y sistema', detalle: CLIENTE ? 'Computer use y permisos del sistema' : 'Permisos de macOS y Ops', ajustes: ['Permisos de macOS', 'Micrófono', 'Cámara', 'Grabación de pantalla', 'Accesibilidad', 'Computer use', 'Ops'] },
  // Edición cliente (11 oct 2026): las llaves del alumno (BYOK) y su privacidad.
  { id: 'llaves', nombre: 'Llaves', detalle: 'Tu conexión con Claude y OpenRouter', ajustes: ['API key de Anthropic', 'Cuenta de Claude', 'Token', 'OpenRouter', 'Probar conexión', 'Llavero'] },
  // Voz del alumno (21 oct 2026): su llave de Groq (gratis) para dictar; «Escuchar» usa la voz del dispositivo.
  { id: 'voz', nombre: 'Voz', detalle: 'Dictar con tu llave de Groq (gratis)', ajustes: ['Llave de Groq', 'Groq', 'Dictar', 'Micrófono', 'Nota de voz', 'Transcribir', 'Escuchar'] },
  // Seguridad del alumno (12 oct 2026): freno general, bitácora, carpetas abiertas y tope de gasto.
  { id: 'seguridad', nombre: 'Seguridad', detalle: 'Pausar todo, lo que hizo Levy, carpetas abiertas y tope de gasto', ajustes: ['Pausar todo', 'Reanudar', 'Lo que hizo Levy', 'Bitácora', 'Carpetas abiertas', 'Abrir carpeta', 'Tope de gasto', 'Límite de crédito', 'Gasto'] },
  { id: 'privacidad', nombre: 'Privacidad', detalle: 'Monitoreo del programa y documentos legales', ajustes: ['Monitoreo de cohorte', 'Compartir mi avance', 'Qué se envía', 'Aviso de privacidad', 'Términos de uso', 'Licencia'] },
]

const GRUPOS_ORIGINAL: ReadonlyArray<DefGrupo> = [
  { id: 'negocio', titulo: 'El negocio', secciones: ['norte', 'equipo', 'clientes', 'oferta', 'embudo'] },
  { id: 'tu', titulo: 'Tú', secciones: ['cuenta', 'apariencia', 'avisos'] },
  { id: 'arbrain', titulo: 'Arbrain', secciones: ['modelo', 'panel', 'atajos'] },
  { id: 'computadora', titulo: 'Esta computadora', secciones: ['mac'] },
]

/**
 * Edición cliente: sin «El negocio» (es el de Daniel), sin Cuenta (perfil y foto viven en su Supabase) ni Avisos push.
 * Llaves y Privacidad son suyas: se pueden cambiar después del primer arranque.
 */
const GRUPOS_CLIENTE: ReadonlyArray<DefGrupo> = [
  { id: 'tu', titulo: 'Tú', secciones: ['llaves', 'voz', 'seguridad', 'privacidad', 'apariencia'] },
  { id: 'arbrain', titulo: 'Arbrain', secciones: ['modelo', 'panel', 'atajos'] },
  { id: 'computadora', titulo: 'Esta computadora', secciones: ['mac'] },
]

export const GRUPOS: ReadonlyArray<DefGrupo> = CLIENTE ? GRUPOS_CLIENTE : GRUPOS_ORIGINAL

/** Las secciones de esta edición: exactamente las que agrupa su navegación. */
export const SECCIONES: ReadonlyArray<DefSeccion> = TODAS.filter((d) => GRUPOS.some((g) => g.secciones.includes(d.id)))

export const SECCION_INICIAL: IdSeccion = CLIENTE ? 'llaves' : 'cuenta'

/** Enlaces viejos que siguen vivos: `permisos` → Mac y sistema, `modelos` → Modelos, `notificaciones` → Notificaciones (id `avisos`). `labels` se fue al Board. */
const ALIAS: Record<string, IdSeccion> = { notificaciones: 'avisos', permisos: 'mac', modelos: 'modelo', general: 'apariencia', teclado: 'atajos' }

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
