'use client'
/**
 * Arrastrar una pestaña del panel (1 oct 2026), el gesto de las pestañas de Chrome o VS Code.
 * 3 oct 2026: arrastrarla DENTRO de la tira la reordena; las vecinas se apartan con una animación corta.
 * 5 oct 2026 (Daniel: «lo que quiero es poderla arrastrar a las otras pestañas»): soltarla sobre OTRA ventana
 * (la principal o una aparte) la inserta en esa tira, donde cayó, y esa ventana le abre hueco mientras se
 * arrastra encima; soltarla donde no hay ventana hace nacer una ventana Arbrain de tamaño completo con su
 * propia tira. La única pestaña de una ventana aparte arrastrada a un lugar vacío se lleva la ventana entera.
 *
 * Pointer events con captura: mientras el botón sigue apretado los eventos siguen llegando aunque el
 * cursor salga de la ventana (a otro monitor), y `screenX/screenY` dan el punto de pantalla. Al empezar,
 * cada ventana contesta dónde está y qué tira tiene (ventanas.ts, `pedirBlancos`). Un clic normal sigue
 * siendo clic: el arrastre solo empieza tras mover UMBRAL píxeles. Solo con puntero fino (en el teléfono
 * el panel es una hoja inferior y la pestaña no se arrastra).
 *
 * 5 oct 2026, el fantasma que cruza monitores (fantasma.ts): fuera de la ventana de origen (o sobre el chat)
 * la pestaña ya no se pierde en el borde. Una ventana nativa la sigue por toda la pantalla: la ventana que
 * nacería, translúcida, o solo la pestaña sobre otra ventana Arbrain, donde aterriza en el hueco al soltarla.
 * Dentro de la tira sigue el fantasma de la página (sin retraso, para reordenar).
 *
 * 6 oct 2026 (Daniel: «verlo como CapCut»): la pestaña tomada deja una ranura con su ancho real y las vecinas se
 * deslizan con resorte (también en la otra ventana: ventanas.ts/PanelDerecho.tsx); cerca de la ranura (RADIO_IMAN)
 * el fantasma se atrae y se alinea; al soltar vuela desde el cursor a su lugar (FLIP) y se asienta; Escape o soltar
 * en nada válido la regresa animada a su origen. Respeta prefers-reduced-motion (sin vuelo, solo el cambio).
 *
 * Geometría pura en arrastre-geom.ts; qué hace una ventana con la pestaña, en ventanas.ts.
 */
import type { PointerEvent as PunteroReact } from 'react'
import { dentroDeLaVentana, desplazamientos, blancoBajo, imanDeRanura, indiceDeInsercion, indiceEnBlanco, pasoElUmbral, puntoEnRect, ranuraEnBlanco, ranuraEnTira, rectEnPantalla, RESORTE_CSS, RESORTE_MS, type Blanco, type ModoFantasma, type Punto } from './arrastre-geom'
import { fantasmaDelArrastre, hayFantasma, prepararFantasma, type Fantasma } from './fantasma'
import { geometriaVentana, refrescarGeometria } from './geometria-ventana'
import { limitarIndice, PRINCIPAL } from './pestanas-fuera'
import { llevarA, moverVentanaA, pedirBlancos, publicar, puedeDesprender, sacarAVentanaNueva, tamanoNuevo, useVentanas } from './ventanas'
import { aFijo, zoomUI } from '@/shared/lib/zoom-ui'
import { colocar, dividida, igualesEstado, normalizar, rectDeClave, zonaDeDivision, VACIAS, type Cortes, type Destino, type EstadoDivision, type Ranura } from './division'

/** Dividir la ventana al soltar sobre su cuerpo (8 oct 2026, division.ts). `estado` = la división actual (null = sin dividir). */
export interface OpcionesDivision {
  estado: EstadoDivision | null; visible: string | null; tira: string[]; cortes: Cortes
  aplicar: (estado: EstadoDivision, clave: string) => void
  /** Clase de la sombra que dice dónde caerá (panel.module.css). */
  claseSombra: string
}

/** Lo que recibe quien reacciona a soltar o cancelar: hacer volar el fantasma de la página a una esquina (cliente). */
interface Vuelo {
  /** El fantasma de la página viaja a `esquina` con resorte y desaparece; resuelve al llegar. Sin fantasma o con movimiento reducido, resuelve ya. */
  volar: (esquina: Punto) => Promise<void>
  /** ¿Lo que se ve ahora es el fantasma de la página? (Si no, lo pinta la ventana nativa.) */
  paginaVisible: boolean
}

