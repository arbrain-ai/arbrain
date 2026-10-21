// Límites de uso del plan (2 oct 2026): tipos de lo que devuelve el daemon en
// GET /limits y el texto de «se restablece». Los datos son del proveedor
// (Claude: usage del Agent SDK; Codex: account/rateLimits/read); lo que falta
// llega como null o available=false y la UI dice «sin dato», nunca un cero.
export interface VentanaLimite {
  id: string
  label: string
  percent: number | null
  resetsAt: string | null
  windowMinutes: number | null
}
export interface LimitesPlan {
  account: string
  engine: 'claude' | 'codex'
  plan: string | null
  available: boolean
  reason: string | null
  windows: VentanaLimite[]
  reached: string | null
  observedAt: string
  source: string
}

/** Valida lo que llega por red: sin el contrato exacto, la UI no pinta nada inventado. */
export function limitesDeRespuesta(data: unknown): LimitesPlan {
  const raiz = data as Partial<LimitesPlan> | null
  if (!raiz || typeof raiz !== 'object' || typeof raiz.available !== 'boolean' || !Array.isArray(raiz.windows)) throw new Error('Respuesta de límites no válida.')
  const windows = raiz.windows.flatMap((raw): VentanaLimite[] => {
    const v = raw as Partial<VentanaLimite> | null
    if (!v || typeof v.id !== 'string' || typeof v.label !== 'string') return []
    return [{
      id: v.id, label: v.label,
      percent: typeof v.percent === 'number' && Number.isFinite(v.percent) ? Math.max(0, Math.min(100, v.percent)) : null,
      resetsAt: typeof v.resetsAt === 'string' && Number.isFinite(Date.parse(v.resetsAt)) ? v.resetsAt : null,
      windowMinutes: typeof v.windowMinutes === 'number' ? v.windowMinutes : null,
    }]
  })
  return {
    account: String(raiz.account ?? ''), engine: raiz.engine === 'codex' ? 'codex' : 'claude',
    plan: typeof raiz.plan === 'string' ? raiz.plan : null,
    available: raiz.available && windows.length > 0,
    reason: typeof raiz.reason === 'string' ? raiz.reason : null,
    windows, reached: typeof raiz.reached === 'string' ? raiz.reached : null,
    observedAt: typeof raiz.observedAt === 'string' ? raiz.observedAt : new Date().toISOString(),
    source: typeof raiz.source === 'string' ? raiz.source : '',
  }
}

/** «Reinicia 17:10 · en 41 min» (menos de 24 h) o «Reinicia sáb 17:00». null sin fecha válida.
 * La hora va en la zona del navegador (o la que se pase, para las pruebas). */
export function textoReinicio(resetsAt: string | null, ahora: Date = new Date(), zonaHoraria?: string): string | null {
  if (!resetsAt) return null
  const objetivo = Date.parse(resetsAt)
  if (!Number.isFinite(objetivo)) return null
  const minutos = Math.ceil((objetivo - ahora.getTime()) / 60_000)
  if (minutos <= 0) return 'Reinicia ahora'
  const partes = new Intl.DateTimeFormat('es-MX', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(zonaHoraria && { timeZone: zonaHoraria }) }).formatToParts(new Date(objetivo))
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
  const hora = `${parte('hour')}:${parte('minute')}`
  if (minutos >= 24 * 60) return `Reinicia ${parte('weekday').replace('.', '')} ${hora}`
  const horas = Math.floor(minutos / 60), resto = minutos % 60
  return `Reinicia ${hora} · en ${horas ? `${horas} h${resto ? ` ${resto} min` : ''}` : `${resto} min`}`
}

/** Qué cuentas consulta el panel para una conversación: la de Claude de esa conversación (o la de
 * Daniel) y la de Codex de esa conversación (o la suya). Codex solo se pinta si la cuenta reporta
 * límites, salvo que la conversación corra en Codex: ahí su «sin dato» sí se muestra. */
export function cuentasDeLimites(account: string): { claude: 'default' | 'bro'; codex: 'codex' | 'yt'; codexEsLaConversacion: boolean } {
  const codexEsLaConversacion = account === 'codex' || account === 'yt'
  return { claude: account === 'bro' ? 'bro' : 'default', codex: account === 'yt' ? 'yt' : 'codex', codexEsLaConversacion }
}

/** Hace cuánto se leyó el dato, para no presentar una lectura vieja como actual. */
export function textoObservado(observedAt: string, ahora: Date = new Date()): string {
  const segundos = Math.max(0, Math.round((ahora.getTime() - Date.parse(observedAt)) / 1000))
  if (segundos < 90) return 'Actualizado ahora'
  const minutos = Math.round(segundos / 60)
  return minutos < 60 ? `Actualizado hace ${minutos} min` : `Actualizado hace ${Math.round(minutos / 60)} h`
}
