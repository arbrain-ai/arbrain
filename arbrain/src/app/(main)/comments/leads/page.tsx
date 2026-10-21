import { redirect } from 'next/navigation'
// Fusionada en /youtube (2 jul 2026)
export default function LeadsRedirect() {
  redirect('/youtube?tab=leads')
}
