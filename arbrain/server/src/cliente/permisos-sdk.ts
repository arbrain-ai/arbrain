/**
 * Modo de permisos del SDK por edición (botón Play, 27 oct 2026; Autónomo, 29 oct 2026).
 *
 *   Instalación de Daniel: `bypassPermissions`, como firmó (síntesis y Live en `default`, igual que antes).
 *   Edición cliente, «Preguntar siempre» y «Automático en mi carpeta»: `auto`. La guardia de Arbrain sigue decidiendo
 *   primero (negar, permitir, el freno con su tarjeta); al clasificador del SDK solo le llega lo rutinario que la
 *   política mandaría a confirmar, y lo que no decida sube por `canUseTool` a la tarjeta del hilo.
 *   Edición cliente, «Autónomo»: `default` sin clasificador. La guardia (gancho PreToolUse) decide TODO: lo que la red
 *   mínima no niega lo aprueba de forma explícita (`permissionDecision: allow`), así que el SDK no pregunta nada; lo
 *   que la red mínima niega vuelve negado, y R5/R6 suben a la tarjeta. Es el mismo efecto que el bypass de la
 *   instalación de Daniel con su lista negra (`cabina/perfiles.ts`), sin pedir `bypassPermissions`: el `.claude/settings.json`
 *   del cerebro del alumno lo prohíbe (`disableBypassPermissionsMode`) y un clasificador podría negar por su cuenta lo
 *   que la persona ya dejó correr.
 *   Síntesis (sin herramientas) y Live siguen en `default`. `ARBRAIN_PERMISOS_AUTO=0` vuelve a `default` (por si un
 *   proveedor o modelo no tiene modo automático).
 */
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'

export interface ModoSdk {
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions: boolean
  /** La guardia deja al clasificador lo rutinario (`OpcionesGuardia.clasificador`). */
  clasificador: boolean
}

export function modoPermisosSdk(op: { cliente: boolean; denyTools: boolean; live: boolean; autonomo?: boolean }, env: NodeJS.ProcessEnv = process.env): ModoSdk {
  if (!op.cliente) return { permissionMode: op.denyTools || op.live ? 'default' : 'bypassPermissions', allowDangerouslySkipPermissions: !op.denyTools, clasificador: false }
  if (op.autonomo && !op.denyTools && !op.live) return { permissionMode: 'default', allowDangerouslySkipPermissions: false, clasificador: false }
  const auto = !op.denyTools && !op.live && env.ARBRAIN_PERMISOS_AUTO !== '0'
  return { permissionMode: auto ? 'auto' : 'default', allowDangerouslySkipPermissions: false, clasificador: auto }
}
