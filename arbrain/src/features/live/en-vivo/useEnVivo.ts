'use client'
// Levy en vivo (18 nov 2026): manos libres en Live. Escucha, transcribe en el Studio y decide con palabras.ts si lo que
// dijiste se manda (tu palabra o tu Enter) o espera en el cuadro de texto. Si hablas encima de Levy, Levy se calla.
import { useCallback, useEffect, useRef, useState } from 'react'
import { OidoEnVivo, type Frase } from './oido.ts'
import { decidir } from './palabras.ts'
import { modoEnvio, fijarModoEnvio, type ModoEnvio } from './bandera.ts'
import { isStopUtterance } from '../voice/endpoint.ts'

export type EstadoEnVivo = 'apagado' | 'escuchando' | 'oyendo' | 'anotando' | 'error'
/** Marcas de latencia de la frase (performance.now): las recibe LatencyTrace al mandar. */
export type MarcasVoz = { voiceEnd: number; endpoint: number; sttDone: number }

export function useEnVivo(o: {
  levyHabla: () => boolean
  borrador: () => string
  onEsperar: (texto: string) => void
  onEnviar: (texto: string, marcas: MarcasVoz) => void
  onCallar: () => void
}) {
  const props = useRef(o); props.current = o
  const oido = useRef<OidoEnVivo | null>(null)
  const [estado, setEstado] = useState<EstadoEnVivo>('apagado')
  const [aviso, setAviso] = useState('')
  const [nivel, setNivel] = useState(0)
  const [modo, setModo] = useState<ModoEnvio>('palabra')
  const modoRef = useRef(modo); modoRef.current = modo
  const cola = useRef(Promise.resolve())
  useEffect(() => { setModo(modoEnvio()) }, [])

  const apagar = useCallback((motivo = '') => {
    oido.current?.cerrar(); oido.current = null
    setEstado('apagado'); setNivel(0); setAviso(motivo)
  }, [])

  /** Frase ya mandada por su adelanto: su `fin` se ignora. Adelanto en vuelo: el `fin` de la misma frase lo espera. */
  const mandada = useRef(0)
  const adelantos = useRef(new Map<number, Promise<void>>())
  const oir = async (wav: Blob) => {
    const r = await fetch('/api/live/oido', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
    const cuerpo = await r.json().catch(() => ({})) as { text?: string; error?: string }
    return { ok: r.ok && typeof cuerpo.text === 'string', texto: cuerpo.text ?? '', error: cuerpo.error, sttDone: performance.now() }
  }

  const anotar = useCallback((f: Frase) => {
    // Mirar adelante: en la pausa de 300 ms, si lo dicho ya termina con tu palabra y no seguiste hablando, se manda.
    if (f.adelanto) {
      if (modoRef.current !== 'palabra') return
      const vuelo = (async () => {
        try {
          const r = await oir(f.wav)
          if (!r.ok || oido.current?.turno.ultimaVozAhora !== f.finDeVoz || mandada.current === f.id) return
          const d = decidir(r.texto, 'palabra', props.current.borrador())
          if (d.accion !== 'enviar') return
          mandada.current = f.id; setAviso('')
          props.current.onEnviar(d.texto, { voiceEnd: f.finDeVoz, endpoint: f.detectado, sttDone: r.sttDone })
        } catch { /* el fin de la frase lo reintenta */ }
      })()
      adelantos.current.set(f.id, vuelo)
      return
    }
    // En orden: una frase no se adelanta a la anterior aunque su transcripción vuelva antes.
    cola.current = cola.current.then(async () => {
      await adelantos.current.get(f.id); adelantos.current.delete(f.id)
      if (mandada.current === f.id) { if (oido.current) setEstado('escuchando'); return }
      setEstado('anotando')
      try {
        const r = await oir(f.wav)
        const sttDone = r.sttDone
        if (!r.ok) { setAviso(r.error || 'No te entendí. Repite o escribe.'); return }
        const texto = r.texto
        if (props.current.levyHabla() && isStopUtterance(texto)) { props.current.onCallar(); return }
        const d = decidir(texto, modoRef.current, props.current.borrador())
        if (d.accion === 'ignorar') return
        if (d.accion === 'pausar') { apagar('En pausa. Toca la onda para seguir.'); return }
        if (d.accion === 'esperar') { props.current.onEsperar(d.texto); setAviso('Di «cambio» o pulsa Enter para enviar'); return }
        setAviso('')
        props.current.onEnviar(d.texto, { voiceEnd: f.finDeVoz, endpoint: f.detectado, sttDone })
      } catch { setAviso('El oído local no respondió. Puedes escribir.') }
      finally { if (oido.current) setEstado('escuchando') }
    })
  }, [apagar])

  const encender = useCallback(async () => {
    if (oido.current) return
    setAviso('')
    const nuevo = new OidoEnVivo({
      onFrase: anotar,
      onError: m => setAviso(m),
      onEvento: (e) => {
        if (e === 'inicio') setEstado(s => s === 'anotando' ? s : 'oyendo')
        if (e === 'descartar') setEstado(s => s === 'oyendo' ? 'escuchando' : s)
        if (e === 'interrumpe') props.current.onCallar()
        if (e === 'dormir') apagar('En pausa: 2 minutos sin oírte. Toca la onda para seguir.')
      },
    })
    nuevo.levyHabla = () => props.current.levyHabla()
    oido.current = nuevo
    try { await nuevo.abrir(); nuevo.tilin(); setEstado('escuchando') }
    catch { oido.current = null; setEstado('error') }
  }, [anotar, apagar])

  const alternar = useCallback(() => { if (oido.current) apagar(); else void encender() }, [apagar, encender])
  const cambiarModo = useCallback(() => { const m: ModoEnvio = modoRef.current === 'palabra' ? 'auto' : 'palabra'; fijarModoEnvio(m); setModo(m) }, [])

  // Nivel para el anillo del botón; Levy hablando cuenta como actividad (no se duerme a media respuesta).
  useEffect(() => {
    if (estado === 'apagado' || estado === 'error') return
    const t = setInterval(() => {
      const a = oido.current; if (!a) return
      setNivel(a.nivel)
      if (props.current.levyHabla()) a.turno.actividad(performance.now())
    }, 80)
    return () => clearInterval(t)
  }, [estado])
  useEffect(() => () => { oido.current?.cerrar(); oido.current = null }, [])

  return { estado, activo: estado !== 'apagado' && estado !== 'error', aviso, nivel, modo, encender, apagar, alternar, cambiarModo }
}
