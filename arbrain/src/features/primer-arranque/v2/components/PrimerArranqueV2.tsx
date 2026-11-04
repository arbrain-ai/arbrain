'use client'
/**
 * Onboarding v2 «tu socio estratega» (3 nov 2026). PROTOTIPO detrás de `ARBRAIN_ONBOARDING_V2` (apagado): lo pinta
 * `/play-lab/bienvenida-v2`, nunca `/bienvenida`. SPEC: docs/builds/onboarding-v2-2026-11-03/SPEC.md.
 *
 * Cuatro pasos con el esqueleto de Cloudroom v140 (riel 01–04 a la izquierda, «Paso N de 4», una acción principal por
 * pantalla, el sello al conectar) y el lenguaje de un agente estratega de negocio. Por defecto corre con datos de
 * ejemplo (`demo.ts`). Con `?vivo=1` lee de verdad la sesión de Claude Code (`/api/llaves/suscripcion`) y cuántas
 * conversaciones hay (`/api/primer-arranque-v2/negocio`); el login real de Claude solo se lanza en la edición cliente.
 * Google, calendario, correo, GitHub y armar el expediente están simulados: piden servidor (SPEC › «Lo que pide»).
 * Nada de esta pantalla guarda ni envía: es para que Daniel la recorra.
 *
 * Capturas: `?paso=entra|agente|herramientas|negocio` y `?escena=cuenta|conectado|github|importando` la abren en un estado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CalendarDays, FolderOpen, Github, Loader2, Mail, MousePointerClick, Sparkles, X } from 'lucide-react'
import { DocumentosLegales } from '../../components/DocumentosLegales'
import { CASILLAS_VACIAS, ConsentimientoAutonomia, listoParaAceptar, type Casillas } from '@/features/seguridad/components/ConsentimientoAutonomia'
import type { TextoAutonomia } from '@/features/seguridad/lib/seguridad'
import { estadoSuscripcion, iniciarSesionClaude, nombrePlan } from '../../lib/llaves'
import { esEdicionCliente } from '@/lib/edicion'
import { ZoomController } from '@/shared/components/ZoomController'
import { useTheme } from '@/shared/contexts/theme-context'
import { accionDe, agentePorDefecto, algunAgente, alcanzables, ESTADO_V2_VACIO, PASOS_V2, RIEL_V2, TITULO_V2, type EstadoV2, type PasoV2 } from '../pasos'
import { AGENTES_DEMO, CUENTA_DEMO, HALLAZGOS_DEMO, type Hallazgos } from '../demo'
import s from '../../components/bienvenida.module.css'
import v from './v2.module.css'

type Herramienta = 'calendario' | 'correo' | 'github'
type Fase = 'libre' | 'esperando' | 'listo'

/** El texto del modo Autónomo de ejemplo (el real viene del daemon con su versión y su huella). */
const TEXTO_AUTONOMIA_DEMO: TextoAutonomia = {
  version: 'autonomia-v1-2026-10-31', sha256: 'demo', titulo: 'Qué significa el modo autónomo',
  aviso: 'Versión del 31 de octubre de 2026. Si cambia, te la volveremos a pedir.',
  casillas: ['He leído esto y entiendo que en modo autónomo mi cerebro actúa sin pedirme un clic en cada paso.', 'Acepto que soy responsable de lo que le pido y de lo que hace en mi nombre.'],
  cuerpo: 'Arbrain es un programa de código abierto que corre en tu computadora.\n\n## 1. Qué hace en modo autónomo\nEn modo autónomo tu cerebro hace lo que le pides sin pedirte un clic en cada paso.',
}

function leerUrl() {
  if (typeof window === 'undefined') return { vivo: false, paso: 'entra' as PasoV2, escena: '' }
  const q = new URLSearchParams(window.location.search)
  const paso = (PASOS_V2 as readonly string[]).includes(q.get('paso') ?? '') ? q.get('paso') as PasoV2 : 'entra'
  return { vivo: q.get('vivo') === '1', paso, escena: q.get('escena') ?? '' }
}

