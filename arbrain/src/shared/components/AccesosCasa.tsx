'use client'
import { Dog, House, Maximize2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { esEdicionCliente, paginaPermitidaEnCliente } from '@/lib/edicion'
import { canAccessRoute } from '@/lib/permissions'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { useLayoutStore } from '@/shared/stores/layout-store'

/**
 * Perro y Casa (26 oct 2026, Daniel: «asegúrate que pueda entrar desde el navegador»). Viven en el bloque «Entorno
 * físico» al pie del «+» del panel (27 oct; Daniel: «ese botón pudiera estar dentro de un panel, hasta abajo tipo
 * "entorno-físico"»). Desde el 27 oct en la tarde se abren como PESTAÑAS del panel derecho, igual que Calendario o Lienzo
 * (Daniel: «todo esto puede abrirse en los paneles de la derecha??»); «Expandir» dentro de la pestaña lleva a la sección
 * completa (/perro, /casa). Solo para quien puede abrir esas rutas.
 */
export const ACCESOS_CASA = [
  { vista: 'perro', href: '/perro', label: 'Perro', nota: 'El Go2: cámara, mapa, lugares, voz y STOP', icon: Dog },
  { vista: 'casa', href: '/casa', label: 'Casa', nota: 'Tu casa: luces, el perro y tus dispositivos', icon: House },
] as const

/** Las entradas que el rol puede abrir. En la edición cliente /perro y /casa no existen (la casa física es del autor). */
export function useAccesosCasa() {
  const { role } = useAuth()
  const pathname = usePathname()
  const cliente = esEdicionCliente()
  const visibles = ACCESOS_CASA.filter(a => role && canAccessRoute(a.href, role) && (!cliente || paginaPermitidaEnCliente(a.href)))
  return { visibles, pathname }
}

/** Ir a la sección completa desde su pestaña: en el teléfono el panel es una hoja encima y se cierra para dejarla ver. */
export function useIrASeccion() {
  const router = useRouter()
  const movil = useIsMobile()
  return (href: string) => {
    if (movil) useLayoutStore.getState().setPanelDerecho(false)
    router.push(href)
  }
}

/** «Expandir» de las pestañas Perro y Casa: la sección completa. Con `alExpandir` se abre EN SITIO, en la misma ventana
 *  (27 oct 2026, Daniel: en una ventana aparte navegar dejaba una vista suelta sin cabecera ni «volver»). */
export function BotonExpandir({ href, nombre, alExpandir }: { href: string; nombre: string; alExpandir?: () => void }) {
  const ir = useIrASeccion()
  return <button type="button" onClick={() => alExpandir ? alExpandir() : ir(href)} data-expandir title={`Abrir ${nombre} a pantalla completa`} aria-label={`Expandir ${nombre} a su sección`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent',
      color: 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 650, letterSpacing: '0.02em', cursor: 'pointer', flexShrink: 0 }}>
    <Maximize2 size={12} aria-hidden />Expandir
  </button>
}
