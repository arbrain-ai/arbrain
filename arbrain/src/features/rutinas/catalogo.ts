import { capital, DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'
import { JOB_REPORTE_SEGUNDA } from '@/shared/constants/reporte-vivo'
// Rutinas, no cronjobs (25 sep 2026). Lo que corre solo, contado como lo entiende
// un dueño de negocio: qué hace y para qué le sirve, sin nombres de scripts ni
// jerga. La identidad sigue siendo el id del scheduler (claudeclaw /schedule); si
// aparece uno nuevo sin entrada aquí, se muestra con su id legible en «Máquina»
// hasta que alguien le escriba su frase.
//
// 10 oct 2026 (vista viva de Rutinas): las 6 categorías del censo con su porqué
// (docs/builds/censo-crons-2026-10-10/CENSO.md §2), quién consume lo que produce y
// con qué corre: un modelo (gasta tokens) o un programa directo (sin costo). El
// costo se mide en la bitácora; `motor` solo dice cuál esperar.

export type Categoria = 'dinero' | 'miembros' | 'contenido' | 'dia' | 'memoria' | 'maquina'
export interface CategoriaDef { id: Categoria; nombre: string; porque: string }

export const CATEGORIAS: CategoriaDef[] = [
  { id: 'dinero', nombre: 'Dinero y cobro', porque: 'Polar es la fuente del dinero. Si esto falla, decides con cifras falsas o alguien pierde acceso pagado.' },
  { id: 'miembros', nombre: 'Miembros y comunidad', porque: 'Lo que los miembros tocan o reciben. Protegerlos es parte del producto.' },
  { id: 'contenido', nombre: 'Contenido y audiencia', porque: 'YouTube es tu canal de adquisición: esto mide y responde a tu audiencia.' },
  { id: 'dia', nombre: 'Tu día', porque: 'Lo que te llega a ti: reportes, agenda, foco y correo.' },
  { id: 'memoria', nombre: 'Memoria y cerebro', porque: 'Lo que hace que Levy recuerde y no se mienta sobre sí mismo.' },
  { id: 'maquina', nombre: 'Máquina', porque: 'Respaldos y vigilancia. Sin esto se cae todo lo de arriba; no aporta valor por sí mismo.' },
]

/** Quién usa lo que la rutina produce. `nadie` es lo que se nota. */
/** Las personas son las de la instalación (`DUENO()`, `SEGUNDA()`); el resto, destinos fijos. */
export type Para = string
export const PARA: Record<Para, string> = { [DUENO()]: 'Tú', [SEGUNDA()]: capital(NOMBRE_SEGUNDA()), miembros: 'Miembros', audiencia: 'Tu audiencia', levy: 'Levy', rutina: 'Otra rutina', nadie: 'Nadie' }

export interface Rutina {
  nombre: string
  queHace: string
  categoria: Categoria
  /** Lo que deja, en pocas palabras. */
  produce?: string
  para?: Para
  /** A quién o qué exactamente (p. ej. «tus reportes semanal y mensual»). */
  paraDetalle?: string
  /** Si lo consume otra rutina: su id, para avisar cuando esa está en pausa. */
  consumidor?: string
  /** Un seguro (respaldo): no lo consume nadie hasta el día que algo se rompe. */
  seguro?: boolean
  /** Con qué corre hoy: un modelo (gasta tokens) o un programa directo (sin costo). Lo medido manda. */
  motor?: 'modelo' | 'programa'
  /** Desde cuándo corre sin modelo, si antes lo envolvía uno (sus tokens de 30 días son de antes). */
  programaDesde?: string
  /** Por qué está en pausa (de la poda del 10 oct, LAPIDAS.md). */
  pausa?: string
}

export const RUTINAS: Record<string, Rutina> = {
  // ── Dinero y cobro ──
  'polar-sync': { categoria: 'dinero', nombre: 'Cuadre de cobros', produce: 'Quién pagó y quién debe tener acceso', para: 'rutina', paraDetalle: 'tus números y tus reportes', motor: 'programa', programaDesde: '10 oct',
    queHace: 'Revisa en Polar quién pagó, quién canceló y quién debe tener acceso a tu comunidad.' },
  'metrics-snapshot': { categoria: 'dinero', nombre: 'Foto del negocio', produce: 'El cierre de cada día', para: 'rutina', paraDetalle: 'tus reportes semanal y mensual', motor: 'programa',
    queHace: 'Cada noche guarda cómo cerró el día: ventas, miembros y resultado de tus videos, para comparar después.' },
  'polar-income-sync': { categoria: 'dinero', nombre: 'Ingresos a Finanzas', produce: 'Los cobros del día en Finanzas', para: DUENO(), paraDetalle: 'tus Finanzas', motor: 'programa', programaDesde: '10 oct',
    queHace: 'Pasa los cobros nuevos a tus Finanzas para que tus números estén al día sin capturar nada.' },
  'snapshot-finanzas': { categoria: 'dinero', nombre: 'Saldos del mes', produce: 'La petición de saldos del mes', para: DUENO(), motor: 'modelo',
    queHace: 'El día primero, si falta la foto del mes, te pide dictar los saldos de tus cuentas para cerrar el mes.' },

  // ── Miembros y comunidad ──
  'videoteca-sync': { categoria: 'miembros', nombre: 'Videoteca al día', produce: 'Las clases nuevas, buscables', para: 'miembros', paraDetalle: 'la Videoteca', motor: 'programa', programaDesde: '10 oct',
    queHace: 'Ordena las clases nuevas para que tú y tus miembros las encuentren al buscar.' },
  [JOB_REPORTE_SEGUNDA]: { categoria: 'miembros', nombre: `Reporte de ${capital(NOMBRE_SEGUNDA())}`, produce: 'Lo que toca en la comunidad', para: SEGUNDA(), motor: 'programa',
    queHace: `Le manda a ${NOMBRE_SEGUNDA()} lo que toca hoy en la comunidad: publicaciones sin respuesta, miembros nuevos o inactivos y la cola de YouTube.` },

  // ── Contenido y audiencia ──
  'youtube-comments-post': { categoria: 'contenido', nombre: 'Publicar respuestas aprobadas', produce: 'Tus respuestas en YouTube', para: 'audiencia', motor: 'programa', programaDesde: '10 oct',
    queHace: 'Publica en YouTube solo las respuestas que ya aprobaste.' },
  'youtube-comments-feedback-loop': { categoria: 'contenido', nombre: 'Aprender de tus correcciones', produce: 'Patrones de lo que apruebas', para: 'rutina', paraDetalle: 'las respuestas a comentarios', consumidor: 'youtube-comments-respond', motor: 'programa',
    queHace: 'Junta lo que corregiste en las respuestas para que las próximas suenen más a ti.' },
  'intel-youtube-scan': { categoria: 'contenido', nombre: 'Radar de competencia', produce: 'Lo que publicaron 29 canales', para: DUENO(), paraDetalle: 'Intel y tus ideas', motor: 'programa',
    queHace: 'Revisa qué publicaron los canales que sigues y lo deja listo para tus ideas.' },
  'youtube-analytics-sync': { categoria: 'contenido', nombre: 'Números de YouTube', produce: 'Retención, CTR y tráfico', para: 'rutina', paraDetalle: 'tus métricas y reportes', motor: 'programa',
    queHace: 'Trae las métricas de tus videos: vistas, retención, clics y de dónde llega la gente.' },
  'studio-live-sync': { categoria: 'contenido', nombre: 'Datos de YouTube Studio', produce: 'Impresiones y CTR de Studio', para: 'rutina', paraDetalle: 'tus métricas', motor: 'programa',
    queHace: 'Copia los datos que solo muestra YouTube Studio. Necesita tu sesión de Studio abierta en el navegador.' },
  'youtube-comments-respond': { categoria: 'contenido', nombre: 'Respuestas a comentarios', produce: 'Borradores para aprobar', para: DUENO(), paraDetalle: 'la cola de aprobación', motor: 'modelo',
    queHace: 'Lee los comentarios nuevos de tus videos y te deja respuestas listas para aprobar.',
    pausa: 'En pausa por ahora (10 oct): la cola tenía 1,469 borradores sin revisar. Lo de más de 30 días se archivó.' },
  'youtube-comments-engagement': { categoria: 'contenido', nombre: 'Seguimiento de respuestas', produce: 'Likes de tus respuestas', para: 'nadie', motor: 'modelo',
    queHace: 'Medía qué respuestas recibieron likes o réplicas.', pausa: 'Retirada en la poda del 10 oct: refrescaba likes de 138 respuestas que nadie mira.' },

  // ── Tu día ──
  'morning-briefing': { categoria: 'dia', nombre: 'Reporte diario', produce: 'Tu reporte de la mañana', para: DUENO(), paraDetalle: 'tu conversación favorita', motor: 'programa',
    queHace: 'Te deja el reporte del día: el dinero de ayer, el embudo del lanzamiento, tu agenda de hoy y las alarmas.' },
  'business-council': { categoria: 'dia', nombre: 'Reporte semanal', produce: 'La semana contra la anterior', para: DUENO(), motor: 'modelo',
    queHace: 'Cada domingo compara la semana con la anterior (ingresos, embudo y retención), revisa el sistema y te dice lo que ve en ti.' },
  'monthly-review': { categoria: 'dia', nombre: 'Reporte mensual', produce: 'El mes contra el anterior', para: DUENO(), motor: 'modelo',
    queHace: 'El día primero resume cómo te fue el mes: ingresos, crecimiento y qué conviene corregir.' },
  'tareas-espejo': { categoria: 'dia', nombre: 'Tareas en tu calendario', produce: 'Tus tareas con fecha en Google', para: DUENO(), paraDetalle: 'tu iPhone', motor: 'programa',
    queHace: 'Pone tus tareas de Todoist con fecha en el calendario «Tareas · Todoist» de Google, para verlas en el iPhone.' },
  'sfocus-guardia': { categoria: 'dia', nombre: 'Guardia del foco', produce: 'Tu bloqueo de 5:00 a 9:00 puesto', para: DUENO(), paraDetalle: 'solo si falla', motor: 'programa',
    queHace: 'Revisa que el bloqueo de distracciones de la mañana esté puesto. Solo te habla si algo falla.' },
  'gmail-cleanup': { categoria: 'dia', nombre: 'Limpieza del correo', produce: 'Tu bandeja sin promociones', para: DUENO(), motor: 'modelo',
    queHace: 'Archiva lo que no necesitas ver en tus dos cuentas de correo. Nunca borra nada.' },
  'ritual-noche': { categoria: 'dia', nombre: 'Ritual de la noche', produce: '«¿Bajamos a tierra mañana?»', para: DUENO(), motor: 'programa',
    queHace: 'Te preguntaba en la noche qué salió hoy y qué sale mañana.', pausa: 'Lo retiró otro cambio del 10 oct: el cierre del día llega conversando con Levy desde las 20:00.' },

  // ── Memoria y cerebro ──
  'hipocampo': { categoria: 'memoria', nombre: 'Memoria de la noche', produce: '0 a 2 memorias nuevas', para: 'levy', paraDetalle: 'la memoria de Levy', motor: 'modelo',
    queHace: 'Repasa lo que pasó ayer y guarda lo que vale la pena recordar.' },
  'os-audit': { categoria: 'memoria', nombre: 'Chequeo del sistema', produce: 'Notas vencidas y enlaces rotos', para: DUENO(), paraDetalle: 'solo si encuentra algo grave', motor: 'programa',
    queHace: 'Revisa que tu sistema no tenga notas vencidas, enlaces rotos ni piezas olvidadas. Solo avisa si algo está mal.' },
  'knowledge-compile': { categoria: 'memoria', nombre: 'Libreta de aprendizajes', produce: 'Notas compiladas', para: 'levy', motor: 'modelo',
    queHace: 'Convertía las conversaciones del día en notas ordenadas que Levy consulta después.',
    pausa: 'En pausa desde el 10 oct: era casi la mitad del gasto de rutinas y la memoria de la noche ya destila lo importante. Lo compilado queda y se sigue consultando.' },
  'system-consciousness': { categoria: 'memoria', nombre: 'Auditoría semanal', produce: 'El estado de cada rutina', para: 'rutina', paraDetalle: 'el reporte semanal', motor: 'modelo',
    queHace: 'Revisaba cada sábado cómo le fue a cada rutina.', pausa: 'Fusionada el 10 oct: el reporte semanal hace esta revisión él mismo.' },
  'machinery-sensores': { categoria: 'memoria', nombre: 'Indicadores del tablero', produce: '9 indicadores en 3 lienzos', para: 'nadie', motor: 'modelo',
    queHace: 'Ponía al día los indicadores de los lienzos de The Machinery.', pausa: 'Retirada en la poda del 10 oct: un modelo envolvía un programa para lienzos que no mueven dinero ni miembros.' },
  'metabolismo': { categoria: 'memoria', nombre: 'Poda del sistema', produce: 'Propuestas de qué retirar', para: DUENO(), motor: 'modelo',
    queHace: 'Proponía qué piezas retirar por falta de uso.', pausa: 'En pausa desde el 13 sep. Se conserva porque sus propuestas viejas aún se pueden leer aquí abajo.' },

  // ── Máquina ──
  'workspace-backup': { categoria: 'maquina', nombre: 'Respaldo', produce: 'Una copia de tu sistema', para: 'nadie', seguro: true, motor: 'programa',
    queHace: 'Guarda una copia de seguridad de tu sistema dos veces al día para que nada se pierda.' },
}

/** Nombre de dueño para un id del scheduler; los ids sin entrada quedan legibles. */
export function nombreRutina(id: string) {
  return RUTINAS[id]?.nombre ?? id.replace(/^custom-/, '').replace(/-[a-z0-9]{8}$/, '').replace(/-/g, ' ')
}