/** El estado con el que abre: lo de los pasos anteriores ya resuelto, para poder entrar directo a cualquiera. */
function estadoInicial(paso: PasoV2, escena: string): EstadoV2 {
  const k = PASOS_V2.indexOf(paso)
  const e: EstadoV2 = structuredClone(ESTADO_V2_VACIO)
  e.agentes = structuredClone(AGENTES_DEMO)
  if (k >= 1 || escena === 'cuenta') { e.cuenta = { ...CUENTA_DEMO }; e.legal = true }
  if (k >= 2 || escena === 'conectado') { e.agentes.claude.conectado = true }
  if (k >= 2) e.autonomia = true
  if (k >= 3) { e.herramientas.calendario = true; e.herramientas.correo = true }
  return e
}

export function PrimerArranqueV2() {
  const url = useMemo(leerUrl, [])
  const [paso, setPaso] = useState<PasoV2>(url.paso)
  const [e, setE] = useState<EstadoV2>(() => estadoInicial(url.paso, url.escena))
  const [nombre, setNombre] = useState(url.paso === 'entra' && url.escena !== 'cuenta' ? '' : CUENTA_DEMO.nombre)
  const [entrando, setEntrando] = useState(false)
  const [legalAbierto, setLegalAbierto] = useState(false)
  const [conectando, setConectando] = useState<'claude' | 'codex' | null>(null)
  const [selloDe, setSelloDe] = useState<'claude' | 'codex' | null>(url.escena === 'conectado' ? 'claude' : null)
  const [autonomo, setAutonomo] = useState(true)
  const [casillas, setCasillas] = useState<Casillas>(url.escena === 'conectado' ? [true, false] : CASILLAS_VACIAS)
  const [pantalla, setPantalla] = useState(false)
  const [herr, setHerr] = useState<Record<Herramienta, Fase>>(() => ({ calendario: e.herramientas.calendario ? 'listo' : 'libre', correo: e.herramientas.correo ? 'listo' : 'libre', github: url.escena === 'github' ? 'esperando' : 'libre' }))
  const [hallazgos, setHallazgos] = useState<Hallazgos | null>(url.vivo ? null : HALLAZGOS_DEMO)
  const [traer, setTraer] = useState({ claude: true, codex: true })
  const [carpetas, setCarpetas] = useState<Set<string>>(new Set())
  const [cuento, setCuento] = useState('')
  const [importando, setImportando] = useState<{ hechas: number; total: number } | null>(url.escena === 'importando' ? { hechas: 18, total: 49 } : null)
  const [aviso, setAviso] = useState<string | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const claro = useTheme().theme === 'light'
  const loginReal = url.vivo && esEdicionCliente()

  // Vivo: la sesión real de Claude Code y Codex (solo lectura) y lo que hay para traer (solo cifras).
  useEffect(() => {
    if (!url.vivo) return
    void estadoSuscripcion(true).then(j => {
      if (!j) { setAviso('No pude leer tu Claude Code desde esta instalación; sigo con lo de ejemplo.'); return }
      setE(x => ({ ...x, agentes: { claude: { instalado: j.instalado, conectado: j.sesion, plan: j.plan ?? null }, codex: { instalado: !!j.codex?.instalado, conectado: !!j.codex?.sesion } } }))
    })
    fetch('/api/primer-arranque-v2/negocio', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((j: Hallazgos | null) => setHallazgos(j ?? HALLAZGOS_DEMO)).catch(() => setHallazgos(HALLAZGOS_DEMO))
  }, [url.vivo])

  useEffect(() => { titulo.current?.focus({ preventScroll: true }) }, [paso])

  // Lo que el estado de la pantalla aporta al de los pasos (autonomía, herramientas y negocio).
  const estado: EstadoV2 = useMemo(() => ({
    ...e,
    autonomia: !autonomo || listoParaAceptar(casillas),
    herramientas: { calendario: herr.calendario === 'listo', correo: herr.correo === 'listo', github: herr.github === 'listo' },
    negocio: {
      chats: hallazgos ? (traer.claude ? hallazgos.chats.claude : 0) + (traer.codex ? hallazgos.chats.codex : 0) : 0,
      carpetas: carpetas.size,
      contado: cuento.trim().length >= 20,
    },
  }), [e, autonomo, casillas, herr, hallazgos, traer, carpetas, cuento])

  const i = PASOS_V2.indexOf(paso)
  const accion = accionDe(paso, estado)
  const llegan = alcanzables(estado)
  const ir = (p: PasoV2) => setPaso(p)

  const entrarConGoogle = () => {
    setEntrando(true)
    window.setTimeout(() => { setEntrando(false); setE(x => ({ ...x, cuenta: { ...CUENTA_DEMO } })); setNombre(n => n || CUENTA_DEMO.nombre) }, 1200)
  }

  const conectar = useCallback(async (quien: 'claude' | 'codex') => {
    setConectando(quien); setAviso(null)
    try {
      if (quien === 'claude' && loginReal) {
        await iniciarSesionClaude()
        for (let k = 0; k < 100; k++) { // hasta 5 min: el login se aprueba en el navegador
          await new Promise(r => setTimeout(r, 3000))
          const j = await estadoSuscripcion(true)
          if (j?.sesion) { setE(x => ({ ...x, agentes: { ...x.agentes, claude: { instalado: true, conectado: true, plan: j.plan ?? null } } })); setSelloDe('claude'); return }
        }
        throw new Error('Se acabó el tiempo. Vuelve a intentarlo cuando tengas el navegador a la mano.')
      }
      await new Promise(r => setTimeout(r, 1400))
      setE(x => ({ ...x, agentes: { ...x.agentes, [quien]: { ...x.agentes[quien], instalado: true, conectado: true } } }))
      setSelloDe(quien)
    } catch (err) { setAviso(err instanceof Error ? err.message : 'No pude conectar tu agente.') } finally { setConectando(null) }
  }, [loginReal])

  const conectarHerramienta = (h: Herramienta) => {
    setHerr(x => ({ ...x, [h]: 'esperando' }))
    if (h !== 'github') window.setTimeout(() => setHerr(x => ({ ...x, [h]: 'listo' })), 1300)
  }

  const continuar = () => {
    if (!accion.habilitada) return
    if (paso !== 'negocio') { ir(PASOS_V2[i + 1]); return }
    const total = estado.negocio.chats + estado.negocio.carpetas * 8 + (estado.negocio.contado ? 1 : 0)
    if (!total) { window.location.assign(`/inicio-v2${url.vivo ? '?vivo=1' : ''}`); return }
    setImportando({ hechas: 0, total })
  }

  // Simulación de «armar mi expediente»: avanza y al terminar abre «Tu socio estratega».
  useEffect(() => {
    if (!importando || url.escena === 'importando') return
    if (importando.hechas >= importando.total) { window.location.assign(`/inicio-v2${url.vivo ? '?vivo=1' : ''}`); return }
    const t = window.setTimeout(() => setImportando(x => x && { ...x, hechas: Math.min(x.total, x.hechas + Math.ceil(x.total / 6)) }), 350)
    return () => window.clearTimeout(t)
  }, [importando, url.escena, url.vivo])

  const conAgente = algunAgente(estado)
  const porDefecto = agentePorDefecto(estado)

  return (
    <div data-bienvenida-v2 data-tema-bienvenida={claro ? 'claro' : 'oscuro'} style={{ colorScheme: claro ? 'light' : 'dark', height: 'var(--ui-zoomed-app-h, 100dvh)' }}
      className={`${claro ? '' : 'dark '}${s.bienvenida} relative w-full overflow-y-auto overscroll-contain bg-background text-foreground`}>
      <ZoomController />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(var(--brand-rgb),0.2),transparent_70%)]" />
      <div className="relative flex min-h-full w-full flex-col items-center justify-center px-4 py-8">
        <div className={`glass-panel-strong relative overflow-hidden ${v.marco}`}>
          <aside className={v.riel} aria-label="Pasos de tu arranque">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Tu arranque</p>
            <ol className="grid gap-1">
              {PASOS_V2.map((p, k) => {
                const hecho = k < i
                return (
                  <li key={p}>
                    <button type="button" className={`${v.paso} ${hecho ? v.hecho : ''}`} aria-current={p === paso ? 'step' : undefined}
                      disabled={!llegan.includes(p) || p === paso} onClick={() => ir(p)}>
                      <span className={v.numero} aria-hidden>{hecho ? <Check className="size-3.5" /> : `0${k + 1}`}</span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold leading-tight">{TITULO_V2[p]}</span>
                        <span className="mt-0.5 block text-[12px] leading-tight text-muted">{p === paso ? 'En curso' : hecho ? 'Listo' : RIEL_V2[p]}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <p className="mt-auto px-2 pt-6 text-[12px] leading-snug text-muted">Lo retomas cuando quieras desde Ajustes.</p>
          </aside>

          <main className="flex min-w-0 flex-col p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-medium text-muted">Paso {i + 1} de {PASOS_V2.length}</p>
              <span className="rounded-full border border-dashed border-foreground/20 px-2.5 py-0.5 text-[11px] font-medium text-muted" title="Prototipo: Google, herramientas y expediente están simulados">Vista previa</span>
            </div>

            {paso === 'entra' && (
              <section data-paso="entra">
                <Encabezado refTitulo={titulo} titulo="Entra a Arbrain" sub="Con tu cuenta de Google. Así tu socio sabe quién eres y trae lo que ya llenaste de tu expediente." />
                {!e.cuenta ? (
                  <button type="button" onClick={entrarConGoogle} disabled={entrando}
                    className="inline-flex min-h-12 w-full max-w-[360px] items-center justify-center gap-3 rounded-xl border border-foreground/15 bg-white px-5 text-[15px] font-semibold text-[#1f1f1f] shadow-sm hover:bg-white/90 disabled:opacity-70">
                    {entrando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogoGoogle />} {entrando ? 'Esperando tu navegador…' : 'Entrar con Google'}
                  </button>
                ) : (
                  <div className="flex max-w-[460px] items-center gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-3.5">
                    <span className="grid size-9 place-items-center rounded-full bg-brand/15 text-[15px] font-semibold text-brand-ink" aria-hidden>{(nombre || e.cuenta.email).charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">Entraste como {e.cuenta.email}</span>
                      <label className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">Te llamo
                        <input value={nombre} onChange={x => setNombre(x.target.value)} maxLength={60} className="input-field min-h-9 max-w-[180px] py-1 text-[13px]" aria-label="¿Cómo te llamo?" />
                      </label>
                    </span>
                    <button type="button" onClick={() => setE(x => ({ ...x, cuenta: null }))} className="min-h-9 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-foreground/[0.06]">Cambiar</button>
                  </div>
                )}
                <label className="mt-6 flex max-w-[560px] cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-4">
                  <input type="checkbox" checked={e.legal} onChange={x => setE(y => ({ ...y, legal: x.target.checked }))} className="mt-0.5 size-4 shrink-0" />
                  <span className="text-[13.5px] leading-relaxed text-foreground/90">Leí y acepto el aviso de privacidad, los términos de uso y la licencia de Arbrain.</span>
                </label>
                <button type="button" onClick={() => setLegalAbierto(a => !a)} aria-expanded={legalAbierto} className="mt-1.5 inline-flex min-h-9 items-center rounded-lg px-2 text-[13px] font-semibold text-brand-ink hover:bg-foreground/[0.05]">{legalAbierto ? 'Ocultar los textos' : 'Leer los textos'}</button>
                {legalAbierto && <div className="mt-3 max-w-[560px]"><DocumentosLegales /></div>}
                <p className="mt-4 max-w-[560px] text-[12.5px] leading-snug text-muted">Entrar no comparte tu avance con nadie: eso se decide aparte y viene apagado. Tu memoria y tus conversaciones se quedan en esta computadora.</p>
              </section>
            )}

            {paso === 'agente' && (
              <section data-paso="agente">
                <Encabezado refTitulo={titulo} titulo={conAgente ? 'Tu agente está conectado' : 'Conecta tu agente'} sub="Tu socio piensa con el agente que ya pagas. Un clic y apruebas en tu navegador: nunca te pedimos copiar un código ni una llave." />
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <TarjetaAgente nombre="Claude Code" plan="Claude" a={estado.agentes.claude} conectando={conectando === 'claude'} sello={selloDe === 'claude'} principal={porDefecto === 'claude' || !conAgente} predeterminado={porDefecto === 'claude'} onConectar={() => void conectar('claude')} />
                  <TarjetaAgente nombre="Codex" plan="ChatGPT" a={estado.agentes.codex} conectando={conectando === 'codex'} sello={selloDe === 'codex'} principal={false} predeterminado={porDefecto === 'codex'} onConectar={() => void conectar('codex')} />
                </div>
                {!conAgente && <p className="mt-3 text-[12.5px] text-muted">¿No tienes Claude ni ChatGPT? Hay otras formas en Ajustes › Llaves (OpenRouter, con un clic).</p>}
                {conAgente && (
                  <div className="mt-6" data-como-trabaja>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Cómo trabaja tu socio</p>
                    <div className="grid gap-2.5">
                      <Casilla marcada={autonomo} onCambio={setAutonomo} icono={<Sparkles className="size-4" aria-hidden />} titulo="Que trabaje sin pedirte permiso en cada paso" etiqueta="Recomendado"
                        detalle="Más rápido. Nunca toca tu dinero ni tus contraseñas, no borra en masa y te enseña antes lo que vaya a muchas personas. Lo cambias cuando quieras." />
                      {autonomo
                        ? <div className="rounded-xl border border-brand/30 bg-brand/[0.05] p-3"><ConsentimientoAutonomia texto={TEXTO_AUTONOMIA_DEMO} marcadas={casillas} onMarcadas={setCasillas} /></div>
                        : <p className="px-1 text-[12.5px] leading-snug text-muted">Trabajará dentro de tu cerebro y te preguntará antes de lo que sale de tu computadora («Automático en mi carpeta»).</p>}
                      <Casilla marcada={pantalla} onCambio={setPantalla} icono={<MousePointerClick className="size-4" aria-hidden />} titulo="Que también use tu pantalla"
                        detalle="Abre tus apps y hace clic por ti con su propio cursor. Lo que vea en tu pantalla se le manda al modelo. Lo apagas cuando quieras." />
                    </div>
                  </div>
                )}
              </section>
            )}

            {paso === 'herramientas' && (
              <section data-paso="herramientas">
                <Encabezado refTitulo={titulo} titulo="Conecta tus herramientas" sub="Para que tu socio te arme el día y te diga quién te debe respuesta. Todo es opcional y se desconecta en Ajustes." />
                <div className="grid gap-2.5">
                  <TarjetaHerramienta icono={<CalendarDays className="size-5" aria-hidden />} nombre="Tu calendario" para="Arma tu día con tus llamadas y protege tus bloques de trabajo." con={e.cuenta ? `Con ${e.cuenta.email}` : 'Con tu cuenta de Google'} fase={herr.calendario} onConectar={() => conectarHerramienta('calendario')} />
                  <TarjetaHerramienta icono={<Mail className="size-5" aria-hidden />} nombre="Tu correo" para="Te dice quién te debe respuesta y te deja borradores. Nunca envía sin tu clic." con={e.cuenta ? `Con ${e.cuenta.email}` : 'Con tu cuenta de Google'} fase={herr.correo} onConectar={() => conectarHerramienta('correo')} />
                  <TarjetaHerramienta icono={<Github className="size-5" aria-hidden />} nombre="GitHub" etiqueta="Opcional" para="Un respaldo privado de tu cerebro, y tu cerebro también en tu servidor si algún día lo quieres." con="Gratis, con tu cuenta de GitHub" fase={herr.github} onConectar={() => conectarHerramienta('github')}>
                    {herr.github === 'esperando' && <CodigoGithub onListo={() => setHerr(x => ({ ...x, github: 'listo' }))} onCancelar={() => setHerr(x => ({ ...x, github: 'libre' }))} quieto={url.escena === 'github'} />}
                  </TarjetaHerramienta>
                </div>
              </section>
            )}

            {paso === 'negocio' && (
              <section data-paso="negocio">
                <Encabezado refTitulo={titulo} titulo="Trae tu negocio" sub="Tu socio lee lo que ya trabajaste y arma tu expediente y tu meta. Se lee aquí, en tu computadora; tus originales no se tocan." />
                {importando ? (
                  <div className="rounded-2xl border border-border-subtle bg-surface/70 p-5" role="status">
                    <p className="text-[14px] font-semibold">Armando tu expediente…</p>
                    <p className="mt-1 text-[13px] text-muted">Leyendo {importando.hechas} de {importando.total}. Puedes cerrar esta pantalla: sigue solo y te aviso al terminar.</p>
                    <div className={`${v.barra} mt-4`}><span style={{ width: `${Math.round((importando.hechas / Math.max(1, importando.total)) * 100)}%` }} /></div>
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    {hallazgos && hallazgos.chats.claude + hallazgos.chats.codex > 0 && (
                      <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4" data-traer-chats>
                        <p className="text-[14.5px] leading-[2.1]">Traer mis conversaciones de
                          {hallazgos.chats.claude > 0 && <button type="button" className={v.chip} aria-pressed={traer.claude} onClick={() => setTraer(t => ({ ...t, claude: !t.claude }))}>Claude Code</button>}
                          {hallazgos.chats.claude > 0 && hallazgos.chats.codex > 0 && 'y'}
                          {hallazgos.chats.codex > 0 && <button type="button" className={v.chip} aria-pressed={traer.codex} onClick={() => setTraer(t => ({ ...t, codex: !t.codex }))}>Codex</button>}
                          de los últimos {hallazgos.chats.dias} días</p>
                        <p className="mt-1 text-[12.5px] text-muted">{hallazgos.chats.claude} de Claude Code y {hallazgos.chats.codex} de Codex, en {hallazgos.chats.proyectos} proyectos. Solo pasa a tu agente lo que dejes marcado.</p>
                      </div>
                    )}
                    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
                      <p className="text-[14px] font-semibold">Una carpeta de tu negocio</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">Propuestas, tu oferta, tus números: lo que explique cómo trabajas.</p>
                      <ul className="mt-3 grid gap-1.5">
                        {(hallazgos?.carpetas ?? []).map(c => {
                          const dentro = carpetas.has(c.nombre)
                          return (
                            <li key={c.nombre} className="flex min-h-11 items-center gap-3 rounded-xl bg-foreground/[0.03] px-3">
                              <FolderOpen className="size-4 shrink-0 text-muted" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.nombre} <span className="text-muted">· {c.hace}</span></span>
                              <button type="button" onClick={() => setCarpetas(x => { const n = new Set(x); if (dentro) n.delete(c.nombre); else n.add(c.nombre); return n })}
                                className={`min-h-9 rounded-lg px-3 text-[12.5px] font-semibold ${dentro ? 'text-brand-ink' : 'text-foreground/80 hover:bg-foreground/[0.06]'}`}>{dentro ? <span className="inline-flex items-center gap-1"><Check className="size-3.5" aria-hidden /> Agregada</span> : 'Agregar'}</button>
                            </li>
                          )
                        })}
                      </ul>
                      <button type="button" className="mt-2 min-h-10 rounded-lg px-2 text-[13px] font-semibold text-brand-ink hover:bg-foreground/[0.05]">Elegir otra carpeta…</button>
                    </div>
                    <label className="block rounded-2xl border border-border-subtle bg-surface/70 p-4">
                      <span className="text-[14px] font-semibold">O cuéntamelo</span>
                      <textarea value={cuento} onChange={x => setCuento(x.target.value)} rows={2} maxLength={1200} placeholder="Qué vendes, a quién y cuánto quieres ganar al mes. Tres frases bastan."
                        className="input-field mt-2 w-full resize-none text-[13.5px] leading-relaxed" />
                    </label>
                  </div>
                )}
              </section>
            )}

            {aviso && <p role="alert" className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">{aviso}</p>}

            <div className="mt-auto flex items-center justify-between gap-3 pt-7">
              {i > 0 && !importando
                ? <button type="button" onClick={() => ir(PASOS_V2[i - 1])} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-foreground/[0.06] hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Atrás</button>
                : <span />}
              {!importando && (
                <div className="flex flex-col items-end gap-1.5">
                  <button type="button" onClick={continuar} disabled={!accion.habilitada} title={accion.porque} className={`${s.tecla}${accion.discreta ? ` ${s.discreta}` : ''}`} data-accion-principal>
                    {accion.texto} <ArrowRight className="size-4" aria-hidden />
                  </button>
                  {accion.porque && <p className="text-[12px] text-muted">{accion.porque}</p>}
                </div>
              )}
            </div>
          </main>
        </div>
        <p className="relative mt-4 text-center text-[12px] text-muted">Todo esto se puede cambiar después en Ajustes</p>
      </div>
    </div>
  )
}

function Encabezado({ titulo, sub, refTitulo }: { titulo: string; sub: string; refTitulo: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="mb-6 max-w-[600px]">
      <h1 ref={refTitulo} tabIndex={-1} className="text-[26px] font-semibold tracking-tight outline-none sm:text-[30px]">{titulo}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{sub}</p>
    </header>
  )
}

function TarjetaAgente({ nombre, plan, a, conectando, sello, principal, predeterminado, onConectar }: {
  nombre: string; plan: string; a: { instalado: boolean; conectado: boolean; plan?: string | null }; conectando: boolean; sello: boolean; principal: boolean; predeterminado: boolean; onConectar: () => void
}) {
  const detalle = a.conectado
    ? `Conectado${a.plan ? ` con tu plan ${nombrePlan(a.plan)}` : ''}`
    : a.instalado ? `Encontrado en esta computadora${a.plan ? ` · plan ${nombrePlan(a.plan)}` : ''}` : `Usa tu plan de ${plan}`
  return (
    <div data-agente={nombre} className={`flex flex-col gap-3 rounded-2xl border p-4 ${a.conectado ? 'border-[rgba(var(--gold-rgb),0.45)] bg-[rgba(var(--gold-rgb),0.05)]' : 'border-border-subtle bg-surface/70'}`}>
      <div className="flex items-start gap-3">
        {a.conectado && sello
          ? <span className={v.sello} aria-hidden><Check className="size-5" strokeWidth={3} /></span>
          : <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold ${a.conectado ? 'bg-[rgba(var(--gold-rgb),0.16)] text-[var(--l-ambar-1,#ffe3bd)]' : 'bg-foreground/[0.06] text-foreground/80'}`} aria-hidden>{a.conectado ? <Check className="size-5" /> : nombre.charAt(0)}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-semibold">{nombre}{predeterminado && <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">Principal</span>}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{detalle}</span>
        </span>
      </div>
      {!a.conectado && (
        conectando
          ? <p className="flex min-h-10 items-center gap-2 text-[12.5px] text-muted" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> Aprueba en tu navegador. Esto se actualiza solo.</p>
          : <button type="button" onClick={onConectar} className={principal ? 'btn-primary min-h-10 rounded-xl px-4 text-[13.5px] font-semibold' : 'min-h-10 rounded-xl border border-foreground/15 px-4 text-[13.5px] font-semibold hover:bg-foreground/[0.05]'}>Conectar</button>
      )}
    </div>
  )
}

function Casilla({ marcada, onCambio, icono, titulo, detalle, etiqueta }: { marcada: boolean; onCambio: (b: boolean) => void; icono: React.ReactNode; titulo: string; detalle: string; etiqueta?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-3.5">
      <input type="checkbox" checked={marcada} onChange={x => onCambio(x.target.checked)} className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground/90">{icono}{titulo}{etiqueta && <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">{etiqueta}</span>}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{detalle}</span>
      </span>
    </label>
  )
}

function TarjetaHerramienta({ icono, nombre, para, con, fase, etiqueta, onConectar, children }: { icono: React.ReactNode; nombre: string; para: string; con: string; fase: Fase; etiqueta?: string; onConectar: () => void; children?: React.ReactNode }) {
  return (
    <div data-herramienta={nombre} className={`rounded-2xl border p-4 ${fase === 'listo' ? 'border-[rgba(var(--gold-rgb),0.4)] bg-[rgba(var(--gold-rgb),0.04)]' : 'border-border-subtle bg-surface/70'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-foreground/85">{icono}</span>
        <span className="min-w-[180px] flex-1">
          <span className="flex items-center gap-2 text-[14.5px] font-semibold">{nombre}{etiqueta && <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-medium text-muted">{etiqueta}</span>}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{para}</span>
          <span className="mt-0.5 block text-[11.5px] text-muted/80">{con}</span>
        </span>
        {fase === 'listo'
          ? <span className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] font-semibold text-[var(--l-ambar-1,#ffe3bd)]"><Check className="size-4" aria-hidden /> Conectado</span>
          : fase === 'esperando' && nombre !== 'GitHub'
            ? <span className="inline-flex min-h-10 items-center gap-2 px-2 text-[12.5px] text-muted" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> Esperando tu navegador…</span>
            : fase === 'libre' && <button type="button" onClick={onConectar} className="min-h-10 rounded-xl border border-foreground/15 px-4 text-[13.5px] font-semibold hover:bg-foreground/[0.05]">Conectar</button>}
      </div>
      {children}
    </div>
  )
}

/** El código de GitHub (flujo de dispositivo): se copia solo, GitHub se abre en 4 s y la pantalla avanza sola. */
function CodigoGithub({ onListo, onCancelar, quieto }: { onListo: () => void; onCancelar: () => void; quieto: boolean }) {
  const [cuenta, setCuenta] = useState(4)
  useEffect(() => {
    if (quieto) return
    if (cuenta <= 0) { const t = window.setTimeout(onListo, 1600); return () => window.clearTimeout(t) }
    const t = window.setTimeout(() => setCuenta(c => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cuenta, onListo, quieto])
  const codigo = 'WDJB-MJHT'
  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-background/40 p-4" data-codigo-github>
      <p className="text-[13px] font-semibold">Tu código de GitHub</p>
      <div className={`${v.codigo} mt-2`} aria-label={`Código ${codigo}`}>
        {codigo.split('').map((c, k) => <span key={k} className={c === '-' ? v.guion : ''}>{c}</span>)}
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted"><Check className="size-3.5 text-[var(--l-ambar-1,#ffe3bd)]" aria-hidden /> Copiado a tu portapapeles · <button type="button" className="inline-flex min-h-8 items-center rounded-md px-1.5 font-semibold text-brand-ink hover:bg-foreground/[0.05]">Copiar otra vez</button></p>
      <p className="mt-1 text-[12.5px] text-muted">{cuenta > 0 ? `Abriendo GitHub en ${cuenta}…` : 'En GitHub: pega con ⌘V y pulsa Authorize. Esta pantalla sigue sola.'}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setCuenta(0)} className="min-h-9 rounded-lg px-3 text-[12.5px] font-semibold text-brand-ink hover:bg-foreground/[0.05]">Abrir ahora</button>
        <button type="button" onClick={onCancelar} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-[12.5px] text-muted hover:bg-foreground/[0.05]"><X className="size-3.5" aria-hidden /> Cancelar</button>
      </div>
    </div>
  )
}

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
