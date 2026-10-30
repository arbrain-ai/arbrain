'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Conversation } from '@/types/database'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function setupConversations() {
      // Ensure session is loaded before subscribing to realtime
      // (without this, the channel subscribes with anon key → RLS blocks change broadcast)
      await supabase.auth.getSession()

      const { data, error } = await supabase
        .from('conversations')
        .select('*, agents(*)')
        .order('created_at', { ascending: false })
        .limit(50)

      if (!error) setConversations((data as Conversation[]) ?? [])
      setLoading(false)

      // Set up realtime now that session is ready
      channel = supabase
        .channel('conversations-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'conversations' },
          (payload) => {
            setConversations((prev) => [payload.new as Conversation, ...prev])
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations' },
          (payload) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.new.id ? { ...c, ...(payload.new as Conversation) } : c,
              ),
            )
          },
        )
        .subscribe()
    }

    setupConversations()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return { conversations, loading }
}
