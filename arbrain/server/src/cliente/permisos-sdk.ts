/**
 * Modo de permisos del SDK por edición (botón Play, 27 oct 2026).
 *
 *   Instalación de Daniel: `bypassPermissions`, como firmó (síntesis y Live en `default`, igual que antes).
 *   Edición cliente: `auto`. La guardia de Arbrain sigue decidiendo primero (negar, permitir, el freno con su tarjeta);
 *   al clasificador del SDK solo le llega lo rutinario que la política mandaría a confirmar, y lo que no decida sube por
 *   `canUseTool` a la tarjeta del hilo. Síntesis (sin herramientas) y Live siguen en `default`. `ARBRAIN_PERMISOS_AUTO=0`
 *   vuelve a `default` (por si un proveedor o modelo no tiene modo automático).
 */
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'

export interface ModoSdk {
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions: boolean
  /** La guardia deja al clasificador lo rutinario (`OpcionesGuardia.clasificador`). */
  clasificador: boolean
}

export function modoPermisosSdk(op: { cliente: boolean; denyTools: boolean; live: boolean }, env: NodeJS.ProcessEnv = process.env): ModoSdk {
  if (!op.cliente) return { permissionMode: op.denyTools || op.live ? 'default' : 'bypassPermissions', allowDangerouslySkipPermissions: !op.denyTools, clasificador: false }
  const auto = !op.denyTools && !op.live && env.ARBRAIN_PERMISOS_AUTO !== '0'
  return { permissionMode: auto ? 'auto' : 'default', allowDangerouslySkipPermissions: false, clasificador: auto }
}
