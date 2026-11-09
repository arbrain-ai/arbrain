/**
 * Tu primer día (5 nov 2026; encendido en la edición del alumno, `ARBRAIN_PRIMER_DIA=0` lo apaga; propuesta: docs/builds/onboarding-taller-2026-11-05/).
 * Daniel, 18:41: «todo vive en taller. necesitamos un onboarding automatico para el white label al instalar la app… como el
 * avatar es cierto consultor de negocio, siento que esto venga en el taller». Un fundador, el mismo día: su agente anda, pero
 * «no tengo loops», no sabe instalarlo a su equipo y no ha mapeado su negocio.
 *
 * Cinco pasos, cada uno deja algo escrito en el cerebro del dueño: quién eres y tu negocio → tu oferta y tu nicho → tu embudo
 * (`embudo.json`, el estándar `arbrain.embudo/v1`) → tus primeras 2 rutinas → tu primera habilidad propia colgada del embudo.
 * Levy guía en el chat; el Taller muestra el avance. El avance NO se guarda: se lee del disco y del daemon cada vez (lo que no
 * está escrito no está hecho; sin daemon, «sin dato», nunca «hecho»).
 *
 * Módulo puro: lo importan la ruta, la vista, el laboratorio y las pruebas (tests/primer-dia/primer-dia.test.ts).
 */
import { RUTA_EMBUDO, validarEmbudo, type Embudo } from '@/features/negocio/embudo'
import { esEdicionCliente } from '@/lib/edicion'

/**
 * El interruptor. Daniel, 5 nov 19:42, a «¿lo enciendo para la cohorte en la próxima versión del alumno?»: «me gusta!».
 * En la edición del alumno (`ARBRAIN_EDICION=cliente`, la variable que la app de escritorio le pasa a su web; CONTRATO-DAEMON
 * §9) viene encendido y `ARBRAIN_PRIMER_DIA=0` lo apaga (en el `arbrain.env` de la app o en el entorno). En la instalación
 * de Daniel sigue apagado: solo `=1` lo enciende, y aun así la ruta lo cierra fuera de la app del alumno.
 */
export const INTERRUPTOR_PRIMER_DIA = 'ARBRAIN_PRIMER_DIA'
export const primerDiaEncendido = (env: Record<string, string | undefined> = process.env) => {
  const v = (env[INTERRUPTOR_PRIMER_DIA] ?? '').trim()
  return v === '1' || (v !== '0' && esEdicionCliente(env))
}

/** Todo vive en la memoria del dueño, junto al embudo: una carpeta, «Mi negocio». */
export const CARPETA_NEGOCIO = '.claude/memory/project/mi-negocio'
export const RUTA_NEGOCIO = `${CARPETA_NEGOCIO}/negocio.md`
export const RUTA_OFERTA = `${CARPETA_NEGOCIO}/oferta.md`
/** La oferta completa en 11 piezas (skill `oferta`, 9 nov 2026). También cumple el paso 2: gana la más larga de las dos. */
export const RUTA_OFERTA_COMPLETA = `${CARPETA_NEGOCIO}/02-oferta.md`
/** La guía que lee su Levy (guia.ts). Se siembra al empezar, solo si no existe: si el dueño la edita, manda la suya. */
export const RUTA_GUIA = `${CARPETA_NEGOCIO}/primer-dia.md`
export { RUTA_EMBUDO }

/** Menos que esto no es una ficha: es un archivo empezado. */
export const MINIMO_FICHA = 200
/** Las rutinas que pide el paso 4. */
export const RUTINAS_META = 2
/** La precargada que se ofrece de un clic en el paso 4 (server/src/cliente/rutinas-precargadas.ts). */
export const RUTINA_MANANA = 'arbrain-reporte-manana'

/**
 * Las habilidades que trae Arbrain (empaquetado/plantillas/skills; la prueba las mantiene al día). Una de estas colgada del
 * embudo no cuenta para el paso 5: el paso pide la TUYA, el proceso de tu negocio escrito para que tu equipo y tu Levy lo
 * hagan igual.
 */
