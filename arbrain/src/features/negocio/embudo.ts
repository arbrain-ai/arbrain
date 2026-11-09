/**
 * Tu negocio › El sistema (4 nov 2026, Daniel: «en lugar de utilizar un Miro… ¿por qué no lo hacemos en un HTML?…
 * ¿quizás sea un panel más?»). Lógica pura del embudo `arbrain.embudo/v1`: validar el archivo que escribe Levy,
 * agruparlo por embudo y traducir cada campo a lo que ve el dueño. Contrato: docs/embudo/README.md.
 *
 * Sin estados inventados: lo que no viene en el archivo o en una lectura real se dice «sin dato», nunca 0.
 */

import { esEdicionCliente } from '@/lib/edicion'

export const ESQUEMA_EMBUDO = 'arbrain.embudo/v1'
/** La única ruta donde el panel busca el embudo, relativa a la raíz del cerebro. */
export const RUTA_EMBUDO = '.claude/memory/project/mi-negocio/embudo.json'
export const ETAPAS = ['Adquisición', 'Nutrición', 'Conversión', 'Bienvenida', 'Entrega', 'Expansión'] as const

export type TipoEjecutor = 'levy' | 'rutina' | 'persona'
export interface Skill { nombre: string; ruta: string }
export interface Rutina { id: string | null; que_hace: string; horario?: string | null; motor?: string | null; activa: boolean; nota?: string }
export interface Ejecutor { tipo: TipoEjecutor; rol?: string; nombre?: string }
/** El número de una etapa, bajado a tierra (5 nov): de dónde sale, cada cuánto se refresca, quién lo mueve y, si aún no
 *  existe, qué lo mediría. */
export interface Medida {
  nombre: string; fuente: string; frecuencia: string; dueno: Ejecutor; hay_numero: boolean; como_medirlo?: string
  valor: number | string | null; medido_en?: string; ventana?: string; consulta?: Record<string, unknown>
}
export interface Evidencia { ruta: string; fecha: string; detalle?: string }
export interface Cuello { es: boolean; frase?: string; evidencia?: Evidencia }
export interface Etapa {
  id: string; orden: number; embudo: string; etapa: (typeof ETAPAS)[number]; nombre: string; que_pasa: string; opera_hoy: boolean
  skills: Skill[]; rutinas: Rutina[]; ejecuta: Ejecutor[]; mide: Medida; cuello: Cuello
}
export interface Arista { desde: string; hacia: string; tipo: 'flujo' | 'upsell' | 'volante'; estado: string; accion?: string; nota?: string; evidencia?: Partial<Evidencia> }
/** Un embudo: una oferta (seis etapas) o un piso que trae gente (un canal, un lead magnet, la comunidad gratuita). */
export interface InfoEmbudo { id: string; nombre: string; kicker?: string; frase?: string; tipo?: 'piso' | 'oferta'; estado?: 'opera' | 'por construir' }
/** Una skill que a propósito no cuelga de ninguna etapa (5 nov): sostiene todo el sistema o vive fuera del negocio. */
export interface SkillSinEtapa { nombre: string; ruta: string; tipo: 'sistema' | 'personal'; por_que: string }
export interface Embudo {
  esquema: typeof ESQUEMA_EMBUDO; negocio: string; generado: string
  /** Retirado como vista el 5 nov: el panel es la única vista del negocio. Se lee para no romper archivos viejos. */
  lienzo?: { page_id?: string; abrir?: string; dibuja?: string }; embudos?: InfoEmbudo[]; etapas: Etapa[]; aristas: Arista[]
  skills_sin_etapa?: SkillSinEtapa[]
  /** El lienzo del sistema nervioso (7 nov): page_id de la tabla draw que abre «Abrir el lienzo completo». Lo llena el
   *  dueño; vacío = el botón dice «lienzo en camino». */
  lienzo_sistema?: string
}

export type Validacion = { ok: true; embudo: Embudo } | { ok: false; errores: string[] }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const txt = (x: unknown) => typeof x === 'string' && x.trim().length > 0
const RUTA_SKILL = /^\.claude\/skills\/[^/]+\/SKILL\.md$/
const ID_ETAPA = /^[a-z0-9-]+\.[a-z0-9-]+$/
const TIPOS_EJECUTOR = ['levy', 'rutina', 'persona']
const ejecutor = (q: unknown) => obj(q) && TIPOS_EJECUTOR.includes(q.tipo as string)

