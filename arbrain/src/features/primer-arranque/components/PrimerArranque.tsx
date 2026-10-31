'use client'
/**
 * Primer arranque de Arbrain para alumnos (11 oct 2026; SPEC del empaquetado › MISIÓN 1-6).
 *
 * Hasta seis pasos, en este orden: bienvenida → aviso de privacidad, términos y licencia → tus llaves → autonomía →
 * monitoreo de cohorte → listo (entra al chat con el primer mensaje de Levy). Referentes: el primer arranque de Claude
 * Desktop y el de Raycast: una idea por pantalla, lo seguro es el botón principal, todo se puede cambiar en Ajustes.
 * Lo decidido en cada paso se guarda al continuar; volver atrás no pierde nada. v1.1 (12 oct): el paso de monitoreo
 * solo aparece si este build tiene a dónde enviar (`pasosVisibles`); el de llaves es «Conectar con OpenRouter».
 * A/B ronda 2: la prueba de la llave es de todo el arranque. Sin crédito, el botón dice «Continuar sin crédito» y
 * «Listo» lo marca en ámbar con «Recargar en OpenRouter» ahí mismo (y prueba de nuevo al volver a la ventana).
 * 0.2.15 (29 oct 2026, docs/builds/autonomia-alumno-2026-10-29): el paso «autonomía» decide en una pantalla cuánto
 * pregunta Levy. «Autónomo» aparece marcado (recomendado) con sus dos casillas vacías (clickwrap): sin las dos,
 * «Continuar» no avanza. El texto, su versión y su huella vienen del daemon y vuelven a él al aceptar. Computer use
 * (0.1.2: macOS y Windows) es una casilla dentro de ese paso; en Linux no aparece.
 * 31 oct 2026 (Daniel: «que sea default el modo oscuro con los botones tan hermosos como el botón de enviar»): la
 * bienvenida es oscura salvo que la persona haya elegido claro a mano, sin importar el tramo de la hora; el botón principal
 * es la tecla ámbar del enviar del chat (bienvenida.module.css). Solo cambia la presentación.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, HardDrive, KeyRound, Loader2, MousePointerClick, ShieldCheck, Sparkles } from 'lucide-react'
import { Retrato } from '@/shared/components/Retrato'
import { DocumentosLegales } from './DocumentosLegales'
import { PanelCaminos } from './PanelCaminos'
import { caminoActual } from '../lib/caminos'
import { Aviso, PanelLlaves, PasoRecarga, usePruebaConexion, useReprobarAlVolver, type EstadoPanel } from './PanelLlaves'
import { fijarConsentimiento, PanelMonitoreo } from './PanelMonitoreo'
import { VERSION_TEXTOS } from '../textos/legales'
import { avisoSinSandbox, type EstadoSandbox } from '@/features/permisos/lib/confirmacion'
import { explicacionComputerUse } from '@/features/permisos/lib/disponibilidad'
import { CASILLAS_VACIAS, ConsentimientoAutonomia, listoParaAceptar, type Casillas } from '@/features/seguridad/components/ConsentimientoAutonomia'
import { consentimientoVigente, cuerpoAceptacion, FICHAS_MODO, NOMBRE_MODO, type EstadoPermisosLevy, type ModoPermisos } from '@/features/seguridad/lib/seguridad'
import { ETIQUETA, pasosVisibles, type Paso } from '../lib/pasos'
import { reprobarAlVolver } from '../lib/llaves'
import { useTheme } from '@/shared/contexts/theme-context'
import s from './bienvenida.module.css'


interface Estado { aceptado: { version: string } | null; nombre: string | null; completado: string | null }

async function post(cuerpo: Record<string, unknown>) {
  const r = await fetch('/api/primer-arranque', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'No pude guardar. Reintenta.')
  return j
}

/** Modo de demostración (capturas, `?demo=autonomia`): sin daemon, con un texto de ejemplo y el paso de autonomía abierto. */
function demoDesdeUrl(): { paso: Paso; permisos: EstadoPermisosLevy } | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  if (q.get('demo') !== 'autonomia') return null
  return {
    paso: 'autonomia',
    permisos: { modo: 'carpeta', modos: ['preguntar', 'carpeta', 'autonomo'], sandbox: q.get('sandbox') !== 'no', texto: { version: 'autonomia-v1-2026-10-31', sha256: 'demo', titulo: 'Qué significa el modo autónomo', aviso: 'Versión del 31 de octubre de 2026. Si cambia, te la volveremos a pedir.', casillas: ['He leído esto y entiendo que en modo autónomo mi cerebro actúa sin pedirme un clic en cada paso.', 'Acepto que soy responsable de lo que le pido y de lo que hace en mi nombre.'], cuerpo: 'Arbrain es un programa de código abierto que corre en tu computadora.\n\n## 1. Qué hace en modo autónomo\nEn modo autónomo tu cerebro hace lo que le pides sin pedirte un clic en cada paso.' } },
  }
}