export const HABILIDADES_DE_ARBRAIN = [
  'actualizar-arbrain', 'artificial-brain', 'autoresearch', 'bajar-a-tierra', 'canvas', 'clientes', 'code-animation',
  'goal-compiler', 'google-workspace', 'habit-system', 'image-generation', 'knowledge-search', 'libro-os', 'memory-manager',
  'oferta', 'os-audit', 'presentaciones', 'sistema-viable', 'skill-creator', 'tour-bienvenida',
] as const

export type IdPaso = 'negocio' | 'oferta' | 'embudo' | 'rutinas' | 'habilidades'
export interface DefPaso {
  id: IdPaso
  titulo: string
  /** Qué te pregunta Levy, en una línea. */
  que: string
  /** Qué queda escrito al terminar, dicho al dueño (sin rutas). */
  deja: string
}

export const PASOS: readonly DefPaso[] = [
  { id: 'negocio', titulo: 'Quién eres y tu negocio', que: 'Tu oficio, a quién sirves hoy, tu equipo y qué te quita más tiempo.', deja: 'Tu ficha de negocio, en tu memoria.' },
  { id: 'oferta', titulo: 'Tu oferta y tu nicho', que: 'La industria que ya conoces por dentro, tu cliente ideal y qué le prometes.', deja: 'Tu oferta escrita: promesa, entrega, precio y garantía.' },
  { id: 'embudo', titulo: 'Tu embudo', que: 'Cómo llega, compra y se queda tu cliente, etapa por etapa, y dónde se atora.', deja: 'Tu embudo completo, con quién mueve cada etapa.' },
  { id: 'rutinas', titulo: 'Tus primeras 2 rutinas', que: 'Qué revisión quieres que corra sola: el resumen de la mañana y una para tu cuello.', deja: 'Dos rutinas trabajando para ti, sin que se lo pidas.' },
  { id: 'habilidades', titulo: 'Tu primera habilidad', que: 'El proceso que más repites en tu cuello, escrito para que tu equipo y tu Levy lo hagan igual.', deja: 'Una habilidad tuya, colgada de su etapa del embudo.' },
]

// ── Lo que se lee (servidor.ts lo junta; aquí solo se juzga) ──

export type LecturaEmbudo =
  | { estado: 'falta' }
  | { estado: 'invalido'; errores: string[] }
  | { estado: 'ok'; embudo: Embudo }

export interface Senales {
  /** Caracteres de la ficha; null si no existe. */
  negocio: number | null
  oferta: number | null
  embudo: LecturaEmbudo
  /** Lo que respondió su daemon; null si no respondió (sin dato, nunca cero). */
  rutinas: { activas: { id: string; titulo: string }[]; manana: 'activa' | 'pausada' | 'falta' } | null
  /** De las skills colgadas del embudo, cuáles existen en su cerebro (`.claude/skills/<nombre>/SKILL.md`). */
  skillsEnDisco: string[]
}

export type EstadoPaso = 'hecho' | 'siguiente' | 'pendiente' | 'revisar' | 'sin-dato'
export interface Paso extends DefPaso {
  numero: number
  estado: EstadoPaso
  /** Lo leído, en una línea («12 etapas · se atora en Conversión»); null si no hay nada que decir. */
  detalle: string | null
  /** Errores del embudo, para pedir la corrección. */
  errores?: string[]
}
export interface Avance { pasos: Paso[]; hechos: number; total: number; completo: boolean; siguiente: IdPaso | null }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Las skills del embudo que cuentan para el paso 5: tuyas (no de Arbrain) y que existen. */
export function habilidadesPropias(embudo: Embudo | null, enDisco: string[]): string[] {
  if (!embudo) return []
  const deArbrain = new Set<string>(HABILIDADES_DE_ARBRAIN)
  const hay = new Set(enDisco)
  const nombres = embudo.etapas.flatMap(et => et.skills.map(s => s.nombre))
  return [...new Set(nombres)].filter(n => !deArbrain.has(n) && hay.has(n))
}

/** Las skills que nombra el embudo (para que el servidor compruebe cuáles existen). */
export function skillsDelEmbudo(embudo: Embudo | null): string[] {
  return embudo ? [...new Set(embudo.etapas.flatMap(et => et.skills.map(s => s.nombre)))] : []
}

