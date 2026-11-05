/**
 * La ventana nativa de la pestaña propia (4 nov 2026). `web_abrir` crea una ventana de Chrome para la sesión; el freno
 * nativo no la conocía (sus ids son los del WindowServer, no los de Chrome) y un clic de `actuar` en ella salía como
 * «pestaña de Daniel»: el encargo de Skool se frenó dos veces así. Aquí se adopta: la ventana del navegador que apareció
 * durante `web_abrir` y cuyo título es el de la pestaña propia. Una ventana que Daniel abra a la vez no tiene ese título;
 * sin títulos (la casa no siempre los da) solo se adopta si apareció exactamente una.
 */
import type { Adaptador, Ventana } from '../contrato.js'
import { BUNDLES_NAVEGADOR } from '../freno.js'

const NOMBRES_NAVEGADOR = /^(google chrome( for testing| beta| canary)?|chromium|brave browser|microsoft edge|arc|vivaldi)$/i
const esDelNavegador = (w: Ventana) => NOMBRES_NAVEGADOR.test(w.app ?? '') || BUNDLES_NAVEGADOR.has((w.app ?? '').toLowerCase())

/** Ids de las ventanas del navegador que hay ahora (antes de abrir). Null si el adaptador no sabe listarlas. */
export async function ventanasDelNavegador(manos: Adaptador): Promise<Set<number> | null> {
  try { return new Set((await manos.ventanas()).filter(esDelNavegador).map(w => w.id)) } catch { return null }
}

/** La capa del freno (o la que sepa adoptar ventanas de la extensión) en la cadena de envoltorios. */
function adoptador(a: Adaptador): { adoptarWeb(id: number): void } | null {
  let x: any = a
  for (let i = 0; x && i < 8; i++, x = x.interno) if (typeof x.adoptarWeb === 'function') return x
  return null
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** ¿Este título de ventana es el de la pestaña? Chrome añade « - Google Chrome» y el nombre del perfil. */
export function mismoTitulo(ventana: string | undefined, pestana: string | undefined): boolean {
  if (!ventana || !pestana) return false
  const v = norm(ventana), p = norm(pestana)
  return v === p || v.startsWith(`${p} - `) || v.startsWith(`${p} – `)
}

/**
 * Tras `web_abrir`: adopta en el freno la ventana nueva del navegador que muestra la pestaña propia. Devuelve los ids
 * adoptados. Reintenta un poco: el WindowServer tarda en listar la ventana y Chrome en ponerle el título.
 */
export async function adoptarVentanaWeb(manos: Adaptador, antes: Set<number>, tituloPestana: string | undefined, op: { intentos?: number; esperaMs?: number } = {}): Promise<number[]> {
  const freno = adoptador(manos)
  if (!freno) return []
  for (let i = 0; i < (op.intentos ?? 4); i++) {
    let nuevas: Ventana[] = []
    // Chrome tiene ventanas auxiliares sin título (franjas de 30 px, burbujas de 64 px): solo cuenta una ventana de verdad.
    try { nuevas = (await manos.ventanas()).filter(w => esDelNavegador(w) && !antes.has(w.id) && (w.marco?.h ?? 0) > 150) } catch { return [] }
    const conTitulo = nuevas.filter(w => mismoTitulo(w.titulo, tituloPestana))
    const elegidas = conTitulo.length ? conTitulo : nuevas.length === 1 && !nuevas[0].titulo ? nuevas : []
    if (elegidas.length) { for (const w of elegidas) freno.adoptarWeb(w.id); return elegidas.map(w => w.id) }
    await new Promise(r => setTimeout(r, op.esperaMs ?? 150))
  }
  return []
}