export function PrimerArranque() {
  const demo = useMemo(() => demoDesdeUrl(), [])
  const [paso, setPaso] = useState<Paso>(demo?.paso ?? 'bienvenida')
  const [estado, setEstado] = useState<Estado | null>(demo ? { aceptado: null, nombre: null, completado: null } : null)
  const [nombre, setNombre] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [llaves, setLlaves] = useState<EstadoPanel>({ listo: false, cobra: 'openrouter' })
  const llavesListas = llaves.listo
  // La prueba de la llave vive aquí: el panel la llena y «Listo» la lee (y la repite).
  const pruebaLlave = usePruebaConexion()
  const sinCredito = llavesListas && llaves.motor !== 'suscripcion' && reprobarAlVolver(pruebaLlave.prueba)
  const [sandbox, setSandbox] = useState<EstadoSandbox | null>(demo ? { disponible: demo.permisos.sandbox, sistema: demo.permisos.sandbox ? 'macos' : 'windows' } : null)
  // ¿Esta instalación vive en el servidor de la persona (nube.sh)? Cambia el paso «Dónde vive» y los textos de «es tuyo».
  const [enServidor, setEnServidor] = useState(false)
  const [monitoreo, setMonitoreo] = useState(false)
  // ¿Este build tiene a dónde enviar el monitoreo? Sin destino (o sin respuesta del daemon) el paso no se muestra.
  const [conMonitoreo, setConMonitoreo] = useState(false)
  // Computer use: ¿existe en este sistema (macOS y Windows)? Sin respuesta, la casilla no se muestra (lado seguro).
  const [cu, setCu] = useState<{ disponible: boolean; plataforma: string }>(demo ? { disponible: true, plataforma: demo.permisos.sandbox ? 'darwin' : 'win32' } : { disponible: false, plataforma: '' })
  const [computerUse, setComputerUse] = useState(false)
  // Autonomía (0.2.15): el nivel elegido (Autónomo marcado por defecto) y las dos casillas, que nacen vacías.
  const [permisos, setPermisos] = useState<EstadoPermisosLevy | null>(demo?.permisos ?? null)
  const [modo, setModo] = useState<ModoPermisos>('autonomo')
  const [casillas, setCasillas] = useState<Casillas>(CASILLAS_VACIAS)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  // Oscuro por defecto: el tramo de la hora no decide aquí. Solo «claro» elegido a mano (y vigente) lo pinta claro. El
  // proveedor nace en 'auto' en el servidor y en el cliente, así que el primer pintado ya es oscuro y no hay salto.
  const claro = useTheme().theme === 'light'

  useEffect(() => {
    if (demo) return
    fetch('/api/primer-arranque', { cache: 'no-store' }).then(r => r.json()).then((j: { estado?: Estado; error?: string; sandbox?: EstadoSandbox; servidor?: boolean }) => {
      if (j.error) { setError(j.error); return }
      setEnServidor(j.servidor === true)
      if (j.estado) { setEstado(j.estado); setNombre(j.estado.nombre ?? ''); setAcepto(j.estado.aceptado?.version === VERSION_TEXTOS) }
      // Contrato v3 §6.1: sin sandbox (Windows, Linux sin bubblewrap) cada comando de terminal pide clic; se avisa al final.
      if (j.sandbox && typeof j.sandbox.disponible === 'boolean') setSandbox(j.sandbox)
    }).catch(() => setError('No pude hablar con tu Arbrain local. Cierra y vuelve a abrir la app.'))
    fetch('/api/monitoreo', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((j: { endpoint_configurado?: boolean } | null) => setConMonitoreo(j?.endpoint_configurado === true))
      .catch(() => setConMonitoreo(false))
    fetch('/api/manos/interruptor', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((j: { disponible?: boolean; plataforma?: string; encendido?: boolean } | null) => {
        setCu({ disponible: j?.disponible === true, plataforma: typeof j?.plataforma === 'string' ? j.plataforma : '' })
        if (j?.encendido === true) setComputerUse(true)
      })
      .catch(() => setCu({ disponible: false, plataforma: '' }))
    // El texto del modo Autónomo, su versión y su huella: del daemon, nunca de la app. Si ya había un nivel (el texto cambió
    // y la bienvenida vuelve a aparecer), se propone el que tenía.
    fetch('/api/seguridad/permisos', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((j: EstadoPermisosLevy | null) => { if (j?.texto) { setPermisos(j); if (j.modo && j.modo !== 'carpeta') setModo(j.modo) } })
      .catch(() => setPermisos(null))
  }, [demo])

  useReprobarAlVolver(paso === 'listo' && sinCredito, pruebaLlave.probar)

  // El foco va al título de cada paso: el lector de pantalla anuncia dónde estás.
  useEffect(() => { titulo.current?.focus({ preventScroll: true }) }, [paso])

  const PASOS = useMemo(() => pasosVisibles(conMonitoreo, cu.disponible), [conMonitoreo, cu.disponible])
  const i = Math.max(0, PASOS.indexOf(paso))
  const ir = (p: Paso) => { setError(null); setPaso(p) }
  const atras = () => i > 0 && ir(PASOS[i - 1])
  const vigente = !!permisos && consentimientoVigente(permisos)

  const continuar = useCallback(async () => {
    setOcupado(true); setError(null)
    try {
      if (paso === 'bienvenida') { if (nombre.trim() !== (estado?.nombre ?? '')) await post({ accion: 'nombre', nombre }) }
      if (paso === 'legal') await post({ accion: 'aceptar', version: VERSION_TEXTOS })
      if (paso === 'autonomia') {
        // El nivel va al daemon con el secreto de la app (la ruta lo pone). Autónomo lleva la versión y la huella del texto
        // que la persona leyó; si el daemon tiene otro texto, responde 409 y se vuelve a cargar.
        const cuerpo = modo === 'autonomo' && !vigente ? (permisos?.texto ? cuerpoAceptacion(permisos.texto, 'bienvenida') : null) : { modo, via: 'bienvenida' }
        if (!cuerpo) throw new Error('No pude leer el texto del modo Autónomo de tu Arbrain. Cierra y vuelve a abrir la app, o elige otro nivel.')
        if (!demo) {
          const r = await fetch('/api/seguridad/permisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'No pude guardar tu nivel de permisos.')
          if (cu.disponible) {
            const c = await fetch('/api/manos/interruptor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encendido: computerUse }) })
            if (!c.ok) throw new Error((await c.json().catch(() => ({}))).error ?? 'No pude guardar computer use.')
          }
        }
      }
      if (paso === 'monitoreo' && conMonitoreo) await fijarConsentimiento(monitoreo)
      if (paso === 'listo') {
        const j = await post({ accion: 'completar' }) as { sesion?: string }
        // Recarga completa: entra al shell de la app (ya con el primer arranque cumplido) en la conversación de bienvenida.
        window.location.replace(j.sesion ? `/chat?session=${encodeURIComponent(j.sesion)}` : '/chat')
        return
      }
      ir(PASOS[i + 1])
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude guardar. Reintenta.') } finally { setOcupado(false) }
  }, [paso, nombre, estado?.nombre, computerUse, cu.disponible, monitoreo, conMonitoreo, i, PASOS, modo, permisos, vigente, demo])

  const puedeSeguir = paso === 'legal' ? acepto : paso === 'autonomia' ? (modo !== 'autonomo' || vigente || (listoParaAceptar(casillas) && !!permisos?.texto)) : true
  // A/B ronda 3: la salida que no se recomienda no pesa igual que la recomendada. Sin llave, el primario es «Conectar con
  // OpenRouter»; sin crédito, «Recargar». Entonces seguir de largo es secundario.
  const botonDiscreto = (paso === 'llaves' && (!llavesListas || sinCredito)) || (paso === 'listo' && sinCredito)
  const textoBoton = paso === 'bienvenida' ? 'Empezar' : paso === 'legal' ? 'Aceptar y continuar' : paso === 'llaves' && !llavesListas ? 'Continuar sin llave' : paso === 'llaves' && sinCredito ? 'Continuar sin crédito' : paso === 'autonomia' && modo === 'autonomo' ? 'Empezar en modo autónomo' : paso === 'listo' ? 'Hablar con Levy' : 'Continuar'
  const nombreModo = NOMBRE_MODO[modo]

  return (
    // Alto fijo con scroll propio (29 oct 2026, un fundador con pantalla de 1280×720 no llegaba al botón): html y body
    // tienen overflow:hidden, así que un min-h crecía por debajo de la ventana sin barra. Por dentro, min-h-full centra
    // la tarjeta cuando cabe y la deja empezar arriba cuando no.
    <div data-bienvenida-scroll data-tema-bienvenida={claro ? 'claro' : 'oscuro'} style={{ colorScheme: claro ? 'light' : 'dark' }}
      className={`${claro ? '' : 'dark '}${s.bienvenida} relative h-[100dvh] w-full overflow-y-auto overscroll-contain bg-background text-foreground`}>
      {/* Luz de marca detrás de la tarjeta (Luminorphism): un halo violeta suave, sin ruido. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(var(--brand-rgb),0.22),transparent_70%)]" />
      <div className="relative flex min-h-full w-full flex-col items-center justify-center px-4 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)]">
        <nav aria-label="Pasos del primer arranque" className="relative mb-6 flex items-center gap-1.5">
          {PASOS.map((p, k) => (
            <span key={p} title={ETIQUETA[p]} aria-current={p === paso ? 'step' : undefined}
              className={`h-1.5 rounded-full transition-all duration-300 ${k < i ? 'w-5 bg-brand-ink/55' : p === paso ? 'w-8 bg-brand-ink shadow-[0_0_10px_rgba(var(--brand-rgb),0.45)]' : 'w-5 bg-foreground/15'}`}>
              <span className="sr-only">{`Paso ${k + 1} de ${PASOS.length}: ${ETIQUETA[p]}${k < i ? ' (hecho)' : ''}`}</span>
            </span>
          ))}
        </nav>

        <main className="glass-panel-strong relative w-full max-w-[600px] p-6 sm:p-8">
          {paso === 'bienvenida' && (
            <div className="text-center">
              <div className="relative mx-auto mb-5 size-24">
                <div aria-hidden className="absolute inset-0 rounded-full bg-brand/30 blur-2xl" />
                <Retrato agente="levy" size={96} prioridad className="relative size-24 rounded-full object-cover ring-2 ring-brand/40" alt="Levy" />
              </div>
              <h1 ref={titulo} tabIndex={-1} className="font-sans text-[26px] font-semibold tracking-tight outline-none sm:text-[30px]">Bienvenido a Arbrain</h1>
              <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed text-muted">Tu cerebro artificial. Vive en {enServidor ? 'tu servidor' : 'tu computadora'}, aprende cómo trabajas y te ayuda a decidir y a ejecutar.</p>
              <ul className="mx-auto mt-6 grid max-w-[460px] gap-2.5 text-left">
                <Punto icono={<HardDrive className="size-4" />} titulo="Es tuyo">Tu memoria, tus conversaciones y tus archivos se quedan en {enServidor ? 'tu servidor, rentado a tu nombre' : 'esta computadora'}.</Punto>
                <Punto icono={<KeyRound className="size-4" />} titulo="Con tus llaves">Levy trabaja con tu propia cuenta: tu Claude Code (Pro o Max) o tu llave, que va al llavero del sistema.</Punto>
                <Punto icono={<ShieldCheck className="size-4" />} titulo="Bajo tu mando">Tú eliges cuánto te pregunta: desde un clic para todo hasta el modo Autónomo con una red mínima. Para cambiarlo o pausar todo, toca el botón del modelo, abajo junto a donde escribes.</Punto>
              </ul>
              <label className="mx-auto mt-6 block max-w-[320px] text-left">
                <span className="text-[13px] font-medium text-foreground/90">¿Cómo te llamo? <span className="font-normal text-muted">(opcional)</span></span>
                <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Tu nombre" className="input-field mt-1.5 min-h-11" onKeyDown={e => { if (e.key === 'Enter') void continuar() }} />
              </label>
            </div>
          )}

          {paso === 'legal' && (
            <div>
              <Encabezado refTitulo={titulo} titulo="Antes de empezar" sub="Léelos con calma. Arbrain corre en tu computadora y tus datos son tuyos." />
              <DocumentosLegales />
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-4">
                <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
                <span className="text-[13.5px] leading-relaxed text-foreground/90">Leí y acepto el aviso de privacidad, los términos de uso y la licencia de Arbrain.</span>
              </label>
            </div>
          )}

          {paso === 'llaves' && (
            <div>
              <Encabezado refTitulo={titulo} titulo="Conecta a Levy con un modelo" sub="Si ya pagas Claude Pro o Max, usa tu Claude Code. Si no, un clic con tu cuenta de OpenRouter; para pegar una llave, «Otras formas»." />
              <PanelLlaves onEstado={setLlaves} control={pruebaLlave} />
              {!llavesListas && <p className="mt-3 text-[12.5px] text-muted">Puedes seguir sin llave y ponerla después en Ajustes › Llaves; Levy no podrá responder hasta entonces.</p>}
            </div>
          )}

          {paso === 'autonomia' && (
            <div data-paso-autonomia>
              <Encabezado refTitulo={titulo} titulo="¿Cómo quieres que trabaje tu cerebro?" sub="Lo recomendado va primero. Lo cambias cuando quieras en Ajustes › Permisos y seguridad." />
              <div role="radiogroup" aria-label="Nivel de permisos" className="grid gap-2.5">
                {FICHAS_MODO.map(f => (
                  <div key={f.modo}>
                    <Opcion activa={modo === f.modo} onElegir={() => setModo(f.modo)} titulo={f.nombre} etiqueta={f.recomendado ? 'Recomendado' : undefined} icono={f.modo === 'autonomo' ? <Sparkles className="size-4" /> : undefined} detalle={f.detalle} />
                    {f.modo === 'autonomo' && modo === 'autonomo' && (
                      permisos?.texto
                        ? (vigente
                          ? <p className="mt-2 rounded-xl border border-brand/30 bg-brand/[0.05] px-3 py-2 text-[12.5px] text-muted">Ya aceptaste este texto (versión {permisos.consentimiento?.version}). Continuar lo deja en Autónomo.</p>
                          : <div className="mt-2 rounded-xl border border-brand/30 bg-brand/[0.05] p-3"><ConsentimientoAutonomia texto={permisos.texto} marcadas={casillas} onMarcadas={setCasillas} deshabilitado={ocupado} /></div>)
                        : <p className="mt-2 text-[12.5px] text-amber-300">No pude leer el texto del modo Autónomo de tu Arbrain. Elige otro nivel o cierra y vuelve a abrir la app.</p>
                    )}
                  </div>
                ))}
              </div>
              {cu.disponible && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-3.5">
                  <input type="checkbox" checked={computerUse} onChange={e => setComputerUse(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground/90"><MousePointerClick className="size-4" aria-hidden /> Que también use tu pantalla (computer use)</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{explicacionComputerUse(cu.plataforma, modo === 'autonomo')}</span>
                  </span>
                </label>
              )}
              {sandbox && !sandbox.disponible && modo === 'autonomo' && <p className="mt-3 text-[12.5px] leading-snug text-amber-700 dark:text-amber-300">En Windows no hay caja de arena: Autónomo corre comandos directo en tu computadora.</p>}
            </div>
          )}

          {paso === 'monitoreo' && (
            <div>
              <Encabezado refTitulo={titulo} titulo="Tu avance en el programa" sub="Si quieres, Arbrain le comparte a tu programa cifras de tu avance para acompañarte. Viene apagado." />
              <PanelMonitoreo pendiente={monitoreo} onPendiente={setMonitoreo} />
            </div>
          )}

          {paso === 'donde' && (
            <div>
              <Encabezado refTitulo={titulo} titulo="¿Dónde vive tu Arbrain?" sub={enServidor
                ? 'Tu Arbrain vive en tu servidor: lo abres desde cualquier navegador o tu teléfono con Tailscale, aunque tu computadora esté apagada. Estos son los tres caminos; cambiar o sumar otro es pegar un prompt en Claude Code.'
                : 'Tu Arbrain vive en esta computadora. Estos son los tres caminos; cambiar o sumar tu servidor es pegar un prompt en Claude Code.'} />
              <PanelCaminos actual={caminoActual(enServidor)} />
            </div>
          )}

          {paso === 'listo' && (
            <div className="text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-brand/15 text-brand-ink"><Sparkles className="size-6" aria-hidden /></div>
              <h1 ref={titulo} tabIndex={-1} className="text-[24px] font-semibold tracking-tight outline-none">Todo listo{nombre.trim() ? `, ${nombre.trim().split(/\s+/)[0]}` : ''}</h1>
              <p className="mx-auto mt-2 max-w-[420px] text-[14.5px] leading-relaxed text-muted">Levy ya te está esperando con tu primera conversación.</p>
              <ul className="mx-auto mt-6 grid max-w-[400px] gap-2 text-left text-[13.5px]">
                <Resumen tono="ok">Aviso de privacidad, términos y licencia aceptados</Resumen>
                {!llavesListas ? <Resumen tono="alerta">Sin llave todavía: ponla en Ajustes › Llaves</Resumen>
                  : sinCredito ? <Resumen tono="alerta"><b className="font-semibold">Conectado, falta crédito.</b> Levy no podrá responder hasta que recargues.</Resumen>
                  : llaves.motor === 'suscripcion' ? <Resumen tono="ok">{pruebaLlave.prueba?.ok ? 'Levy conectado y probado con tu Claude Code' : 'Levy conectado con tu Claude Code (tu suscripción)'}</Resumen>
                  : <Resumen tono="ok">{pruebaLlave.prueba?.ok ? 'Levy conectado y probado con tu cuenta' : 'Levy conectado con tu llave'}</Resumen>}
                <Resumen tono="ok">{modo === 'autonomo' ? 'Modo Autónomo: Levy actúa sin pedirte clic, salvo dinero, secretos, borrados grandes y envíos a muchos' : modo === 'carpeta' ? 'Automático en mi carpeta: Levy pregunta antes de lo que sale de tu computadora' : 'Preguntar siempre: Levy te pide un clic para casi todo'}</Resumen>
                {cu.disponible
                  ? <Resumen tono="ok">{computerUse ? (modo === 'autonomo' ? 'Computer use encendido; en Autónomo queda como lo dejes' : 'Computer use encendido por esta apertura; lo irreversible te pide tu clic') : 'Computer use apagado: lo enciendes en Ajustes › Esta computadora'}</Resumen>
                  : <Resumen tono="neutro">Computer use no está disponible en este sistema; Levy trabaja con tus archivos y en el chat</Resumen>}
                {conMonitoreo && <Resumen tono="ok">{monitoreo ? 'Compartes tu avance (solo cifras)' : 'Monitoreo apagado: no sale nada'}</Resumen>}
                {sandbox && !sandbox.disponible && modo !== 'autonomo' && <Resumen tono="neutro">Terminal sin sandbox en este equipo: cada comando te pedirá un clic</Resumen>}
              </ul>
              {sinCredito && (
                <div className="mx-auto max-w-[420px]">
                  <PasoRecarga cobra={llaves.cobra} onReintentar={() => void pruebaLlave.probar()} probando={pruebaLlave.probando} className="mt-4" />
                </div>
              )}
              {sandbox && !sandbox.disponible && modo !== 'autonomo' && <Aviso tono="info" className="mx-auto mt-4 max-w-[420px] text-left">{avisoSinSandbox(sandbox)}</Aviso>}
            </div>
          )}

          {error && <Aviso tono="alerta" className="mt-5">{error}</Aviso>}

          <div className={`mt-7 flex items-center gap-3 ${paso === 'bienvenida' || paso === 'listo' ? 'justify-center' : 'justify-between'}`}>
            {paso !== 'bienvenida' && paso !== 'listo' && (
              <button type="button" onClick={atras} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand">
                <ArrowLeft className="size-4" aria-hidden /> Atrás
              </button>
            )}
            <button type="button" onClick={() => void continuar()} disabled={!puedeSeguir || ocupado || (!estado && !error)} title={paso === 'autonomia' && modo === 'autonomo' && !puedeSeguir ? 'Marca las dos casillas para empezar en modo autónomo' : undefined} className={`${s.tecla}${botonDiscreto ? ` ${s.discreta}` : ''}`}>
              {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <>{textoBoton} <ArrowRight className="size-4" aria-hidden /></>}
            </button>
          </div>
          {paso === 'autonomia' && <p className="mt-3 text-center text-[12px] text-muted">{modo === 'autonomo' && !vigente ? `Continuar se activa con las dos casillas marcadas. ` : ''}Elegiste «{nombreModo}».</p>}
        </main>
        <p className="relative mt-5 text-center text-[12px] text-muted">Paso {i + 1} de {PASOS.length} · Todo esto se puede cambiar después en Ajustes</p>
      </div>
    </div>
  )
}

function Encabezado({ titulo, sub, refTitulo }: { titulo: string; sub: string; refTitulo: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="mb-5">
      <h1 ref={refTitulo} tabIndex={-1} className="text-[22px] font-semibold tracking-tight outline-none">{titulo}</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{sub}</p>
    </header>
  )
}

function Punto({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface/60 px-4 py-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand-ink" aria-hidden>{icono}</span>
      <span><span className="block text-[14px] font-semibold">{titulo}</span><span className="block text-[13px] leading-snug text-muted">{children}</span></span>
    </li>
  )
}

function Opcion({ activa, onElegir, titulo, detalle, etiqueta, icono }: { activa: boolean; onElegir: () => void; titulo: string; detalle: string; etiqueta?: string; icono?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={activa} onClick={onElegir}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${activa ? 'border-brand/60 bg-brand/[0.07]' : 'border-border-subtle bg-surface/60 hover:bg-foreground/[0.03]'}`}>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${activa ? 'border-brand bg-brand text-white' : 'border-foreground/25'}`} aria-hidden>{activa && <Check className="size-3" />}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[14px] font-semibold">{icono}{titulo}{etiqueta && <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">{etiqueta}</span>}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{detalle}</span>
      </span>
    </button>
  )
}

/** `ok` palomita verde; `alerta` ámbar con «!»; `neutro` un punto (lo que no está mal pero tampoco es un logro). */
function Resumen({ tono, children }: { tono: 'ok' | 'alerta' | 'neutro'; children: React.ReactNode }) {
  const color = tono === 'ok' ? 'bg-success/15 text-success' : tono === 'alerta' ? 'bg-warning/15 text-warning' : 'bg-foreground/10 text-muted'
  return (
    <li className="flex items-start gap-2.5" data-tono={tono}>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${color}`} aria-hidden>{tono === 'ok' ? <Check className="size-3" /> : tono === 'alerta' ? '!' : <span className="size-1.5 rounded-full bg-current" />}</span>
      <span className="text-foreground/90">{children}</span>
    </li>
  )
}
