'use client'
/**
 * MODO COCHE: hablar con Arbrain sin tocar el micrófono, con un Orbe a pantalla completa (o un mini flotante en la
 * computadora). Es un complemento del chat: lo que se escribe no cambia.
 *
 * Una pantalla de vidrio encima del MISMO chat. Lo que dices se transcribe (la misma ruta del micrófono del chat, con tu
 * llave de Groq) y se manda al chat como si lo hubieras dictado, con una nota invisible («[Modo coche]») para que el
 * agente conteste breve y para el oído. Al terminar su turno, la respuesta suena dentro del Orbe (voz-coche.ts, con tu
 * llave de LemonFox o la voz del aparato) y el Orbe vuelve a escucharte.
 *
 * El flujo:
 *   - Abre EN PAUSA: no escucha hasta que tocas el Orbe.
 *   - Escuchando: 3 s de silencio = terminaste (una barrita se llena mientras callas); «cambio», «dale», «terminé»,
 *     «adelante» o «te toca» al final envían al instante; «pausa», «paremos», «terminamos» pausan. Una tos no se manda.
 *   - Procesando · N s: el micrófono queda cerrado mientras el agente trabaja. Luego habla, con subtítulos, y al
 *     terminar suena un tilín y vuelve a escucharte.
 *   - Toques en el Orbe: en pausa → escucha · escuchando → pausa (lo que ibas diciendo se BORRA, para empezar de nuevo)
 *     · procesando → te escucha para agregarle algo (va a la fila del chat; el agente no se frena) · hablando → lo
 *     calla y te escucha. Solo la ✕ sale.
 *   - «…bueno, terminamos» manda lo de antes y queda en pausa cuando responde. El micrófono se pide una sola vez por
 *     sesión (pausar lo silencia, no lo suelta: el iPhone no vuelve a preguntar).
 *   - Pantalla despierta (Wake Lock + video mudo de respaldo).
 * El MINI (solo en la computadora): «Achicar» o Esc lo vuelven un orbe flotante que se arrastra, se agranda desde la
 * esquina y recuerda su lugar; un halo translúcido se enciende y respira con el micrófono abierto. Sigue oyendo y
 * hablando con la ventana tapada, y se pausa solo tras 2 min sin oírte o si escribes en el chat (con un tono que baja).
 * Los colores del Orbe los escoge cada quien (botón de la paleta; orbe/paletas.ts).
 * FLUIDO o POR TURNOS (interruptor arriba, o la pastilla del mini; se recuerda en `turnos.ts`). Fluido es lo de arriba.
 * Por turnos, para trabajar tranquilo sin una conversación abierta: tocas → escucha; tocas otra vez → se manda (si se te
 * olvida, se manda solo a los 6 s de silencio, para que el micrófono nunca quede abierto); la respuesta suena y el Orbe
 * queda en pausa con el micrófono SUELTO hasta el próximo toque (tampoco hay micrófono tomado mientras trabaja o habla).
 * Seguridad: se esconde con `localStorage['arbrain-modo-coche'] = 'no'`; cualquier error de esta pantalla la cierra y
 * deja el chat como siempre (nada del chat depende de ella).
 */
import { Component, useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, Palette, Sun, X } from 'lucide-react'
import { usePendientes } from '@/features/permisos/lib/pendientes'
import type { ChatMessage } from '@/features/chat/hooks/useChat'
import { notaDelModo, ultimaRespuesta } from './respuesta'
import { guardarModo, leerModo, type ModoTurno } from './turnos'
import { SILENCIO_MS, SILENCIO_TURNOS_MS } from './vad'
import { callarVoz, decirEnCoche, desbloquearVoz, ponerOyenteVoz, reintentarVoz, vozOcupada } from './voz-coche'
import { iniciarVozCelular } from './voz-celular'
import { anotar, vaciar } from './bitacora'
import { conColchon } from './colchon'
import type { EstadoOrbe } from './orbe/motor'
import { guardarPaleta, paletaGuardada, PALETAS, siguientePaleta } from './orbe/paletas'
import { Oido, type Grabacion } from './oido'
import { acomodar, esEscritorio, guardarLugar, guardarVista, leerLugar, leerVista, type LugarMini, type Vista } from './mini'
import { Orbe } from './Orbe'
import { decidir, esRuido, type Decision } from './palabras'
import { PantallaDespierta } from './pantalla-despierta'
import { partirParaVoz } from './partir-voz'
import { SubtitulosDeFrase, type Subtitulo } from './subtitulos'
import { tocarTilin } from './tilin'
import { tocarTonoPausa } from './tono-pausa'
import s from './modo-coche.module.css'