/** Lo mismo que exige `embudo.schema.json`, con errores en palabras (Levy los lee para corregir el archivo). */
export function validarEmbudo(x: unknown): Validacion {
  const e: string[] = []
  if (!obj(x)) return { ok: false, errores: ['El archivo no es un objeto JSON.'] }
  if (x.esquema !== ESQUEMA_EMBUDO) e.push(`«esquema» debe ser «${ESQUEMA_EMBUDO}».`)
  if (!txt(x.negocio)) e.push('Falta «negocio».')
  if (typeof x.generado !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.generado)) e.push('«generado» debe ser una fecha AAAA-MM-DD.')
  if (x.embudos !== undefined && (!Array.isArray(x.embudos) || x.embudos.some(b => !obj(b) || !txt(b.id) || !txt(b.nombre)))) e.push('Cada embudo necesita «id» y «nombre».')
  else for (const b of (x.embudos ?? []) as Record<string, unknown>[]) {
    if (b.tipo !== undefined && b.tipo !== 'piso' && b.tipo !== 'oferta') e.push(`Embudo ${b.id}: «tipo» es piso u oferta.`)
    if (b.estado !== undefined && b.estado !== 'opera' && b.estado !== 'por construir') e.push(`Embudo ${b.id}: «estado» es opera o por construir.`)
  }
  if (x.lienzo_sistema !== undefined && typeof x.lienzo_sistema !== 'string') e.push('«lienzo_sistema» es el id de una página de lienzo (texto, puede ir vacío).')
  if (!Array.isArray(x.etapas) || !x.etapas.length) e.push('Falta la lista «etapas».')
  if (!Array.isArray(x.aristas)) e.push('Falta la lista «aristas» (puede ir vacía).')
  const ids = new Set<string>()
  let cuellos = 0
  for (const [i, et] of (Array.isArray(x.etapas) ? x.etapas : []).entries()) {
    const d = `Etapa ${i + 1}`
    if (!obj(et)) { e.push(`${d}: no es un objeto.`); continue }
    const n = typeof et.id === 'string' ? `${d} (${et.id})` : d
    if (typeof et.id !== 'string' || !ID_ETAPA.test(et.id)) e.push(`${d}: «id» debe ser «embudo.etapa».`)
    else if (ids.has(et.id)) e.push(`${n}: «id» repetido.`)
    else ids.add(et.id)
    if (!Number.isInteger(et.orden) || (et.orden as number) < 1) e.push(`${n}: «orden» debe ser un entero desde 1.`)
    if (!txt(et.embudo)) e.push(`${n}: falta «embudo».`)
    if (!(ETAPAS as readonly unknown[]).includes(et.etapa)) e.push(`${n}: «etapa» debe ser una de ${ETAPAS.join(', ')}.`)
    if (!txt(et.nombre)) e.push(`${n}: falta «nombre».`)
    if (typeof et.que_pasa !== 'string') e.push(`${n}: falta «que_pasa».`)
    if (typeof et.opera_hoy !== 'boolean') e.push(`${n}: «opera_hoy» debe ser true o false.`)
    if (!Array.isArray(et.skills) || et.skills.some(s => !obj(s) || !txt(s.nombre) || typeof s.ruta !== 'string' || !RUTA_SKILL.test(s.ruta))) e.push(`${n}: cada skill necesita «nombre» y «ruta» (.claude/skills/<nombre>/SKILL.md).`)
    if (!Array.isArray(et.rutinas) || et.rutinas.some(r => !obj(r) || !(r.id === null || txt(r.id)) || !txt(r.que_hace) || typeof r.activa !== 'boolean')) e.push(`${n}: cada rutina necesita «id» (o null), «que_hace» y «activa».`)
    if (!Array.isArray(et.ejecuta) || et.ejecuta.some(q => !ejecutor(q))) e.push(`${n}: «ejecuta» lleva tipos levy, rutina o persona.`)
    const m = et.mide
    if (!obj(m) || !txt(m.nombre) || !txt(m.fuente) || typeof m.hay_numero !== 'boolean' || !('valor' in m)) e.push(`${n}: «mide» necesita nombre, fuente, hay_numero y valor.`)
    else {
      if (!txt(m.frecuencia)) e.push(`${n}: «mide.frecuencia» dice cada cuánto se refresca el número («en vivo», «cada noche», «a mano»).`)
      if (!ejecutor(m.dueno)) e.push(`${n}: «mide.dueno» dice quién mueve el número (tipo levy, rutina o persona).`)
      if (m.hay_numero === false && !txt(m.como_medirlo)) e.push(`${n}: sin número todavía, «mide.como_medirlo» dice qué lo mediría.`)
      if (m.valor !== null && !(typeof m.valor === 'number' || typeof m.valor === 'string')) e.push(`${n}: «mide.valor» es número, texto o null.`)
      else if (m.valor !== null && !txt(m.medido_en)) e.push(`${n}: un número escrito necesita «medido_en».`)
    }
    const c = et.cuello
    if (!obj(c) || typeof c.es !== 'boolean') e.push(`${n}: falta «cuello.es».`)
    else if (c.es) {
      cuellos++
      if (!txt(c.frase) || !obj(c.evidencia) || !txt(c.evidencia.ruta) || !txt(c.evidencia.fecha)) e.push(`${n}: el cuello necesita «frase» y «evidencia» con ruta y fecha.`)
    }
  }
  if (cuellos > 1) e.push(`Hay ${cuellos} cuellos de botella: se marca uno solo.`)
  if (x.skills_sin_etapa !== undefined) {
    if (!Array.isArray(x.skills_sin_etapa)) e.push('«skills_sin_etapa» es una lista.')
    else {
      const enEtapas = new Set((Array.isArray(x.etapas) ? x.etapas : []).flatMap(et => obj(et) && Array.isArray(et.skills) ? et.skills.map(s => obj(s) ? s.nombre : null) : []))
      for (const [i, s] of x.skills_sin_etapa.entries()) {
        if (!obj(s) || !txt(s.nombre) || typeof s.ruta !== 'string' || !RUTA_SKILL.test(s.ruta) || !['sistema', 'personal'].includes(s.tipo as string) || !txt(s.por_que)) { e.push(`Skill sin etapa ${i + 1}: necesita «nombre», «ruta», «tipo» (sistema o personal) y «por_que».`); continue }
        if (enEtapas.has(s.nombre)) e.push(`«${s.nombre}» cuelga de una etapa y también está en «skills_sin_etapa»: va en un solo lado.`)
      }
    }
  }
  for (const [i, a] of (Array.isArray(x.aristas) ? x.aristas : []).entries()) {
    if (!obj(a) || !txt(a.desde) || !txt(a.hacia) || !['flujo', 'upsell', 'volante'].includes(a.tipo as string) || !txt(a.estado)) { e.push(`Arista ${i + 1}: necesita desde, hacia, tipo (flujo, upsell o volante) y estado.`); continue }
    if (ids.size && (!ids.has(a.desde as string) || !ids.has(a.hacia as string))) e.push(`Arista ${i + 1}: une etapas que no existen (${a.desde} → ${a.hacia}).`)
  }
  return e.length ? { ok: false, errores: e } : { ok: true, embudo: x as unknown as Embudo }
}

