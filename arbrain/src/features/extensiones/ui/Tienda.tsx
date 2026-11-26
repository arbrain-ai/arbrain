'use client'
/**
 * Extensiones · la tienda (21 nov 2026, fase 2 del SPEC docs/builds/extensiones-2026-11-20). Daniel (20 nov 19:07): «Voy
 * a confiar en tu criterio, así que sí, haz lo que consideres». Catálogo curado: ver, instalar, actualizar, quitar y abrir
 * el panel de lo instalado. La misma en la instalación de Daniel y en la del alumno (lo resuelve su daemon).
 *
 * Antes de instalar se ve qué pide (carpetas que lee y escribe, a dónde sale, si dibuja en el Lienzo, si trae tareas que
 * corren solas y sus llaves). Una extensión con tareas exige el «Sí» del dueño (casilla); sin ella el daemon no instala.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Download, FolderOpen, Globe, KeyRound, PanelsTopLeft, Puzzle, RefreshCw, Shapes, Trash2 } from 'lucide-react'
import { tr, trn } from '@/shared/i18n'
import { cadaEnPalabras, type EstadoTienda, type ExtensionVista } from './tipos'
import { PanelExtension } from './PanelExtension'
import s from './extensiones.module.css'

type Aviso = { id: string; tipo: 'ok' | 'error'; texto: string }
type Respuesta = { ok?: boolean; error?: string; nota?: string; necesitaConsentimiento?: boolean; faltanLlaves?: string[]; faltan?: { nombre: string; ayuda?: string }[]; tareas?: { altas?: string[] } }

const leerParam = () => { try { return new URLSearchParams(window.location.search).get('ext') } catch { return null } }

export function Tienda({ grande = false }: { grande?: boolean }) {
  const [estado, setEstado] = useState<EstadoTienda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/extensiones', { cache: 'no-store' })
      const j = await r.json() as EstadoTienda & { error?: string }
      if (!r.ok || !j.extensiones) { setError(j.error ?? tr('No se pudo leer la tienda.')); return }
      setEstado(j); setError(null)
    } catch { setError(tr('Tu Arbrain local no responde.')) }
  }, [])

  useEffect(() => { void cargar(); setAbierta(leerParam()) }, [cargar])

  const abrir = useCallback((id: string | null) => {
    setAbierta(id)
    // En la sección completa, `?ext=` deja volver al panel con atrás/adelante o recargando.
    if (grande) { const q = new URLSearchParams(window.location.search); if (id) q.set('ext', id); else q.delete('ext'); window.history.replaceState(window.history.state, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`) }
  }, [grande])

  const accion = useCallback(async (id: string, que: 'instalar' | 'actualizar' | 'quitar', cuerpo: Record<string, unknown> = {}) => {
    setOcupada(id); setAviso(null)
    try {
      const r = await fetch(`/api/extensiones/${encodeURIComponent(id)}/${que}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({})) as Respuesta
      if (!r.ok || j.ok === false) {
        const detalle = j.faltan?.map(f => `${f.nombre}${f.ayuda ? `: ${tr(f.ayuda)}` : ''}`).join(' · ')
        setAviso({ id, tipo: 'error', texto: [j.error ? tr(j.error) : tr('No se pudo.'), detalle].filter(Boolean).join(' ') })
        return false
      }
      const altas = j.tareas?.altas?.length ?? 0
      const hecho = que === 'instalar' ? tr('Instalada.') : que === 'actualizar' ? tr('Al día.') : tr('Quitada.')
      setAviso({ id, tipo: 'ok', texto: [hecho, altas ? trn(altas, 'Una tarea quedó programada.', '{n} tareas quedaron programadas.') : '', j.nota ? tr(j.nota) : ''].filter(Boolean).join(' ') })
      return true
    } catch { setAviso({ id, tipo: 'error', texto: tr('Tu Arbrain local no responde.') }); return false }
    finally { setOcupada(null); void cargar() }
  }, [cargar])

  const elegida = estado?.extensiones.find(e => e.id === abierta && e.instalada && e.manifiesto?.panel)
  if (elegida) return <PanelExtension id={elegida.id} nombre={elegida.nombre} onVolver={() => abrir(null)} />

  const instaladas = estado?.extensiones.filter(e => e.instalada) ?? []
  const disponibles = estado?.extensiones.filter(e => !e.instalada) ?? []
  return (
    <div className={s.tienda} data-prueba="tienda" data-grande={grande || undefined}>
      {error && <p className="pg-aviso" role="alert">{error}</p>}
      {estado?.catalogo.error && <p className="pg-aviso">{tr(estado.catalogo.error)}</p>}
      {!estado && !error && <p className={s.vacio}>{tr('Leyendo el catálogo…')}</p>}
      {estado && (
        <>
          <Grupo titulo={tr('Instaladas')} cuenta={instaladas.length} vacio={tr('Aún no instalas ninguna. Las del catálogo están abajo.')}>
            {instaladas.map(e => <Tarjeta key={e.id} e={e} ocupada={ocupada === e.id} aviso={aviso?.id === e.id ? aviso : null} onAccion={accion} onAbrir={() => abrir(e.id)} />)}
          </Grupo>
          <Grupo titulo={tr('Del catálogo')} cuenta={disponibles.length} vacio={tr('Ya tienes todo lo del catálogo.')}>
            {disponibles.map(e => <Tarjeta key={e.id} e={e} ocupada={ocupada === e.id} aviso={aviso?.id === e.id ? aviso : null} onAccion={accion} onAbrir={() => abrir(e.id)} />)}
          </Grupo>
          <p className={s.pie}>
            {tr('Cada extensión es un plugin de Claude Code: entra en tu siguiente conversación con Levy. Tus datos viven en tu cerebro, nunca en la extensión; quitarla no los borra.')}
            {estado.catalogo.version && <> {tr('Catálogo {version}.', { version: estado.catalogo.version })}</>}
          </p>
        </>
      )}
    </div>
  )
}

function Grupo({ titulo, cuenta, vacio, children }: { titulo: string; cuenta: number; vacio: string; children: React.ReactNode }) {
  return (
    <section className={s.grupo}>
      <h3 className="pg-etiqueta">{titulo} <span className={s.cuenta}>{cuenta}</span></h3>
      {cuenta ? <div className={s.rejilla}>{children}</div> : <p className={s.vacio}>{vacio}</p>}
    </section>
  )
}

function Tarjeta({ e, ocupada, aviso, onAccion, onAbrir }: {
  e: ExtensionVista; ocupada: boolean; aviso: Aviso | null
  onAccion: (id: string, que: 'instalar' | 'actualizar' | 'quitar', cuerpo?: Record<string, unknown>) => Promise<boolean>
  onAbrir: () => void
}) {
  const [paso, setPaso] = useState<'nada' | 'instalar' | 'quitar'>('nada')
  const m = e.manifiesto
  const faltan = e.requisitos.filter(r => r.ok === false)
  const tienePanel = !!m?.panel
  return (
    <article className={s.tarjeta} data-prueba="extension" data-id={e.id} data-instalada={e.instalada ? '' : undefined}>
      <header className={s.cabeza}>
        <span className={s.sello} aria-hidden>{tienePanel ? <PanelsTopLeft size={18} /> : <Puzzle size={18} />}</span>
        <div className={s.quien}>
          <h4>{e.nombre}</h4>
          <span className={s.meta}>
            {e.instalada ? tr('Instalada · v{version}', { version: e.instalada.version ?? '?' }) : e.version ? `v${e.version}` : ''}
            {e.categoria ? ` · ${e.categoria}` : ''}
          </span>
        </div>
        {e.actualizable && <span className={s.insignia} data-tono="nuevo">{tr('v{version} disponible', { version: e.version ?? '' })}</span>}
        {e.instalada && !e.actualizable && <span className={s.insignia}>{tr('Al día')}</span>}
      </header>
      <p className={s.resumen}>{e.descripcion}</p>
      {e.acerca && e.acerca !== e.descripcion && <p className={s.acerca}>{e.acerca}</p>}

      {m && <ul className={s.pide} aria-label={tr('Qué pide')}>
        {tienePanel && <li><PanelsTopLeft size={13} aria-hidden />{tr('Trae su panel')}</li>}
        {m.permisos.lee.length > 0 && <li title={m.permisos.lee.join(', ')}><FolderOpen size={13} aria-hidden />{trn(m.permisos.lee.length, 'Lee y escribe una carpeta de tu cerebro', 'Lee y escribe {n} carpetas de tu cerebro')}</li>}
        {m.permisos.red.length > 0 && <li title={m.permisos.red.join(', ')}><Globe size={13} aria-hidden />{m.permisos.red.includes('*') ? tr('Sale a internet') : tr('Sale a {hosts}', { hosts: m.permisos.red.slice(0, 2).join(', ') })}</li>}
        {m.permisos.lienzo && <li><Shapes size={13} aria-hidden />{tr('Dibuja en tu Lienzo')}</li>}
        {m.tareas.map(t => <li key={t.id}><Clock size={13} aria-hidden />{tr('Corre sola {cuando}', { cuando: cadaEnPalabras(t.cada) })}{e.tareas.find(x => x.id === t.id)?.alta ? ` · ${tr('programada')}` : ''}</li>)}
        {e.llaves.map(l => <li key={l.clave} data-falta={!l.guardada && !l.opcional ? '' : undefined}><KeyRound size={13} aria-hidden />{l.guardada ? tr('Tu llave {clave} está guardada', { clave: l.clave }) : tr('Pide tu llave {clave}', { clave: l.clave })}</li>)}
      </ul>}

      {!e.valida && <p className="pg-aviso">{tr('Esta extensión no trae un arbrain.json válido.')}</p>}
      {faltan.length > 0 && !e.instalada && <p className="pg-aviso">{tr('Antes de instalarla falta:')} {faltan.map(f => `${f.nombre}${f.ayuda ? ` (${f.ayuda})` : ''}`).join(' · ')}</p>}
      {aviso && <p className={s.aviso} data-tono={aviso.tipo} role="status">{aviso.texto}</p>}

      {paso === 'instalar' && m && <ConfirmarInstalar e={e} ocupada={ocupada} onCancelar={() => setPaso('nada')}
        onInstalar={async cuerpo => { if (await onAccion(e.id, 'instalar', cuerpo)) setPaso('nada') }} />}
      {paso === 'quitar' && (
        <div className={s.confirmar} data-prueba="confirmar-quitar">
          <p>{tr('Se quita del cerebro y se dan de baja sus tareas. Tus datos se quedan en tu cerebro.')}</p>
          <div className={s.botones}>
            <button type="button" className="pg-boton" onClick={() => setPaso('nada')}>{tr('Cancelar')}</button>
            <button type="button" className={`pg-boton ${s.peligro}`} disabled={ocupada} onClick={async () => { if (await onAccion(e.id, 'quitar')) setPaso('nada') }}>{ocupada ? tr('Quitando…') : tr('Sí, quitar')}</button>
          </div>
        </div>
      )}

      {paso === 'nada' && (
        <footer className={s.botones}>
          {e.instalada ? <>
            {tienePanel && <button type="button" className={`pg-boton ${s.primario}`} onClick={onAbrir}><PanelsTopLeft size={14} aria-hidden />{tr('Abrir panel')}</button>}
            {e.actualizable && <button type="button" className="pg-boton" disabled={ocupada} onClick={() => void onAccion(e.id, 'actualizar')}><RefreshCw size={14} aria-hidden />{ocupada ? tr('Actualizando…') : tr('Actualizar')}</button>}
            <button type="button" className="pg-boton" disabled={ocupada} onClick={() => setPaso('quitar')}><Trash2 size={14} aria-hidden />{tr('Quitar')}</button>
          </> : e.valida && e.enCatalogo && (
            <button type="button" className={`pg-boton ${s.primario}`} disabled={ocupada || faltan.length > 0} onClick={() => setPaso('instalar')}><Download size={14} aria-hidden />{tr('Instalar')}</button>
          )}
        </footer>
      )}
    </article>
  )
}

function ConfirmarInstalar({ e, ocupada, onCancelar, onInstalar }: { e: ExtensionVista; ocupada: boolean; onCancelar: () => void; onInstalar: (cuerpo: Record<string, unknown>) => void }) {
  const m = e.manifiesto!
  const [llaves, setLlaves] = useState<Record<string, string>>({})
  const [si, setSi] = useState(false)
  const faltaLlave = e.llaves.some(l => !l.opcional && !l.guardada && !llaves[l.clave]?.trim())
  const listo = !faltaLlave && (!m.permisos.programa || si)
  const carpetas = useMemo(() => [...new Set([...m.permisos.lee, ...m.permisos.escribe])], [m])
  return (
    <form className={s.confirmar} data-prueba="confirmar-instalar" onSubmit={ev => { ev.preventDefault(); if (listo) onInstalar({ consentimiento: si, llaves }) }}>
      <p className={s.confirmarTitulo}>{tr('Antes de instalar «{nombre}»', { nombre: e.nombre })}</p>
      <ul className={s.permisos}>
        {carpetas.length > 0 && <li><FolderOpen size={14} aria-hidden /><span>{tr('Usa en tu cerebro:')} {carpetas.map(c => <code key={c}>{c}</code>)}</span></li>}
        {m.permisos.red.length > 0 && <li><Globe size={14} aria-hidden /><span>{tr('Sale a:')} {m.permisos.red.map(h => <code key={h}>{h === '*' ? tr('las páginas públicas que tú le pidas') : h}</code>)}</span></li>}
        {m.permisos.lienzo && <li><Shapes size={14} aria-hidden /><span>{tr('Dibuja en tu Lienzo.')}</span></li>}
        {m.tareas.map(t => <li key={t.id}><Clock size={14} aria-hidden /><span>{tr('Corre sola {cuando} («{tarea}»), sin gastar tu modelo.', { cuando: cadaEnPalabras(t.cada), tarea: t.id })}</span></li>)}
        {m.requiere.programas.length > 0 && <li><Puzzle size={14} aria-hidden /><span>{tr('Usa en tu computadora:')} {m.requiere.programas.map(p => <code key={p}>{p}</code>)}</span></li>}
      </ul>
      {e.llaves.map(l => (
        <label key={l.clave} className={s.llave}>
          <span className={s.llaveNombre}><KeyRound size={13} aria-hidden />{l.clave}{l.opcional ? ` · ${tr('opcional')}` : ''}</span>
          <span className={s.llavePara}>{l.para}</span>
          {l.guardada ? <span className={s.llaveLista}>{tr('Ya está guardada en esta computadora (escribe otra solo si quieres cambiarla).')}</span> : null}
          <input type="password" autoComplete="off" spellCheck={false} placeholder={l.guardada ? tr('Guardada') : tr('Pega tu llave')} value={llaves[l.clave] ?? ''}
            onChange={ev => setLlaves(x => ({ ...x, [l.clave]: ev.target.value }))} />
          {l.como_conseguirla && <span className={s.llaveComo}>{tr('Cómo conseguirla:')} {l.como_conseguirla}</span>}
        </label>
      ))}
      {m.permisos.programa && (
        <label className={s.si}>
          <input type="checkbox" checked={si} onChange={ev => setSi(ev.target.checked)} />
          <span>{tr('Sí, que sus tareas corran solas en mi computadora.')}</span>
        </label>
      )}
      <div className={s.botones}>
        <button type="button" className="pg-boton" onClick={onCancelar}>{tr('Cancelar')}</button>
        <button type="submit" className={`pg-boton ${s.primario}`} disabled={!listo || ocupada}><Download size={14} aria-hidden />{ocupada ? tr('Instalando…') : tr('Instalar')}</button>
      </div>
      <p className={s.nota}>{tr('La llave se guarda solo en esta computadora, fuera de tu cerebro y de git: no hace falta pasarla por el chat.')}</p>
    </form>
  )
}
