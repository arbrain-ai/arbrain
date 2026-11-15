'use client'
/**
 * Ajustes › Privacidad (edición cliente, 11 oct 2026): la conexión opcional con arbrain.ai (21 oct 2026), el monitoreo
 * anterior del programa (solo si este build tiene destino o ya hay consentimiento) y los textos aceptados.
 */
import { useEffect, useState } from 'react'
import { DocumentosLegales } from './DocumentosLegales'
import { PanelMonitoreo } from './PanelMonitoreo'
import { PanelConexionArbrain } from './PanelConexionArbrain'
import { tr } from '@/shared/i18n'

export function SeccionPrivacidad() {
  // El monitoreo anterior solo tiene sentido con un destino horneado o un consentimiento dado; si no, confunde.
  const [conMonitoreo, setConMonitoreo] = useState(false)
  useEffect(() => {
    fetch('/api/monitoreo', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => setConMonitoreo(!!(j?.endpoint_configurado || j?.consentimiento))).catch(() => {})
  }, [])
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground/90">{tr('Conectar con arbrain.ai (opcional)')}</h3>
        <p className="mb-3 text-xs leading-snug text-muted">{tr('Tu Arbrain le manda a tu programa una señal mínima de tu avance, una vez al día, solo si lo conectas. Tus conversaciones nunca salen.')}</p>
        <PanelConexionArbrain />
      </section>
      {conMonitoreo && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-foreground/90">{tr('Monitoreo del programa')}</h3>
          <p className="mb-3 text-xs leading-snug text-muted">{tr('Solo cifras de tu avance, una vez al día, y solo si lo activas. Tus conversaciones nunca salen.')}</p>
          <PanelMonitoreo />
        </section>
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground/90">{tr('Lo que aceptaste')}</h3>
        <DocumentosLegales />
      </section>
    </div>
  )
}