/** Juzga cada paso con lo leído. Pura. */
export function evaluar(s: Senales): Avance {
  const embudo = s.embudo.estado === 'ok' ? s.embudo.embudo : null
  const juicio: Record<IdPaso, Pick<Paso, 'estado' | 'detalle' | 'errores'>> = {
    negocio: ficha(s.negocio),
    oferta: ficha(s.oferta),
    embudo: s.embudo.estado === 'ok'
      ? { estado: 'hecho', detalle: resumenEmbudo(s.embudo.embudo) }
      : s.embudo.estado === 'invalido'
        ? { estado: 'revisar', detalle: `Levy lo escribió, pero tiene ${plural(s.embudo.errores.length, 'detalle', 'detalles')} por corregir.`, errores: s.embudo.errores }
        : { estado: 'pendiente', detalle: null },
    rutinas: !s.rutinas
      ? { estado: 'sin-dato', detalle: 'Tu Arbrain no respondió: no puedo ver tus rutinas ahora.' }
      : s.rutinas.activas.length >= RUTINAS_META
        ? { estado: 'hecho', detalle: s.rutinas.activas.slice(0, 3).map(r => r.titulo).join(' · ') }
        : { estado: 'pendiente', detalle: s.rutinas.activas.length ? `${s.rutinas.activas.length} de ${RUTINAS_META} activa: ${s.rutinas.activas[0].titulo}` : null },
    habilidades: (() => {
      const propias = habilidadesPropias(embudo, s.skillsEnDisco)
      if (propias.length) return { estado: 'hecho' as const, detalle: propias.join(' · ') }
      if (!embudo) return { estado: 'pendiente' as const, detalle: 'Va después de tu embudo: cuelga de una de sus etapas.' }
      return { estado: 'pendiente' as const, detalle: null }
    })(),
  }
  const pasos: Paso[] = PASOS.map((p, i) => ({ ...p, numero: i + 1, ...juicio[p.id] }))
  // «Siguiente» es el primero que falta (en orden); lo que pide revisión cuenta como lo que falta.
  const primero = pasos.find(p => p.estado === 'pendiente' || p.estado === 'revisar')
  if (primero?.estado === 'pendiente') primero.estado = 'siguiente'
  const hechos = pasos.filter(p => p.estado === 'hecho').length
  return { pasos, hechos, total: pasos.length, completo: hechos === pasos.length, siguiente: primero?.id ?? null }
}

function ficha(n: number | null): Pick<Paso, 'estado' | 'detalle'> {
  if (n == null) return { estado: 'pendiente', detalle: null }
  if (n < MINIMO_FICHA) return { estado: 'pendiente', detalle: 'Empezada: le falta lo esencial.' }
  return { estado: 'hecho', detalle: null }
}

function resumenEmbudo(e: Embudo): string {
  const cuello = e.etapas.find(et => et.cuello.es)
  const embudos = e.embudos?.length ?? 1
  return [
    embudos > 1 ? `${embudos} embudos` : null,
    plural(e.etapas.length, 'etapa', 'etapas'),
    cuello ? `se atora en ${cuello.etapa}` : 'sin cuello marcado',
  ].filter(Boolean).join(' · ')
}

/** Lee el texto de `embudo.json` (o su ausencia) en lo que necesita el paso 3. */
export function leerEmbudo(texto: string | null): LecturaEmbudo {
  if (texto == null) return { estado: 'falta' }
  let crudo: unknown
  try { crudo = JSON.parse(texto.replace(/^﻿/, '')) } catch { return { estado: 'invalido', errores: ['El archivo del embudo no es JSON válido.'] } }
  const v = validarEmbudo(crudo)
  return v.ok ? { estado: 'ok', embudo: v.embudo } : { estado: 'invalido', errores: v.errores.slice(0, 12) }
}

// ── Lo que se le dice a Levy ──