export interface Grupo { info: InfoEmbudo; etapas: Etapa[] }

/** Los embudos en el orden declarado (o el de aparición), cada uno con sus etapas por `orden`. */
export function agrupar(e: Embudo): Grupo[] {
  const ids: string[] = []
  for (const b of e.embudos ?? []) if (!ids.includes(b.id)) ids.push(b.id)
  for (const et of e.etapas) if (!ids.includes(et.embudo)) ids.push(et.embudo)
  return ids
    .map(id => ({ info: e.embudos?.find(b => b.id === id) ?? { id, nombre: id }, etapas: e.etapas.filter(et => et.embudo === id).sort((a, b) => a.orden - b.orden) }))
    .filter(g => g.etapas.length > 0)
}

/** El puente de un embudo al siguiente y el giro de vuelta (casos → contenido). */
export function puentes(e: Embudo) {
  return { upsell: e.aristas.filter(a => a.tipo === 'upsell'), volante: e.aristas.filter(a => a.tipo === 'volante') }
}

/** La escalera de valor que sale de un embudo: cada `upsell` que parte de una de sus etapas, con el embudo al que sube.
 *  Un piso puede subir a varios (la comunidad gratuita sube a la oferta de entrada y a la mayor). */
export function subidasDe(e: Embudo, g: Grupo): { arista: Arista; hacia: string }[] {
  const destino = (id: string) => e.etapas.find(et => et.id === id)?.embudo
  return e.aristas
    .filter(a => a.tipo === 'upsell' && g.etapas.some(et => et.id === a.desde) && destino(a.hacia) !== g.info.id)
    .map(a => ({ arista: a, hacia: nombreEmbudo(e, destino(a.hacia) ?? a.hacia) }))
}

