import { permanentRedirect } from 'next/navigation'
// Fusionada en /youtube (2 jul 2026)
export default function CommentsRedirect() {
  permanentRedirect('/youtube?tab=comments')
}
