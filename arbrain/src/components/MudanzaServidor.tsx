'use client'

import { useEffect } from 'react'
import { isDesktopRuntime } from '@/lib/local-first'
import { hayStreamLocal } from '@/lib/actividad-viva'
import { hijosVivos } from '@/features/chat/lib/turnos-activos'
import { composerDrafts, recibirBorradoresTraspasados } from '@/features/chat/lib/composer-drafts'
import {
  MARCA_IMAGEN, PREFIJO_BORRADOR, PREFIJO_FILA, TOPE_TRASPASO, docVacio, fundirFila, idsDeImagenes, leerTraspaso, listoParaMudar, partesClave,
  type BorradorTraspaso, type FilaTraspaso, type Traspaso,
} from '@/lib/mudanza-servidor'

/**
 * Mudanza de servidor (11 oct 2026, incidente del domingo: la app pasó el día en el embebido 127.0.0.1:3218 y, al
 * morir ese servidor, ~2 h de «conexión rechazada» con el Studio sano). El lado nativo (src-tauri/src/servidor.rs)
 * vigila y, cuando toca cambiar de servidor, avisa con `arbrain:mudar-servidor`. Aquí:
 *  - se contesta «recibido» al instante (si no, a los 20 s el lado nativo navega sin traspaso);
 *  - se espera un momento seguro (sin stream, turno ni hijos vivos, sin texto suelto y 20 s sin tocar), salvo que el
 *    servidor de esta página ya esté muerto: entonces solo se espera a que el borrador termine de guardarse;
 *  - la principal empaqueta borradores (IndexedDB) y fila (localStorage), porque otro puerto es otro origen;
 *  - el lado nativo guarda el paquete y navega la ventana al origen nuevo con la MISMA ruta.
 * Al arrancar en el origen nuevo se recoge el paquete (una vez) y se funde con lo que hubiera.
 */

async function invocar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
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

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Borradores con algo escrito (y sus imágenes, mientras quepan) + filas de mensajes de este origen. */
async function empaquetar(): Promise<{ texto: string; sinImagenes: number }> {
  const { entries, get } = await import('idb-keyval')
  const borradores: BorradorTraspaso[] = []
  let peso = 0, sinImagenes = 0
  for (const [k, doc] of await entries()) {
    if (typeof k !== 'string' || !k.startsWith(PREFIJO_BORRADOR) || !partesClave(k) || docVacio(doc) || !doc || typeof doc !== 'object') continue
    const d = doc as Record<string, unknown>
    // Formato anterior (File suelto en el documento): no se serializa; el texto viaja igual.
    const limpio = Object.fromEntries(Object.entries(d).map(([c, v]) => [c, Array.isArray(v) ? v.filter(x => !(typeof Blob !== 'undefined' && x instanceof Blob)) : v]))
    const b: BorradorTraspaso = { clave: k, doc: limpio, imagenes: [] }
    peso += JSON.stringify(limpio).length
    for (const id of idsDeImagenes(limpio)) {
      const r = (await get(k + MARCA_IMAGEN + id)) as { name?: string; type?: string; lastModified?: number; bytes?: ArrayBuffer } | undefined
      if (!r?.bytes) continue
      if (peso + r.bytes.byteLength * 1.4 > TOPE_TRASPASO) { sinImagenes++; continue }
      const b64 = base64(r.bytes)
      peso += b64.length
      b.imagenes.push({ id, name: r.name ?? 'imagen', type: r.type ?? '', lastModified: r.lastModified ?? Date.now(), b64 })
    }
    borradores.push(b)
  }
  const filas: FilaTraspaso[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIJO_FILA)) continue
      const items = JSON.parse(localStorage.getItem(k) ?? '[]')
      if (Array.isArray(items) && items.length) filas.push({ clave: k, items })
    }
  } catch { /* sin almacenamiento: solo viajan los borradores */ }
  const t: Traspaso = { v: 1, ts: Date.now(), borradores, filas }
  return { texto: JSON.stringify(t), sinImagenes }
}

/** En el origen nuevo: funde lo que trajo la mudanza. */
async function recoger() {
  let raw: string | null = null
  try { raw = await invocar<string | null>('servidor_traspaso_tomar') } catch { return /* app anterior a la mudanza */ }
  const t = leerTraspaso(raw)
  if (!t) return
  let filas = 0
  for (const f of t.filas) {
    try {
      const actual = JSON.parse(localStorage.getItem(f.clave) ?? '[]')
      const unida = fundirFila(Array.isArray(actual) ? actual : [], f.items)
      if (unida.length) { localStorage.setItem(f.clave, JSON.stringify(unida)); filas++ }
    } catch { /* la fila de esa conversación se queda en el origen anterior */ }
  }
  if (filas) window.dispatchEvent(new CustomEvent('arbrain:cola-importada'))
  recibirBorradoresTraspasados(t.borradores)
}

export function MudanzaServidor() {
  useEffect(() => {
    if (!isDesktopRuntime()) return
    void recoger()

    let ultimoToque = Date.now()
    let pedido: { destino: string; exportar: boolean; urgente: boolean } | null = null
    let enCurso = false
    let reloj: ReturnType<typeof setInterval> | null = null

    const intentar = async () => {
      if (!pedido || enCurso) return
      if (pedido.destino === window.location.origin) { pedido = null; return }
      enCurso = true
      try {
        const textoAjeno = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'))
          .some((el) => {
            if (el.getAttribute('aria-label') === 'Mensaje') return false // el borrador del chat sí viaja
            const v = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.textContent ?? ''
            return v.trim().length > 0 && document.activeElement === el
          })
        const listo = listoParaMudar({
          urgente: pedido.urgente,
          streamLocal: hayStreamLocal(),
          turnosServidor: pedido.urgente ? 0 : await turnosEnServidor(),
          hijosVivos: hijosLocales(),
          ocioMs: Date.now() - ultimoToque,
          textoAjeno,
        })
        if (!listo || !pedido) return
        await composerDrafts.idleAll()
        let traspaso: string | null = null
        if (pedido.exportar) {
          try {
            const p = await empaquetar()
            traspaso = p.texto
            if (p.sinImagenes) console.warn(`[mudanza] ${p.sinImagenes} imagen(es) de borradores no cupieron en el traspaso`)
          } catch (e) { console.warn('[mudanza] no se pudieron empaquetar los borradores', e) }
        }
        const ruta = window.location.pathname + window.location.search + window.location.hash
        await invocar('servidor_mudanza_lista', { ruta, traspaso })
        pedido = null
      } catch (e) {
        console.warn('[mudanza] falló; el lado nativo reintenta', e)
      } finally {
        enCurso = false
      }
    }

    const alAviso = (e: Event) => {
      const d = (e as CustomEvent).detail as { destino?: unknown; exportar?: unknown; urgente?: unknown } | null
      if (!d || typeof d.destino !== 'string') return
      pedido = { destino: d.destino, exportar: d.exportar === true, urgente: d.urgente === true }
      void invocar('servidor_mudanza_recibida').catch(() => {})
      reloj ??= setInterval(() => void intentar(), 2_000)
      void intentar()
    }
    const toque = () => { ultimoToque = Date.now() }
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    eventos.forEach((ev) => window.addEventListener(ev, toque, { capture: true, passive: true }))
    window.addEventListener('arbrain:mudar-servidor', alAviso)
    return () => {
      window.removeEventListener('arbrain:mudar-servidor', alAviso)
      eventos.forEach((ev) => window.removeEventListener(ev, toque, { capture: true }))
      if (reloj) clearInterval(reloj)
    }
  }, [])
  return null
}
