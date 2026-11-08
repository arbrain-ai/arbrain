'use client'
/**
 * Ajustes › Autonomía (4 nov 2026): qué hace Levy solo y qué espera tu toque. El preset (Cauteloso · Equilibrado · Piloto
 * automático) y, debajo, cada clase con su modo: lo hace solo, te pregunta o nunca. Lo irreversible no baja de «te
 * pregunta». Aquí se enciende «Soporte técnico a la cohorte» (nace en «te pregunta»): un agente no cambia su propia
 * autonomía, la cambias tú (el daemon exige el secreto de la web). Misma fuente que la bandeja (`/api/decisiones`).
 */
import { Loader2 } from 'lucide-react'
import { useBandeja } from './useBandeja'
import { ajustesCon, modosDe, NOMBRE_MODO, type Clase, type Modo, type PoliticaApp } from './lib/bandeja'

export function SeccionAutonomia() {
  const b = useBandeja(15_000)
  const p = b.vista?.politica
  if (!p) return <p className="py-6 text-sm text-muted">{b.error ? `La política no responde: ${b.error}` : 'Cargando la política…'}</p>
  const ocupado = b.ocupado === 'politica'
  const cambiar = (clase: Clase, modo: Modo) => void b.politica(p.preset, ajustesCon(p, clase, modo))
  return (
    <div className="space-y-4" data-ajustes-autonomia>
      <section className="solid-card overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground/90">Punto de partida</h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">Lo que cambies abajo se queda aunque cambies de punto de partida.</p>
        </div>
        <div role="radiogroup" aria-label="Política de autonomía" className="grid gap-2 px-4 py-4 sm:grid-cols-3 sm:px-5">
          {p.presets.map(x => {
            const activo = x.id === p.preset
            return (
              <button key={x.id} type="button" role="radio" aria-checked={activo} disabled={ocupado} onClick={() => void b.politica(x.id, p.ajustes ?? {})}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? 'border-brand/60 bg-brand/10' : 'border-border-subtle hover:border-foreground/25'}`}>
                <span className="block text-[13px] font-semibold text-foreground">{x.nombre}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{x.que}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="solid-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground/90">Qué hace Levy solo</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted">Lo que hace solo queda en «Lo que hice solo»; lo que te pregunta llega a tu bandeja con Sí · No · Otro.</p>
          </div>
          {ocupado && <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />}
        </div>
        <ul className="divide-y divide-border-subtle">
          {p.clases.map(c => <FilaClase key={c.id} c={c} ocupado={ocupado} onCambio={m => cambiar(c.id, m)} />)}
        </ul>
        <p className="border-t border-border-subtle px-4 py-3 text-xs leading-snug text-muted sm:px-5">Siempre tuyo, en cualquier punto de partida: {p.siempreTuyo.join(', ')}.</p>
      </section>
      {b.error && <p className="text-xs text-red-400" role="alert">{b.error}</p>}
    </div>
  )
}

function FilaClase({ c, ocupado, onCambio }: { c: PoliticaApp['clases'][number]; ocupado: boolean; onCambio: (m: Modo) => void }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5" data-clase={c.id} data-modo={c.modo}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-foreground">
          {c.nombre}
          {c.irreversible && <span className="rounded-full bg-foreground/10 px-1.5 text-[10.5px] font-medium text-muted">irreversible</span>}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted">{c.que}</p>
        {c.firmado && <p className="mt-1 text-xs leading-snug text-foreground/75" data-firmado>{c.firmado}</p>}
      </div>
      <div role="radiogroup" aria-label={`${c.nombre}: qué hace Levy`} className="flex shrink-0 overflow-hidden rounded-lg border border-border-subtle">
        {modosDe(c).map(m => {
          const activo = c.modo === m
          return (
            <button key={m} type="button" role="radio" aria-checked={activo} disabled={ocupado} onClick={() => { if (!activo) onCambio(m) }}
              className={`min-h-9 px-2.5 text-xs font-medium transition-colors ${activo ? 'bg-brand/15 text-foreground' : 'text-muted hover:bg-card-hover hover:text-foreground'}`}>
              {NOMBRE_MODO[m]}
            </button>
          )
        })}
      </div>
    </li>
  )
}
