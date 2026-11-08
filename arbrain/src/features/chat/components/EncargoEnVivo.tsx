'use client'
/**
 * Encargo de las manos en vivo, bajo la línea viva del turno (5 nov 2026). Daniel, viendo a las manos tardar minutos en
 * subir un banner a YouTube: «te tardas algo mas de lo que me gustaria incluso si pudieras poner un temporizador».
 *
 * Mientras la fila «Haciendo una tarea en pantalla» (manos › encargar) corre: reloj del encargo que avanza cada segundo,
 * el paso en que va y dos botones discretos, «Detener» y «Tomar el control» (la franja del encargo, espejada en el chat).
 * Sondea `/api/manos/encargos` cada 1.5 s solo mientras está montado (hay un encargo corriendo en este turno); al terminar
 * la llamada se desmonta y deja de sondear. Si la ruta falla o no hay archivo, no pinta nada: la fila se ve como siempre.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ChatMessage } from '../hooks/useChat'
import { agruparHerramientas, encargosCorriendo, type EncargoCorriendo } from '../lib/rastro'
import { emparejarLlamadas, estaVivo, relojEncargo, textoPaso, type EncargoVivo, type OrdenEncargo } from '@/features/manos/lib/encargos'
import h from './herramientas.module.css'

const RUTA = '/api/manos/encargos'
const CADA_MS = 1_500

/** Los encargos vivos según el disco, sondeados mientras el componente vive. `null` = sin dato (falla o aún no llega). */
function useEncargosVivos(cadaMs = CADA_MS): EncargoVivo[] | null {
  const [lista, setLista] = useState<EncargoVivo[] | null>(null)
  useEffect(() => {
    let vivo = true
    let t: ReturnType<typeof setTimeout> | undefined
    const leer = async () => {
      let seguir = true
      // Con la ventana oculta no se pregunta; se vuelve a intentar en el siguiente tic.
      if (document.visibilityState !== 'hidden') {
        try {
          const r = await fetch(RUTA, { cache: 'no-store' })
          const j = await r.json().catch(() => null) as { encargos?: unknown } | null
          if (!vivo) return
          if (r.ok && Array.isArray(j?.encargos)) setLista(j.encargos as EncargoVivo[])
          else {
            setLista(null)
            // 401, 403, 404: esta sesión o esta edición no lo ve; no se insiste. Un 5xx puede ser pasajero.
            seguir = r.status >= 500
          }
        } catch { if (vivo) setLista(null) }
      }
      if (vivo && seguir) t = setTimeout(leer, cadaMs)
    }
    void leer()
    return () => { vivo = false; if (t) clearTimeout(t) }
  }, [cadaMs])
  return lista
}

const EN_CAMINO: Record<OrdenEncargo, string> = { detener: 'Deteniendo', control: 'Dejándote la ventana' }

/** Una línea: reloj · paso · Detener · Tomar el control. El reloj late solo (no re-renderiza el turno). */
function LineaEncargo({ e }: { e: EncargoVivo }) {
  const corre = estaVivo(e)
  const [ahora, setAhora] = useState(() => Date.now())
  const [enviada, setEnviada] = useState<OrdenEncargo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!corre) return
    setAhora(Date.now())
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [corre])

  const mandar = async (orden: OrdenEncargo) => {
    setEnviada(orden); setError(null)
    try {
      const r = await fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id, orden }) })
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: unknown }
        setError(typeof j.error === 'string' ? j.error : 'No se pudo mandar la orden.')
        setEnviada(null)
      }
    } catch { setError('Sin conexión con Arbrain.'); setEnviada(null) }
  }

  const reloj = relojEncargo(e, ahora)
  const paso = error ?? (enviada && corre ? EN_CAMINO[enviada] : textoPaso(e))
  const botones = corre && !enviada ? e.valores : []
  if (!reloj && !paso && !botones.length) return null
  return (
    <div className={h.encargo} data-encargo={e.id} data-estado={e.estado}>
      {reloj && <span className={h.encargoReloj} title="Tiempo de este encargo">{reloj}</span>}
      {paso && <>
        {reloj && <span aria-hidden>·</span>}
        <span className={h.encargoPaso} {...(error ? { 'data-error': '' } : {})} role="status" aria-live="polite" title={paso}>{paso}</span>
      </>}
      {!!botones.length && <span className={h.encargoAcciones}>
        {botones.includes('detener') && <button type="button" className={h.encargoBoton} onClick={() => void mandar('detener')}>Detener</button>}
        {botones.includes('control') && <button type="button" className={h.encargoBoton} onClick={() => void mandar('control')}
          title="Detiene el encargo y te deja la ventana">Tomar el control</button>}
      </span>}
    </div>
  )
}

function Sondeo({ corriendo }: { corriendo: EncargoCorriendo[] }) {
  const lista = useEncargosVivos()
  const filas = useMemo(() => {
    if (!lista?.length) return []
    const encargos = emparejarLlamadas(lista, corriendo.map(c => c.pedido))
    return corriendo.flatMap((c, i) => encargos[i] ? [{ toolId: c.toolId, e: encargos[i]! }] : [])
  }, [lista, corriendo])
  if (!filas.length) return null
  return <div className={h.encargos} data-encargos-vivos>{filas.map(f => <LineaEncargo key={f.toolId} e={f.e} />)}</div>
}

/** Monta el sondeo solo si en este turno hay un `encargar` corriendo; al terminar, se desmonta y deja de preguntar. */
export function EncargosEnVivo({ msg }: { msg: ChatMessage }) {
  const corriendo = useMemo(() => encargosCorriendo(agruparHerramientas(msg)), [msg])
  if (!corriendo.length) return null
  return <Sondeo corriendo={corriendo} />
}
