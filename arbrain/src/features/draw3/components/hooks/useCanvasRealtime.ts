/**
 * Canal realtime de la página (postgres_changes sobre `draw`) — extraido
 * verbatim de DrawEditor3.tsx (refactor fase 3, extraccion B2).
 *
 * Semantica de merge (sin cambios):
 * - Versiones <= remoteVersionRef se ignoran (anti-eco de nuestros propios saves)
 * - mergeRemoteElements: por elemento gana el updatedAt mas nuevo; los locales
 *   que el remoto no conoce se conservan (anti lost-update durante edicion)
 * - El theme NO sigue payloads realtime (sigue el theme global de la app)
 */
'use client'
import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCanvasStore, type ThemeMode } from '../../stores/canvas-store'
import type { CanvasElement } from '../../elements/types'

export function mergeRemoteElements(local: CanvasElement[], remote: CanvasElement[]) {
  const localById = new Map(local.map(el => [el.id, el]))
  const remoteIds = new Set(remote.map(el => el.id))
  const merged = remote.map(remoteEl => {
    const localEl = localById.get(remoteEl.id)
    if (!localEl) return remoteEl
    return (remoteEl.updatedAt ?? 0) >= (localEl.updatedAt ?? 0) ? remoteEl : localEl
  })
  for (const localEl of local) {
    if (!remoteIds.has(localEl.id)) merged.push(localEl)
  }
  return merged
}

type CanvasSettings = ReturnType<typeof useCanvasStore.getState>['settings']

export interface CanvasRealtimeDeps {
  loaded: boolean
  pageId: string
  remoteVersionRef: RefObject<number>
  nameRef: RefObject<string>
  setName: (name: string) => void
  setElements: (elements: CanvasElement[]) => void
  setAgentVersion: (v: number) => void
  setPageName: (name: string) => void
  updateSettings: (patch: Partial<CanvasSettings>) => void
  setRenderTick: Dispatch<SetStateAction<number>>
  normalizeElement: (raw: Record<string, unknown>, files: Record<string, { dataURL?: string }>, index: number) => CanvasElement | null
  sanitizeCanvasSettings: (value: unknown) => Partial<CanvasSettings>
  /** Ids que el merge remoto creo/actualizo — para el flash de actividad del agente. */
  onRemoteChanges?: (ids: string[]) => void
}

export function useCanvasRealtime({
  loaded,
  pageId,
  remoteVersionRef,
  nameRef,
  setName,
  setElements,
  setAgentVersion,
  setPageName,
  updateSettings,
  setRenderTick,
  normalizeElement,
  sanitizeCanvasSettings,
  onRemoteChanges,
}: CanvasRealtimeDeps) {
  // Realtime merge from agent ops. The server may still send legacy-compatible
  // records; normalize everything into v3 before merging.
  useEffect(() => {
    if (!loaded) return
    const supabase = createClient()
    const channel = supabase
      .channel(`draw3-native-${pageId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'draw', filter: `page_id=eq.${pageId}` },
        (payload) => {
          const row = payload.new as {
            agent_version?: number
            name?: string
            page_elements?: {
              elements?: Record<string, unknown>[]
              files?: Record<string, { dataURL?: string }>
              theme?: ThemeMode
              camera?: { x: number; y: number; scale: number }
              settings?: Record<string, unknown>
            }
          }
          const incomingVersion = row.agent_version ?? 0
          if (incomingVersion <= remoteVersionRef.current) return
          remoteVersionRef.current = incomingVersion
          const files = row.page_elements?.files ?? {}
          const incoming = (row.page_elements?.elements ?? []).map((raw, index) => normalizeElement(raw, files, index)).filter(Boolean) as CanvasElement[]
          const localBefore = useCanvasStore.getState().elements
          setElements(mergeRemoteElements(localBefore, incoming))
          if (onRemoteChanges) {
            const localById = new Map(localBefore.map(el => [el.id, el]))
            const changed = incoming
              .filter(el => {
                const prev = localById.get(el.id)
                return !prev || (el.updatedAt ?? 0) > (prev.updatedAt ?? 0)
              })
              .map(el => el.id)
            if (changed.length > 0) onRemoteChanges(changed)
          }
          setAgentVersion(incomingVersion)
          if (row.name && row.name !== nameRef.current) {
            setName(row.name)
            setPageName(row.name)
          }
          // Theme follows the global app theme (mirrored via useTheme), not realtime payloads.
          if (row.page_elements?.settings) updateSettings(sanitizeCanvasSettings(row.page_elements.settings))
          setRenderTick(t => t + 1)
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loaded, pageId, setAgentVersion, setElements, setPageName, updateSettings, normalizeElement, sanitizeCanvasSettings, setRenderTick, remoteVersionRef, nameRef, setName, onRemoteChanges])
}