/**
 * El mensaje que manda «Empezar con Levy»: corto, en primera persona y legible para el dueño (lo ve en su chat). El detalle de
 * cómo hacerlo vive en la guía de su memoria (guia.ts), que este mensaje nombra para que su Levy la lea primero.
 */
export function mensajePaso(id: IdPaso, extra?: { errores?: string[] }): string {
  const p = PASOS.findIndex(x => x.id === id)
  const def = PASOS[p]
  const base = `${p === 0 ? 'Empecemos' : 'Sigamos con'} mi primer día, paso ${p + 1} de ${PASOS.length}: ${def.titulo.toLowerCase()}. Antes lee la guía de mi primer día (\`${RUTA_GUIA}\`) y lo que ya sabes de mí.`
  const pedido: Record<IdPaso, string> = {
    negocio: 'Entrevístame una pregunta a la vez, no inventes nada y enséñame la ficha antes de guardarla.',
    oferta: 'Ayúdame a elegir el nicho que ya conozco por dentro y a escribir mi oferta. Una pregunta a la vez; enséñamela antes de guardarla.',
    embudo: 'Arma mi embudo con lo que ya escribimos de mi negocio y mi oferta, valídalo con el esquema de la guía y enséñamelo etapa por etapa antes de guardarlo.',
    rutinas: 'Propónme mis dos primeras rutinas (el resumen de la mañana y una para la etapa donde se atora mi negocio). Créalas y dime cuál tengo que activar.',
    habilidades: 'Escojamos el proceso que más repito en la etapa donde se atora mi negocio y conviértelo en mi primera habilidad, colgada de esa etapa en mi embudo.',
  }
  const errores = extra?.errores?.length ? ` La app marca esto en mi embudo: ${extra.errores.slice(0, 6).join(' ')} Corrígelo.` : ''
  return `${base} ${pedido[id]}${errores}`
}

/** El mensaje de Levy que abre el primer día en el chat (lo publica la app una sola vez, al ofrecerlo). */
export function mensajeOferta(nombre: string | null): string {
  const hola = nombre ? `${nombre}, ya` : 'Ya'
  return [
    `${hola} conoces la app. Ahora pongamos tu negocio dentro de tu cerebro: es tu primer día.`,
    '',
    'Son cinco pasos y cada uno deja algo escrito en tu memoria:',
    ...PASOS.map((p, i) => `${i + 1}. **${p.titulo}.** ${p.que}`),
    '',
    'A la derecha, en el **Taller › Tu primer día**, ves el avance. Toca **Empezar con Levy** en el paso 1 o escríbeme «empecemos mi primer día». Lo que hagamos aquí es justo lo que después le vas a instalar a tu primer cliente.',
  ].join('\n')
}

// ── Cuándo se ofrece solo ──

/** Lo que la app recuerda del primer día (en `primer-arranque.json`, campo `primerDia`). El avance no: se lee. */
export interface EstadoPrimerDia { ofrecido: string | null; oculto: string | null }
export const ESTADO_VACIO: EstadoPrimerDia = { ofrecido: null, oculto: null }

export function estadoPrimerDia(x: unknown): EstadoPrimerDia {
  const o = x && typeof x === 'object' ? x as Record<string, unknown> : {}
  const iso = (v: unknown) => typeof v === 'string' && v ? v : null
  return { ofrecido: iso(o.ofrecido), oculto: iso(o.oculto) }
}

/**
 * ¿Se abre solo ahora? Una vez, con la bienvenida terminada y el recorrido de Levy ya visto o saltado (no se le cruza), y
 * nunca si el dueño lo ocultó.
 */
export function debeOfrecer(e: { bienvenidaCompleta: boolean; tourPendiente: boolean; primerDia: EstadoPrimerDia }): boolean {
  return e.bienvenidaCompleta && !e.tourPendiente && !e.primerDia.ofrecido && !e.primerDia.oculto
}

/** Respuesta de GET /api/primer-dia. `activo: false` = interruptor apagado o fuera de la edición del alumno: nada cambia. */
export type RespuestaPrimerDia =
  | { activo: false }
  | { activo: true; avance: Avance; ofrecer: boolean; oculto: boolean }

export const URL_PRIMER_DIA = '/api/primer-dia'
