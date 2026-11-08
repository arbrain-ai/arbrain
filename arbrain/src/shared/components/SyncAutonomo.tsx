'use client'

/**
 * El sincronizador sin pantalla (4 nov 2026). Reemplaza al punto verde de arriba a la derecha («Arbrain Runtime»): Daniel ya no
 * lo miraba («deja todo preparado para que sea la ia quien se encargue de esto sin mi atención en el medio»). No pinta nada.
 * Las reglas viven en `lib/local-first/sync-autonomo.ts`; las acciones manuales, para Levy y diagnóstico, en Ajustes › Mac y
 * sistema › Sincronización.
 */
import { useEffect } from 'react'
import {
  isDesktopRuntime,
  isLocalhostRuntime,
  isOnline,
  listSyncQueue,
  onLocalFirstChanged,
  prepareOfflinePack,
  pullCloudToLocal,
  syncEntidades,
} from '@/lib/local-first'
import {
  conflictosPorResolver,
  ESPEJO_CADA_MS,
  fraseIrresoluble,
  irresolubles,
  NOMBRE_PAQUETE,
  PAQUETE_CADA_MS,
  REVISION_SYNC_MS,
  syncVencidos,
  toca,
} from '@/lib/local-first/sync-autonomo'
import type { SyncQueueItem } from '@/lib/local-first/types'

/** La misma marca que usaba el punto verde: el espejo no se repite al cambiar de versión. */
const CLAVE_ESPEJO = 'mission-control:last-mirror-pull'
const CLAVE_PAQUETE = 'arbrain.sync.ultimo-paquete'
const CLAVE_ESCALADO = (id: string) => `arbrain.sync.escalado.${id}`

const leer = (clave: string) => { try { return Number(localStorage.getItem(clave) ?? NaN) } catch { return NaN } }
const marcar = (clave: string, valor = String(Date.now())) => { try { localStorage.setItem(clave, valor) } catch { /* sin almacenamiento */ } }

/** Una línea en la bitácora de Levy (o la campana, solo para lo irresoluble). Nunca lanza. */
async function anotar(cuerpo: { evento: 'conflicto_resuelto' | 'fallas' | 'espejo' | 'error' | 'irresoluble'; titulo: string; detalle?: string; id?: string }): Promise<boolean> {
  try {
    const r = await fetch('/api/local-first/bitacora', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    return r.ok
  } catch { return false }
}

async function escalar(cola: SyncQueueItem[]) {
  for (const item of irresolubles(cola)) {
    if (Number.isFinite(leer(CLAVE_ESCALADO(item.id)))) continue
    const { titulo, cuerpo } = fraseIrresoluble(item)
    if (await anotar({ evento: 'irresoluble', titulo, detalle: cuerpo, id: item.id })) marcar(CLAVE_ESCALADO(item.id))
  }
}

export function SyncAutonomo() {
  useEffect(() => {
    let vivo = true, corriendo = false, espera: number | undefined

    const tic = async () => {
      if (!vivo || corriendo || document.hidden || !isOnline()) return
      corriendo = true
      try {
        const cola = await listSyncQueue()
        const vencidos = syncVencidos(cola)
        let despues = cola
        if (vencidos.length) {
          const conflictos = new Set(conflictosPorResolver(cola).map(i => i.id))
          const r = await syncEntidades(vencidos)
          despues = await listSyncQueue()
          for (const item of despues) {
            if (conflictos.has(item.id) && item.status === 'synced') await anotar({ evento: 'conflicto_resuelto', titulo: `Conflicto resuelto solo (${item.entityType}): ganó el cambio local`, id: item.id })
          }
          if (r.failed || r.conflicts) await anotar({ evento: 'fallas', titulo: `Sincronización: ${r.synced} de ${r.processed} subidos; ${r.failed} fallaron y ${r.conflicts} en conflicto, reintento con espera creciente` })
        }
        await escalar(despues)

        // El espejo local (lo que antes hacía el punto verde al abrir la app): cada 5 min, sin las vistas de analítica.
        if (isLocalhostRuntime() && toca(leer(CLAVE_ESPEJO), ESPEJO_CADA_MS)) {
          marcar(CLAVE_ESPEJO)
          const p = await pullCloudToLocal(false)
          if (p.errors.length) await anotar({ evento: 'espejo', titulo: 'Espejo local con errores', detalle: p.errors.join('; ').slice(0, 900) })
        }
        // El paquete offline, una vez al día y uno solo (se sobrescribe).
        if (isDesktopRuntime() && toca(leer(CLAVE_PAQUETE), PAQUETE_CADA_MS)) {
          marcar(CLAVE_PAQUETE)
          await prepareOfflinePack({ name: NOMBRE_PAQUETE, notes: 'Paquete diario del sincronizador autónomo.', snapshots: { generatedFrom: 'sync-autonomo' } })
        }
      } catch (error) {
        await anotar({ evento: 'error', titulo: 'El sincronizador autónomo falló en esta vuelta', detalle: error instanceof Error ? error.message : String(error) })
      } finally {
        corriendo = false
      }
    }

    // Un cambio local (una tarea nueva, un lienzo guardado) se sube pronto, sin esperar a la siguiente vuelta.
    const pronto = () => { window.clearTimeout(espera); espera = window.setTimeout(() => void tic(), 1_500) }
    const primera = window.setTimeout(() => void tic(), 4_000)
    const intervalo = window.setInterval(() => void tic(), REVISION_SYNC_MS)
    const offCambio = onLocalFirstChanged(pronto)
    const alVolver = () => { if (!document.hidden) pronto() }
    window.addEventListener('online', pronto)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      window.clearTimeout(primera); window.clearTimeout(espera); window.clearInterval(intervalo)
      offCambio()
      window.removeEventListener('online', pronto)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  return null
}