interface Opciones {
  /** Clase del «fantasma» que sigue al cursor (el estilo vive en panel.module.css). */
  claseFantasma: string
  /** ¿Soltar aquí abre una ventana nueva? (El fantasma cambia de cara: «aquí nace una ventana».) */
  nueva: (cliente: Punto, pantalla: Punto) => boolean
  /** Se llama solo si hubo arrastre de verdad (no para un clic) y el usuario soltó. */
  alSoltar: (fin: { cliente: Punto; pantalla: Punto } & Vuelo) => void
  /** Al pasar el umbral (antes del primer movimiento de arrastre). */
  alEmpezar?: () => void
  /** Cada movimiento ya en arrastre (para apartar a las vecinas). */
  alMover?: (cliente: Punto, pantalla: Punto) => void
  /** Escape o cancelación del sistema: todo vuelve a su lugar. */
  alCancelar?: (v: Vuelo) => void
  /** El imán de la ranura: la esquina libre (cliente) que dejaría el cursor → dónde se pinta el fantasma. null/sin llamar = sigue al cursor. */
  iman?: (libre: Punto, cliente: Punto) => { pos: Punto; atrapada: boolean } | null
  /** ¿Se ve el fantasma de la página? (No cuando lo reemplaza el fantasma nativo que cruza monitores.) */
  conFantasmaDePagina?: (cliente: Punto, pantalla: Punto) => boolean
}

/** Copia visible de la pestaña, pegada al cursor. No recibe el puntero: el arrastre sigue siendo del original. */
function crearFantasma(origen: HTMLElement, clase: string) {
  const f = document.createElement('div')
  f.className = clase
  f.setAttribute('aria-hidden', 'true')
  const copia = origen.cloneNode(true) as HTMLElement
  for (const a of ['title', 'role', 'aria-selected', 'data-activa', 'data-arrastrable']) copia.removeAttribute(a)
  copia.tabIndex = -1
  f.appendChild(copia)
  document.body.appendChild(f)
  return f
}

