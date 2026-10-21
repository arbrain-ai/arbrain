'use client'

// useAuth ahora lee del AuthProvider compartido (1 suscripción + 1 fetch para toda
// la app). La lógica vive en shared/contexts/auth-context.tsx. Se mantiene este path
// de import para los ~11 consumidores existentes.
export { useAuthContext as useAuth, type AuthState } from '@/shared/contexts/auth-context'
