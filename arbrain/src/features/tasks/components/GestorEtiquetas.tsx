'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Palette, Plus, Tag, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Label } from '@/types/database'

const COLORES = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6',
]

/**
 * Etiquetas de las tareas (2 oct 2026). Vivían en Configuración; se mudaron al Board porque solo las usan sus
 * tarjetas, la lista, los filtros y el detalle de tarea. Mismo comportamiento que antes (tabla `labels`), en
 * español y con confirmación antes de borrar. Solo el dueño las administra.
 */
export function GestorEtiquetas({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [etiquetas, setEtiquetas] = useState<Label[]>([])
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(COLORES[0])
  const [editando, setEditando] = useState<string | null>(null)
  const [nombreEdicion, setNombreEdicion] = useState('')
  const [colorEdicion, setColorEdicion] = useState('')
  const [porBorrar, setPorBorrar] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await createClient().from('labels').select('*').order('name')
    if (e) setError('No se pudieron leer las etiquetas.')
    else setEtiquetas((data ?? []) as Label[])
  }, [])

  useEffect(() => {
    if (!abierto) return
    void cargar()
    panelRef.current?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation(); onCerrar()
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [abierto, cargar, onCerrar])

  if (!abierto) return null

  const crear = async () => {
    if (!nombre.trim()) return
    setGuardando(true); setError(null)
    const { data, error: e } = await createClient().from('labels').insert({ name: nombre.trim(), color }).select('*').single()
    if (e || !data) setError('No se pudo crear la etiqueta.')
    else setEtiquetas((prev) => [...prev, data as Label].sort((a, b) => a.name.localeCompare(b.name)))
    setNombre('')
    setColor(COLORES[Math.floor(Math.random() * COLORES.length)])
    setGuardando(false)
  }

  const actualizar = async (id: string) => {
    if (!nombreEdicion.trim()) return
    setGuardando(true); setError(null)
    const { error: e } = await createClient().from('labels').update({ name: nombreEdicion.trim(), color: colorEdicion }).eq('id', id)
    if (e) setError('No se pudo guardar el cambio.')
    else setEtiquetas((prev) => prev.map((l) => l.id === id ? { ...l, name: nombreEdicion.trim(), color: colorEdicion } : l))
    setEditando(null)
    setGuardando(false)
  }

  const borrar = async (id: string) => {
    setError(null)
    const { error: e } = await createClient().from('labels').delete().eq('id', id)
    if (e) setError('No se pudo borrar la etiqueta.')
    else setEtiquetas((prev) => prev.filter((l) => l.id !== id))
    setPorBorrar(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onCerrar} aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal
          aria-labelledby="etiquetas-titulo"
          tabIndex={-1}
          className="pointer-events-auto flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-lg outline-none"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
            <div className="flex items-center gap-2">
              <Tag size={15} className="text-muted" aria-hidden />
              <h2 id="etiquetas-titulo" className="text-sm font-semibold text-foreground">Etiquetas de las tareas</h2>
              <span className="rounded-full bg-card-hover px-1.5 py-0.5 text-[10px] text-muted/80">{etiquetas.length}</span>
            </div>
            <button type="button" onClick={onCerrar} className="icon-btn size-9" aria-label="Cerrar etiquetas"><X size={16} /></button>
          </div>

          <div className="space-y-3 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Color de la etiqueta nueva">
                {COLORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Color ${c}`}
                    onClick={() => setColor(c)}
                    className={`size-5 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-foreground/30 ring-offset-1 ring-offset-card' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void crear() }}
                placeholder="Nombre de la etiqueta nueva"
                aria-label="Nombre de la etiqueta nueva"
                className="input-field min-h-11 min-w-0 flex-1 px-3 text-sm md:min-h-9"
              />
              <button
                type="button"
                onClick={() => void crear()}
                disabled={!nombre.trim() || guardando}
                className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card-active px-3 text-xs font-medium text-foreground/80 disabled:opacity-30 md:min-h-9"
              >
                <Plus size={12} aria-hidden /> Agregar
              </button>
            </div>

            {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

            <ul className="space-y-1">
              {etiquetas.map((l) => (
                <li key={l.id} className="group flex min-h-11 items-center gap-3 rounded-lg border border-border-subtle bg-card/40 px-3 py-1.5">
                  {editando === l.id ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1">
                        {COLORES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Color ${c}`}
                            onClick={() => setColorEdicion(c)}
                            className={`size-4 rounded-full ${colorEdicion === c ? 'scale-110 ring-2 ring-foreground/30' : ''}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <input
                        type="text"
                        value={nombreEdicion}
                        onChange={(e) => setNombreEdicion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void actualizar(l.id)
                          if (e.key === 'Escape') { e.stopPropagation(); setEditando(null) }
                        }}
                        autoFocus
                        aria-label="Nombre de la etiqueta"
                        className="min-w-0 flex-1 rounded border border-border bg-card-hover px-2 py-0.5 text-sm text-foreground outline-none"
                      />
                      <button type="button" onClick={() => void actualizar(l.id)} className="icon-btn size-8 text-emerald-400" aria-label="Guardar"><Check size={14} /></button>
                      <button type="button" onClick={() => setEditando(null)} className="icon-btn size-8" aria-label="Cancelar"><X size={14} /></button>
                    </>
                  ) : porBorrar === l.id ? (
                    <>
                      <span className="flex-1 text-xs text-foreground/80">¿Borrar «{l.name}»? Se quita de todas las tareas.</span>
                      <button type="button" onClick={() => void borrar(l.id)} className="min-h-9 rounded-lg bg-red-500/80 px-3 text-xs font-medium text-white">Borrar</button>
                      <button type="button" onClick={() => setPorBorrar(null)} className="min-h-9 rounded-lg border border-border px-3 text-xs">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                      <span className="flex-1 text-sm text-foreground/80">{l.name}</span>
                      <button
                        type="button"
                        onClick={() => { setEditando(l.id); setNombreEdicion(l.name); setColorEdicion(l.color) }}
                        className="icon-btn size-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Editar ${l.name}`}
                      >
                        <Palette size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPorBorrar(l.id)}
                        className="icon-btn size-8 opacity-100 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Borrar ${l.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </li>
              ))}
              {etiquetas.length === 0 && <li className="py-4 text-center text-xs text-muted/60">Todavía no hay etiquetas.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
