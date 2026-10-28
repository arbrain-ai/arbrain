'use client'

import { CLAVE_TEMA, CLAVE_TEMA_HASTA, finDelTramo, temaAhora, temaGuardadoVigente } from '@/shared/lib/tema-por-hora'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'
/** Estilo de la interfaz (27 oct 2026): el de hoy o el lenguaje unificado nacido del botón de enviar. Eje aparte del tema. */
export type Estilo = 'actual' | 'unificado'

interface ThemeContextValue {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  cycleTheme: () => void
  toggleTheme: () => void
  estilo: Estilo
  setEstilo: (estilo: Estilo) => void
  toggleEstilo: () => void
}

const STORAGE_KEY = CLAVE_TEMA
const ThemeContext = createContext<ThemeContextValue | null>(null)

/** «Automático» = por hora de México (claro 06–19, oscuro 19–06), ya no el esquema del sistema. */
function getAutoTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return temaAhora()
}

/**
 * Claro/oscuro guardado a mano vale hasta el siguiente cambio de tramo (06:00 o 19:00); después, o sin fecha de
 * caducidad (lo guardado antes del 4 oct 2026, que dejaba la app en claro de noche para siempre), automático.
 */
function leerGuardado(): ThemeMode {
  try {
    return temaGuardadoVigente(window.localStorage.getItem(STORAGE_KEY), window.localStorage.getItem(CLAVE_TEMA_HASTA), Date.now())
  } catch { return 'auto' }
}

function guardar(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
    if (theme === 'auto') window.localStorage.removeItem(CLAVE_TEMA_HASTA)
    else window.localStorage.setItem(CLAVE_TEMA_HASTA, String(finDelTramo()))
  } catch { /* sin storage: vale para esta sesión */ }
}

/** Color de la barra de estado/pestaña (PWA, Safari): el del tema RESUELTO, no el del sistema. Mismo par que layout.tsx. */
export const COLOR_BARRA = { light: '#fafafa', dark: '#09090b' } as const

// Detecta runtime Tauri sin import estático (mismo patrón que isDesktopRuntime en
// lib/local-first/runtime.ts) para no arrastrar glue de Tauri al bundle web/PWA.
function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

// La titlebar nativa de macOS (decorations:true, sin titleBarStyle) sigue el theme
// de NSApp, NO el .dark del <html>. Sin esto se queda con el valor viejo aunque la
// app cambie de modo. El comando IPC `plugin:window|set_theme` es el que
// getCurrentWindow().setTheme invoca por dentro (voltea NSApp.appearance). La
// ventana tiene label "main".
//
// CLAVE (fix del titlebar "un paso atrás", 21 jul 2026): se invoca por el bridge
// GLOBAL `window.__TAURI_INTERNALS__.invoke`, que SIEMPRE está inyectado en el
// webview de Tauri, en vez de `import('@tauri-apps/api/core')`. El import dinámico
// carga un chunk que en el build standalone resolvía de forma intermitente (el de
// /window directamente no cargaba); cuando fallaba, el `.catch` se tragaba el
// set_theme y el titlebar se quedaba con el tema anterior → parecía invertido/
// rezagado al alternar. El bridge global no carga chunk: la llamada nunca se cae.
function syncNativeTitlebarTheme(resolved: 'light' | 'dark'): void {
  if (!isDesktopRuntime()) return
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> }
  }).__TAURI_INTERNALS__
  const invoke = internals?.invoke
  if (typeof invoke !== 'function') return
  // Vía principal: comando propio `tema_nativo` (fija el tema de TODAS las ventanas y la apariencia de cada
  // NSWindow, y repinta la barra). Respaldo: set_theme del plugin de ventana (solo NSApp).
  const respaldo = (err: unknown) => {
    console.warn('[tema] tema_nativo falló, uso plugin:window|set_theme', err)
    try { void invoke('plugin:window|set_theme', { label: 'main', value: resolved }).catch(() => {}) } catch { /* inerte */ }
  }
  try { void invoke('tema_nativo', { tema: resolved }).catch(respaldo) } catch (err) { respaldo(err) }
}

