'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { civilToday } from './calendar-days'
import { zonaDueno } from '@/shared/lib/zona-dueno'
import type { Habito, Reflexion } from './types'

export interface HabitDefinition extends Habito { activo: boolean; created_at: string }
export interface HabitRecord {
  fecha: string; habito_clave: string; hecho: boolean | null; revision: number
  updated_at: string | null; source: string; evidence: string | null; request_id: string | null
}
export interface HabitSnapshot {
  owner: string; date: string; from: string; to: string; today: string; timeZone: string
  catalog: HabitDefinition[]; habitos: HabitDefinition[]; checks: HabitRecord[]; records: HabitRecord[]; reflexion: Reflexion
}
interface HabitCommand {
  owner: string; date: string; clave: string; hecho: boolean | null; source: 'manual' | 'keyboard'
  requestId: string; expectedRevision?: number; timeZone: string
}
const storageKey = (owner: string) => `arbrain:habits:pending:${owner}`

export function useCivilClock(timeZone = zonaDueno()) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 15_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  return { now, today: civilToday(timeZone, now), timeZone }
}

export function useHabitRecords(range: { date: string; from: string; to: string; timeZone?: string }) {
  const [data, setData] = useState<HabitSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<HabitCommand[]>([])
  const [notice, setNotice] = useState('')
  const [undo, setUndo] = useState<{ date: string; clave: string; hecho: boolean | null } | null>(null)
  const actual = useRef<HabitSnapshot | null>(null)
  const queue = useRef<HabitCommand[]>([])
  const busy = useRef(false), failed = useRef(false), readSeq = useRef(0), epoch = useRef(0)
  const rangeRef = useRef(range); rangeRef.current = range
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readSeq.current++ } }, [])

  const persist = useCallback(() => {
    setPending([...queue.current])
    const owner = actual.current?.owner
    if (!owner) return
    try {
      if (queue.current.length) localStorage.setItem(storageKey(owner), JSON.stringify(queue.current))
      else localStorage.removeItem(storageKey(owner))
    } catch { setNotice('El navegador no pudo guardar el envío pendiente. Mantén esta vista abierta.') }
  }, [])

  const refresh = useCallback(async () => {
    if (busy.current) return
    const sequence = ++readSeq.current, version = epoch.current
    const requested = { ...rangeRef.current, timeZone: rangeRef.current.timeZone ?? zonaDueno() }
    try {
      const response = await fetch(`/api/sistema?${new URLSearchParams(requested)}`, { cache:'no-store', signal:AbortSignal.timeout(25_000) })
      const result = await response.json()
      if (!mounted.current || sequence !== readSeq.current || version !== epoch.current) return
      if (!response.ok) {
        if ([401,403].includes(response.status)) { actual.current = null; setData(null); queue.current = []; setPending([]); setUndo(null) }
        throw new Error(result.error ?? 'No se pudieron leer los hábitos.')
      }
      if (actual.current?.owner !== result.owner) {
        queue.current = []; setUndo(null)
        try {
          const recovered = JSON.parse(localStorage.getItem(storageKey(result.owner)) ?? '[]')
          if (Array.isArray(recovered) && recovered.every(c => c.owner === result.owner && typeof c.requestId === 'string' && typeof c.clave === 'string')) queue.current = recovered
        } catch { /* malformed storage never becomes a request */ }
        failed.current = queue.current.length > 0
        if (failed.current) setNotice('Hay una marca pendiente de confirmar. Reintenta para conocer su resultado.')
        setPending([...queue.current])
      }
      actual.current = result; setData(result); setLoading(false)
      if (!failed.current) setError(null)
    } catch (err) {
      if (sequence === readSeq.current && mounted.current) { setError(err instanceof Error ? err.message : 'Sin conexión.'); setLoading(false) }
    }
  }, [])
  useEffect(() => { setLoading(true); void refresh() }, [range.date, range.from, range.to, range.timeZone, refresh])
  useEffect(() => {
    const check = () => { if (!document.hidden) void refresh() }
    const timer = window.setInterval(check, 20_000)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('online', check) }
  }, [refresh])

  const run = useCallback(async () => {
    if (busy.current || !actual.current) return
    busy.current = true; failed.current = false; epoch.current++; setSaving(true); setError(null)
    try {
      while (queue.current.length) {
        const command = queue.current[0]
        if (command.owner !== actual.current?.owner) throw new Error('La identidad cambió. Abre de nuevo la vista.')
        if (command.expectedRevision === undefined) {
          const known = [...actual.current.records, ...actual.current.checks].find(r => r.fecha === command.date && r.habito_clave === command.clave)
          command.expectedRevision = known?.revision ?? 0
        }
        persist() // exact command saved BEFORE network, including revision
        const response = await fetch('/api/sistema', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(command), signal:AbortSignal.timeout(25_000) })
        const result = await response.json()
        if (!response.ok) {
          if ([400,404,409,413,422].includes(response.status)) {
            queue.current = []; setUndo(null); persist()
          }
          throw new Error(response.status === 409 ? 'El hábito cambió en otra pantalla. Revisa su estado antes de volver a marcar.' : result.error ?? 'No se pudo confirmar la marca.')
        }
        if (actual.current?.owner !== command.owner) return
        const row: HabitRecord = result.record
        const replace = (rows: HabitRecord[]) => [...rows.filter(r => r.fecha !== row.fecha || r.habito_clave !== row.habito_clave), row]
        actual.current = { ...actual.current, records:replace(actual.current.records),
          checks: row.fecha === actual.current.date ? replace(actual.current.checks) : actual.current.checks }
        if (mounted.current) setData(actual.current)
        queue.current.shift(); persist()
        setNotice(command.hecho === true ? 'Hábito marcado.' : command.hecho === false ? 'Registrado como no cumplido.' : 'Marca retirada: sin registro.')
      }
    } catch (err) {
      failed.current = true
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la marca. Reintenta el mismo envío.')
    } finally {
      busy.current = false; epoch.current++; setSaving(false); setPending([...queue.current]); void refresh()
    }
  }, [persist, refresh])

  const record = useCallback((date: string, clave: string): HabitRecord | null => {
    const known = [...(actual.current?.records ?? []), ...(actual.current?.checks ?? [])].find(r => r.fecha === date && r.habito_clave === clave) ?? null
    const last = !failed.current ? [...queue.current].reverse().find(c => c.date === date && c.clave === clave) : null
    return last ? { fecha:date, habito_clave:clave, hecho:last.hecho, revision:known?.revision ?? 0, updated_at:null, source:last.source, evidence:null, request_id:last.requestId } : known
  }, [])

  const mark = useCallback((date: string, clave: string, hecho: boolean | null, source: 'manual' | 'keyboard' = 'manual', remember = true) => {
    if (!actual.current || failed.current && queue.current.length) return
    if (remember) setUndo({ date, clave, hecho:record(date, clave)?.hecho ?? null })
    queue.current.push({ owner:actual.current.owner, date, clave, hecho, source, requestId:crypto.randomUUID(), timeZone:rangeRef.current.timeZone ?? zonaDueno() })
    persist(); void run()
  }, [persist, record, run])
  const toggle = useCallback((date: string, clave: string, source: 'manual' | 'keyboard' = 'manual') => mark(date, clave, record(date, clave)?.hecho === true ? null : true, source), [mark, record])
  const undoLast = useCallback(() => { if (undo) { mark(undo.date, undo.clave, undo.hecho, 'manual', false); setUndo(null) } }, [undo, mark])
  return { data, loading, error, saving, pending, notice, canUndo:!!undo, record, mark, toggle, undoLast, retry:run, refresh }
}