export const esPiso = (b: InfoEmbudo) => b.tipo === 'piso'
export const porConstruir = (b: InfoEmbudo) => b.estado === 'por construir'

/** «4 pisos y 2 embudos encadenados»: cuántos de cada uno, en palabras. */
export function resumenGrupos(grupos: Grupo[]): string {
  const pisos = grupos.filter(g => esPiso(g.info)).length
  const ofertas = grupos.length - pisos
  const deEmbudos = ofertas === 1 ? 'un embudo' : `${ofertas} embudos`
  if (!pisos) return ofertas === 1 ? 'Un embudo' : `${ofertas} embudos encadenados`
  return `${pisos === 1 ? 'Un piso' : `${pisos} pisos`} y ${deEmbudos}${grupos.length > 1 ? ' encadenados' : ''}`
}

/** El nombre de un embudo por su id («SFC» → «SaaS Factory»); sin `embudos` declarados, el id. */
export const nombreEmbudo = (e: Embudo, id: string) => e.embudos?.find(b => b.id === id)?.nombre ?? id

export const cuelloDe = (e: Embudo) => e.etapas.find(et => et.cuello.es) ?? null

/** Las etapas de las que cuelga una skill (por nombre de carpeta), para Habilidades. */
export function etapasDeSkill(e: Embudo | null | undefined, nombre: string): Etapa[] {
  return e ? e.etapas.filter(et => et.skills.some(s => s.nombre === nombre)) : []
}

/**
 * Skills por etapa (5 nov, Daniel: «las skills conllevan parte del sistema del embudo… deberíamos categorizarlas»). La
 * etapa de cada skill vive en el embudo, no en su SKILL.md: o cuelga de una etapa, o está en `skills_sin_etapa` con su
 * porqué. Con el inventario real de `.claude/skills/`, lo que no está en ningún lado sale «sin revisar» (una skill nueva
 * que nadie ha ubicado) y lo nombrado que ya no existe sale aparte.
 */
export interface SkillsPorEtapa {
  grupos: { info: InfoEmbudo; etapas: { etapa: Etapa; skills: string[] }[] }[]
  sistema: SkillSinEtapa[]; personal: SkillSinEtapa[]
  /** En la carpeta de skills y en ningún lado del embudo. null = sin inventario (no se pudo leer la carpeta). */
  sinRevisar: string[] | null
  /** Nombradas en el embudo, pero ya no existen en la carpeta. */
  noExisten: string[]
  /** Skills distintas que cuelgan de al menos una etapa. */
  enEtapas: number
}
export function skillsPorEtapa(e: Embudo, inventario?: string[] | null): SkillsPorEtapa {
  const grupos = agrupar(e).map(g => ({ info: g.info, etapas: g.etapas.map(et => ({ etapa: et, skills: [...new Set(et.skills.map(s => s.nombre))] })) }))
  const colgadas = new Set(e.etapas.flatMap(et => et.skills.map(s => s.nombre)))
  const fuera = e.skills_sin_etapa ?? []
  const ubicadas = new Set([...colgadas, ...fuera.map(s => s.nombre)])
  const hay = inventario ? new Set(inventario) : null
  const porNombre = (a: SkillSinEtapa, b: SkillSinEtapa) => a.nombre.localeCompare(b.nombre)
  return {
    grupos,
    sistema: fuera.filter(s => s.tipo === 'sistema').sort(porNombre),
    personal: fuera.filter(s => s.tipo === 'personal').sort(porNombre),
    sinRevisar: inventario ? [...new Set(inventario)].filter(n => !ubicadas.has(n)).sort() : null,
    noExisten: hay ? [...ubicadas].filter(n => !hay.has(n)).sort() : [],
    enEtapas: colgadas.size,
  }
}

/** La ruta estándar de una skill por su nombre de carpeta. */
export const rutaSkill = (nombre: string) => `.claude/skills/${nombre}/SKILL.md`

/** El nombre de carpeta de una ruta de skill: `.claude/skills/polar/SKILL.md` → `polar`. */
export const skillDeRuta = (ruta: string) => /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(ruta)?.[1] ?? null