// ── Un solo tema para todas las ventanas (25 oct 2026, Daniel: «el atajo "t" debería aplicar el cambio de tema a toda
// la app aun si está en 2 pantallas»). La verdad es localStorage (CLAVE_TEMA); la ventana que cambia el tema lo
// anuncia y las demás lo aplican al instante, sin recargar. Tres vías porque ninguna llega sola a todas: el evento
// `storage` (otras pestañas del navegador), BroadcastChannel (mismo origen, incluso con storage aislado) y, en el
// escritorio, un evento de Tauri (ventanas nativas `vista-ventana-N`, que pueden vivir en otro proceso web).
const CANAL_TEMA = 'arbrain-tema'
const yoTema = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())
type AvisoTema = { theme: ThemeMode; de: string }
let canalTema: BroadcastChannel | null = null

function esTema(v: unknown): v is ThemeMode { return v === 'light' || v === 'dark' || v === 'auto' }

// ── Estilo (27 oct 2026, Daniel: probar el lenguaje unificado sin perder el de hoy). Misma vía que el tema: localStorage
// es la verdad, el aviso viaja por el canal propio y por `storage`. No caduca: lo que elige se queda hasta que lo cambie.
export const CLAVE_ESTILO = 'arbrain-estilo'
const CANAL_ESTILO = 'arbrain-estilo'
let canalEstilo: BroadcastChannel | null = null
function leerEstilo(): Estilo {
  try { return window.localStorage.getItem(CLAVE_ESTILO) === 'unificado' ? 'unificado' : 'actual' } catch { return 'actual' }
}
function aplicarEstilo(estilo: Estilo): void {
  if (typeof document === 'undefined') return
  if (estilo === 'unificado') document.documentElement.dataset.estilo = 'unificado'
  else delete document.documentElement.dataset.estilo
}
function anunciarEstilo(estilo: Estilo): void {
  try {
    if (!canalEstilo && 'BroadcastChannel' in window) canalEstilo = new BroadcastChannel(CANAL_ESTILO)
    canalEstilo?.postMessage({ estilo, de: yoTema })
  } catch { /* canal cerrado */ }
  if (isDesktopRuntime()) void import('@tauri-apps/api/event').then(({ emit }) => emit(CANAL_ESTILO, { estilo, de: yoTema })).catch(() => {})
}
function escucharEstilo(alCambiar: (estilo: Estilo) => void): () => void {
  const recibir = (a: unknown) => {
    const aviso = a as { estilo?: unknown; de?: string } | null
    if (aviso && aviso.de !== yoTema && (aviso.estilo === 'actual' || aviso.estilo === 'unificado')) alCambiar(aviso.estilo)
  }
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CANAL_ESTILO) : null
  if (bc) bc.onmessage = e => recibir(e.data)
  const alGuardar = (e: StorageEvent) => { if (e.key === CLAVE_ESTILO) alCambiar(e.newValue === 'unificado' ? 'unificado' : 'actual') }
  window.addEventListener('storage', alGuardar)
  let soltarTauri: (() => void) | null = null
  let vivo = true
  if (isDesktopRuntime()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen(CANAL_ESTILO, e => recibir(e.payload)))
      .then(u => { if (vivo) soltarTauri = u; else u() })
      .catch(() => {})
  }
  return () => { vivo = false; bc?.close(); window.removeEventListener('storage', alGuardar); soltarTauri?.() }
}

function anunciarTema(theme: ThemeMode): void {
  if (typeof window === 'undefined') return
  const aviso: AvisoTema = { theme, de: yoTema }
  try {
    if (!canalTema && 'BroadcastChannel' in window) canalTema = new BroadcastChannel(CANAL_TEMA)
    canalTema?.postMessage(aviso)
  } catch { /* canal cerrado */ }
  if (isDesktopRuntime()) void import('@tauri-apps/api/event').then(({ emit }) => emit(CANAL_TEMA, aviso)).catch(() => {})
}

function escucharTema(alCambiar: (theme: ThemeMode) => void): () => void {
  const recibir = (a: unknown) => {
    const aviso = a as Partial<AvisoTema> | null
    if (aviso && aviso.de !== yoTema && esTema(aviso.theme)) alCambiar(aviso.theme)
  }
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CANAL_TEMA) : null
  if (bc) bc.onmessage = e => recibir(e.data)
  const alGuardar = (e: StorageEvent) => { if (e.key === STORAGE_KEY && esTema(e.newValue)) alCambiar(e.newValue) }
  window.addEventListener('storage', alGuardar)
  let soltarTauri: (() => void) | null = null
  let vivo = true
  if (isDesktopRuntime()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen<AvisoTema>(CANAL_TEMA, e => recibir(e.payload)))
      .then(u => { if (vivo) soltarTauri = u; else u() })
      .catch(() => {})
  }
  return () => { vivo = false; bc?.close(); window.removeEventListener('storage', alGuardar); soltarTauri?.() }
}

