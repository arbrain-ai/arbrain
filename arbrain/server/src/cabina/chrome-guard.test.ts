import { describe, it, expect, beforeEach } from 'vitest'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { createHash } from 'node:crypto'
import { sitioSensible, pasos, esAccion, pareceBorrar, decidir, registrarMensajeDeDaniel, aprenderDeRespuesta, chromeHooks, claveConversacion, _reiniciarGuardian, PERMISO_MS, CHROME_PREFIX } from './chrome-guard.js'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'

const C = claveConversacion({ owner: 'daniel', account: 'default', conversationId: 'conv-1' })
const click = (tabId: number, resumen = 'Opens the Filters menu') => ({ name: 'computer', input: { action: 'left_click', coordinate: [1, 2], tabId, action_summary: resumen } })

beforeEach(() => _reiniciarGuardian())

describe('sitios sensibles', () => {
  it('reconoce cobros, bancos, correo, DNS y bases', () => {
    expect(sitioSensible('https://polar.sh/dashboard/mi-organizacion')?.sitio).toBe('Polar')
    expect(sitioSensible('dashboard.stripe.com/payments')?.tipo).toBe('cobros')
    expect(sitioSensible('https://whop.com/hub')?.sitio).toBe('Whop')
    expect(sitioSensible('https://www.paypal.com/myaccount')?.sitio).toBe('PayPal')
    expect(sitioSensible('https://www.bbva.mx/personas')?.tipo).toBe('banco')
    expect(sitioSensible('https://mail.google.com/mail/u/0/#inbox')?.sitio).toBe('Gmail')
    expect(sitioSensible('https://dash.cloudflare.com/abc/dns')?.sitio).toBe('Cloudflare')
    expect(sitioSensible('https://ap.www.namecheap.com/domains')?.sitio).toBe('Namecheap')
    expect(sitioSensible('https://supabase.com/dashboard/project/x')?.sitio).toBe('Supabase')
  })
  it('no marca sitios comunes ni engaños de dominio', () => {
    expect(sitioSensible('https://ejemplo.org')).toBeNull()
    expect(sitioSensible('https://www.youtube.com/watch?v=1')).toBeNull()
    expect(sitioSensible('https://docs.google.com/document/d/1')).toBeNull()
    expect(sitioSensible('https://polar.sh.evil.com')).toBeNull()
    expect(sitioSensible('https://notstripe.com')).toBeNull()
  })
})

describe('clasificación de herramientas', () => {
  it('leer y navegar no son acciones; clic, teclear, JS y formularios sí', () => {
    expect(esAccion({ name: 'navigate', input: { url: 'https://polar.sh' } })).toBe(false)
    expect(esAccion({ name: 'read_page', input: {} })).toBe(false)
    expect(esAccion({ name: 'computer', input: { action: 'screenshot' } })).toBe(false)
    expect(esAccion({ name: 'computer', input: { action: 'scroll' } })).toBe(false)
    expect(esAccion(click(1))).toBe(true)
    expect(esAccion({ name: 'computer', input: { action: 'type', text: 'hola' } })).toBe(true)
    expect(esAccion({ name: 'javascript_tool', input: { text: '1' } })).toBe(true)
    expect(esAccion({ name: 'form_input', input: { value: 'x' } })).toBe(true)
    expect(esAccion({ name: 'navigate', input: { url: 'javascript:alert(1)' } })).toBe(true)
  })
  it('abre browser_batch en sus pasos', () => {
    const p = pasos(`${CHROME_PREFIX}browser_batch`, { actions: [{ name: 'navigate', input: { url: 'x.com', tabId: 1 } }, click(1)] })
    expect(p.map(x => x.name)).toEqual(['navigate', 'computer'])
  })
  it('detecta borrar por el resumen declarado o un fetch DELETE', () => {
    expect(pareceBorrar(click(1, 'Deletes the selected video'))).toBe(true)
    expect(pareceBorrar(click(1, 'Elimina la fila 3'))).toBe(true)
    expect(pareceBorrar(click(1, 'Moves the email to Trash'))).toBe(true)
    expect(pareceBorrar({ name: 'javascript_tool', input: { text: "await fetch('/api/x', { method: 'DELETE' })" } })).toBe(true)
    expect(pareceBorrar(click(1, 'Opens the Filters menu'))).toBe(false)
    expect(pareceBorrar({ name: 'computer', input: { action: 'type', text: 'borrar esto' } })).toBe(false)
  })
})

