import { permanentRedirect } from 'next/navigation'
// Fusionada en /youtube (2 jul 2026)
export default function IntelRedirect() {
  permanentRedirect('/youtube?tab=intel')
}
