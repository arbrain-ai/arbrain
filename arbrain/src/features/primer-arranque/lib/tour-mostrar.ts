'use client'
/**
 * «Muéstramelo» del tour de bienvenida (1 nov 2026): cada destino del guion (`<!-- mostrar: … -->`) a la misma acción
 * que hace la persona a mano, por los caminos del panel (el «+», Tareas, Taller y Ajustes). Un destino desconocido no
 * abre nada. Los destinos válidos viven en lib/tour.ts (`DESTINOS_MOSTRAR`).
 */
import { abrirCasa, abrirSeccion } from '@/features/cabina/panel/Secciones'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'
import { seccionDeUrl } from '@/features/configuracion/secciones'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { destinoValido } from './tour'

export function mostrarDestino(destino: string | null | undefined): boolean {
  if (!destinoValido(destino)) return false
  const [que, cual] = destino!.split(':')
  try {
    if (que === 'calendario') abrirSeccion(cual === 'semana' || cual === 'mes' ? { vista: 'calendario', alcance: cual } : { vista: 'calendario' })
    else if (que === 'tareas') abrirCasa('tareas')
    else if (que === 'taller') { abrirCasa('taller'); if (cual) pedirSegmentoTaller(cual) }
    else if (que === 'ajustes') useAjustes.getState().abrir(cual ? seccionDeUrl(cual) : undefined)
    return true
  } catch { return false }
}
