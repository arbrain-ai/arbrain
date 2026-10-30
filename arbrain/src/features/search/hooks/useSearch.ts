'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { searchLocal } from '@/lib/local-first'

export interface SearchResult {
  type: 'task' | 'document' | 'activity' | 'agent' | 'message' | 'calendar' | 'canvas'
  id: string
  title: string
  subtitle: string
  timestamp: string | null
  taskId?: string
}

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    const supabase = createClient()
    const pattern = `%${searchQuery.trim()}%`

    try {
      // Use ilike as universal fallback (works without search_vector columns)
      const [tasksRes, docsRes, activitiesRes, agentsRes, messagesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, description, status, created_at')
          .or(`title.ilike.${pattern},description.ilike.${pattern}`)
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase
          .from('documents')
          .select('id, title, type, created_at')
          .ilike('title', pattern)
          .limit(5),
        supabase
          .from('activities')
          .select('id, message, type, created_at, agents(name)')
          .ilike('message', pattern)
          .limit(5),
        supabase
          .from('agents')
          .select('id, name, role, avatar')
          .or(`name.ilike.${pattern},role.ilike.${pattern}`)
          .limit(5),
        supabase
          .from('messages')
          .select('id, content, task_id, created_at, agents(name)')
          .ilike('content', pattern)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const localResults = await searchLocal(searchQuery).catch(() => [])
      const searchResults: SearchResult[] = [
        ...localResults.map((hit) => ({
          type: hit.module === 'calendar' ? 'calendar' as const : hit.module === 'canvas' ? 'canvas' as const : 'task' as const,
          id: hit.id,
          title: hit.title,
          subtitle: `local ${hit.module}${hit.subtitle ? ` · ${hit.subtitle}` : ''}`,
          timestamp: hit.updatedAt ?? null,
        })),
        ...(tasksRes.data || []).map((t) => ({
          type: 'task' as const,
          id: t.id,
          title: t.title,
          subtitle: `${t.status} task`,
          timestamp: t.created_at,
        })),
        ...(agentsRes.data || []).map((a) => ({
          type: 'agent' as const,
          id: a.id,
          title: `${a.avatar} ${a.name}`,
          subtitle: a.role,
          timestamp: null,
        })),
        ...(messagesRes.data || []).map((m) => ({
          type: 'message' as const,
          id: m.id,
          title: m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content,
          subtitle: `by ${(m.agents as unknown as { name: string })?.name || 'Unknown'}`,
          timestamp: m.created_at,
          taskId: m.task_id,
        })),
        ...(docsRes.data || []).map((d) => ({
          type: 'document' as const,
          id: d.id,
          title: d.title,
          subtitle: `${d.type} document`,
          timestamp: d.created_at,
        })),
        ...(activitiesRes.data || []).map((a) => ({
          type: 'activity' as const,
          id: a.id,
          title: a.message,
          subtitle: `by ${(a.agents as unknown as { name: string })?.name || 'Unknown'}`,
          timestamp: a.created_at,
        })),
      ]

      setResults(searchResults)
    } catch (err) {
      console.error('Search error:', err)
      const localResults = await searchLocal(searchQuery).catch(() => [])
      setResults(localResults.map((hit) => ({
        type: hit.module === 'calendar' ? 'calendar' as const : hit.module === 'canvas' ? 'canvas' as const : 'task' as const,
        id: hit.id,
        title: hit.title,
        subtitle: `local ${hit.module}${hit.subtitle ? ` · ${hit.subtitle}` : ''}`,
        timestamp: hit.updatedAt ?? null,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  return { query, setQuery, results, loading, search }
}