const movimientoReducido = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function empezarArrastre(e: PunteroReact<HTMLElement>, o: Opciones) {
  if (e.button !== 0 || !e.isPrimary || e.pointerType === 'touch') return
  const origen = e.currentTarget, id = e.pointerId
  const inicio: Punto = { x: e.clientX, y: e.clientY }
  const caja = origen.getBoundingClientRect()
  const agarre: Punto = { x: inicio.x - caja.left, y: inicio.y - caja.top }
  const raiz = document.documentElement
  let fantasma: HTMLElement | null = null
  let esquinaActual: Punto = { x: 0, y: 0 }, paginaVisible = true, reclamado = false

  const quitarFantasma = () => { fantasma?.remove(); fantasma = null }
  // La manita: mientras dura el gesto el cursor es de agarre en toda la ventana (una hoja propia: un módulo CSS no admite `*` global).
  let manita: HTMLStyleElement | null = null
  const limpiarGesto = () => {
    manita?.remove(); manita = null
    raiz.removeAttribute('data-arrastrando-pestana')
    origen.removeAttribute('data-arrastrada')
    try { origen.releasePointerCapture(id) } catch { /* ya liberado */ }
  }
  const limpiar = () => {
    window.removeEventListener('pointermove', mover, true)
    window.removeEventListener('pointerup', soltar, true)
    window.removeEventListener('pointercancel', cancelar, true)
    window.removeEventListener('keydown', tecla, true)
  }
  const posicion = (e: Punto) => { const z = zoomUI(); return `translate3d(${Math.round(aFijo(e.x, z))}px, ${Math.round(aFijo(e.y, z))}px, 0)` }
  // FLIP: el fantasma sale de donde está y llega a `esquina`; el gesto (ranura, cursor) se cierra al aterrizar, justo antes de que quien llamó cambie el estado.
  const vuelo = (): Vuelo => ({
    paginaVisible,
    volar: esquina => {
      const f = fantasma
      reclamado = true
      const fin = () => { quitarFantasma(); limpiarGesto() }
      if (!f) { limpiarGesto(); return Promise.resolve() }
      f.style.visibility = ''; f.removeAttribute('data-fuera'); f.removeAttribute('data-iman')
      if (movimientoReducido()) { fin(); return Promise.resolve() }
      const de = posicion(esquinaActual), a = posicion(esquina)
      const animar = (el: Element, cuadros: Keyframe[], easing: string) => {
        try { return el.animate(cuadros, { duration: RESORTE_MS + 40, easing, fill: 'forwards' }) } catch { return el.animate(cuadros, { duration: RESORTE_MS + 40, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }) }
      }
      f.firstElementChild?.animate([{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: RESORTE_MS, easing: 'ease-out', fill: 'forwards' })
      return animar(f, [{ transform: de }, { transform: a }], RESORTE_CSS).finished.then(fin, fin)
    },
  })
  // Si nadie reclamó el vuelo (ventana nueva, otra ventana…), el fantasma y el gesto se cierran al instante, como siempre.
  const cerrarSiNadieVuela = () => { if (!reclamado) { quitarFantasma(); limpiarGesto() } }
  // El clic que sigue a soltar no debe cambiar de pestaña.
  const sinClic = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
  const tapar = () => { window.addEventListener('click', sinClic, true); setTimeout(() => window.removeEventListener('click', sinClic, true), 120) }

  function mover(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    const p = { x: ev.clientX, y: ev.clientY }
    if (!fantasma) {
      if (!pasoElUmbral(inicio, p)) return
      fantasma = crearFantasma(origen, o.claseFantasma)
      o.alEmpezar?.()
      raiz.setAttribute('data-arrastrando-pestana', '')
      manita = document.createElement('style'); manita.textContent = '*, *::before, *::after { cursor: grabbing !important; }'; document.head.appendChild(manita)
      origen.setAttribute('data-arrastrada', '')
      try { origen.setPointerCapture(id) } catch { /* sin captura: los eventos siguen por la ventana mientras el cursor no la deje */ }
    }
    const pantalla = { x: ev.screenX, y: ev.screenY }
    o.alMover?.(p, pantalla)
    // Coordenadas de pantalla → fijas bajo el zoom de la UI (si no, con ⌘+ el fantasma se aleja del cursor).
    // Fuera del imán sigue al cursor; cerca de la ranura se atrae y se alinea.
    const libre = { x: p.x - agarre.x, y: p.y - agarre.y }, im = o.iman?.(libre, p) ?? null
    esquinaActual = im ? im.pos : libre
    fantasma.style.transform = posicion(esquinaActual)
    if (im?.atrapada) fantasma.setAttribute('data-iman', ''); else fantasma.removeAttribute('data-iman')
    if (o.nueva(p, pantalla)) fantasma.setAttribute('data-fuera', ''); else fantasma.removeAttribute('data-fuera')
    paginaVisible = !o.conFantasmaDePagina || o.conFantasmaDePagina(p, pantalla)
    fantasma.style.visibility = paginaVisible ? '' : 'hidden'
  }
  function soltar(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    const arrastro = !!fantasma
    limpiar()
    if (!arrastro) return
    tapar()
    o.alSoltar({ cliente: { x: ev.clientX, y: ev.clientY }, pantalla: { x: ev.screenX, y: ev.screenY }, ...vuelo() })
    cerrarSiNadieVuela()
  }
  function cancelar(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    const arrastro = !!fantasma
    limpiar()
    if (!arrastro) { limpiarGesto(); return }
    tapar(); o.alCancelar?.(vuelo()); cerrarSiNadieVuela()
  }
  function tecla(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !fantasma) return
    ev.preventDefault(); ev.stopPropagation()
    limpiar(); tapar(); o.alCancelar?.(vuelo()); cerrarSiNadieVuela()
  }

  window.addEventListener('pointermove', mover, true)
  window.addEventListener('pointerup', soltar, true)
  window.addEventListener('pointercancel', cancelar, true)
  window.addEventListener('keydown', tecla, true)
}

/**
 * Desde cualquier tira (el panel principal o una ventana aparte). `ventana`: la de esta tira. Lo que se mueve
 * es el envoltorio `[data-clave]` de cada pestaña, hijo directo de `[data-tira]` (las ancladas llevan
 * `data-anclada` y solo se acomodan entre ellas). El Taller vive fuera de la tira: solo cambia de ventana.
 */
