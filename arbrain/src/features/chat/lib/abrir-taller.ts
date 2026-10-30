'use client'
// «Ver el Taller» desde el hilo (1 oct 2026): el mismo camino que la línea «N agentes
// trabajando ›» de la pestaña Tareas (`activar('taller')`), más abrir el panel donde viva
// (columna, hoja en teléfono o su ventana propia, si el Taller se arrastró fuera) con la sub-vista «Agentes» al frente.
import { mostrarPanel } from '@/features/cabina/panel/ventanas'

// Misma clave que guarda el panel (PanelDerecho.tsx `CLAVE`): el Taller recuerda su última
// sub-vista y arranca ahí; aquí se le pide «Agentes», que es donde están estas tareas.
const CLAVE_PANEL = 'arbrain.panelDerecho'

export function abrirTallerDelPanel() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_PANEL) ?? '{}')
    localStorage.setItem(CLAVE_PANEL, JSON.stringify({ ...guardado, taller: 'terminales' }))
  } catch { /* sin almacenamiento: abre en la última sub-vista */ }
  // Con el Taller en su ventana se trae al frente; si no, se activa en la columna y se abre. (1 oct 2026)
  mostrarPanel('taller')
}