const CLAVE = 'arbrain-modo-coche'
/** Lo que espera el micrófono después de la última frase (la cola de las bocinas). */
const VUELVE_MS = 250
/** El agente terminó (turno cerrado y sin voz por decir) durante este tiempo: tu turno. */
const QUIETA_MS = 1200
/** El tilín empieza 30 ms después de pedirlo y la bocina agrega su retraso: el detector lo ignora con esta holgura. */
const TILIN_HOLGURA_MS = 80
/** Si el turno nunca se ve empezar (algo raro), a este tiempo se vuelve a escuchar. */
const SIN_TURNO_MS = 6000
/** El colchón de silencio dentro de cada frase (Bluetooth del coche). */
const COLCHON_MS = 200
/** En la computadora: tanto tiempo escuchando sin oírte y se pausa solo (una llamada, alguien hablando al lado). */
const INACTIVO_MS = 2 * 60_000
/** El borde del mini que ocupa el anillo. */
const BORDE_MINI = 10
type Fase = 'pausa' | 'abriendo' | 'escucha' | 'anotando' | 'procesando' | 'habla' | 'sin-mic'

/** ¿Se muestra el botón? En el celular, el iPad y la computadora, si el navegador sabe grabar y no lo escondiste. */
function useDisponible(): boolean {
  const [si, setSi] = useState(false)
  useEffect(() => {
    let escondido = false
    try { escondido = localStorage.getItem(CLAVE) === 'no' } catch { /* modo privado */ }
    setSi(!escondido && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  }, [])
  return si
}

/** Las variables de color del CSS (`--orbe-principal`, `--orbe-acento`) con la paleta escogida. */
function coloresCss(id: string): Record<string, string> {
  const p = PALETAS.find(x => x.id === id) ?? paletaGuardada()
  return { '--orbe-principal': p.principal[1].join(' '), '--orbe-acento': p.acento[1].join(' ') }
}

/** Un error de la pantalla del coche la cierra: el chat sigue como siempre. */
class Resguardo extends Component<{ alFallar: () => void; children: ReactNode }, { roto: boolean }> {
  state = { roto: false }
  static getDerivedStateFromError() { return { roto: true } }
  componentDidCatch(e: unknown) { console.warn('[modo-coche] se cerró por un error', e); this.props.alFallar() }
  render() { return this.state.roto ? null : this.props.children }
}

export function BotonModoCoche({ trabajando, enviar, mensajes }: {
  trabajando: boolean
  enviar: (texto: string, nota: string) => void
  /** Los mensajes del chat: al terminar el turno, la última respuesta suena en el Orbe. */
  mensajes: readonly Pick<ChatMessage, 'id' | 'role' | 'content'>[]
}) {
  const disponible = useDisponible()
  const [abierto, setAbierto] = useState(false)
  // La voz al celular (SFlow 2.3): el celular avisa que lo estás usando, aunque el Orbe esté cerrado.
  useEffect(() => { iniciarVozCelular() }, [])
  const ctxRef = useRef<AudioContext | null>(null)
  const despiertaRef = useRef<PantallaDespierta | null>(null)
  const [despierta, setDespierta] = useState(false)

  const abrir = useCallback(() => {
    // Dentro del toque (iOS lo exige): el contexto de audio, el audio de la voz y la pantalla despierta.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx && (!ctxRef.current || ctxRef.current.state === 'closed')) ctxRef.current = new Ctx()
      void ctxRef.current?.resume().catch(() => {})
    } catch { ctxRef.current = null }
    if (!ctxRef.current) return
    desbloquearVoz()
    despiertaRef.current ??= new PantallaDespierta(setDespierta)
    despiertaRef.current.encender()
    setAbierto(true)
  }, [])
  const cerrar = useCallback(() => {
    despiertaRef.current?.apagar()
    setAbierto(false)
  }, [])

  if (!disponible) return null
  return (
    <>
      <button type="button" onClick={abrir} aria-label="Modo coche: hablar con Arbrain sin tocar el micrófono" title="Modo coche" className={s.boton}
        style={coloresCss(paletaGuardada().id)}>
        <span className={s.miniOrbe} aria-hidden />
      </button>
      {abierto && ctxRef.current && createPortal(
        <Resguardo alFallar={cerrar}>
          <PantallaCoche ctx={ctxRef.current} trabajando={trabajando} enviar={enviar} cerrar={cerrar} mensajes={mensajes}
            despierta={despierta} renovarDespierta={() => { void despiertaRef.current?.renovar() }} />
        </Resguardo>,
        document.body,
      )}
    </>
  )
}