function applyTheme(theme: ThemeMode, nativo = true): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark'
  const resolved = theme === 'auto' ? getAutoTheme() : theme
  const root = document.documentElement

  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', COLOR_BARRA[resolved]))
  // La barra nativa de TODAS las ventanas la fija quien cambió el tema (tema_nativo); las que solo reciben el aviso no repiten.
  if (nativo) syncNativeTitlebarTheme(resolved)

  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('auto')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark')
  const [estilo, setEstiloState] = useState<Estilo>('actual')

  useEffect(() => {
    const e = leerEstilo()
    setEstiloState(e)
    aplicarEstilo(e)
    return escucharEstilo(siguiente => { setEstiloState(siguiente); aplicarEstilo(siguiente) })
  }, [])

  const setEstilo = useCallback((siguiente: Estilo) => {
    try { window.localStorage.setItem(CLAVE_ESTILO, siguiente) } catch { /* sin storage: vale para esta sesión */ }
    setEstiloState(siguiente)
    aplicarEstilo(siguiente)
    anunciarEstilo(siguiente)
  }, [])
  const toggleEstilo = useCallback(() => setEstilo(estilo === 'unificado' ? 'actual' : 'unificado'), [estilo, setEstilo])

  useEffect(() => {
    const nextTheme = leerGuardado()

    setThemeState(nextTheme)
    setResolvedTheme(applyTheme(nextTheme))
  }, [])

  useEffect(() => {
    // En vivo: se revisa cada 20 s (y al volver a la ventana). En automático repinta si cruzó 06:00 o 19:00; con
    // claro/oscuro a mano, al caducar la elección vuelve a automático.
    const revisar = () => {
      if (theme !== 'auto') {
        if (leerGuardado() === 'auto') { guardar('auto'); setThemeState('auto'); setResolvedTheme(applyTheme('auto')) }
        return
      }
      setResolvedTheme(prev => { const t = getAutoTheme(); if (t !== prev) applyTheme('auto'); return t })
    }
    const id = window.setInterval(revisar, 20_000)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', revisar)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('focus', revisar) }
  }, [theme])

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    guardar(nextTheme)
    setThemeState(nextTheme)
    setResolvedTheme(applyTheme(nextTheme))
    anunciarTema(nextTheme)
  }, [])

  // Otra ventana cambió el tema: se aplica aquí igual (ya quedó guardado en el storage compartido).
  useEffect(() => escucharTema((nextTheme) => {
    setThemeState(nextTheme)
    setResolvedTheme(applyTheme(nextTheme, false))
  }), [])

  const cycleTheme = useCallback(() => {
    const nextTheme: ThemeMode = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    setTheme(nextTheme)
  }, [setTheme, theme])

  // Toggle binario dark<->light (atajo Cmd+Option+T y boton del sidebar). Volver al tema que toca a esta hora es
  // volver a automático; el contrario dura hasta el siguiente cambio de tramo.
  const toggleTheme = useCallback(() => {
    const siguiente = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(siguiente === getAutoTheme() ? 'auto' : siguiente)
  }, [resolvedTheme, setTheme])

  // Atajo global Cmd+Option+T. Gotcha Mac: Option+T produce el caracter '†', por
  // lo que e.key NO es 't' — hay que matchear contra e.code === 'KeyT'.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // El calendario usa T para «hoy» (10 oct 2026) y lo marca con preventDefault en captura: ahí no cambia el tema.
      if (e.defaultPrevented) return
      const target = document.activeElement as HTMLElement | null
      const editing = target?.isContentEditable || target?.closest('input,textarea,select,[role="textbox"]')
      const plainT = e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey && !editing && !e.isComposing
      // ⇧T (27 oct 2026): alterna el estilo (actual ↔ unificado); T sola sigue alternando claro/oscuro.
      if (plainT && e.shiftKey) {
        e.preventDefault()
        if (!e.repeat) toggleEstilo()
        return
      }
      if (((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyT') || plainT) {
        e.preventDefault()
        if (!e.repeat) toggleTheme()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleTheme, toggleEstilo])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme, toggleTheme, estilo, setEstilo, toggleEstilo }),
    [cycleTheme, resolvedTheme, setTheme, theme, toggleTheme, estilo, setEstilo, toggleEstilo]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}

const themeStorageKey = STORAGE_KEY
