/**
 * Extensiones de Arbrain · el modelo puro (21 nov 2026, fase 2 del SPEC `docs/builds/extensiones-2026-11-20/SPEC.md`).
 *
 * Daniel (20 nov 19:07): «Voy a confiar en tu criterio, así que sí, haz lo que consideres». Firmado: marketplace v1 de
 * Arbrain (catálogo curado) con Competencia como primera extensión con panel.
 *
 * Una extensión ES un plugin de Claude Code más un `arbrain.json` (esquema `arbrain.extension/v1`) con lo que Arbrain
 * necesita: requisitos, permisos, panel y tareas. Aquí vive lo que no toca disco ni red:
 *   - `leerManifiesto`: el `arbrain.json` con tolerancia (lo que no cumple se descarta campo por campo; sin nombre ni
 *     esquema no es una extensión).
 *   - `declarada` / `FORMA_FUENTE_EXT`: la validación PROPIA de las fuentes `ext:` del panel. No afloja `FORMA_FUENTE` de
 *     las islas (que sigue rechazando `ext:$CEREBRO/…`): el panel habla un protocolo aparte, con su propia puerta.
 *   - `leerMensajePanel`: lo que manda el iframe del panel, validado (dato NO confiable, como en las islas).
 *   - `textoDeAccion` / `urlDeAccion`: una acción es texto para Levy (lo declarado en `panel.acciones`) o una URL https
 *     que se abre en el navegador del dueño. Nunca un comando.
 *   - `idTarea`: el id de una tarea de extensión en el scheduler (`ext-<extension>--<tarea>`), igual que el daemon.
 *
 * Sin imports: lo usan el daemon (este paquete) y la web (`src/features/extensiones/modelo.ts` lo re-exporta).
 * Pruebas: server/src/extensiones/modelo.test.ts.
 */

export const ESQUEMA_EXTENSION = 'arbrain.extension/v1'
/** Nombre del catálogo en Claude Code: una extensión se instala como `<extension>@arbrain`. */
export const MARKETPLACE = 'arbrain'

/** kebab-case, igual que el `name` de su `plugin.json` (y sin `--`, que separa extensión y tarea en el scheduler). */
export const NOMBRE_EXTENSION = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,62}[a-z0-9]$|^[a-z0-9]$/
const ID_CORTO = /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,39}$/
const CLAVE_LLAVE = /^[a-z0-9_]{1,64}$/

export const esNombreExtension = (x: unknown): x is string => typeof x === 'string' && NOMBRE_EXTENSION.test(x)

