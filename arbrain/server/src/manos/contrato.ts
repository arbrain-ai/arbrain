/**
 * Manos — contrato estable de computer use de Arbrain.
 *
 * Los motores (Claude y Codex) nunca hablan con la tecnología de control
 * directamente: hablan con este contrato. Debajo hay dos piezas intercambiables,
 * elegidas por configuración y no en el código:
 *
 *   - Adaptador de manos (`MANOS_ADAPTADOR`): observa y actúa sobre apps del
 *     sistema. Hoy `cua` (Cua Driver). Mañana otro, sin tocar a los motores.
 *   - Decisor rápido (`MANOS_DECISOR`): escoge entre opciones cerradas. Hoy
 *     `jev` (TypeSafe por Vercel AI Gateway) con `claude` de respaldo.
 *
 * El contrato está pensado en Arbrain, no en Cua: nombres en español, refs
 * cortos (`e12`) en vez de tokens del proveedor y efectos en tres estados
 * honestos (`confirmado`, `sin_verificar`, `fallo`). Receta para agregar un
 * adaptador: docs/builds/computer-use-2026-10-02/ADAPTADORES.md.
 */

/** Cómo se señala una app: bundle id (preferido), nombre visible o pid. */
export interface Objetivo { app?: string; pid?: number; ventana?: number }

export interface Elemento {
  /** Ref corto y válido hasta el siguiente `observar` de la misma ventana. */
  ref: string
  rol: string
  etiqueta?: string
  valor?: string
  acciones?: string[]
  /** Marco en puntos de pantalla, si el adaptador lo conoce. */
  marco?: { x: number; y: number; w: number; h: number }
  profundidad?: number
}

export interface Observacion {
  app: string
  pid: number
  ventana: number
  titulo?: string
  elementos: Elemento[]
  /** Árbol legible para el modelo (una línea por elemento). */
  texto: string
  /** Ruta a un PNG en disco, solo si se pidió `captura`. */
  captura?: string
  total_elementos: number
  aviso?: string
  /** URL de la página, si la ventana es de un navegador o app web. */
  url?: string
}

export interface PedidoObservar extends Objetivo {
  /** Filtra el árbol a líneas que contengan este texto (y sus ancestros). */
  consulta?: string
  captura?: boolean
  max_elementos?: number
  /** Presupuesto del recorrido del árbol. Si se agota, vuelve parcial con aviso. */
  tiempo_max_ms?: number
  /** Fuerza el OCR local (Vision) además del árbol: para lo que no publica texto (canvas, imágenes). */
  ocr?: boolean
  /** Lee desde la raíz de la app (apps sin ventanas: el Dock, la barra de menús). */
  raiz_app?: boolean
}

export type Accion = 'click' | 'escribir' | 'tecla' | 'scroll' | 'valor'

export interface PedidoActuar extends Objetivo {
  accion: Accion
  ref?: string
  texto?: string
  tecla?: string
  modificadores?: string[]
  direccion?: 'arriba' | 'abajo' | 'izquierda' | 'derecha'
  cantidad?: number
  valor?: string
  /** Último recurso: traer la ventana al frente un instante y devolver el foco. */
  primer_plano?: boolean
  /** `false` salta la espera de asentado del adaptador (quien llama espera su propia condición; lo usan las recetas). */
  asentar?: boolean
  /**
   * Freno de seguridad: cita textual del pedido explícito de Daniel que autoriza una acción
   * irreversible (enviar, borrar, pagar, publicar, salir, descartar). Sin ella, el freno la detiene.
   */
  confirmacion?: string
  /**
   * Escritura visible: letra por letra con ritmo humano y el fantasma posado en el campo (grabaciones, masterclass).
   * Por defecto el texto entra de golpe; `MANOS_MODO_DEMO=1` lo vuelve visible siempre.
   */
  visible?: boolean
  /**
   * `hid` = el cursor REAL de Daniel viaja con trayectoria humana y actúa con la app al frente. Último recurso
   * (regla «cada quien su cursor», 3 oct): solo con su cita explícita o con Daniel inactivo. «Quiero verte» NO es hid.
   */
  via?: 'fondo' | 'hid'
  /** Lo pone la capa TS al autorizar `hid`; ArbrainManos lo vuelve a comprobar antes de mover el ratón. */
  permiso_hid?: 'explicito' | 'inactivo'
  /** Umbral de inactividad (s) que ArbrainManos exige con `permiso_hid: inactivo`. */
  hid_inactivo_s?: number
  /** Si otra sesión opera la ventana, cuánto esperar antes de devolver «ocupada» (ms). */
  espera_candado_ms?: number
}

export interface ResultadoAccion {
  ok: boolean
  /**
   * `confirmado`: el adaptador leyó el cambio. `sin_verificar`: se envió pero no hay lectura.
   * `bloqueado`: el freno la detuvo antes de tocar nada (falta el pedido explícito de Daniel).
   */
  efecto: 'confirmado' | 'sin_verificar' | 'fallo' | 'bloqueado'
  detalle?: string
  /** Si el freno intervino: categoría y motivo (también cuando dejó pasar con confirmación). */
  freno?: { categoria: string; motivo: string; paso: boolean }
  /** Si la acción dejó la página en un video: lo que hicieron las manos para silenciarlo y pausarlo. */
  medios?: ResultadoMedios
}

