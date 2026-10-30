'use client'

import { type ReactNode } from 'react'

// Simplified router: no caching, no display:none.
// Previous KeepAliveRouter kept ALL routes mounted (6+ component trees with
// live subscriptions, effects, and re-renders) causing severe navigation lag.
// Now we just render the current route directly — instant switching.
export function KeepAliveRouter({ children }: { children: ReactNode }) {
  return <div className="h-full" style={{ display: 'contents' }}>{children}</div>
}
