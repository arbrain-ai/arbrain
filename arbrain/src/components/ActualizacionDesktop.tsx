'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isDesktopRuntime, isLocalhostRuntime } from '@/lib/local-first'
import { hayStreamLocal } from '@/lib/actividad-viva'
import { hijosVivos } from '@/features/chat/lib/turnos-activos'
import { composerDrafts } from '@/features/chat/lib/composer-drafts'
import { fijarScroll } from '@/features/chat/lib/desplazar'
import {
  CLAVE_ESTADO, esRutaDeVentana, evaluarDespliegue, hayQueAplicar, leerEstado, momentoSeguro, rutaPorRestaurar, scrollTopRestaurado,
  serializarEstado, textoDespliegue, textoFinDespliegue, type EstadoUI,
} from '@/lib/actualizacion'

/**
 * Actualizar sin cortar (4 oct 2026, «quítame a mí del medio»). Dos fuentes de «versión nueva»:
 *  - web: el Studio desplegó otro build (/api/version) → basta recargar el webview;
 *  - shell: `desktop:install` dejó un Arbrain.app firmado al lado (comando Tauri `actualizacion_estado`)
 *    → se relanza la app. Si el binario es el mismo, solo se instala al cerrar y aquí no se avisa.
 *  - web sin compilar: origin/main trae cambios de arbrain/ que el Studio aún no despliega (/api/actualizacion).
 *    Solo «Reiniciar» lo dispara: pide el deploy YA, muestra «Actualizando…» y al terminar recarga como siempre.
 *    El modo automático no lo pide (el vigilante del Studio ya lo despliega solo cada 5 min).
 * Contrato de «Reiniciar» (5 oct, tras tres pulsaciones que no hicieron nada porque el build del Studio no compilaba):
 * siempre hay un efecto visible. Aplica lo que haya (relanza o recarga), o muestra el progreso real del deploy y
 * recarga sola al terminar, o dice por qué no pudo. Un árbol pendiente que no compiló no cuenta como «versión nueva».
 * Se aplica sola en un momento seguro (momentoSeguro: sin stream ni turno ni hijos vivos y 2 min sin tocar
 * la ventana) o al pulsar «Reiniciar». Antes de aplicar se guardan las escrituras del borrador y el estado
 * de pantalla; al arrancar se restauran (misma conversación, mismo scroll, misma ruta).
 */

interface EstadoWeb {
  disponible: boolean; pendiente: boolean; desplegando: boolean; fase: string | null; fallo: boolean; faseTs?: number | null
}

