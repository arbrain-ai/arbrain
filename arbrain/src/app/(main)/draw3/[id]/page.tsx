'use client'

import { use } from 'react'
import { DrawEditor3 } from '@/features/draw3/components/DrawEditor3'

export default function Draw3EditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <DrawEditor3 pageId={id} />
}