describe('decidir y el «sí» de Daniel', () => {
  it('permite actuar en un sitio no sensible con URL conocida', () => {
    expect(decidir(C, { name: 'navigate', input: { url: 'https://ejemplo.org', tabId: 7 } }).permitir).toBe(true)
    expect(decidir(C, click(7)).permitir).toBe(true)
  })
  it('detiene una acción en Polar hasta el sí, y el sí vale solo para Polar y por tiempo corto', () => {
    const t0 = 1_000_000
    decidir(C, { name: 'navigate', input: { url: 'https://polar.sh/dashboard', tabId: 3 } }, t0)
    const d = decidir(C, click(3, 'Clicks Refund'), t0)
    expect(d.permitir).toBe(false)
    if (!d.permitir) expect(d.motivo).toMatch(new RegExp(`sí de ${DUENO}`))
    // Otra conversación no hereda nada
    const otra = claveConversacion({ owner: 'daniel', account: 'default', conversationId: 'conv-2' })
    expect(registrarMensajeDeDaniel(otra, 'sí', t0 + 1)).toEqual([])
    expect(registrarMensajeDeDaniel(C, 'Sí, dale', t0 + 1000)).toEqual(['sitio:Polar'])
    expect(decidir(C, click(3, 'Clicks Refund'), t0 + 2000).permitir).toBe(true)
    // Stripe sigue pidiendo
    decidir(C, { name: 'navigate', input: { url: 'https://dashboard.stripe.com', tabId: 4 } }, t0 + 3000)
    expect(decidir(C, click(4), t0 + 3000).permitir).toBe(false)
    // Vence
    expect(decidir(C, click(3), t0 + 1000 + PERMISO_MS + 1).permitir).toBe(false)
  })
  it('cualquier respuesta que no sea un sí descarta lo pendiente', () => {
    decidir(C, { name: 'navigate', input: { url: 'https://mail.google.com', tabId: 5 } })
    expect(decidir(C, click(5, 'Sends the reply')).permitir).toBe(false)
    expect(registrarMensajeDeDaniel(C, 'no, espera, primero revisa el texto')).toEqual([])
    expect(registrarMensajeDeDaniel(C, 'sí')).toEqual([]) // ya no hay pendiente
    expect(decidir(C, click(5, 'Sends the reply')).permitir).toBe(false)
  })
  it('borrar pide permiso en cualquier sitio', () => {
    decidir(C, { name: 'navigate', input: { url: 'https://studio.youtube.com', tabId: 6 } })
    const d = decidir(C, click(6, 'Deletes the draft video'))
    expect(d.permitir).toBe(false)
    if (!d.permitir) expect(d.clave).toBe('borrar:studio.youtube.com')
  })
  it('sin URL confiable pide confirmar la pestaña antes de actuar', () => {
    const d = decidir(C, click(9))
    expect(d.permitir).toBe(false)
    if (!d.permitir) { expect(d.clave).toBe(''); expect(d.motivo).toMatch(/tabs_context_mcp/) }
  })
  it('aprende la URL de la respuesta de la extensión y la invalida tras una acción muda', () => {
    aprenderDeRespuesta(C, 'tabs_context_mcp', {}, [{ type: 'text', text: JSON.stringify({ availableTabs: [{ tabId: 11, title: 'Polar', url: 'https://polar.sh/dashboard' }] }) }])
    expect(decidir(C, click(11)).permitir).toBe(false) // ya sabe que es Polar
    aprenderDeRespuesta(C, 'tabs_context_mcp', {}, 'Tab Context:\n- tabId 12: "Arbrain" (https://ejemplo.org/)')
    expect(decidir(C, click(12)).permitir).toBe(true)
    aprenderDeRespuesta(C, 'computer', click(12).input, 'Clicked at (1, 2)')
    expect(decidir(C, click(12)).permitir).toBe(false) // la página pudo cambiar
  })
})

describe('hooks del SDK', () => {
  const pre = (tool_name: string, tool_input: unknown) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 't', session_id: 's', transcript_path: '', cwd: '' }) as unknown as HookInput
  it('niega en el PreToolUse y deja pasar herramientas que no son de Chrome', async () => {
    const h = chromeHooks(C).PreToolUse[0].hooks[0]
    const ok = await h(pre('Bash', { command: 'ls' }), 't', { signal: new AbortController().signal })
    expect(ok).toEqual({ continue: true })
    await h(pre(`${CHROME_PREFIX}navigate`, { url: 'https://supabase.com/dashboard', tabId: 2 }), 't', { signal: new AbortController().signal })
    const no = await h(pre(`${CHROME_PREFIX}computer`, click(2, 'Runs the SQL query').input), 't', { signal: new AbortController().signal }) as { hookSpecificOutput?: { permissionDecision?: string } }
    expect(no.hookSpecificOutput?.permissionDecision).toBe('deny')
  })
  it('la firma del pool no cambia entre turnos (las funciones no se serializan)', () => {
    const firma = (h: unknown) => createHash('sha256').update(JSON.stringify(h)).digest('hex')
    expect(firma(chromeHooks(C))).toBe(firma(chromeHooks(C)))
  })
})
