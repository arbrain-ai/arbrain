/**
 * Persistencia de borradores del compositor en IndexedDB (2 oct 2026).
 *
 * El borrador guardaba los `File` dentro del mismo valor que el texto. Dos fallas: (1) un File que apunta a
 * algo que el sistema ya borró (capturas flotantes de macOS, temporales de WebKit) no se deja clonar y
 * tumbaba TODO el guardado, texto incluido; (2) cada tecla reescribía los megabytes de las imágenes.
 *
 * Ahora el documento del borrador lleva solo el texto y referencias; cada imagen vive en su propia clave,
 * como bytes (ArrayBuffer, que IndexedDB guarda igual en todos los motores), y se escribe UNA vez. Así:
 *   - el texto siempre se guarda, aunque una imagen no quepa o no se pueda leer;
 *   - si una imagen falla, se dice cuál y por qué (cuota llena, ilegible), en vez de «no pudo guardarse»;
 *   - al recargar, el borrador vuelve con sus imágenes; si alguna se perdió, se avisa.
 * Los borradores guardados con el formato anterior (Files sueltos en el documento) se siguen leyendo.
 */

export type Almacen = { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> }
export type Lectura = { value: unknown; aviso?: string }
export type Escritura = void | { aviso: string }

const MARCA = '__archivo'
type Referencia = { [MARCA]: string; name: string; type: string; lastModified: number }
type Registro = { name: string; type: string; lastModified: number; bytes: ArrayBuffer }

/** Error al escribir el documento del borrador, con el mensaje listo para mostrar. */
export class ErrorBorrador extends Error {
  mensaje: string
  constructor(mensaje: string) { super(mensaje); this.name = 'ErrorBorrador'; this.mensaje = mensaje }
}

const esBlob = (v: unknown): v is File => typeof Blob !== 'undefined' && v instanceof Blob
const esReferencia = (v: unknown): v is Referencia => !!v && typeof v === 'object' && typeof (v as Record<string, unknown>)[MARCA] === 'string'

export function esErrorDeCuota(e: unknown): boolean {
  const n = (e as { name?: string })?.name
  const m = String((e as { message?: string })?.message ?? '')
  return n === 'QuotaExceededError' || /quota/i.test(m)
}

const aleatorio = () => Math.random().toString(36).slice(2, 10)
const plural = (n: number, uno: string, varios: string) => n === 1 ? uno : varios

export function crearPersistenciaBorradores(almacen: Almacen) {
  /** Id estable por File (la clave de su imagen) y claves de imagen que SÍ están en el almacén: cada File se escribe una vez. */
  const ids = new WeakMap<object, string>()
  const escritas = new Set<string>()
  /** Por borrador, las claves de imagen que su último documento referencia (para limpiar huérfanas). */
  const referenciadas = new Map<string, Set<string>>()
  const claveImagen = (key: string, id: string) => `${key}#img#${id}`

  const idDe = (f: object) => { let id = ids.get(f); if (!id) { id = aleatorio() + aleatorio(); ids.set(f, id) } return id }

  async function set(key: string, value: unknown): Promise<Escritura> {
    const nuevas = new Set<string>()
    let perdidas = 0, cuota = false, ilegibles = 0
    let doc: unknown = value
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const copia: Record<string, unknown> = { ...(value as Record<string, unknown>) }
      for (const [campo, v] of Object.entries(copia)) {
        if (!Array.isArray(v) || !v.some(esBlob)) continue
        const salida: unknown[] = []
        for (const item of v) {
          if (!esBlob(item)) { salida.push(item); continue }
          const id = idDe(item), k = claveImagen(key, id)
          try {
            if (!escritas.has(k)) {
              const bytes = await item.arrayBuffer()
              await almacen.set(k, { name: item.name, type: item.type, lastModified: item.lastModified, bytes } satisfies Registro)
              escritas.add(k)
            }
            nuevas.add(k)
            salida.push({ [MARCA]: id, name: item.name, type: item.type, lastModified: item.lastModified } satisfies Referencia)
          } catch (e) { perdidas++; if (esErrorDeCuota(e)) cuota = true; else ilegibles++ }
        }
        copia[campo] = salida
      }
      doc = copia
    }
    try { await almacen.set(key, doc) } catch (e) {
      throw new ErrorBorrador(esErrorDeCuota(e)
        ? 'Tu borrador sigue abierto, pero este dispositivo no tiene espacio para guardarlo. Libera espacio o envíalo antes de cerrar la app.'
        : 'Tu borrador sigue abierto, pero no pudo guardarse en este dispositivo. No cierres la app todavía.')
    }
    const previas = referenciadas.get(key)
    referenciadas.set(key, nuevas)
    // Se espera el borrado: si el mismo File vuelve al borrador enseguida (envío que falló y devuelve la caja),
    // su escritura nueva no puede cruzarse con este borrado. Y la marca se quita para que sí se reescriba.
    if (previas) for (const k of previas) if (!nuevas.has(k)) { escritas.delete(k); await almacen.del(k).catch(() => {}) }
    if (!perdidas) return
    const n = perdidas
    const causa = cuota
      ? `este dispositivo no tiene espacio para ${plural(n, 'ella', 'ellas')}; libera espacio`
      : ilegibles ? `${plural(n, 'no se pudo leer', 'no se pudieron leer')} (el sistema ya no ${plural(n, 'tiene el archivo', 'tiene los archivos')}); vuelve a ${plural(n, 'pegarla', 'pegarlas')}` : 'no se pudo guardar'
    return { aviso: `El texto de tu borrador está guardado, pero ${n} ${plural(n, 'imagen', 'imágenes')} no: ${causa}. No cierres la app todavía.` }
  }

  async function get(key: string): Promise<Lectura> {
    const saved = await almacen.get(key)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) { referenciadas.set(key, new Set()); return { value: saved } }
    const salida: Record<string, unknown> = { ...(saved as Record<string, unknown>) }
    const vivas = new Set<string>()
    let perdidas = 0
    for (const [campo, v] of Object.entries(salida)) {
      if (!Array.isArray(v) || !v.some(x => esBlob(x) || esReferencia(x))) continue
      const archivos: File[] = []
      for (const item of v) {
        try {
          if (esReferencia(item)) {
            const k = claveImagen(key, item[MARCA])
            const r = await almacen.get(k) as Registro | undefined
            if (!r || !(r.bytes instanceof ArrayBuffer) || r.bytes.byteLength === 0) throw new Error('imagen ausente')
            const f = new File([r.bytes], r.name, { type: r.type, lastModified: r.lastModified })
            ids.set(f, item[MARCA]); escritas.add(k); vivas.add(k); archivos.push(f)
          } else if (esBlob(item)) {
            // Formato anterior: el File iba suelto en el documento. Si ya no se puede leer, se descarta con aviso.
            const bytes = await item.arrayBuffer()
            if (!bytes.byteLength) throw new Error('vacío')
            archivos.push(new File([bytes], item.name, { type: item.type, lastModified: item.lastModified }))
          } else archivos.push(item as File)
        } catch { perdidas++ }
      }
      salida[campo] = archivos
    }
    referenciadas.set(key, vivas)
    return { value: salida, aviso: perdidas ? `${perdidas} ${plural(perdidas, 'imagen de tu borrador ya no estaba disponible y se quitó', 'imágenes de tu borrador ya no estaban disponibles y se quitaron')}. Vuelve a ${plural(perdidas, 'adjuntarla', 'adjuntarlas')}.` : undefined }
  }

  return { get, set }
}
