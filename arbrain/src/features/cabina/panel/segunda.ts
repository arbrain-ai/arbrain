'use client'
/**
 * ¿La sesión es de la segunda persona de la instalación? 2 nov 2026: su panel se acomoda a lo suyo (fijadas.ts ›
 * acomodoSegunda). Solo decide lo que se PINTA; lo que puede leer lo decide el servidor (lib/planning/server.ts). El escritorio
 * local es del dueño (su perfil sintético lleva el correo del dueño), así que nunca cae aquí.
 */
import { useAuth } from '@/hooks/useAuth'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'

export const esCorreoSegunda = (correo: string | null | undefined, segunda = instalacion().correoReportesSecundario, cliente = esEdicionCliente()) =>
  !cliente && !!segunda && (correo ?? '').trim().toLowerCase() === segunda.trim().toLowerCase()

export function useSoySegunda(): boolean {
  const { profile, user } = useAuth()
  return esCorreoSegunda(profile?.email ?? user?.email)
}
