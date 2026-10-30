'use client'

// Chat + Live en una sola superficie (2 jul 2026). Live (Command Center de voz) era
// una ruta propia que Daniel casi no abria; ahora es pestaña. Carga lazy: el HUD de voz
// solo se monta si se abre la pestaña.

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { BotonPanel } from '@/features/cabina/panel/BotonPanel'
import type { LiveChatController } from '@/features/live/controller'
import { ChatPanel } from '@/features/chat/components/ChatPanel'
import { ConsejoPanel } from '@/features/chat/components/ConsejoPanel'
import { useAccountStore } from '@/features/chat/stores/account-store'
import { precargarAvatar } from '@/features/chat/components/Levy3D'
import { AGENTES } from '@/features/live/agents'
import { agenteActivo } from '@/features/live/agent-state'
import { redGratis } from '@/features/live/precarga'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import { esEdicionCliente } from '@/lib/edicion'

/** Edición cliente: ni Live ni Consejo (voz, avatares de otros agentes y motores de Daniel no viajan). */
const CLIENTE = esEdicionCliente()

const LiveWorkspace = dynamic(
  () => import('@/features/live/components/LiveWorkspace').then(m => m.LiveWorkspace),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-primary" /></div> }
)

// El tab inicial se lee de la URL SIN useSearchParams (24 ago 2026). Ese hook
// obliga a un <Suspense> y su fallback pintaba un spinner ANTES del chat en cada
// apertura en frio del PWA — uno de los repintados que Daniel reportaba. Aqui el
// query solo aporta el valor INICIAL (nunca se re-lee), asi que no hace falta
// reactividad: una lectura directa en el initializer basta y el chat pinta de una.
function initialTab(): 'chat' | 'live' {
  if (typeof window === 'undefined' || CLIENTE) return 'chat'
  try {
    return new URLSearchParams(window.location.search).get('tab') === 'live' ? 'live' : 'chat'
  } catch {
    return 'chat'
  }
}

function ChatTabs() {
  const [tab, setTab] = useState<'chat' | 'live'>(initialTab)
  const chooseTab = (next: 'chat' | 'live') => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'live') url.searchParams.set('tab', 'live'); else url.searchParams.delete('tab')
    window.history.replaceState(null, '', url)
  }
  // Live se prepara por INTENCIÓN (5 oct 2026). El 4 oct, al abrir el chat se bajaban en segundo plano el
  // código de Live y los tres avatares 3D: ~93 MB de glb en cada carga en frío. Por Funnel desde una
  // cafetería (10 Mbps) eso son más de 70 s de red ocupada sin haber abierto Live. Ahora:
  //  · en la misma máquina (la app de escritorio contra 127.0.0.1) la red no cuesta: solo se calienta el código de Live;
  //  · el avatar (descargar y parsear ~30 MB y retenerlo, más ~64 MB de los otros dos) espera a la intención: el
  //    puntero se acerca o se toca la cara de Levy (`openclaw:prepare-live`) o se abre Live. Nunca con «ahorro de datos».
  //    Eficiencia (6 oct 2026): en la máquina local la red es gratis pero la CPU y la memoria no; en una laptop modesta
  //    eso era ~45 MB más de heap (55 vs 10 MB medidos) y segundos de tareas largas en cada arranque del chat.
  useEffect(() => {
    if (tab === 'live' || CLIENTE) return
    const preparar = () => {
      void import('@/features/live/components/LiveWorkspace')
      // Teléfono (11 oct 2026, datos móviles): rozar «Levy» al hacer scroll bajaba 29-35 MB sin abrir Live. Ahí el
      // avatar espera a que Live se abra de verdad (y desde entonces queda en la caché del service worker).
      if (!esTelefonoAhora()) precargarAvatar(AGENTES[agenteActivo()].modelo)
    }
    window.addEventListener('openclaw:prepare-live', preparar)
    let t: number | undefined
    if (redGratis(window.location, (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)) {
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      const go = () => { void import('@/features/live/components/LiveWorkspace') }
      if (idle) idle(go, { timeout: 4000 }); else t = window.setTimeout(go, 1200)
    }
    return () => { window.removeEventListener('openclaw:prepare-live', preparar); if (t) clearTimeout(t) }
  }, [tab])
  const [consejo, setConsejo] = useState(false)
  const [controller, setController] = useState<LiveChatController | null>(null)
  useEffect(() => { setConsejo(!CLIENTE && new URLSearchParams(window.location.search).get('mode') === 'consejo') }, [])
  const openConsejo = () => { setConsejo(true); window.history.replaceState(null, '', '/chat?mode=consejo') }

  // Entrada programática a Live (evento openclaw:go-live); ya no hay botón que lo despache.
  useEffect(() => {
    const goLive = () => { if (!CLIENTE) chooseTab('live') }
    window.addEventListener('openclaw:go-live', goLive)
    return () => window.removeEventListener('openclaw:go-live', goLive)
  }, [])

  // Live sigue vivo en /chat?tab=live, sin botón: Daniel no lo usa (1 oct). La cabecera
  // del chat lleva solo el panel y la conversación nueva.
  const acciones = <BotonPanel />


  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        {consejo ? <ConsejoPanel onAccount={account => { useAccountStore.getState().setAccount(account); setConsejo(false); window.history.replaceState(null, '', '/chat') }} /> : <>
          <div className={tab === 'chat' ? 'h-full' : 'hidden'} aria-hidden={tab !== 'chat'}>
            <ChatPanel headerAction={acciones} onConsejo={CLIENTE ? undefined : openConsejo} liveMode={tab === 'live'} onLiveController={setController} />
          </div>
          {tab === 'live' && <LiveWorkspace controller={controller} onClose={() => chooseTab('chat')} />}
        </>}
      </div>
    </div>
  )
}

export default function ChatPage() {
  return <ChatTabs />
}
