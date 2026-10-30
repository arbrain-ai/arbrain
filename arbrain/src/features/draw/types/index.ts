export interface DrawPage {
  thumbnail_url?: string | null
  page_id: string
  user_id: string
  name: string
  page_elements: DrawElements | null
  agent_version: number
  is_deleted: boolean
  folder_id: string | null
  created_at: string
  updated_at: string
  /**
   * Settings de PÁGINA (columna `settings` de la tabla `draw`), distintos de
   * `page_elements.settings` (config del grid del editor de canvas). Hoy solo
   * trae `htmlUrl`: si viene seteado, la página es una "hoja HTML" que renderiza
   * un iframe full-bleed en vez del editor de canvas.
   */
  page_settings?: { htmlUrl?: string } | null
}

export interface DrawFolder {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export interface DrawElements {
  elements: readonly Record<string, unknown>[]
  files?: Record<string, unknown>
  schemaVersion?: number
  theme?: 'dark' | 'light' | 'mono' | 'system'
  camera?: { x: number; y: number; scale: number }
  settings?: {
    gridStyle?: 'none' | 'lines' | 'dots'
    gridSize?: number
    snapToGrid?: boolean
    snapToObjects?: boolean
    snapThreshold?: number
    showObjectDimensions?: boolean
    showMinimap?: boolean
  }
}
