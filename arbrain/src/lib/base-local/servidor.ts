/**
 * Clientes «tipo Supabase» de la edición cliente (11 oct 2026). Nunca se crea un cliente Supabase real: los datos
 * viven en la base local de la instalación y la sesión es la de la app de escritorio (secreto por instalación).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteLocal, type UsuarioLocal } from './consulta'
import { almacenDeLaInstalacion } from './archivos'
import { LOCAL_DESKTOP_USER_ID } from '@/lib/desktop-auth'
import { CORREO_LOCAL_CLIENTE, NOMBRE_LOCAL_CLIENTE } from '@/lib/edicion'

export const USUARIO_LOCAL_CLIENTE: UsuarioLocal = { id: LOCAL_DESKTOP_USER_ID, email: CORREO_LOCAL_CLIENTE, nombre: NOMBRE_LOCAL_CLIENTE }

/** Equivalente al cliente de servicio: sin usuario, acceso a la base local. */
export function clienteLocalServicio(): SupabaseClient {
  return clienteLocal(almacenDeLaInstalacion()) as unknown as SupabaseClient
}

/** Equivalente al cliente con sesión: el usuario existe solo si la petición trae la cookie de la app. */
export function clienteLocalSesion(esLaApp: () => Promise<boolean>): SupabaseClient {
  return clienteLocal(almacenDeLaInstalacion(), {
    usuario: async () => (await esLaApp()) ? USUARIO_LOCAL_CLIENTE : null,
  }) as unknown as SupabaseClient
}
