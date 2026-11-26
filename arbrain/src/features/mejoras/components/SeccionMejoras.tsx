'use client'
/**
 * Ajustes › Mejoras: un interruptor por mejora opcional. Apagada, la app se comporta exactamente como sin ella. Se
 * guardan en el daemon (valen en todas las ventanas y en el teléfono) y se aplican al momento.
 */
import { useEffect } from 'react'
import { Interruptor } from '@/features/configuracion/components/Interruptor'
import { DEF_MEJORAS } from '../lib/mejoras'
import { useMejoras } from '../lib/mejoras-store'
import { tr } from '@/shared/i18n'
import { textoConAtajos, useEsMac } from '@/shared/navigation/teclas-plataforma'

export function SeccionMejoras() {
  const { mejoras, error, cargar, fijar } = useMejoras()
  const mac = useEsMac()
  useEffect(() => { cargar() }, [cargar])
  return (
    <div className="space-y-4" data-seccion-mejoras>
      <section className="solid-card overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground/90">{tr('Mejoras opcionales')}</h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">{tr('Préndelas o apágalas cuando quieras. Apagada, cada una deja la app exactamente como estaba.')}</p>
        </div>
        <ul className="divide-y divide-border-subtle">
          {DEF_MEJORAS.map((m) => {
            const activa = mejoras[m.id]
            return (
              <li key={m.id} data-mejora={m.id} data-activa={activa || undefined} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">{tr(m.nombre)}</span>
                  <span className="block text-xs leading-snug text-muted">{textoConAtajos(tr(m.detalle), mac)}</span>
                </span>
                <Interruptor activo={activa} onCambio={(v) => { void fijar(m.id, v) }} etiqueta={activa ? tr('Apagar {mejora}', { mejora: tr(m.nombre) }) : tr('Prender {mejora}', { mejora: tr(m.nombre) })} />
              </li>
            )
          })}
        </ul>
        {error && <p role="alert" className="border-t border-border-subtle px-4 py-2 text-xs text-red-500 sm:px-5">{tr('Quedó solo en este dispositivo: {error}', { error })}</p>}
      </section>
    </div>
  )
}