async function estadoWeb(): Promise<EstadoWeb | null> {
  try {
    const r = await fetch('/api/actualizacion', { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    return r.ok ? ((await r.json()) as EstadoWeb) : null
  } catch { return null }
}

async function buildServidor(): Promise<string | null> {
  try {
    const r = await fetch('/api/version', { cache: 'no-store', signal: AbortSignal.timeout(4_000) })
    return ((await r.json()) as { build?: string | null }).build ?? null
  } catch { return null /* el servidor reinicia en el cambio de slot */ }
}

interface EstadoShell { pendiente: boolean; cambiaBinario: boolean; aplicable: boolean }

async function consultarShell(): Promise<EstadoShell | null> {
  if (!isDesktopRuntime()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<EstadoShell>('actualizacion_estado')
  } catch { return null /* app anterior a este mecanismo: sin comando */ }
}

async function turnosEnServidor(): Promise<number | null> {
  try {
    const r = await fetch('/api/chat/active', { cache: 'no-store', signal: AbortSignal.timeout(4_000) })
    const j = (await r.json()) as { available?: boolean; turns?: unknown[] }
    return j.available && Array.isArray(j.turns) ? j.turns.length : null
  } catch { return null }
}

function hijosLocales(): number | null {
  const m = hijosVivos()
  if (!m) return null
  let n = 0
  for (const v of m.values()) n += v
  return n
}

function capturarEstado(): EstadoUI {
  const hilo = document.querySelector<HTMLElement>('[data-arbrain-scroll="chat"]')
  const desdeAbajo = hilo ? Math.max(0, hilo.scrollHeight - hilo.clientHeight - hilo.scrollTop) : 0
  return {
    ruta: window.location.pathname + window.location.search + window.location.hash,
    ts: Date.now(),
    ...(hilo ? { chat: { alFinal: desdeAbajo < 48, desdeAbajo } } : {}),
  }
}

/** Reproduce el scroll del hilo cuando sus mensajes terminan de cargar; se rinde si Daniel lo mueve. */
function restaurarScroll(chat: NonNullable<EstadoUI['chat']>) {
  let movido = false
  const alMover = () => { movido = true }
  window.addEventListener('wheel', alMover, { once: true, passive: true })
  window.addEventListener('touchstart', alMover, { once: true, passive: true })
  window.addEventListener('keydown', alMover, { once: true })
  const inicio = Date.now()
  let estableDesde = 0
  const paso = () => {
    if (movido || Date.now() - inicio > 10_000) return
    const hilo = document.querySelector<HTMLElement>('[data-arbrain-scroll="chat"]')
    if (hilo && hilo.scrollHeight > hilo.clientHeight) {
      // 12 oct 2026: por fijarScroll, nunca `scrollTop =`. Con el zoom de la app (1.7 en la Mac de Daniel) un scroll
      // instantáneo por código deja el compositor de WKWebView en otra posición y el hilo se ve vacío hasta mover la
      // rueda (causa raíz en lib/desplazar.ts). Este era el último camino del hilo sin migrar, y corre justo después de
      // cada despliegue: la app recarga y restaura la conversación (Daniel 12 oct ~20:00: «ya no me apareció el chat»).
      fijarScroll(hilo, scrollTopRestaurado(chat, hilo.scrollHeight, hilo.clientHeight))
      estableDesde ||= Date.now()
      if (Date.now() - estableDesde > 1_500) return // ya cargó y se mantuvo: listo
    }
    setTimeout(paso, 150)
  }
  paso()
}

const idVentana = Math.random().toString(36).slice(2)

export function ActualizacionDesktop() {
  const router = useRouter()
  const canal = useRef<BroadcastChannel | null>(null)
  const [lista, setLista] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)
  const web = useRef(false)
  const sinDesplegar = useRef(false)
  const shell = useRef<EstadoShell | null>(null)
  const ultimoToque = useRef(Date.now())
  const ocupado = useRef(false)

  // Restaurar lo guardado por el último «aplicar» (solo si es reciente y válido).
  useEffect(() => {
    // Una ventana sacada del panel no restaura nada de la principal ni le gasta su estado guardado.
    if (esRutaDeVentana(window.location.pathname)) return
    let raw: string | null = null
    // sessionStorage es de ESTA ventana (recarga web); localStorage solo sirve al relanzar la app entera.
    try { raw = sessionStorage.getItem(CLAVE_ESTADO); sessionStorage.removeItem(CLAVE_ESTADO) } catch { /* sin almacenamiento */ }
    if (!raw) try { raw = localStorage.getItem(CLAVE_ESTADO); localStorage.removeItem(CLAVE_ESTADO) } catch { /* sin almacenamiento */ }
    const estado = leerEstado(raw)
    if (!estado) return
    const actual = window.location.pathname + window.location.search + window.location.hash
    const destino = rutaPorRestaurar(estado, actual)
    if (destino) router.replace(destino)
    if (estado.chat) restaurarScroll(estado.chat)
  }, [router])

  /** Pide el deploy y espera a que termine mostrando su fase real. true = recargar ya; false = no se pudo (ya lo dijo). */
  const desplegarYEsperar = useCallback(async (): Promise<boolean> => {
    const desde = Date.now()
    setProgreso(textoDespliegue(null))
    try {
      await fetch('/api/actualizacion', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    } catch { /* si la orden no llegó, la espera de abajo lo detecta (sinArranque) */ }
    let fase: string | null = null
    for (;;) {
      await new Promise((r) => setTimeout(r, 2_000))
      const [build, estado] = await Promise.all([buildServidor(), estadoWeb()])
      if (estado) fase = estado.fase
      setProgreso(textoDespliegue(fase, Date.now() - desde))
      const v = evaluarDespliegue({ buildMio: process.env.NEXT_PUBLIC_ARBRAIN_BUILD, buildServidor: build, estado, desde, ahora: Date.now() })
      if (v === 'esperar') continue
      if (v === 'listo') return true
      // Nunca volver en silencio: el motivo queda a la vista unos segundos y la píldora se recalcula (un árbol que no
      // compiló deja de ofrecerse hasta que entre otro commit).
      sinDesplegar.current = false
      setProgreso(textoFinDespliegue(v))
      await new Promise((r) => setTimeout(r, 7_000))
      setProgreso(null)
      return false
    }
  }, [])

  const aplicar = useCallback(async (manual: boolean) => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      if (!manual) {
        // Lectura fresca justo antes de actuar: el estado «seguro» de hace 5 s puede ya no serlo.
        const textoAjeno = Array.from(document.querySelectorAll('textarea'))
          .some((t) => t.value.trim().length > 0 && t.getAttribute('aria-label') !== 'Mensaje') // el borrador del chat sí sobrevive
        const veredicto = momentoSeguro({
          streamLocal: hayStreamLocal(),
          turnosServidor: await turnosEnServidor(),
          hijosVivos: hijosLocales(),
          ocioMs: Date.now() - ultimoToque.current,
        })
        if (textoAjeno || !veredicto.seguro) return
      }
      setAplicando(true)
      if (manual && !web.current && sinDesplegar.current && !(await desplegarYEsperar())) {
        setAplicando(false)
        setLista(!!(shell.current?.pendiente && shell.current.cambiaBinario))
        return
      }
      setProgreso(null)
      await composerDrafts.idleAll()
      const relanza = !!(shell.current?.pendiente && shell.current.cambiaBinario)
      if (!esRutaDeVentana(window.location.pathname)) {
        try { (relanza ? localStorage : sessionStorage).setItem(CLAVE_ESTADO, serializarEstado(capturarEstado())) } catch { /* se pierde solo el scroll */ }
      } else if (relanza) {
        // El estado a conservar es el de la principal (el localStorage es de todas): se lo pide y le da un momento.
        canal.current?.postMessage({ tipo: 'guardar-estado', origen: idVentana })
        await new Promise((r) => setTimeout(r, 800))
      }
      // Las demás ventanas (lienzo sacado del panel) recargan con su propia ruta; si se relanza la app se cierran todas.
      if (!relanza) canal.current?.postMessage({ tipo: 'aplicar', build: process.env.NEXT_PUBLIC_ARBRAIN_BUILD ?? null, origen: idVentana })
      if (relanza) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          ;(window as { __arbrainCerrando?: boolean }).__arbrainCerrando = true
          await invoke('actualizacion_aplicar') // la app se cierra y el relevo la reabre
          return
        } catch { (window as { __arbrainCerrando?: boolean }).__arbrainCerrando = false /* el comando falló: si hay web nueva se recarga, si no se reintenta luego */ }
      }
      // A mano siempre se recarga: tras un deploy el build nuevo ya está servido, y si no había nada la recarga es el
      // efecto visible que confirma el estado real (la píldora se recalcula al arrancar).
      if (web.current || manual) window.location.reload()
      else setAplicando(false)
    } finally {
      ocupado.current = false
    }
  }, [desplegarYEsperar])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !(isDesktopRuntime() || isLocalhostRuntime())) return
    const mio = process.env.NEXT_PUBLIC_ARBRAIN_BUILD
    let vivo = true
    let ultimaConsulta = 0

    // Una sola versión para todas las ventanas: quien aplica avisa, y quien arranca con build nuevo avisa a las viejas.
    // Solo se obedece un build que el servidor sirve hoy y que no es el mío (sin ping-pong ante un rollback).
    const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('arbrain:actualizacion')
    canal.current = bc
    const recargarPorAviso = async (m: { tipo?: string; build?: string | null; origen?: string }) => {
      if (m.tipo === 'guardar-estado') {
        if (m.origen === idVentana || esRutaDeVentana(window.location.pathname)) return
        await composerDrafts.idleAll()
        try { localStorage.setItem(CLAVE_ESTADO, serializarEstado(capturarEstado())) } catch { /* se pierde solo el scroll */ }
        return
      }
      if (!mio || m.origen === idVentana || ocupado.current) return
      const servido = await buildServidor()
      if (!servido || servido === mio) { if (servido === mio) { web.current = false; if (vivo) setLista(false) } return }
      if (m.tipo === 'version' && m.build !== servido) return
      ocupado.current = true
      await composerDrafts.idleAll()
      try { sessionStorage.setItem(CLAVE_ESTADO, serializarEstado(capturarEstado())) } catch { /* se pierde solo el scroll */ }
      window.location.reload()
    }
    if (bc) {
      bc.onmessage = (e) => void recargarPorAviso(e.data ?? {})
      bc.postMessage({ tipo: 'version', build: mio ?? null, origen: idVentana })
    }

    const consultar = async () => {
      if (Date.now() - ultimaConsulta < 15_000) return
      ultimaConsulta = Date.now()
      if (mio) {
        try {
          const r = await fetch('/api/version', { cache: 'no-store' })
          const { build } = (await r.json()) as { build?: string | null }
          web.current = !!build && build !== mio
        } catch { /* deploy en curso o servidor reiniciando: la próxima vuelta */ }
      }
      const e = mio ? await estadoWeb() : null
      shell.current = await consultarShell()
      if (ocupado.current) return // «Reiniciar» en curso: su propio flujo decide qué mostrar
      const q = hayQueAplicar({ webNueva: web.current, estado: e, shell: shell.current })
      sinDesplegar.current = q.sinDesplegar
      if (vivo) setLista(q.alguna)
    }
    const toque = () => { ultimoToque.current = Date.now() }
    const alVolver = () => { if (document.visibilityState === 'visible') void consultar() }
    const evento = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    evento.forEach((e) => window.addEventListener(e, toque, { capture: true, passive: true }))
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    void consultar()
    const sondeo = setInterval(() => void consultar(), 20_000)
    const decision = setInterval(() => {
      if (web.current || (shell.current?.pendiente && shell.current.cambiaBinario)) void aplicar(false)
    }, 10_000)
    return () => {
      vivo = false
      bc?.close(); canal.current = null
      clearInterval(sondeo); clearInterval(decision)
      evento.forEach((e) => window.removeEventListener(e, toque, { capture: true }))
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [aplicar])

  if (!lista) return null
  return (
    <div className="fixed bottom-3 left-3 z-[60]">
      <button
        type="button"
        disabled={aplicando}
        onClick={() => void aplicar(true)}
        title="Hay una versión nueva. Se aplica sola cuando no estés usando la ventana; tu conversación, borrador y paneles vuelven tal cual."
        className="flex items-center gap-2 rounded-full border border-border-subtle bg-card/90 px-3 py-1.5 text-[11px] text-muted shadow-lg backdrop-blur transition-colors hover:bg-card-hover disabled:opacity-60"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-brand" />
        {aplicando ? (progreso ?? 'Reiniciando…') : <>Versión nueva lista <span className="text-muted/50">·</span> <span className="text-brand-ink">Reiniciar</span></>}
      </button>
    </div>
  )
}
