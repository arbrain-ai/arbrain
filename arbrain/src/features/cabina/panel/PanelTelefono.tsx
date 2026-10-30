'use client'
/**
 * `/telefono` (14 oct 2026, Daniel: «agarrar el teléfono y verlo… en un panel como lo conocemos nosotros»). El panel derecho
 * del escritorio, a pantalla completa en el iPhone: las MISMAS pestañas (el Studio las guarda y el latido del bus las
 * sincroniza, compartido.ts), con la fila de pestañas del teléfono arriba y la vista debajo.
 *
 * - `?abrir=<vista>` (el push de «ábrelo en mi teléfono» o un enlace): la abre como pestaña y la deja al frente. Abrir el mismo
 *   enlace otra vez reusa su pestaña.
 * - `?pestana=<id>`: trae al frente una pestaña que ya existe.
 * - Sin pestaña a la vista (se cerró la última o se volvió atrás), esta página: la lista de lo abierto para tocar.
 * En el escritorio la misma ruta abre la columna del panel con esa pestaña.
 */
import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Hammer, ListChecks, Smartphone } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import { usePanelFijadas } from './fijadas'
import { clavesTelefono, verPestanaEnTelefono } from './telefono-pestanas'
import { idDeEnlace, leerVista } from './artefacto-enlace'
import { nombreDeClave } from './nombre-pestana'
import { IconoVista, OpcionesPanel } from './Secciones'
import { TALLER } from './pestanas-fuera'
import s from './panel-telefono.module.css'

export function PanelTelefono() {
  const params = useSearchParams()
  const router = useRouter()
  const hecho = useRef<string | null>(null)
  const { fijadas, orden, taller, cargar } = usePanelFijadas()
  useEffect(() => { cargar() }, [cargar])

  // Lo que pide el enlace se aplica UNA vez y la URL queda limpia (recargar no lo vuelve a abrir encima de lo que Daniel movió).
  const abrir = params.get('abrir'), pestana = params.get('pestana')
  useEffect(() => {
    const clave = `${abrir ?? ''}|${pestana ?? ''}`
    if (hecho.current === clave || (!abrir && !pestana)) return
    hecho.current = clave
    const st = usePanelFijadas.getState()
    st.cargar()
    const input = leerVista(abrir)
    if (input && abrir) st.fijar(idDeEnlace(abrir), input, true, { deLevy: true })
    else if (pestana && (st.fijadas.some(f => f.id === pestana) || pestana === TALLER)) st.activar(pestana)
    useLayoutStore.getState().setPanelDerecho(true)
    router.replace('/telefono')
  }, [abrir, pestana, router])

  // Llegar aquí sin enlace abre el panel con la pestaña que estaba a la vista (en el teléfono, a pantalla completa).
  useEffect(() => {
    if (abrir || pestana) return
    if (esTelefonoAhora() && clavesTelefono(usePanelFijadas.getState().orden, usePanelFijadas.getState().taller).length) useLayoutStore.getState().setPanelDerecho(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const claves = clavesTelefono(orden, taller)
  return <main className={s.pagina}>
    <header className={s.cabeza}>
      <Smartphone size={18} aria-hidden />
      <div>
        <h1>Tu panel</h1>
        <p>Las mismas pestañas que en tu escritorio. Lo que abras o cierres aquí, cambia allá.</p>
      </div>
    </header>
    {/* Hábitos de hoy (22 oct 2026): un toque a las casillas. Desde ahí, «Agregar a inicio» deja su propio ícono. */}
    <Link href="/telefono/habitos" className={s.fila} data-habitos-acceso>
      <span className={s.icono}><ListChecks size={16} aria-hidden /></span>
      <span className={s.nombre}>Hábitos de hoy</span>
      <ChevronRight size={16} aria-hidden className={s.flecha} />
    </Link>
    {claves.length ? <ul className={s.lista}>
      {claves.map(c => {
        const f = fijadas.find(x => x.id === c)
        return <li key={c}>
          <button className={s.fila} onClick={() => verPestanaEnTelefono(c)}>
            <span className={s.icono}>{c === TALLER ? <Hammer size={16} aria-hidden /> : f ? <IconoVista vista={f.input.vista} size={16} /> : null}</span>
            <span className={s.nombre}>{nombreDeClave(c, fijadas)}</span>
            <ChevronRight size={16} aria-hidden className={s.flecha} />
          </button>
        </li>
      })}
    </ul> : <p className={s.vacio}>No hay pestañas abiertas. Abre una aquí o pídesela a Levy: «ábrelo en mi teléfono».</p>}
    <section className={s.abrir}>
      <h2>Abrir</h2>
      <OpcionesPanel grande />
    </section>
  </main>
}