/** Lo que el freno necesita saber del elemento y su entorno. Nunca trae el contenido de los campos. */
export interface ContextoAccion {
  bundle?: string
  app?: string
  elemento?: { rol: string; subrol?: string; titulo?: string; descripcion?: string; placeholder?: string; ayuda?: string; identificador?: string; dom_id?: string; dom_clases?: string; etiqueta_ui?: string; valor_largo?: number; acciones?: string[] }
  /** Ancestros desde el padre hacia la ventana: «AXSheet», «AXGroup «Compositor»»… */
  ancestros?: string[]
  dentro_de?: string[]
  ventana?: { titulo?: string; subrol?: string }
  dialogo?: { tipo: string; texto?: string; boton_defecto?: string; boton_cancelar?: string }
  boton_defecto_ventana?: string
  url?: string
  /** Sistema del adaptador que armó el contexto: el freno traduce los atajos de Windows (Ctrl = ⌘, Alt+F4). */
  plataforma?: 'macos' | 'windows'
}

export interface ResultadoMedios { silenciado: boolean; pausado: boolean; reproductor: boolean; acciones: string[]; ms: number; url?: string }

export interface PedidoNavegar { url: string; navegador?: string; ventana_nueva?: boolean }
export interface ResultadoNavegar { ok: boolean; pid: number; ventana: number; url?: string; titulo?: string; medios?: ResultadoMedios; detalle?: string }

export interface App { nombre: string; bundle?: string; pid: number; activa: boolean }

export interface Ventana {
  id: number
  pid: number
  app: string
  titulo?: string
  marco: { x: number; y: number; w: number; h: number }
  en_pantalla: boolean
  z?: number | null
}

export interface Expectativa { etiqueta_contiene?: string; rol?: string; valor?: string; seleccionado?: boolean; habilitado?: boolean }

export interface ResultadoVerificar { cumple: boolean | 'desconocido'; detalle: string }

/** Lo que toda tecnología de manos debe implementar. */
export interface Adaptador {
  readonly nombre: string
  observar(p: PedidoObservar): Promise<Observacion>
  actuar(p: PedidoActuar): Promise<ResultadoAccion>
  apps(): Promise<App[]>
  /** Abre una app en segundo plano (sin robar el frente) y devuelve su pid. */
  abrir(app: string): Promise<{ pid: number; ventanas: Ventana[] }>
  ventanas(p?: { app?: string; pid?: number }): Promise<Ventana[]>
  verificar(p: Objetivo & { espera: Expectativa[] }): Promise<ResultadoVerificar>
  /** Posición del cursor real en puntos: sirve para probar que las manos no lo tocan. */
  cursor(): Promise<{ x: number; y: number }>
  /** Estado de permisos/salud del sistema de control. */
  salud(): Promise<{ ok: boolean; detalle: string }>
  cerrar(): Promise<void>
  /** Opcional: contexto del elemento (o del enfocado si no hay ref) para el freno. */
  contexto?(p: Objetivo & { ref?: string }): Promise<ContextoAccion>
  /** Opcional: URL y título de la página de una ventana de navegador. */
  pagina?(p: Objetivo): Promise<{ ventana: number; titulo?: string; url?: string }>
  /** Opcional: silencia y pausa el reproductor de la página en una sola operación. */
  medios?(p: Objetivo & { tope_ms?: number }): Promise<ResultadoMedios>
  /** Opcional: trae al frente una ventana (solo con intención «ponme/muéstrame»). */
  mostrar?(p: Objetivo): Promise<void>
  /** Opcional: suelta las ventanas que esta sesión tenía tomadas. */
  soltar?(): Promise<void>
  /** Opcional: segundos desde el último toque de Daniel al ratón o al teclado (sin contar los eventos de la mano). */
  inactividad?(): Promise<number | undefined>
  /** Opcional: abre una URL en una ventana NUEVA del navegador sin activarla (Windows; en macOS `navegar` usa `open -g`). */
  abrirUrl?(p: PedidoNavegar): Promise<{ pid: number; ventanas: Ventana[] }>
}

/** Pregunta cerrada para el decisor rápido. */
export interface PedidoDecidir {
  pregunta: string
  /** Estado mínimo que el decisor ve (texto del árbol, metas, historial corto). */
  estado: unknown
  /** id → descripción. El decisor solo puede devolver uno de estos ids. */
  opciones: Record<string, string>
  /** Acción que cambia estado (enviar, activar, borrar): exige más confianza. */
  cambia_estado?: boolean
  /** Las opciones o la pregunta traen contenido de terceros (un chat, un correo): solo decide un modelo de Anthropic. */
  privado?: boolean
}

export interface Decision {
  eleccion: string
  /** Probabilidad 0–1 si el decisor la da; null si no (Claude devuelve texto). */
  confianza: number | null
  decisor: string
  ms: number
  costo_usd: number | null
  tokens_entrada?: number
  /** Si un decisor anterior cedió, por qué. */
  cedio?: string
}

export interface Decisor {
  readonly nombre: string
  decidir(p: PedidoDecidir): Promise<Decision>
  cerrar?(): Promise<void>
}

/** Umbrales del informe (sección 6): 0.55 normal, 0.85 si cambia estado. */
export const UMBRAL_NORMAL = 0.55
export const UMBRAL_CAMBIA_ESTADO = 0.85
