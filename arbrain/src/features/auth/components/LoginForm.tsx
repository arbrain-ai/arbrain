'use client'

// Entrar a Arbrain (5 oct 2026). Daniel desde la laptop: «justo después de dar Enter no hay animación de clic,
// ni hover, ni nada que parezca que realmente está buscando». Además, el `<form action>` de React 19 vaciaba
// los campos al terminar la acción: un error borraba lo escrito. Aquí el envío va por onSubmit (nada se resetea)
// y cada fase se ve (features/auth/entrada.ts):
//   · pulsar (clic o Enter): el botón se hunde un instante;
//   · entrando: la barra dorada avanza bajo el texto y el borde late (lo único vivo en la pantalla);
//   · lenta (5 s): lo dice y sigue intentando;
//   · adentro: la barra se completa, se dibuja la palomita y la tarjeta se retira hacia el chat;
//   · error: aparece qué pasó, el campo culpable se marca y conserva lo escrito.
// Movimiento de la casa (shared/movimiento); con «reducir movimiento» todo llega quieto y el texto cuenta la fase.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { login } from '@/actions/auth'
import { mov, escalon, Palomita, prefiereQuieto } from '@/shared/movimiento'
import { destinoSeguro, mensajeDeError, LENTA_MS, type FaseEntrada } from '../entrada'
import s from './entrada.module.css'

const ETIQUETA: Record<FaseEntrada, string> = {
  quieta: 'Entrar', error: 'Entrar', entrando: 'Verificando tu acceso', lenta: 'Sigo verificando', adentro: 'Adentro',
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fase, setFase] = useState<FaseEntrada>('quieta')
  const [error, setError] = useState<string | null>(null)
  const [culpable, setCulpable] = useState<'email' | 'password' | null>(null)
  const [verClave, setVerClave] = useState(false)
  const [mayusculas, setMayusculas] = useState(false)
  const [pulsado, setPulsado] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const claveRef = useRef<HTMLInputElement>(null)
  const relojes = useRef<number[]>([])
  const ocupada = fase === 'entrando' || fase === 'lenta' || fase === 'adentro'

  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      const m = mensajeDeError('unauthorized')
      setError(m.texto); setCulpable(m.campo); setFase('error')
    }
  }, [searchParams])
  useEffect(() => () => relojes.current.forEach(clearTimeout), [])

  const despues = (ms: number, fn: () => void) => { relojes.current.push(window.setTimeout(fn, ms)) }

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupada) return
    // El botón se hunde también con Enter, que no pasa por :active.
    setPulsado(true); despues(160, () => setPulsado(false))
    setFase('entrando'); setError(null); setCulpable(null)
    despues(LENTA_MS, () => setFase(f => (f === 'entrando' ? 'lenta' : f)))

    const datos = new FormData(e.currentTarget)
    datos.set('next', destinoSeguro(searchParams.get('next')))
    let resultado: Awaited<ReturnType<typeof login>>
    try {
      resultado = await login(datos)
    } catch (err) {
      resultado = { error: mensajeDeError(err instanceof Error ? err.message : String(err)).texto, campo: null }
    }
    relojes.current.forEach(clearTimeout); relojes.current = []

    if ('destino' in resultado) {
      const { destino } = resultado
      setFase('adentro')
      // Un respiro para que se lea la palomita antes de que la tarjeta se retire hacia el chat.
      despues(prefiereQuieto() ? 0 : 380, () => router.replace(destino))
      return
    }
    setError(resultado.error)
    setCulpable(resultado.campo ?? null)
    setFase('error')
    // Lo escrito se queda. El foco vuelve al campo culpable, seleccionado, para corregir de un tecleo.
    const campo = resultado.campo === 'email' ? emailRef.current : claveRef.current
    requestAnimationFrame(() => { campo?.focus(); campo?.select() })
  }

  const leerMayusculas = (e: KeyboardEvent<HTMLInputElement>) => setMayusculas(e.getModifierState?.('CapsLock') ?? false)
  const limpiar = (campo: 'email' | 'password') => { if (culpable === campo) setCulpable(null) }

  return (
    <form onSubmit={entrar} className={s.forma} data-fase={fase} aria-busy={ocupada || undefined}>
      <div className={`${s.campo} ${mov.entra}`} style={escalon(2)}>
        <label htmlFor="email">Correo</label>
        <input
          ref={emailRef} id="email" name="email" type="email" required autoComplete="username" inputMode="email"
          placeholder="tu@correo.com" readOnly={ocupada} aria-invalid={culpable === 'email' || undefined}
          onChange={() => limpiar('email')} className={`input-field ${s.entrada}`}
        />
      </div>

      <div className={`${s.campo} ${mov.entra}`} style={escalon(3)}>
        <label htmlFor="password">Contraseña</label>
        <div className={s.conBoton}>
          <input
            ref={claveRef} id="password" name="password" type={verClave ? 'text' : 'password'} required autoComplete="current-password"
            placeholder="••••••••" readOnly={ocupada} aria-invalid={culpable === 'password' || undefined}
            aria-describedby={mayusculas ? 'mayusculas' : undefined}
            onChange={() => limpiar('password')} onKeyDown={leerMayusculas} onKeyUp={leerMayusculas} onBlur={() => setMayusculas(false)}
            className={`input-field ${s.entrada}`}
          />
          <button
            type="button" className={s.ojo} onClick={() => setVerClave(v => !v)} tabIndex={-1}
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
          >
            {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {mayusculas && <p id="mayusculas" className={`${s.nota} ${mov.aparece}`}>Mayúsculas activadas</p>}
      </div>

      {error && (
        <p key={error} role="alert" className={`${s.error} ${mov.aparece}`}>{error}</p>
      )}

      <div className={`${s.envio} ${mov.entra}`} style={escalon(4)}>
        {/* El halo late solo mientras se busca: es lo único vivo en la pantalla. */}
        <span aria-hidden className={`${s.halo} ${fase === 'entrando' || fase === 'lenta' ? mov.late : ''}`} />
        <button
          type="submit" className={`btn-primary ${s.boton}`} data-pulsado={pulsado || undefined}
          data-hecha={fase === 'adentro' || undefined} aria-disabled={ocupada || undefined}
        >
          <span key={ETIQUETA[fase]} className={`${s.etiqueta} ${fase === 'quieta' ? '' : mov.aparece}`}>
            {fase === 'adentro' && <Palomita className={s.palomita} />}
            {ETIQUETA[fase]}
            {(fase === 'quieta' || fase === 'error') && <ArrowRight size={16} className={s.flecha} aria-hidden />}
          </span>
          <span aria-hidden className={s.barra} />
        </button>
      </div>

      <p className={s.estado} aria-live="polite">
        {fase === 'lenta' && <span className={mov.aparece}>La red va lenta. Sigo intentando; no hace falta volver a pulsar.</span>}
        {fase === 'adentro' && <span className={mov.aparece}>Abriendo tu chat…</span>}
      </p>

      <p className={`${s.olvido} ${mov.aparece}`} style={escalon(6)}>
        <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
      </p>
    </form>
  )
}
