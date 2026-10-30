'use client'
/**
 * «Conecta tu reloj» (5 oct 2026): el estándar para cualquier usuario de Arbrain. Tres pasos para que Health Auto Export
 * mande su salud a SU Arbrain con SU token (POST /api/salud/ingest). El tercer paso escucha: cuando llega el primer
 * envío, la palomita se dibuja y dice cuántas muestras llegaron. El token completo se ve una sola vez, al generarlo.
 */
import { useState } from 'react'
import { ArrowLeft, Check, Copy, KeyRound } from 'lucide-react'
import { mov, escalon, Palomita } from '@/shared/movimiento'
import { useFuente, releer } from '../datos'
import { useAhora } from '../useAhora'
import { hace, type Conexion, type DatosSalud } from '@/features/salud/modelo'

const esLocal = (u: string) => /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u)
import l from '../luz.module.css'
import h from './salud.module.css'

const URL_CONEXION = '/api/salud/conexion'
const METRICAS_HAE = ['Sleep Analysis', 'Heart Rate Variability', 'Resting Heart Rate', 'Respiratory Rate', 'Step Count', 'VO2 Max', 'Apple Sleeping Wrist Temperature']

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false)
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 1600) } catch { /* sin portapapeles: el texto sigue seleccionable */ } }
  return <button className={h.copiar} onClick={() => void copiar()} aria-label={`Copiar ${etiqueta}`} data-hecho={hecho || undefined}>
    {hecho ? <><Check size={12} aria-hidden /> Copiado</> : <><Copy size={12} aria-hidden /> Copiar</>}
  </button>
}

function Campo({ nombre, valor, oculto }: { nombre: string; valor: string; oculto?: string }) {
  return <div className={h.campo}>
    <span>{nombre}</span>
    <code>{oculto ?? valor}</code>
    {!oculto && <Copiar texto={valor} etiqueta={nombre} />}
  </div>
}