function PantallaCoche({ ctx, trabajando, enviar, cerrar, despierta, renovarDespierta, mensajes }: {
  ctx: AudioContext; trabajando: boolean; enviar: (t: string, nota: string) => void; cerrar: () => void
  mensajes: readonly Pick<ChatMessage, 'id' | 'role' | 'content'>[]
  despierta: boolean; renovarDespierta: () => void
}) {
  const [fase, setFase] = useState<Fase>('pausa')
  const [medida, setMedida] = useState({ tuVoz: false, avance: 0, ahora: 0 })
  const [aviso, setAviso] = useState<string | null>(null)
  const [subtitulo, setSubtitulo] = useState<Subtitulo | null>(null)
  const [tamano, setTamano] = useState(0)
  const { pendientes, apps } = usePendientes()
  const tarjetas = pendientes.length + apps.length
  // El mini (solo en la computadora): la vista y el lugar se recuerdan.
  const escritorio = useRef(esEscritorio()).current
  const [vista, setVista] = useState<Vista>(() => (escritorio ? leerVista() : 'completa'))
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const [lugar, setLugar] = useState<LugarMini>(() => leerLugar())
  const lugarRef = useRef(lugar)
  lugarRef.current = lugar
  const escuchaDesdeRef = useRef(0)
  // Fluido o por turnos: se recuerda en este navegador.
  const [modo, setModo] = useState<ModoTurno>(() => leerModo())
  const modoRef = useRef(modo)
  modoRef.current = modo
  const ultimaVozRef = useRef(0)

  const oidoRef = useRef<Oido | null>(null)
  const faseRef = useRef<Fase>('pausa')
  const pausadoRef = useRef(true)
  /** Sube con cada toque que cancela y con cada mensaje enviado: lo que llegue tarde de antes se ignora. */
  const epocaRef = useRef(0)
  const enviadoEnRef = useRef(0)
  const vioTrabajandoRef = useRef(false)
  const quietaDesdeRef = useRef(0)
  const trabajandoRef = useRef(trabajando)
  trabajandoRef.current = trabajando
  const enviarRef = useRef(enviar)
  const mensajesRef = useRef(mensajes)
  mensajesRef.current = mensajes
  /** Tras enviar: la respuesta que había antes (para no repetirla) y si todavía falta decir la nueva. */
  const respuestaAntesRef = useRef<string | null>(null)
  const esperaRespuestaRef = useRef(false)
  const [paleta, setPaleta] = useState(() => paletaGuardada().id)
  enviarRef.current = enviar
  const cerrarRef = useRef(cerrar)
  cerrarRef.current = cerrar
  const pausaSolaRef = useRef<(m: 'inactivo' | 'escribes') => void>(() => {})
  const renovarRef = useRef(renovarDespierta)
  renovarRef.current = renovarDespierta
  const fraseRef = useRef(new SubtitulosDeFrase())
  const previoRef = useRef('')
  const hablaDesde = useRef(0)
  const relojes = useRef(new Set<ReturnType<typeof setTimeout>>())
  const avisoRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ponerFase = (f: Fase) => {
    if (f !== faseRef.current) {
      anotar({ ev: 'fase', fase: f, de: faseRef.current })
      if (f === 'escucha') escuchaDesdeRef.current = performance.now()
    }
    faseRef.current = f
    setFase(f)
    // Por turnos: fuera de tu turno el micrófono se suelta del todo (no solo se silencia).
    if (modoRef.current === 'turnos' && (f === 'pausa' || f === 'procesando' || f === 'habla')) {
      const oido = oidoRef.current
      if (oido?.tomado) { oido.soltar(); anotar({ ev: 'mic-suelto', fase: f }) }
    }
  }
  const despues = (fn: () => void, ms: number) => {
    const t = setTimeout(() => { relojes.current.delete(t); fn() }, ms)
    relojes.current.add(t)
  }

  const avisar = useCallback((texto: string, ms = 3500) => {
    setAviso(texto)
    if (avisoRef.current) clearTimeout(avisoRef.current)
    avisoRef.current = setTimeout(() => setAviso(null), ms)
  }, [])

  const cambiarVista = useCallback((v: Vista) => {
    setVista(v)
    guardarVista(v)
    anotar({ ev: 'vista', vista: v, fase: faseRef.current })
  }, [])

  // El tamaño del Orbe sigue a la pantalla (gira el celular en el soporte y se acomoda); el mini no se sale de la ventana.
  useEffect(() => {
    const medir = () => {
      setTamano(Math.round(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.56, 560)))
      setLugar(l => acomodar(l, window.innerWidth, window.innerHeight))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  /**
   * Tu turno: micrófono y, cuando YA graba, el tilín. Antes era al revés (tilín, 500 ms y recién ahí el micrófono; por
   * turnos, además, el sistema tardaba en darlo) y lo primero que decías al oír el tilín se perdía (de 0,3 a 1 s). Ahora
   * el tilín quiere decir «ya te estoy grabando»; el detector no lo toma por tu voz (`ignorar`). El micrófono se pide
   * aquí mismo, dentro del toque (iOS).
   */
  const escuchar = useCallback(() => {
    const oido = oidoRef.current
    if (!oido) return
    pausadoRef.current = false
    oido.silencioMs = modoRef.current === 'turnos' ? SILENCIO_TURNOS_MS : SILENCIO_MS
    ponerFase('abriendo')
    const epoca = epocaRef.current
    void oido.reanudar().then(grabando => {
      // Aunque haya tardado (el iPhone pidió permiso y lo diste después), si sigue siendo tu turno, ya te escucha.
      if (!grabando || epoca !== epocaRef.current || (faseRef.current !== 'abriendo' && faseRef.current !== 'sin-mic')) return
      let espera = 0
      try { espera = tocarTilin(ctx) } catch { /* sin tilín */ }
      oido.ignorar(espera ? espera + TILIN_HOLGURA_MS : 0)
      anotar({ ev: 'tilin', ms: oido.grabandoHace() })
      ponerFase('escucha')
    })
    despues(() => {
      if (epoca === epocaRef.current && faseRef.current === 'abriendo' && !oido.escuchando)
        avisar('Si el iPhone te pide el micrófono, toca «Permitir». Sigo esperando.', 12_000)
    }, 4000)
  }, [ctx, avisar])

  /** Pausa: micrófono cerrado; lo que ibas diciendo se tira. */
  const pausar = useCallback(() => {
    pausadoRef.current = true
    epocaRef.current++
    oidoRef.current?.pausar()
    ponerFase('pausa')
  }, [])

  /** En la computadora: se pausa solo (2 min sin oírte, o escribes en el chat), con un tono que baja. */
  const pausaSola = useCallback((motivo: 'inactivo' | 'escribes') => {
    pausar()
    tocarTonoPausa(ctx)
    anotar({ ev: 'pausa-sola', de: motivo })
    avisar(motivo === 'inactivo' ? 'En pausa: 2 minutos sin oírte. Toca el Orbe para seguir.'
      : 'En pausa mientras escribes. Toca el Orbe para seguir.', 6000)
  }, [ctx, pausar, avisar])

  pausaSolaRef.current = pausaSola

  /** Después de un mensaje, de la voz o de un error: tu turno, salvo que lo hayas pausado. */
  const siguienteTurno = useCallback(() => {
    // Por turnos nada vuelve a escuchar solo: tras la respuesta (o un error) queda en pausa hasta tu toque.
    if (modoRef.current === 'turnos') pausadoRef.current = true
    anotar({ ev: 'siguiente-turno', de: pausadoRef.current ? 'pausa' : 'escucha' })
    if (pausadoRef.current) { ponerFase('pausa'); return }
    escuchar()
  }, [escuchar])

  const actuar = useCallback((d: Decision) => {
    anotar({ ev: 'decision', de: d.accion, n: d.texto.length })
    epocaRef.current++
    if (d.accion === 'pausar') { pausar(); avisar('En pausa. Toca el Orbe para seguir.'); return }
    if ((d.accion !== 'enviar' && d.accion !== 'enviar-y-pausar') || !d.texto) return
    const aLaFila = trabajandoRef.current
    respuestaAntesRef.current = ultimaRespuesta(mensajesRef.current)?.id ?? null
    esperaRespuestaRef.current = true
    enviarRef.current(d.texto, notaDelModo(modoRef.current))
    enviadoEnRef.current = performance.now()
    vioTrabajandoRef.current = false
    quietaDesdeRef.current = 0
    // «…bueno, terminamos»: el agente responde y después el Orbe queda en pausa (no vuelve a escuchar solo).
    // Por turnos, siempre: responde y el Orbe queda en pausa hasta el próximo toque.
    if (d.accion === 'enviar-y-pausar' || modoRef.current === 'turnos') pausadoRef.current = true
    ponerFase('procesando')
    avisar(d.accion === 'enviar-y-pausar' ? 'Enviado. Cuando te responda, queda en pausa.'
      : aLaFila ? 'A la fila del chat: lo lee al terminar (o toca «Enviar ya»)' : 'Enviado', aLaFila ? 5000 : 3000)
  }, [pausar, avisar])

  // Lo que dijiste → texto. `final`: tras el silencio largo; si no, la mirada adelantada de una pausa corta.
  const transcribir = useCallback(async (g: Grabacion, final: boolean, pausa = 0) => {
    const epoca = epocaRef.current
    const oido = oidoRef.current
    if (final) { oido?.pausar(); ponerFase('anotando') }
    let texto = ''
    try {
      const form = new FormData()
      form.append('audio', g.audio, g.nombre)
      const r = await fetch('/api/chat/transcribe', { method: 'POST', body: form })
      const j = await r.json().catch(() => null) as { text?: string; error?: string } | null
      if (!r.ok) {
        if (final && epoca === epocaRef.current) { avisar(j?.error ? `No te pude transcribir: ${j.error}` : 'No te pude transcribir. Repítelo, por favor.', 5000); siguienteTurno() }
        return
      }
      texto = j?.text?.trim() ?? ''
    } catch {
      if (final && epoca === epocaRef.current) { avisar('Sin conexión con tu Arbrain. Repítelo en un momento.', 5000); siguienteTurno() }
      return
    } finally {
      reintentarVoz() // si la voz esperaba a que terminaras, ya puede hablar
    }
    if (epoca !== epocaRef.current) return // lo cancelaste con un toque, o ya se mandó
    if (!final) {
      if (!oido?.sigueLaPausa(pausa) || esRuido(texto)) return
      const d = decidir(texto, false)
      if (d.accion === 'seguir') return
      oido.pausar()
      actuar(d)
      return
    }
    if (esRuido(texto)) { avisar('Solo oí ruido; no lo mandé.'); siguienteTurno(); return }
    actuar(decidir(texto, true))
  }, [actuar, avisar, siguienteTurno])

  // Abrir: el oído y la voz conectados. Empieza en pausa.
  useEffect(() => {
    let vivo = true
    const oido = new Oido(ctx, {
      alTerminar: g => { void transcribir(g, true) },
      alMirarAdelante: (g, pausa) => { void transcribir(g, false, pausa) },
      alEmpezarDeNuevo: () => {
        reintentarVoz()
        // Por turnos: si tocaste y no se oyó nada (o solo un ruido), no se queda escuchando: vuelve a la pausa.
        if (vivo && modoRef.current === 'turnos' && faseRef.current === 'escucha') {
          anotar({ ev: 'sin-voz-turnos' })
          epocaRef.current++
          pausar()
          avisar('No te oí. En pausa: toca el Orbe para hablar.', 5000)
        }
      },
      alVacio: () => { if (vivo) { avisar('No alcancé a oírte; no mandé nada.'); siguienteTurno() } },
      alFallar: motivo => { if (vivo) { anotar({ ev: 'sin-mic' }); ponerFase('sin-mic'); avisar(`${motivo} Toca el Orbe para intentar otra vez.`, 8000) } },
    })
    oidoRef.current = oido

    ponerOyenteVoz({
      puedeHablar: () => !oido.hablaVista,
      antesDeHablar: texto => {
        oido.pausar()
        hablaDesde.current = performance.now()
        ponerFase('habla')
        const sub = fraseRef.current.empezar(texto, previoRef.current)
        previoRef.current = sub.actual
        setSubtitulo(sub)
      },
      alAvanzar: avance => {
        const sub = fraseRef.current.en(avance)
        if (sub) { previoRef.current = sub.actual; setSubtitulo(sub) }
      },
      alTerminar: () => {
        anotar({ ev: 'voz-termino', fase: faseRef.current })
        despues(() => {
          if (!vivo || vozOcupada() || faseRef.current !== 'habla') return
          if (pausadoRef.current) { ponerFase('pausa'); return }
          quietaDesdeRef.current = 0
          ponerFase('procesando') // si el agente ya terminó su turno, en un momento vuelve tu turno
        }, VUELVE_MS)
      },
      colchon: (audio, tipo) => conColchon(audio, tipo, COLCHON_MS),
      partir: partirParaVoz,
    })

    anotar({ ev: 'abrir', vista: vistaRef.current })
    let escuchabaAlOcultar = false
    const alCambiarVista = () => {
      anotar({ ev: document.visibilityState === 'visible' ? 'visible' : 'oculta', fase: faseRef.current })
      if (escritorio) {
        // La computadora sí deja oír y hablar con la ventana tapada: no se pausa (las guardias de 2 min siguen).
        if (document.visibilityState === 'visible') void ctx.resume().catch(() => {})
        return
      }
      if (document.visibilityState === 'visible') {
        void ctx.resume().catch(() => {})
        renovarRef.current()
        oido.reanclar()
        if (escuchabaAlOcultar && !pausadoRef.current && modoRef.current !== 'turnos' && !vozOcupada()) escuchar()
        escuchabaAlOcultar = false
      } else if (faseRef.current === 'escucha' || faseRef.current === 'abriendo') {
        escuchabaAlOcultar = true // iOS no deja grabar en segundo plano: se suelta limpio y vuelve al regresar
        epocaRef.current++
        oido.pausar()
        ponerFase('pausa')
      }
    }
    document.addEventListener('visibilitychange', alCambiarVista)
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!escritorio) cerrarRef.current()
        else if (vistaRef.current === 'completa') cambiarVista('mini') // en la computadora, Esc achica; salir es la ✕
        return
      }
      // Escribes en el chat con el micrófono abierto: se pausa solo (lo que tecleas no es para el Orbe).
      if (!escritorio || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      if (faseRef.current !== 'escucha' && faseRef.current !== 'abriendo') return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) pausaSolaRef.current('escribes')
    }
    window.addEventListener('keydown', alTecla, true)
    const relojesVivos = relojes.current

    return () => {
      vivo = false
      epocaRef.current++
      oido.cerrar()
      oidoRef.current = null
      ponerOyenteVoz(null)
      reintentarVoz() // lo que hubiera quedado esperando suena con la voz de siempre
      relojesVivos.forEach(clearTimeout)
      relojesVivos.clear()
      if (avisoRef.current) clearTimeout(avisoRef.current)
      document.removeEventListener('visibilitychange', alCambiarVista)
      window.removeEventListener('keydown', alTecla, true)
      anotar({ ev: 'cerrar', fase: faseRef.current })
      vaciar()
    }
  }, [ctx, transcribir, avisar, escuchar, escritorio, cambiarVista, pausar, siguienteTurno])

  // Cada 120 ms: tu voz, la barrita del silencio, los segundos de «Procesando» y si ya es tu turno.
  useEffect(() => {
    const t = setInterval(() => {
      const ahora = performance.now()
      const oido = oidoRef.current
      const tuVoz = oido?.hablandoAhora() ?? false
      setMedida({ tuVoz, avance: oido?.avanceSilencio() ?? 0, ahora })
      if (trabajandoRef.current) vioTrabajandoRef.current = true
      // El turno terminó: la respuesta nueva suena en el Orbe (una sola vez por mensaje enviado).
      if (esperaRespuestaRef.current && !trabajandoRef.current
        && (vioTrabajandoRef.current || ahora - enviadoEnRef.current > SIN_TURNO_MS)) {
        esperaRespuestaRef.current = false
        const r = ultimaRespuesta(mensajesRef.current)
        if (r && r.id !== respuestaAntesRef.current && r.texto.trim()) {
          anotar({ ev: 'respuesta', n: r.texto.length })
          quietaDesdeRef.current = 0
          decirEnCoche(r.texto)
          return
        }
      }
      if (escritorio && faseRef.current === 'escucha') {
        if (tuVoz) ultimaVozRef.current = ahora
        if (ahora - Math.max(ultimaVozRef.current, escuchaDesdeRef.current) > INACTIVO_MS) pausaSolaRef.current('inactivo')
        return
      }
      if (faseRef.current !== 'procesando') return
      if (trabajandoRef.current) { vioTrabajandoRef.current = true; quietaDesdeRef.current = 0; return }
      if (vozOcupada()) { quietaDesdeRef.current = 0; return }
      if (!vioTrabajandoRef.current && ahora - enviadoEnRef.current < SIN_TURNO_MS) return
      if (!quietaDesdeRef.current) quietaDesdeRef.current = ahora
      else if (ahora - quietaDesdeRef.current > QUIETA_MS) { quietaDesdeRef.current = 0; setSubtitulo(null); siguienteTurno() }
    }, 120)
    return () => clearInterval(t)
  }, [siguienteTurno, escritorio])

  const tocarOrbe = () => {
    const f = faseRef.current
    anotar({ ev: 'toque', fase: f, vista: vistaRef.current })
    if (f === 'pausa' || f === 'sin-mic') { escuchar(); return }
    // Tocar mientras el agente piensa o habla es «quiero decirle algo»: se calla la voz (si hablaba) y te
    // escucha. El agente NUNCA se frena: lo que digas entra al chat como cuando escribes mientras trabaja (a la fila, con
    // «Enviar ya» y el Stop del chat a la mano). Para pausar: otro toque mientras te escucha, o «terminamos».
    if (f === 'habla') { callarVoz(); setSubtitulo(null); escuchar(); return }
    if (f === 'procesando') { escuchar(); return }
    if (modoRef.current === 'turnos') {
      // Por turnos, el segundo toque MANDA lo que dijiste.
      if (f === 'anotando') { avisar('Ya lo estoy anotando.'); return }
      if (f === 'escucha' && oidoRef.current?.entregarYa()) { anotar({ ev: 'toque-envia' }); ponerFase('anotando'); return }
      pausar() // tocaste sin haber hablado: nada que mandar
      return
    }
    const borro = (f === 'escucha' && !!oidoRef.current?.hablaVista) || f === 'anotando'
    pausar()
    if (borro) avisar('Borrado. Toca el Orbe para empezar de nuevo.')
  }

  /** El botón de la paleta: pasa a los siguientes colores y los recuerda en este navegador. */
  const cambiarPaleta = () => {
    const id = siguientePaleta(paleta)
    guardarPaleta(id)
    setPaleta(id)
    avisar(`Colores: ${paletaGuardada().nombre}`, 2000)
  }
  const colores = coloresCss(paleta)

  const segundos = Math.max(0, Math.floor((medida.ahora - enviadoEnRef.current) / 1000))
  const orbe: EstadoOrbe = fase === 'habla' ? 'hablando'
    : fase === 'sin-mic' ? 'error'
    : fase === 'escucha' ? 'escucha'
    : fase === 'anotando' || fase === 'procesando' || (fase === 'pausa' && trabajando) ? 'pensando'
    : 'reposo'
  const estado = fase === 'pausa' ? 'En pausa'
    : fase === 'abriendo' ? 'Abriendo el micrófono…'
    : fase === 'escucha' ? 'Escuchando'
    : fase === 'anotando' ? 'Anotando lo que dijiste…'
    : fase === 'procesando' ? `Procesando · ${segundos} s`
    : fase === 'habla' ? 'Hablando'
    : 'Sin micrófono'
  const turnos = modo === 'turnos'
  const pista = fase === 'pausa' ? (trabajando ? 'Sigue trabajando y te habla al terminar. Toca el Orbe para hablar.'
      : turnos ? 'Por turnos: toca el Orbe cuando quieras hablar.' : 'Toca el Orbe para hablar.')
    : fase === 'escucha' ? (turnos ? 'Habla con calma. Toca el Orbe para enviar.' : 'Habla con calma. Di «cambio» para enviar ya, o «pausa».')
    : fase === 'procesando' ? 'Trabajando. Toca el Orbe si quieres agregarle algo.'
    : fase === 'habla' ? 'Toca el Orbe para callarlo y hablar.'
    : fase === 'sin-mic' ? 'Toca el Orbe para intentar otra vez.'
    : ''
  const etiquetaOrbe = fase === 'pausa' || fase === 'sin-mic' ? 'Hablar' : fase === 'habla' ? 'Callar la voz y hablar'
    : fase === 'procesando' ? 'Agregar algo' : turnos && fase === 'escucha' ? 'Enviar' : 'Pausar'

  /** El interruptor Fluido / Por turnos. Cambiar a mitad de una escucha no la corta: vale desde lo siguiente. */
  const cambiarModo = useCallback((m: ModoTurno) => {
    if (m === modoRef.current) return
    modoRef.current = m
    setModo(m)
    guardarModo(m)
    const f = faseRef.current
    anotar({ ev: 'modo', de: m, fase: f })
    if (m === 'turnos') {
      pausadoRef.current = true // lo que esté en curso termina en pausa
      if (f !== 'abriendo' && f !== 'escucha' && f !== 'anotando' && oidoRef.current?.tomado) oidoRef.current.soltar()
      avisar('Por turnos: después de cada respuesta queda en pausa hasta que lo toques.', 4500)
    } else {
      if (f === 'procesando' || f === 'habla') pausadoRef.current = false // responde y vuelve a escucharte solo
      avisar('Fluido: después de cada respuesta te vuelve a escuchar solo.', 4500)
    }
  }, [avisar])

  const nivel = useCallback(() => {
    if (faseRef.current === 'habla') {
      const t = (performance.now() - hablaDesde.current) / 1000
      return 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3)) * (0.6 + 0.4 * Math.sin(t * 2.1))
    }
    return oidoRef.current?.nivel ?? 0
  }, [])

  // ── El mini: se arrastra desde el Orbe (un clic sin arrastrar es un toque) y se agranda desde la esquina. ──
  const arrastre = useRef<{ x0: number; y0: number; l: LugarMini; tamano: boolean; movio: boolean } | null>(null)
  const movioRef = useRef(false)
  const empezar = (tamanoDesdeEsquina: boolean) => (e: EventoPuntero<HTMLElement>) => {
    if (e.button !== 0) return
    if (tamanoDesdeEsquina) e.stopPropagation()
    arrastre.current = { x0: e.clientX, y0: e.clientY, l: lugarRef.current, tamano: tamanoDesdeEsquina, movio: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sin captura */ }
  }
  const mover = (e: EventoPuntero<HTMLElement>) => {
    const a = arrastre.current
    if (!a) return
    const dx = e.clientX - a.x0, dy = e.clientY - a.y0
    if (!a.movio && Math.hypot(dx, dy) < 4) return
    a.movio = true
    const l = a.tamano ? { ...a.l, lado: a.l.lado + Math.max(dx, dy) } : { ...a.l, x: a.l.x + dx, y: a.l.y + dy }
    setLugar(acomodar(l, window.innerWidth, window.innerHeight))
  }
  const soltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a?.movio) return
    movioRef.current = !a.tamano
    guardarLugar(lugarRef.current)
    anotar({ ev: a.tamano ? 'mini-tamano' : 'mini-mover', n: lugarRef.current.lado })
  }
  const clicMini = () => {
    if (movioRef.current) { movioRef.current = false; return } // fue un arrastre, no un toque
    tocarOrbe()
  }
  const etiquetaArriba = typeof window !== 'undefined' && lugar.y + lugar.lado + 44 > window.innerHeight

  if (escritorio && vista === 'mini') return (
    <div className={s.mini} role="dialog" aria-modal="false" aria-label="Modo coche (mini)" data-fase={fase}
      data-arriba={etiquetaArriba ? '' : undefined}
      style={{ ...colores, left: lugar.x, top: lugar.y, width: lugar.lado, height: lugar.lado }}>
      <button type="button" className={s.orbeMini} onClick={clicMini}
        onPointerDown={empezar(false)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        aria-label={etiquetaOrbe}
        title="Toca para hablar o pausar · arrastra para moverlo">
        <span className={s.anillo} aria-hidden />
        <Orbe estado={medida.tuVoz && fase === 'escucha' ? 'escucha' : orbe} tamano={lugar.lado - 2 * BORDE_MINI} nivel={nivel} />
      </button>
      <button type="button" className={s.modoMini} data-modo={modo} onClick={() => cambiarModo(turnos ? 'fluido' : 'turnos')}
        aria-label={turnos ? 'Modo por turnos (toca para cambiar a fluido)' : 'Modo fluido (toca para cambiar a por turnos)'}
        title={turnos ? 'Por turnos: queda en pausa tras cada respuesta. Clic: fluido' : 'Fluido: vuelve a escuchar solo. Clic: por turnos'}>
        {turnos ? 'Turnos' : 'Fluido'}
      </button>
      <div className={s.controles}>
        <button type="button" className={s.control} onClick={() => cambiarVista('completa')} aria-label="Agrandar a pantalla completa" title="Pantalla completa">
          <Maximize2 size={12} />
        </button>
        <button type="button" className={s.control} onClick={cambiarPaleta} aria-label="Cambiar los colores del Orbe" title="Colores del Orbe">
          <Palette size={12} />
        </button>
        <button type="button" className={s.control} onClick={cerrar} aria-label="Salir del modo coche" title="Salir del modo coche">
          <X size={12} />
        </button>
      </div>
      <div className={s.barraMini} aria-hidden style={{ opacity: fase === 'escucha' && medida.avance > 0 ? 1 : 0 }}>
        <div className={s.relleno} style={{ transform: `scaleX(${fase === 'escucha' ? medida.avance : 0})` }} />
      </div>
      <span className={s.esquina} aria-hidden onPointerDown={empezar(true)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} />
      <div className={s.etiqueta} aria-live="polite" style={aviso ? { opacity: 0 } : undefined}>{estado}</div>
      {aviso && <div key={aviso} className={s.avisoMini}>{aviso}</div>}
    </div>
  )

  return (
    <div className={s.pantalla} role="dialog" aria-modal="true" aria-label="Modo coche" data-fase={fase} style={colores}>
      <button type="button" onClick={cerrar} className={s.cerrar} aria-label="Salir del modo coche"><X size={22} /></button>
      {escritorio && (
        <button type="button" onClick={() => cambiarVista('mini')} className={s.achicar} aria-label="Achicar a mini" title="Achicar (Esc)">
          <Minimize2 size={20} />
        </button>
      )}
      <div className={s.modos} role="group" aria-label="Cómo conversa el Orbe">
        <button type="button" className={s.modo} aria-pressed={!turnos} onClick={() => cambiarModo('fluido')}>Fluido</button>
        <button type="button" className={s.modo} aria-pressed={turnos} onClick={() => cambiarModo('turnos')}>Por turnos</button>
      </div>
      <div className={s.arriba}>
        <div className={s.estado} aria-live="polite"><span className={s.punto} aria-hidden />{estado}</div>
        {pista && <div className={s.pista}>{pista}</div>}
        <div className={s.barra} aria-hidden style={{ opacity: fase === 'escucha' && medida.avance > 0 ? 1 : 0 }}>
          <div className={s.relleno} style={{ transform: `scaleX(${fase === 'escucha' ? medida.avance : 0})` }} />
        </div>
      </div>
      <button type="button" onClick={tocarOrbe} className={s.orbe}
        aria-label={etiquetaOrbe}>
        <span className={s.marco}>
          <span className={s.anillo} aria-hidden />
          <Orbe estado={medida.tuVoz && fase === 'escucha' ? 'escucha' : orbe} tamano={tamano} nivel={nivel} />
        </span>
      </button>
      <div className={s.abajo}>
        {subtitulo && fase === 'habla' ? (
          <div className={s.subtitulos} aria-live="off">
            {subtitulo.anterior && <div className={s.anterior}>{subtitulo.anterior}</div>}
            <div key={subtitulo.actual} className={s.actual}>{subtitulo.actual}</div>
          </div>
        ) : null}
        {tarjetas > 0 && <div className={s.tarjeta}>{tarjetas === 1 ? 'Te espera una tarjeta' : `Te esperan ${tarjetas} tarjetas`} en el chat: para cuando llegues</div>}
        {aviso && <div key={aviso} className={s.aviso}>{aviso}</div>}
      </div>
      <button type="button" onClick={cambiarPaleta} className={s.paleta} aria-label="Cambiar los colores del Orbe" title="Colores del Orbe">
        <Palette size={18} />
      </button>
      {despierta && <div className={s.despierta}><Sun size={13} aria-hidden /> Pantalla despierta</div>}
    </div>
  )
}
