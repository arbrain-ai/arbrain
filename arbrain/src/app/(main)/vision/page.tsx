import { permanentRedirect } from 'next/navigation'
// Visión es pestaña del Command Center (2 jul 2026)
export default function VisionRedirect() {
  permanentRedirect('/ml-dashboard?tab=vision')
}
