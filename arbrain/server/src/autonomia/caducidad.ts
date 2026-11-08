/**
 * Caducidad por sentido de la bandeja (4 nov 2026, Daniel viendo «Esperan tu toque 7»: «¿hay data que no me debería estar
 * llegando?»). De siete tarjetas, tres ya no tenían sentido: mover a Fulano «de hoy a la 1:00 pm» (era del día anterior), un
 * botón de comunidad.example cuyo encargo ya había terminado y un comentario sobre la grupal de dos días antes.
 *
 * Una tarjeta abierta deja de aplicar, lo que llegue primero:
 *   - cuando pasa el momento que nombra su título («hoy», «a las 12», «al jueves 12:00», «5 nov», «2026-11-05»);
 *   - las de manos, cuando su encargo terminó (`caducarTarjetas` al cerrar el encargo; aquí, la red: VIDA_COLA_MANOS_MS);
 *   - tope general: 48 h sin toque (VIDA_COLA_MS).
 * Caducar NUNCA ejecuta: queda `vencida` y Levy anota una línea en «Lo que hice solo» («caducó sin enviar»). Qué sube a la
 * bandeja no cambia: contactar, pagar, borrar y publicar siguen siendo de la persona.
 */
import { diaCivil, instanteDeHoraCivil, zonaDueno } from '../zona.js'

const DIA_MS = 24 * 3_600_000
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «nov», «nov.» o el nombre entero («noviembre», «sept»): nunca el principio de otra palabra («2 marcas»). */
const NOMBRE_MES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|sept|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)'
const SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

const plano = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** El día civil `n` días después de `dia` (mediodía como ancla: sin saltos por horario de verano). */
const sumarDias = (dia: string, n: number, zona: string) => diaCivil(instanteDeHoraCivil(dia, 12, 0, zona) + n * DIA_MS, zona)
const diaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay()

/** El día que nombra el texto (o null): fecha ISO, «5 nov», «pasado mañana», «mañana», «hoy», «el/al/este jueves». */
function diaNombrado(t: string, hoy: string, zona: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const fecha = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?${NOMBRE_MES}\\b`).exec(t)
  if (fecha) {
    const d = Number(fecha[1]), m = MESES.indexOf(fecha[2] === 'setiembre' ? 'sep' : fecha[2].slice(0, 3)) + 1
    if (d >= 1 && d <= 31) {
      let anio = Number(hoy.slice(0, 4))
      // «3 ene» dicho en diciembre es del año que entra.
      if (m < Number(hoy.slice(5, 7)) - 6) anio += 1
      return `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  if (/\bpasado manana\b/.test(t)) return sumarDias(hoy, 2, zona)
  // «mañana» como día, no «en/de/por la mañana».
  if (/(?<!\bla )\bmanana\b/.test(t)) return sumarDias(hoy, 1, zona)
  if (/\bhoy\b|\besta (?:tarde|noche|manana)\b/.test(t)) return hoy
  // «del lunes» suele ser pasado («el recap del lunes»): solo cuenta con una preposición que mira adelante.
  const sem = new RegExp(`\\b(?:al|el|este|para el|hasta el|antes del)\\s+(${SEMANA.join('|')})\\b`).exec(t)
  if (sem) {
    const quiere = SEMANA.indexOf(sem[1])
    return sumarDias(hoy, (quiere - diaSemana(hoy) + 7) % 7, zona)
  }
  return null
}

/** La hora que nombra el texto (o null): «a la 1:00 pm», «a las 12», «antes de las 5 de la tarde», «13:00». */
function horaNombrada(t: string): { h: number; m: number } | null {
  const sufijo = String.raw`\s*(a\.?\s?m\.?|p\.?\s?m\.?|de la (?:tarde|noche|manana))?`
  const conPrep = new RegExp(String.raw`\b(?:a|antes de|para) las?\s+(\d{1,2})(?::(\d{2}))?` + sufijo).exec(t)
  const reloj = conPrep ? null : new RegExp(String.raw`\b(\d{1,2}):(\d{2})` + sufijo).exec(t)
  const x = conPrep ?? reloj
  if (!x) return null
  let h = Number(x[1]); const m = Number(x[2] ?? 0), suf = (x[3] ?? '').replace(/[\s.]/g, '')
  if (h > 23 || m > 59) return null
  if ((suf === 'pm' || (suf.startsWith('dela') && !suf.endsWith('manana'))) && h < 12) h += 12
  else if ((suf === 'am' || suf.endsWith('manana')) && h === 12) h = 0
  // Sin am/pm, de 1 a 7 es de la tarde (horario de trabajo: «a la 1:00» es la 1 pm).
  else if (!suf && h >= 1 && h <= 7) h += 12
  return { h, m }
}

/**
 * Cuándo deja de aplicar una tarjeta por lo que dice su título (epoch ms), o null si no nombra un momento.
 * Con día y sin hora: al terminar ese día. Con hora y sin día: esa hora del día en que nació. Una hora que ya había pasado
 * cuando nació la tarjeta no la mata al nacer: vale hasta el fin de ese día.
 */
export function venceSegunTexto(texto: string, creada: number, zona = zonaDueno()): number | null {
  const t = plano(texto)
  const hoy = diaCivil(creada, zona)
  const dia = diaNombrado(t, hoy, zona), hora = horaNombrada(t)
  if (!dia && !hora) return null
  const d = dia ?? hoy
  const finDelDia = instanteDeHoraCivil(sumarDias(d, 1, zona), 0, 0, zona)
  if (!hora) return finDelDia > creada ? finDelDia : null
  const exacta = instanteDeHoraCivil(d, hora.h, hora.m, zona)
  if (exacta > creada) return exacta
  return finDelDia > creada ? finDelDia : null
}

/** Por qué caducó (la línea de «Lo que hice solo»). */
export type MotivoCaducidad = 'hora' | 'encargo' | 'tope'
export const FRASE_MOTIVO: Record<MotivoCaducidad, string> = { hora: 'ya pasó su momento', encargo: 'su encargo terminó', tope: '48 h sin tu toque' }

const VERBO_SIN: Record<string, string> = { enviar: 'sin enviar', pagar: 'sin pagar', borrar: 'sin borrar', publicar: 'sin publicar', otra: 'sin hacerse' }
/** «Caducó sin enviar: WhatsApp a Fulano… (ya pasó su momento)». */
export function lineaCaducada(titulo: string, categoria: string, motivo: MotivoCaducidad): string {
  return `Caducó ${VERBO_SIN[categoria] ?? 'sin hacerse'}: ${titulo.replace(/\s+/g, ' ').trim().slice(0, 160)} (${FRASE_MOTIVO[motivo]})`
}

/**
 * A quién va una tarjeta de contactar, para agruparlas por persona («dos de Mengano = una tarjeta con dos acciones»). Del título
 * que escribe Levy: «WhatsApp a Fulano: …», «Comentario a Mengano en …», «Responderle a Perengano …», «DM a Zutano …». Un nombre con
 * mayúscula después de «a»; nada si no lo hay.
 */
export function personaDe(titulo: string): string | null {
  const m = /(?:^|[\s(])(?:a|para|con)\s+@?([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?)/.exec(titulo)
  if (!m) return null
  const nombre = m[1].trim()
  // Lo que no es una persona aunque vaya con mayúscula.
  if (/^(Arbrain|Levy|Comunidad|Google|Claude|Codex|Polar|Supabase|Cloudflare|Todoist|WhatsApp|Gmail|YouTube)\b/.test(nombre)) return null
  return nombre.split(/\s+/)[0]
}
