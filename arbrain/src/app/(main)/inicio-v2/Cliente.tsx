'use client'
// Solo en el cliente: lee la URL y lo guardado de «Empieza aquí» en el navegador.
import dynamic from 'next/dynamic'
export const InicioV2 = dynamic(() => import('@/features/primer-arranque/v2/components/SocioEstratega').then(m => m.SocioEstratega), { ssr: false })