/** Quién mueve la etapa, en palabras del dueño. El fundador es «Tú». */
export function quien(q: Ejecutor): string {
  if (q.tipo === 'levy') return 'Levy'
  if (q.tipo === 'rutina') return 'Una rutina'
  if (q.rol === 'fundador') return 'Tú'
  return q.nombre ?? (q.rol ? q.rol[0].toUpperCase() + q.rol.slice(1) : 'Una persona')
}
export const rolDe = (q: Ejecutor) => q.tipo === 'persona' && q.rol && q.rol !== 'fundador' && q.nombre ? q.rol : null

/** De dónde se lee la última corrida: el scheduler de Arbrain, launchd del Studio, o de ningún lado. */
export function motorDe(r: Rutina): 'scheduler' | 'launchd' | null {
  if (!r.id || !r.motor) return null
  if (/^launchd/i.test(r.motor)) return 'launchd'
  if (/^scheduler/i.test(r.motor)) return 'scheduler'
  return null
}

/** El número de la etapa: la cifra solo si Levy la leyó (con su fecha); si no, «sin dato» o «sin número todavía». */
export function numero(m: Medida): { texto: string; sinDato: boolean; cuando: string | null } {
  if (!m.hay_numero) return { texto: 'sin número todavía', sinDato: true, cuando: null }
  if (m.valor === null || m.valor === '' || !m.medido_en) return { texto: 'sin dato', sinDato: true, cuando: null }
  const texto = typeof m.valor === 'number' ? m.valor.toLocaleString('es-MX') : m.valor
  return { texto, sinDato: false, cuando: [m.ventana, fechaCorta(m.medido_en)].filter(Boolean).join(' · ') || null }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «2026-10-23» → «23 oct 2026». Lo que no es fecha se devuelve igual. */
export function fechaCorta(iso: string | undefined | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : iso ?? ''
}

/** Respuesta de /api/negocio/embudo. `activo: false` = interruptor apagado: nada cambia en la app. */
export type RespuestaEmbudo =
  | { activo: false }
  | { activo: true; ruta: string; embudo: Embudo | null; errores?: string[]; launchd: Record<string, { semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'; texto: string; medidoEn: string }>
      /** Las skills que de verdad existen en `.claude/skills/` (nombre de carpeta), para marcar las que no cuelgan de nada. */
      skills?: string[] }

export const URL_EMBUDO = '/api/negocio/embudo'

/**
 * El interruptor de Tu negocio y Business Intelligence. En la instalación del autor, solo `ARBRAIN_PANEL_NEGOCIO=1` en el
 * entorno del servidor lo enciende. En la edición del alumno (8 nov 2026, Daniel: «este mismo sistema les compartiré a mis
 * alumnos») viene encendido como motor vacío y `ARBRAIN_PANEL_NEGOCIO=0` lo apaga, igual que Tu primer día.
 */
export const panelNegocioEncendido = (env: Record<string, string | undefined> = process.env) => {
  const v = (env.ARBRAIN_PANEL_NEGOCIO ?? '').trim()
  return v === '1' || (v !== '0' && esEdicionCliente(env))
}

/** Cómo le fue a una rutina, en una frase. `tono` sigue a Rutinas (ok, error, curso, pausada, sin-dato) más `atencion`. */
export interface Corrida { tono: 'ok' | 'error' | 'curso' | 'pausada' | 'sin-dato' | 'atencion' | 'por-construir'; texto: string }

const mayus = (t: string) => t ? t[0].toUpperCase() + t.slice(1) : t

/** La lectura de launchd del Studio (lib/canvas/nervio-estado.ts) sin jerga: «Corrió hace 3 min», «Apagada». */
export function corridaLaunchd(m: { semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'; texto: string } | undefined): Corrida {
  if (!m || m.semaforo === 'gris') return { tono: 'sin-dato', texto: 'Sin dato aquí' }
  if (m.semaforo === 'verde') return m.texto === 'corriendo ahora' ? { tono: 'curso', texto: 'Trabajando ahora' } : { tono: 'ok', texto: `Corrió ${m.texto}` }
  if (m.semaforo === 'ambar') return { tono: 'atencion', texto: mayus(m.texto) }
  return /no está cargada/.test(m.texto) ? { tono: 'error', texto: 'Apagada: no está corriendo' } : { tono: 'error', texto: 'Falló en su última corrida' }
}

/** Una rutina que todavía no existe o está apagada a propósito no tiene estado: se dice por qué. */
export function corridaInactiva(r: Rutina): Corrida {
  return { tono: 'por-construir', texto: mayus(r.nota ?? (r.id ? 'En pausa' : 'Por construir')) }
}
