'use client'
import { useState, type CSSProperties } from 'react'
import { CATEGORIAS } from './categorias'
import { minutos } from './campos-fondo'
import { useZonas } from './useZonas'
import type { Zona } from './zonas'
import e from './engrane.module.css'

/**
 * «Zonas de mi vida» en el engrane del calendario (28 oct 2026, 08:09, Daniel: «en algún panel en la config activar y desactivar
 * ciertas zonas de mi vida; por ahora habilita todas, pero que el color de fondo dicte la zona»). Una fila por zona: su color (uno
 * de los cinco de las categorías), su nombre, su interruptor y sus horas. Cada cambio se guarda solo, por persona (useZonas).
 */
export function ZonasDeMiVida() {
  const { zonas, error, cambiar } = useZonas()
  const [aviso, setAviso] = useState<string | null>(null)
  if (!zonas.length) return null
  const hacer = (p: Promise<unknown>) => { setAviso(null); p.catch(err => setAviso(err instanceof Error ? err.message : 'No se guardó.')) }
  const tocadas = zonas.some(z => z.tocada)
  // La misma sección que las del engrane (Engrane.tsx › Seccion), sin importarla de vuelta.
  return <section className={e.seccion} aria-label="Zonas de mi vida"><h4>Zonas de mi vida</h4>
    <div className={e.zonas} data-zonas>
      {zonas.map(z => <FilaZona key={z.clave} zona={z} hacer={hacer} cambiar={cambiar} />)}
    </div>
    {(aviso ?? error) && <small className={e.zonasAviso} role="status">{aviso ?? error}</small>}
    {tocadas && <button className={e.zonasRestablecer} onClick={() => hacer(cambiar({ accion: 'restablecer' }))}>Volver a las de fábrica</button>}
  </section>
}

const DIAS_LABORALES = '1,2,3,4,5'
const diasTexto = (dias: readonly number[]) => !dias.length ? 'Diario' : dias.join(',') === DIAS_LABORALES ? 'Lun a vie' : dias.map(d => 'LMMJVSD'[d - 1]).join(' ')

function FilaZona({ zona: z, hacer, cambiar }: { zona: Zona; hacer: (p: Promise<unknown>) => void; cambiar: ReturnType<typeof useZonas>['cambiar'] }) {
  const [paleta, setPaleta] = useState(false)
  const def = CATEGORIAS.find(c => c.id === z.categoria) ?? CATEGORIAS[4]
  // 24 h, como el resto de la casa («6:00», «0600» y «06:00» valen). Una hora inválida o igual al otro extremo no se manda: el campo
  // vuelve a lo guardado.
  const mover = (i: number, lado: 0 | 1, crudo: string, el: HTMLInputElement) => {
    const f = z.franjas.map(x => [x[0], x[1]] as [string, string])
    const t = crudo.trim().replace(/^(\d{1,2})(\d{2})$/, '$1:$2'), m = minutos(t)
    const valor = m == null ? null : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    if (!valor || f[i][lado] === valor) { el.value = f[i][lado]; return }
    el.value = valor
    f[i][lado] = valor
    if (f[i][0] === f[i][1]) { el.value = z.franjas[i][lado]; return }
    hacer(cambiar({ accion: 'zona', clave: z.clave, franjas: f }))
  }
  return <div className={e.zona} data-apagada={!z.activa || undefined} data-zona={z.clave} style={{ '--c': def.color } as CSSProperties}>
    <div className={e.zonaCabeza}>
      <button className={e.zonaColor} aria-label={`Color de ${z.titulo}: ${def.nombre}`} aria-expanded={paleta} title={`Color: ${def.nombre}`} onClick={() => setPaleta(v => !v)}><i aria-hidden /></button>
      <span className={e.zonaNombre}><b>{z.titulo}</b><small>{diasTexto(z.dias)}</small></span>
      <button className={e.interruptor} data-solo role="switch" aria-checked={z.activa} aria-label={`${z.titulo}: ${z.activa ? 'encendida' : 'apagada'}`}
        onClick={() => hacer(cambiar({ accion: 'zona', clave: z.clave, activa: !z.activa }))}><i aria-hidden /></button>
    </div>
    {paleta && <div className={e.zonaPaleta} role="radiogroup" aria-label={`Color de ${z.titulo}`}>
      {CATEGORIAS.map(c => <button key={c.id} role="radio" aria-checked={c.id === z.categoria} title={c.nombre} style={{ '--c': c.color } as CSSProperties}
        onClick={() => { setPaleta(false); hacer(cambiar({ accion: 'zona', clave: z.clave, categoria: c.id })) }}><i aria-hidden />{c.corto}</button>)}
    </div>}
    <div className={e.zonaHoras}>
      {z.franjas.map((f, i) => <span key={`${i}-${f[0]}-${f[1]}`} className={e.zonaFranja}>
        <input inputMode="numeric" maxLength={5} placeholder="HH:MM" defaultValue={f[0]} aria-label={`${z.titulo}: inicio${z.franjas.length > 1 ? ` ${i + 1}` : ''}`} onBlur={ev => mover(i, 0, ev.target.value, ev.target)} onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }} />
        <span aria-hidden>–</span>
        <input inputMode="numeric" maxLength={5} placeholder="HH:MM" defaultValue={f[1]} aria-label={`${z.titulo}: fin${z.franjas.length > 1 ? ` ${i + 1}` : ''}`} onBlur={ev => mover(i, 1, ev.target.value, ev.target)} onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }} />
      </span>)}
    </div>
  </div>
}
