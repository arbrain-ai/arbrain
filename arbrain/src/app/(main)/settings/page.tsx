'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { seccionDeUrl } from '@/features/configuracion/secciones'
import { useAjustes } from '@/shared/stores/ajustes-store'

/**
 * /settings → enlace directo a Ajustes (6 oct 2026). Ajustes ya no es una pantalla: es una ventana flotante montada en
 * el shell. Esta ruta solo la abre sobre /chat y deja la URL limpia. `?seccion=panel` (o el viejo `?section=`) abre esa
 * sección. Historia: docs/builds/configuracion-orden-2026-10-02/CENSO.md.
 */
function AbrirAjustes() {
  const router = useRouter()
  const params = useSearchParams()
  const crudo = params.get('seccion') ?? params.get('section')
  useEffect(() => {
    // Las etiquetas viven en el Board desde el 2 oct: el enlace viejo abre ahí su gestor.
    if (crudo === 'labels') { router.replace('/board?etiquetas=1'); return }
    useAjustes.getState().abrir(crudo ? seccionDeUrl(crudo) : undefined)
    router.replace('/chat')
  }, [crudo, router])
  return null
}

export default function SettingsPage() {
  return (
    <Suspense>
      <AbrirAjustes />
    </Suspense>
  )
}