export interface Llave { clave: string; para: string; como_conseguirla?: string; opcional: boolean }
export interface Accion { id: string; etiqueta: string; pide: string }
export interface Panel { titulo: string; entrada: string; icono?: string; seccion?: string; datos: string[]; acciones: Accion[] }
export interface Tarea { id: string; cada: string; corre: string; argumentos: string[]; necesita: string[] }
export interface Manifiesto {
  esquema: typeof ESQUEMA_EXTENSION
  nombre: string
  resumen: string
  frases: string[]
  requiere: { arbrain: string | null; skills_base: string[]; programas: string[]; extensiones: string[]; llaves: Llave[] }
  permisos: { lee: string[]; escribe: string[]; red: string[]; lienzo: boolean; programa: boolean }
  panel: Panel | null
  tareas: Tarea[]
  licencia: { nivel: 'gratis' | 'membresia'; producto?: string }
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const txt = (x: unknown, max: number): string | null => (typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : null)
const lista = <T>(x: unknown, leer: (v: unknown) => T | null, tope = 40): T[] =>
  Array.isArray(x) ? x.map(leer).filter((v): v is T => v !== null).slice(0, tope) : []
const cadena = (max: number, ok: (s: string) => boolean = () => true) => (v: unknown) => { const s = txt(v, max); return s !== null && ok(s) ? s : null }

/** Carpeta del cerebro relativa (`.claude/memory/…/`): nunca absoluta, `..`, `~`, ni las skills de la base. */
export function carpetaRelativaSegura(s: string): boolean {
  if (!s || s.startsWith('/') || s.startsWith('~') || s.includes('\\') || s.includes('\0') || /^[a-z]:/i.test(s)) return false
  const partes = s.split('/').filter(Boolean)
  if (!partes.length || partes.some(p => p === '..' || p === '.')) return false
  return !s.startsWith('.claude/skills')
}

/** Ruta relativa dentro de la carpeta instalada de la extensión (`panel/index.html`, `./skills/x/scripts/y.py`). */
export function rutaInternaSegura(s: string): boolean {
  const r = s.replace(/^\.\//, '')
  if (!r || r.startsWith('/') || r.includes('\\') || r.includes('\0') || /^[a-z]:/i.test(r)) return false
  return r.split('/').every(p => p && p !== '..' && p !== '.')
}

export function leerManifiesto(x: unknown): Manifiesto | null {
  if (!obj(x) || x.esquema !== ESQUEMA_EXTENSION) return null
  const nombre = txt(x.nombre, 40)
  const resumen = txt(x.resumen, 200)
  if (!nombre || !resumen) return null
  const rq = obj(x.requiere) ? x.requiere : {}
  const pm = obj(x.permisos) ? x.permisos : {}
  const llaves = lista(rq.llaves, v => {
    if (!obj(v)) return null
    const clave = txt(v.clave, 64), para = txt(v.para, 400)
    if (!clave || !CLAVE_LLAVE.test(clave) || !para) return null
    const como = txt(v.como_conseguirla, 600)
    return { clave, para, ...(como ? { como_conseguirla: como } : {}), opcional: v.opcional === true } satisfies Llave
  }, 8)
  const claves = new Set(llaves.map(l => l.clave))
  const lee = lista(pm.lee, cadena(200, carpetaRelativaSegura))
  let panel: Panel | null = null
  if (obj(x.panel)) {
    const p = x.panel
    const entrada = txt(p.entrada, 200)
    if (entrada && rutaInternaSegura(entrada) && /\.html?$/i.test(entrada)) {
      panel = {
        titulo: txt(p.titulo, 60) ?? nombre,
        entrada: entrada.replace(/^\.\//, ''),
        ...(txt(p.icono, 40) ? { icono: txt(p.icono, 40)! } : {}),
        ...(txt(p.seccion, 40) ? { seccion: txt(p.seccion, 40)! } : {}),
        // Solo lo que además pasa la puerta `ext:` (forma y permiso de lectura).
        datos: lista(p.datos, cadena(320, d => declaradaEn(d, lee) !== null), 24),
        acciones: lista(p.acciones, v => {
          if (!obj(v)) return null
          const id = txt(v.id, 40), etiqueta = txt(v.etiqueta, 60), pide = txt(v.pide, 600)
          return id && ID_CORTO.test(id) && etiqueta && pide ? { id, etiqueta, pide } : null
        }, 16),
      }
    }
  }
  const nivel = obj(x.licencia) && x.licencia.nivel === 'membresia' ? 'membresia' : 'gratis'
  const producto = obj(x.licencia) ? txt(x.licencia.producto, 120) : null
  const regla = txt(rq.arbrain, 20)
  return {
    esquema: ESQUEMA_EXTENSION,
    nombre,
    resumen,
    frases: lista(x.frases, cadena(120), 8),
    requiere: {
      arbrain: regla && REGLA_VERSION.test(regla) ? regla : null,
      skills_base: lista(rq.skills_base, cadena(64, s => /^[a-z0-9-]+$/.test(s))),
      programas: lista(rq.programas, cadena(64, s => /^[A-Za-z0-9._+-]+$/.test(s)), 12),
      extensiones: lista(rq.extensiones, cadena(64, s => NOMBRE_EXTENSION.test(s)), 12),
      llaves,
    },
    permisos: {
      lee,
      escribe: lista(pm.escribe, cadena(200, carpetaRelativaSegura)),
      red: lista(pm.red, cadena(120), 24),
      lienzo: pm.lienzo === true,
      programa: pm.programa === true,
    },
    panel,
    tareas: lista(x.tareas, v => {
      if (!obj(v)) return null
      const id = txt(v.id, 40), cada = txt(v.cada, 80), corre = txt(v.corre, 200)
      if (!id || !ID_CORTO.test(id) || !cada || !/^[0-9*/,\- ]+$/.test(cada) || !corre || !rutaInternaSegura(corre)) return null
      return {
        id, cada, corre: corre.replace(/^\.\//, ''),
        argumentos: lista(v.argumentos, v2 => (typeof v2 === 'string' && v2.length <= 200 && !v2.includes('\0') ? v2 : null), 20),
        // Una tarea solo puede pedir llaves que la extensión declara.
        necesita: lista(v.necesita, cadena(64, s => claves.has(s)), 8),
      } satisfies Tarea
    }, 8),
    licencia: { nivel, ...(producto ? { producto } : {}) },
  }
}

// ── Versión mínima de Arbrain ──
const REGLA_VERSION = /^(>=|\^|~)?\d+\.\d+\.\d+$/
const partes = (v: string) => v.replace(/^[^\d]*/, '').split(/[.+-]/).slice(0, 3).map(n => Number.parseInt(n, 10) || 0)
const comparar = (a: number[], b: number[]) => { for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0 }

/** ¿La versión instalada de Arbrain cumple `requiere.arbrain`? null = no se sabe (no se bloquea por no saber). */
export function cumpleVersion(regla: string | null, actual: string | null): boolean | null {
  if (!regla) return true
  if (!actual || !/^\d+\.\d+\.\d+/.test(actual)) return null
  const m = /^(>=|\^|~)?(.+)$/.exec(regla)!
  const op = m[1] ?? '', min = partes(m[2]), v = partes(actual)
  if (comparar(v, min) < 0) return false
  if (op === '^') return min[0] > 0 ? v[0] === min[0] : v[0] === 0 && v[1] === min[1]
  if (op === '~') return v[0] === min[0] && v[1] === min[1]
  if (op === '') return comparar(v, min) === 0
  return true
}

// ── La fuente `ext:` (SPEC §2) ──

/**
 * Forma de una fuente del panel: `ext:$CEREBRO/<ruta>.json` o `ext:$DATOS/<ruta>.json`. Es su PROPIA puerta: las islas
 * siguen con `FORMA_FUENTE` intacto (que la rechaza); este protocolo solo lo habla el host de paneles de extensión.
 */
export const FORMA_FUENTE_EXT = /^ext:\$(CEREBRO|DATOS)\/[A-Za-z0-9._\-/]{1,300}\.json$/

export interface FuenteDeclarada { raiz: 'cerebro' | 'datos'; rel: string; permiso: string }

function declaradaEn(ruta: string, lee: readonly string[]): FuenteDeclarada | null {
  if (!FORMA_FUENTE_EXT.test(`ext:${ruta}`)) return null
  const m = /^\$(CEREBRO|DATOS)\/(.+)$/.exec(ruta)!
  const rel = m[2]
  if (rel.split('/').some(p => !p || p === '..' || p === '.')) return null
  if (m[1] === 'DATOS') return { raiz: 'datos', rel, permiso: '' }
  // `$CEREBRO/…` tiene que caer dentro de una carpeta que la extensión declara en `permisos.lee`.
  const permiso = lee.find(l => { const base = l.endsWith('/') ? l : `${l}/`; return rel.startsWith(base) && carpetaRelativaSegura(l) })
  return permiso ? { raiz: 'cerebro', rel, permiso } : null
}

/**
 * Reglas 1 y 2 de la fuente `ext:`: solo lo que el `arbrain.json` instalado declara en `panel.datos`, letra por letra,
 * con su forma, y (para `$CEREBRO`) dentro de `permisos.lee`. null = `negado`. La regla 3 (la ruta real, ya sin enlaces,
 * no sale de la carpeta del permiso) necesita disco y vive en `lib/extensiones/fuente-ext.ts`.
 */
export function declarada(fuente: unknown, m: Pick<Manifiesto, 'panel' | 'permisos'> | null): FuenteDeclarada | null {
  if (typeof fuente !== 'string' || fuente.length > 330 || !FORMA_FUENTE_EXT.test(fuente) || !m?.panel) return null
  const ruta = fuente.slice(4)
  if (!m.panel.datos.includes(ruta)) return null
  return declaradaEn(ruta, m.permisos.lee)
}

// ── Lo que manda el panel ──

/** Lo que llega del panel. Estado de un dato: `ok`, `vacio` (no existe o está roto: «sin dato», nunca un cero) o `negado`. */
export type EstadoExt = 'ok' | 'vacio' | 'negado'
export interface LecturaExt { estado: EstadoExt; valor: unknown; fecha: string | null; error?: string }

export type MensajePanel =
  | { tipo: 'hola' }
  | { tipo: 'pedir'; fuente: string }
  | { tipo: 'soltar'; fuente: string }
  | { tipo: 'accion'; destino: string }
  | { tipo: 'listo' }

export const LARGO_DESTINO_EXT = 600

/** Dato NO confiable: forma y tamaño. Una fuente que no tiene forma `ext:` se ignora aquí (no llega ni a negarse). */
export function leerMensajePanel(d: unknown): MensajePanel | null {
  if (!obj(d)) return null
  switch (d.tipo) {
    case 'hola': return { tipo: 'hola' }
    case 'listo': return { tipo: 'listo' }
    case 'pedir':
    case 'soltar': return typeof d.fuente === 'string' && d.fuente.length <= 330 && FORMA_FUENTE_EXT.test(d.fuente) ? { tipo: d.tipo, fuente: d.fuente } : null
    case 'accion': return typeof d.destino === 'string' && d.destino.trim() && d.destino.length <= LARGO_DESTINO_EXT ? { tipo: 'accion', destino: d.destino.trim() } : null
    default: return null
  }
}

/** `chat:<id>` → el texto declarado que recibe Levy (o null si la extensión no declara esa acción). */
export function textoDeAccion(destino: string, m: Pick<Manifiesto, 'panel'> | null): string | null {
  const r = /^chat:([a-z0-9-]{1,40})$/.exec(destino)
  if (!r) return null
  return m?.panel?.acciones.find(a => a.id === r[1])?.pide ?? null
}

/** `url:https://…` → la URL que se abre en el navegador del dueño (solo https, sin credenciales en la URL). */
export function urlDeAccion(destino: string): string | null {
  const r = /^url:(https:\/\/.+)$/.exec(destino)
  if (!r) return null
  try {
    const u = new URL(r[1])
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null
  } catch { return null }
}

// ── Tareas en el scheduler ──

/** El id de una tarea de extensión en `scheduled_tasks` (lo usa el scheduler: server/src/extensiones/tareas.ts). */
export const idTarea = (extension: string, tarea: string) => `ext-${extension}--${tarea}`