export function ConectaReloj({ x, onVolver }: { x: DatosSalud; onVolver?: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [generadoEn, setGeneradoEn] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ahora = useAhora()
  // Escucha cada 5 s mientras se espera el primer envío (o el primero después de regenerar).
  const previa = useFuente<{ conexion: Conexion }>(URL_CONEXION)
  const con = previa.data?.conexion ?? x.conexion
  const llego = !!con?.ultimoEnvio && (!generadoEn || Date.parse(con.ultimoEnvio) >= generadoEn - 1000)
  useFuente<{ conexion: Conexion }>(con?.tieneToken && !llego ? URL_CONEXION : null, 5000)

  async function generar() {
    if (con?.tieneToken && !window.confirm('¿Generar un token nuevo? El anterior deja de funcionar al instante y tendrás que pegar el nuevo en Health Auto Export.')) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch(URL_CONEXION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'generar' }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok || !b.token) throw new Error(b.error ?? 'No se pudo generar tu token.')
      setToken(b.token); setGeneradoEn(Date.now()); await releer(URL_CONEXION)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar tu token.') } finally { setOcupado(false) }
  }
  const verCuerpo = async () => { await releer('/api/salud'); onVolver?.() }
  const url = con?.url ?? '/api/salud/ingest'

  return <section className={h.conecta} aria-label="Conecta tu reloj">
    <header className={`${h.conectaCabeza} ${mov.entra}`} style={escalon(0)}>
      {onVolver && <button className={l.enlace} onClick={onVolver}><ArrowLeft size={12} aria-hidden /> Volver a tu cuerpo</button>}
      <p className={l.ceja}>Salud · <b>Conecta tu reloj</b></p>
      <h3 className={`${h.palabra} ${l.serif}`}>Tu cuerpo, en tu Arbrain</h3>
      <p className={h.hacer}>Tu Apple Watch manda tu sueño, tu HRV y tu pulso a tu Arbrain cada hora, y aquí ves cómo está tu cuerpo hoy contra tu propio normal. Solo tú ves tus datos.</p>
    </header>

    {x.fuente === 'studio' && <p className={`${h.nota} ${h.recuadro} ${mov.entra}`} style={escalon(1)}>
      Tu reloj ya llega por tu receptor del Studio (Tailscale) desde el 24 jul y esta vista lo lee de ahí. Estos pasos son la ruta estándar de cualquier usuario de Arbrain. Si un día te pasas a ella, crea una <b>segunda</b> automatización; la primera sigue intacta hasta comparar 14 días.
    </p>}

    <ol className={h.pasos}>
      <li className={mov.entra} style={escalon(2)}>
        <span className={`${h.numero} ${l.serif}`}>1</span>
        <div>
          <h4>Instala Health Auto Export en tu iPhone</h4>
          <p>Es la app que lee Salud y la manda a donde le digas. Las automatizaciones necesitan su plan de pago. Al abrirla, permite el acceso a Salud para estas siete métricas:</p>
          <ul className={h.metricasHae}>{METRICAS_HAE.map(m => <li key={m}>{m}</li>)}</ul>
          <p className={h.nota}>Duerme con el reloj puesto: sin eso no hay sueño, HRV nocturno ni temperatura de muñeca.</p>
        </div>
      </li>
      <li className={mov.entra} style={escalon(3)}>
        <span className={`${h.numero} ${l.serif}`}>2</span>
        <div>
          <h4>Crea la automatización hacia tu Arbrain</h4>
          <p>En la app: <b>Automations → nueva → REST API</b>. Pega estos dos datos:</p>
          <Campo nombre="URL" valor={url} />
          {esLocal(url) && <p className={l.aviso}>Esta dirección solo existe en esta computadora: tu iPhone no la alcanza. Abre Arbrain por su dirección pública para copiar la buena.</p>}
          {token ? <Campo nombre="Encabezado" valor={`Authorization: Bearer ${token}`} />
            : con?.tieneToken ? <Campo nombre="Encabezado" valor="" oculto={`Authorization: Bearer ••••${con.pista ?? ''}`} />
            : null}
          {token && <p className={`${h.nota} ${mov.aparece}`}>Cópialo ahora: por seguridad no se vuelve a mostrar completo.</p>}
          <button className={h.boton} onClick={() => void generar()} disabled={ocupado}>
            <KeyRound size={13} aria-hidden /> {ocupado ? 'Generando…' : con?.tieneToken ? 'Generar un token nuevo' : 'Generar mi token'}
          </button>
          {error && <p className={l.aviso} role="alert">{error}</p>}
          <p>Y elige: formato <b>JSON</b>, las siete métricas de arriba, cada <b>hora</b>, con un rango que incluya ayer y hoy. Lo que llegue repetido no se cuenta dos veces.</p>
        </div>
      </li>
      <li className={mov.entra} style={escalon(4)}>
        <span className={`${h.numero} ${l.serif}`}>3</span>
        <div>
          <h4>Manda el primer envío</h4>
          <p>En la automatización, expórtala a mano una vez (o espera a la próxima hora). Aquí lo vas a ver llegar.</p>
          {!con?.tieneToken ? <p className={h.espera}><i aria-hidden />Primero genera tu token en el paso 2.</p>
            : llego ? <div className={h.llego} data-hecha>
              <span className={h.palomita}><Palomita /></span>
              <p><b>Llegó {hace(con.ultimoEnvio!, ahora)}</b>{con.muestras != null && ` · ${con.muestras.toLocaleString('es-MX')} muestras`}</p>
              {con.error ? <p className={l.aviso}>{con.error}</p> : <button className={h.boton} onClick={() => void verCuerpo()}>Ver mi cuerpo</button>}
            </div>
            : <p className={h.espera}><i className={mov.late} aria-hidden />Esperando el primer envío…{con.error && <span> {con.error}</span>}</p>}
        </div>
      </li>
    </ol>

    <p className={`${h.nota} ${mov.aparece}`} style={escalon(6)}>Tu token solo sirve para escribir tu salud: no abre tu cuenta. Si lo pierdes o lo compartes, genera uno nuevo y el anterior deja de funcionar al instante.</p>
  </section>
}
