import { principalSalud } from '@/features/salud/principal'
import { planningError } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { civilToday, shiftDay } from '@/features/sistema/calendar-days'
import { conexionDe, origenDe } from '@/features/salud/servidor'
import { METRICAS_DIA, type DatosSalud, type Dia, type Marca, type Noche, type PactoFila } from '@/features/salud/modelo'

// Vista «salud» (5 oct 2026): el cuerpo de quien pregunta, leído al abrir.
// Daniel: su ruta propia (receptor del Studio → daily-log.csv) por el agent-server, sin tocarla, salvo que
// SALUD_FUENTE_DANIEL=arbrain (la propuesta de docs/builds/vista-salud-2026-10-05.md). Los demás: su base aislada
// (salud_muestras por user_id). Hábitos: los suyos (sistema_habitos/sistema_checks). Lo que falla va a `errores`; nunca cero.

export const runtime = 'nodejs'
export const maxDuration = 60
const noStore = { 'Cache-Control': 'no-store' }
const DIAS = 100
const redondear = (c: string, v: number) => c === 'pasos' || c === 'resting_hr' ? Math.round(v) : Math.round(v * 100) / 100

interface Studio { dias?: Dia[]; noches?: Noche[]; ultimoEnvio?: string | null; pacto?: PactoFila[] | null; errores?: string[] }

async function deStudio(fresco: boolean): Promise<Studio> {
  const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
    method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ que: 'salud', fresco }), signal: AbortSignal.timeout(40_000), cache: 'no-store',
  })
  if (!res.ok) throw new Error(`El Studio respondió ${res.status}.`)
  return await res.json() as Studio
}

export async function GET(request: Request) {
  try {
    const principal = await principalSalud()
    const fresco = new URL(request.url).searchParams.get('fresco') === '1'
    const db = createServiceClient()
    const hoy = civilToday(), desde = shiftDay(hoy, -DIAS)
    const errores: string[] = []
    const studio = principal.personalOwner && process.env.SALUD_FUENTE_DANIEL !== 'arbrain'

    const [fuente, habitos, marcas, reflexion, conexion] = await Promise.all([
      studio
        ? deStudio(fresco).catch((e: unknown) => { errores.push(`No se pudo leer tu reloj en el Studio (${e instanceof Error ? e.message : 'sin respuesta'}).`); return {} as Studio })
        : (async (): Promise<Studio> => {
          const [dias, noches] = await Promise.all([
            db.rpc('salud_dias_v1', { p_user: principal.id, p_desde: desde }),
            db.from('salud_muestras').select('fecha, extra').eq('user_id', principal.id).eq('metrica', 'sueno_horas').gte('fecha', desde).not('extra', 'is', null).order('fecha'),
          ])
          if (dias.error) { errores.push('No se pudieron leer tus datos de salud.'); return {} }
          const porFecha = new Map<string, Dia>()
          for (const f of (dias.data ?? []) as { fecha: string; metrica: string; valor: number }[]) {
            if (!(METRICAS_DIA as readonly string[]).includes(f.metrica)) continue
            const d = porFecha.get(f.fecha) ?? { fecha: f.fecha }
            ;(d as Record<string, unknown>)[f.metrica] = redondear(f.metrica, f.valor); porFecha.set(f.fecha, d)
          }
          const n = new Map<string, Noche>()
          for (const r of (noches.data ?? []) as { fecha: string; extra: { inicio?: string; fin?: string } | null }[]) if (r.extra?.inicio && r.extra.fin) n.set(r.fecha, { fecha: r.fecha, inicio: r.extra.inicio, fin: r.extra.fin })
          return { dias: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)), noches: [...n.values()], pacto: null }
        })(),
      db.from('sistema_habitos').select('clave, nombre, activo, orden').eq('user_id', principal.id).order('orden'),
      db.from('sistema_checks').select('fecha, habito_clave, hecho').eq('user_id', principal.id).gte('fecha', desde).order('fecha').limit(5000),
      db.from('sistema_reflexion').select('prioridad_am').eq('user_id', principal.id).eq('fecha', hoy).maybeSingle(),
      db.from('salud_conexiones').select('token_pista, ultimo_envio, ultimo_envio_muestras, ultimo_error').eq('user_id', principal.id).maybeSingle(),
    ])
    if (habitos.error || marcas.error) errores.push('No se pudieron leer tus hábitos.')
    if (conexion.error) errores.push('No se pudo leer tu conexión del reloj.')

    const con = conexion.error ? null : conexionDe(conexion.data, origenDe(request))
    const datos: DatosSalud = {
      fuente: studio ? 'studio' : 'arbrain', hoy,
      dias: fuente.dias ?? [], noches: fuente.noches ?? [],
      ultimoEnvio: studio ? fuente.ultimoEnvio ?? null : con?.ultimoEnvio ?? null,
      pacto: fuente.pacto ?? null,
      habitos: (habitos.data ?? []).filter(h => h.activo).map(h => ({ clave: h.clave as string, nombre: h.nombre as string })),
      marcas: (marcas.data ?? []).map(m => ({ fecha: m.fecha as string, clave: m.habito_clave as string, hecho: m.hecho as boolean | null }) satisfies Marca),
      prioridad: ((reflexion.data?.prioridad_am as string | undefined) ?? '').trim() || null,
      conexion: con, planPersonal: principal.personalOwner,
      leidoEn: new Date().toISOString(),
      errores: [...errores, ...(fuente.errores ?? [])],
    }
    return Response.json(datos, { headers: noStore })
  } catch (error) { return planningError(error) }
}