export function arrastrarPestana(e: PunteroReact<HTMLElement>, clave: string, claseFantasma: string, o: { ventana: string; alReordenar: (indice: number) => void; division?: OpcionesDivision }) {
  const panel = e.currentTarget.closest('[data-panel-derecho]')
  const tira = e.currentTarget.closest<HTMLElement>('[data-tira]')
  const propia = e.currentTarget.closest<HTMLElement>('[data-clave]')
  if (!panel || !propia) return
  const principal = o.ventana === PRINCIPAL
  const sacar = puedeDesprender(useVentanas.getState().nativo)
  const sobreElPanel = (p: Punto) => puntoEnRect(p, panel.getBoundingClientRect())
  // La tira con holgura vertical: un arrastre algo torcido sigue siendo reordenar, no sacar.
  // Dividida, cada grupo tiene su tira: el ancho que cuenta es el de su cabecera, no el de todo el panel.
  const cabeceraPropia = e.currentTarget.closest<HTMLElement>('[data-cabecera-grupo]')
  const sobreLaTira = (p: Punto) => { if (!tira) return false; const r = tira.getBoundingClientRect(), q = (cabeceraPropia ?? panel).getBoundingClientRect(); return p.y >= r.top - 18 && p.y <= r.bottom + 18 && p.x >= q.left && p.x <= q.right }
  const hermanas = Array.from(tira?.children ?? []).filter((h): h is HTMLElement => h instanceof HTMLElement && h.dataset.clave != null)
  const desde = hermanas.indexOf(propia)
  const cajas = hermanas.map(h => h.getBoundingClientRect())
  const anclada = propia.hasAttribute('data-anclada')
  const ancladasSinElla = hermanas.filter(h => h !== propia && h.hasAttribute('data-anclada')).length
  // Cuántas pestañas hay en esta ventana (con el Taller, que vive fuera de la tira).
  const enEsta = panel.querySelectorAll('[data-clave]').length
  let destino = desde
  const pintar = (d: number) => {
    destino = d
    const dx = desplazamientos(cajas.map(c => ({ left: c.left, width: c.width })), desde, d)
    hermanas.forEach((h, i) => { h.style.transform = dx[i] ? `translateX(${dx[i]}px)` : '' })
  }
  const soltarTodo = () => hermanas.forEach(h => { h.style.transform = '' })
  const cajasPlanas = cajas.map(c => ({ left: c.left, width: c.width, top: c.top }))
  // Al aterrizar, la pestaña se asienta con un pulso corto (el mismo de las que llegan de otra ventana).
  const asentar = () => { propia.setAttribute('data-llego', ''); setTimeout(() => propia.removeAttribute('data-llego'), 520) }
  // Dónde regresa la pestaña si se cancela. El Taller vive fuera de la tira (`desde` = -1): su lugar es el suyo, no el de una hermana.
  const origenCaja = desde >= 0 ? cajas[desde] : propia.getBoundingClientRect()
  // Dónde está el fantasma nativo (cursor efectivo, tras el imán): el aterrizaje parte de ahí.
  let cursorFant: Punto = { x: 0, y: 0 }

  // Las demás ventanas: dónde están y dónde caería la pestaña en cada una.
  let otras: { blancos: Blanco[]; soltar: () => void } | null = null
  let sobre: string | null = null, sobreIndice = -1
  const avisarSobre = (d: Blanco | null, indice: number) => {
    const v = d?.ventana ?? null
    if (v === sobre && indice === sobreIndice) return
    sobre = v; sobreIndice = indice
    publicar({ tipo: 'sobre', clave, ventana: v, indice, ancho: Math.round(propia.getBoundingClientRect().width) })
  }
  const terminar = () => { if (sobre) avisarSobre(null, -1); otras?.soltar(); otras = null; pintarSombra(null) }

  // El fantasma nativo (app con `ventanas_pestanas` ≥ 3): se prepara al apretar, nace al pasar el umbral.
  const nativo = sacar && hayFantasma()
  if (nativo) prepararFantasma()
  let f: Fantasma | null = null
  // El agarre en px de pantalla (con zoom de la página, el cociente outer/inner es la escala).
  const g0 = geometriaVentana()
  const escala = g0.innerWidth > 0 && g0.outerWidth > 0 ? g0.outerWidth / g0.innerWidth : 1
  const caja0 = e.currentTarget.getBoundingClientRect()
  const agarre: Punto = { x: (e.clientX - caja0.left) * escala, y: (e.clientY - caja0.top) * escala }
  const altoPestana = caja0.height * escala
  const fuera = (cliente: Punto) => !dentroDeLaVentana(cliente, window)
  const destinoEn = (cliente: Punto, pantalla: Punto) => fuera(cliente) ? blancoBajo(pantalla, otras?.blancos ?? []) : null
  const indiceEn = (d: Blanco, pantalla: Punto) => {
    if (!d.tira) return undefined
    const i = indiceEnBlanco(pantalla, d, clave), resto = d.pestanas.filter(t => t.clave !== clave)
    return limitarIndice(i, anclada, resto.filter(t => t.anclada).length, resto.length)
  }

  // Dividir (8 oct 2026, como Visual Studio): sobre el cuerpo de ESTA ventana, el punto decide la zona (mitad derecha,
  // izquierda o un cuarto en las esquinas). Solo cuenta si cambia lo que se ve; mientras tanto, una sombra dice dónde caerá.
  const dv = o.division
  const cuerpo = panel.querySelector<HTMLElement>('[data-zona-division]')
  // Las cabeceras de los grupos (solo con la ventana dividida): soltar sobre la de otro grupo la lleva a ese grupo.
  const cabeceras = Array.from(panel.querySelectorAll<HTMLElement>('[data-cabecera-grupo]')).map(h => ({ r: Number(h.dataset.ranura) as Ranura, h }))
  const planDivision = (cliente: Punto): { estado: EstadoDivision; caja: DOMRect } | null => {
    if (!dv || !cuerpo || sobreLaTira(cliente) || fuera(cliente)) return null
    const caja = cuerpo.getBoundingClientRect()
    if (!puntoEnRect(cliente, caja)) return null
    const cab = cabeceras.find(c => puntoEnRect(cliente, c.h.getBoundingClientRect()))
    if (cab && cab.h === cabeceraPropia) return null
    const destino: Destino = cab ? { grupo: cab.r } : zonaDeDivision(cliente, caja)
    const antes = dv.estado ?? normalizar({ celdas: [dv.visible, null, null, null] }, dv.tira)
    const despues = colocar(dv.estado ?? { celdas: VACIAS, grupos: {} }, clave, destino, dv.visible, dv.tira)
    // Vale si cambia algo: divide, mueve de grupo o (llevando la última de un grupo a otro) junta todo otra vez.
    return !igualesEstado(despues, antes) && (dividida(despues.celdas) || !!dv.estado) ? { estado: despues, caja } : null
  }
  let sombra: HTMLElement | null = null
  const pintarSombra = (plan: { estado: EstadoDivision } | null) => {
    const r = plan && dv ? rectDeClave(clave, plan.estado.celdas, dv.cortes) : null
    if (!r || !cuerpo || !dv) { sombra?.remove(); sombra = null; return }
    if (!sombra) { sombra = document.createElement('div'); sombra.className = dv.claseSombra; sombra.setAttribute('aria-hidden', 'true'); cuerpo.appendChild(sombra) }
    sombra.style.left = `calc(${r.x * 100}% + 6px)`; sombra.style.top = `calc(${r.y * 100}% + 6px)`
    sombra.style.width = `calc(${r.w * 100}% - 12px)`; sombra.style.height = `calc(${r.h * 100}% - 12px)`
  }

  // Nace una ventana: fuera de toda ventana o, en la principal, sobre el chat (fuera del panel).
  const nueva = (cliente: Punto, pantalla: Punto) => sacar && !destinoEn(cliente, pantalla) && (fuera(cliente) || (principal && !sobreElPanel(cliente)))
  // Qué enseña el fantasma nativo: la ventana que nacería, solo la pestaña sobre otra ventana, o nada (en el panel de origen).
  const modoFantasma = (cliente: Punto, pantalla: Punto): ModoFantasma | null =>
    !f || !hayFantasma() || sobreLaTira(cliente) ? null : destinoEn(cliente, pantalla) ? 'pestana' : nueva(cliente, pantalla) ? 'ventana' : fuera(cliente) ? 'pestana' : null

  empezarArrastre(e, {
    claseFantasma,
    alEmpezar: () => {
      // Esta ventana puede haberse movido de monitor desde la última vez: se mide de nuevo (la usa el vuelo de regreso).
      void refrescarGeometria()
      otras = pedirBlancos()
      // Se pregunta otra vez: `preparar` (al apretar) ya pudo descubrir que la app no deja usar el nativo.
      if (nativo && hayFantasma()) f = fantasmaDelArrastre(clave, agarre, tamanoNuevo())
    },
    nueva,
    // El imán de la tira propia: la ranura que la pestaña dejó (la del lugar donde caerá).
    iman: (libre, cliente) => {
      if (!sobreLaTira(cliente)) return null
      const r = ranuraEnTira(cajasPlanas, desde, destino)
      return r ? imanDeRanura(libre, { x: r.left, y: r.top }) : null
    },
    conFantasmaDePagina: (cliente, pantalla) => modoFantasma(cliente, pantalla) === null,
    alMover: (cliente, pantalla) => {
      pintar(sobreLaTira(cliente) ? limitarIndice(indiceDeInsercion(cajas.map(c => c.left + c.width / 2), cliente.x, desde), anclada, ancladasSinElla, hermanas.length - 1) : desde)
      const d = destinoEn(cliente, pantalla)
      const indice = d ? indiceEn(d, pantalla) ?? d.pestanas.length : -1
      avisarSobre(d, indice)
      pintarSombra(planDivision(cliente))
      const modo = modoFantasma(cliente, pantalla)
      // Sobre la tira de otra ventana el imán atrae la pestaña a su ranura: se mueve la ventana fantasma, no solo el cursor.
      cursorFant = pantalla
      if (f && d && modo === 'pestana') {
        const m = imanDeRanura({ x: pantalla.x - agarre.x, y: pantalla.y - agarre.y }, ranuraEnBlanco(d, indice, clave, altoPestana))
        cursorFant = { x: m.pos.x + agarre.x, y: m.pos.y + agarre.y }
      }
      f?.seguir(cursorFant, modo)
    },
    // Cancelar (Escape o soltar en nada válido): las vecinas vuelven con resorte y la pestaña regresa animada a su origen.
    alCancelar: ({ volar, paginaVisible }) => {
      soltarTodo(); terminar()
      const fin = () => { asentar() }
      if (f && !paginaVisible) {
        const o0 = rectEnPantalla(geometriaVentana(), origenCaja)
        void f.aterrizar({ x: o0.left - (cursorFant.x - agarre.x), y: o0.top - (cursorFant.y - agarre.y) }).then(fin)
      } else { f?.quitar(); void volar({ x: origenCaja.left, y: origenCaja.top }).then(fin) }
    },
    alSoltar: ({ cliente, pantalla, volar }) => {
      const d = destinoEn(cliente, pantalla)
      if (sobreLaTira(cliente)) {
        terminar(); f?.quitar()
        // La pestaña vuela desde el cursor a su ranura; recién entonces cambia el orden (las vecinas ya están en su sitio).
        const fin = () => { soltarTodo(); if (destino !== desde) o.alReordenar(destino); asentar() }
        const r = ranuraEnTira(cajasPlanas, desde, destino)
        if (r) void volar({ x: r.left, y: r.top }).then(fin); else fin()
        return
      }
      soltarTodo()
      const plan = planDivision(cliente)
      if (plan && dv) {
        terminar(); f?.quitar()
        // La pestaña vuela a la parte donde quedará y entonces la ventana se divide.
        const r = rectDeClave(clave, plan.estado.celdas, dv.cortes)
        const fin = () => { dv.aplicar(plan.estado, clave); asentar() }
        if (r) void volar({ x: plan.caja.left + r.x * plan.caja.width + 12, y: plan.caja.top + r.y * plan.caja.height + 34 }).then(fin); else fin()
        return
      }
      if (d) {
        const indice = indiceEn(d, pantalla)
        const ranura = f ? ranuraEnBlanco(d, indice ?? d.pestanas.length, clave, altoPestana) : null
        // El hueco sigue abierto mientras la pestaña vuela a él; al llegar, la otra ventana la recibe y lo cierra.
        const entregar = () => { llevarA(clave, d.ventana, indice); terminar() }
        if (f && ranura) void f.aterrizar({ x: ranura.x - (cursorFant.x - agarre.x), y: ranura.y - (cursorFant.y - agarre.y) }).then(entregar)
        else { entregar(); void f?.desvanecer() }
        return
      }
      terminar()
      // Sola en su ventana aparte: se va la ventana entera adonde se soltó. Si no, nace una ventana nueva.
      const abrir = !sacar ? null
        : fuera(cliente) ? (!principal && enEsta <= 1 ? moverVentanaA(o.ventana, pantalla) : sacarAVentanaNueva(clave, pantalla))
        : principal && !sobreElPanel(cliente) ? sacarAVentanaNueva(clave, pantalla) : null
      // Nada válido donde se soltó: la pestaña regresa animada a su origen.
      if (!abrir) { f?.quitar(); void volar({ x: origenCaja.left, y: origenCaja.top }).then(asentar); return }
      // El fantasma se queda hasta que la ventana real está en su lugar, y se desvanece encima de ella.
      void abrir.finally(() => { void f?.desvanecer() })
    },
  })
}
