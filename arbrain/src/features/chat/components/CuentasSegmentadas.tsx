'use client'
import { useEffect, useState } from 'react'
import type { ChatTab, TabOption } from '../stores/account-store'
import { limitesDeRespuesta } from '../lib/limites-plan'
import { estadoDeCuenta, type EstadoCuenta } from '../lib/selector-modelo'
import css from './model-picker.module.css'

// Cuentas del selector de modelo (1 nov 2026): un segmentado discreto; el punto dice si la cuenta tiene sesión y cuota.
// El daemon guarda 60 s cada lectura de /limits; aquí también, para que abrir y cerrar el menú no repita consultas.
type Lectura = { estado: EstadoCuenta; detalle: string; oculto?: boolean }
const VIGENCIA_MS = 60_000
const memoria = new Map<string, { en: number; lectura: Lectura }>()

function useEstadoCuentas(ids: string[]): Record<string, Lectura> {
  const clave = ids.join(',')
  const [estados, setEstados] = useState<Record<string, Lectura>>(() => Object.fromEntries(ids.flatMap(id => { const m = memoria.get(id); return m ? [[id, m.lectura]] : [] })))
  useEffect(() => {
    const ac = new AbortController()
    for (const id of clave.split(',')) {
      const m = memoria.get(id)
      if (m && Date.now() - m.en < VIGENCIA_MS) continue
      void fetch(`/api/chat/limits?${new URLSearchParams({ account: id })}`, { signal: ac.signal, cache: 'no-store' }).then(async r => {
        const data = await r.json().catch(() => null)
        // 403: la identidad no es la personal; no hay punto que pintar.
        const lectura: Lectura = r.status === 403 ? { estado: 'sin-dato', detalle: '', oculto: true }
          : r.ok ? estadoDeCuenta(limitesDeRespuesta(data))
          : { estado: 'sin-dato', detalle: data?.error || 'No se pudo consultar la cuenta' }
        memoria.set(id, { en: Date.now(), lectura })
        if (!ac.signal.aborted) setEstados(e => ({ ...e, [id]: lectura }))
      }).catch(() => { if (!ac.signal.aborted) setEstados(e => ({ ...e, [id]: { estado: 'sin-dato', detalle: 'Sin respuesta del servidor' } })) })
    }
    return () => ac.abort()
  }, [clave])
  return estados
}

export function CuentasSegmentadas({ options, active, onSelect }: { options: TabOption[]; active?: ChatTab; onSelect: (tab: ChatTab) => void }) {
  const estados = useEstadoCuentas(options.map(o => o.id))
  return (
    <div className={css.segmentado} role="group" aria-label="Cuenta">
      {options.map((opt) => {
        const lectura = estados[opt.id]
        const detalle = lectura && !lectura.oculto && lectura.detalle ? ` · ${lectura.detalle}` : ''
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={opt.id === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(opt.id)}
            title={`${opt.sublabel}${detalle}`}
            className={css.segmento}
          >
            {!lectura?.oculto && <span aria-hidden className={css.punto} data-estado={lectura?.estado ?? 'sin-dato'} />}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
