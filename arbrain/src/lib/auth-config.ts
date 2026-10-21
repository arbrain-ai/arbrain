import { instalacion } from '@/config'
// Whitelisted emails — only these can login/signup. Vienen de la configuración de la instalación
// (config/instalacion.ts); la edición cliente no tiene login por correo (entra con el secreto de la app).
export const ALLOWED_EMAILS: readonly string[] = instalacion().correosPermitidos.map((c) => c.correo.toLowerCase())

export type UserRole = 'owner' | 'admin' | 'member'

// Role assignments by email
// Lo que NO se hereda entre perfiles owner es el buzón: avisos de agenda/cron, push de rutinas y conversaciones sin
// dueño son de la persona dueña (correoDueno), no de «todo perfil owner». Ver features/avisos/server.ts.
export const EMAIL_ROLES: Record<string, UserRole> = Object.fromEntries(
  instalacion().correosPermitidos.map((c) => [c.correo.toLowerCase(), c.rol]),
)

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}

export function getRoleForEmail(email: string): UserRole {
  return EMAIL_ROLES[email.toLowerCase()] ?? 'member'
}
